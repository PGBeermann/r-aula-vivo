/**
 * R Aula Viva — Servidor de aula colaborativa para R sobre red local Wi-Fi
 * Universidad Autónoma de Chiriquí (UNACHI)
 *
 * Arquitectura:
 *   - Servidor HTTP (Node.js nativo) que sirve la interfaz web offline.
 *   - Canal WebSocket para sincronización docente -> estudiantes en tiempo real.
 *   - Ejecución de R mediante Rscript, capturando stdout/stderr y gráficos PNG.
 *
 * No requiere internet: todos los recursos (CodeMirror) están vendorizados.
 * Solo necesita: Node.js y R instalados en la máquina anfitriona.
 */

'use strict';

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, execSync } = require('child_process');
const { WebSocketServer } = require('ws');

// ----------------------------------------------------------------------------
// Configuración
// ----------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);
const TEACHER_KEY = process.env.TEACHER_KEY || 'unachi-docente';
const R_TIMEOUT_MS = parseInt(process.env.R_TIMEOUT || '20000', 10);
const R_MAX_BUFFER = 8 * 1024 * 1024; // 8 MB de salida máxima
const MAX_PLOT_BYTES = 4 * 1024 * 1024; // no transmitir imágenes gigantes
const PUBLIC_DIR = path.join(__dirname, 'public');
const RUN_ROOT = path.join(os.tmpdir(), 'r-aula-vivo-runs');

fs.mkdirSync(RUN_ROOT, { recursive: true });

// ----------------------------------------------------------------------------
// Locale para R
//   - En Linux/macOS elegimos un locale UTF-8 realmente instalado (evita los
//     avisos "Setting LC_* = C.UTF-8 failed" cuando C.UTF-8 no está generado).
//   - En Windows NO forzamos locale: R moderno (>= 4.2) usa UTF-8 de forma
//     nativa y "C.UTF-8" no es válido allí; además limpiamos cualquier LC_*
//     heredado del entorno para que R no lo rechace al arrancar.
// ----------------------------------------------------------------------------
const IS_WIN = process.platform === 'win32';
const LC_KEYS = ['LC_ALL', 'LANG', 'LC_COLLATE', 'LC_CTYPE', 'LC_MONETARY', 'LC_TIME', 'LC_NUMERIC', 'LC_MESSAGES'];

let R_LOCALE = null; // null => no forzar (heredar del sistema)
if (!IS_WIN) {
  try {
    const avail = execSync('locale -a', { encoding: 'utf8' }).split('\n').map((s) => s.trim());
    const norm = (s) => s.toLowerCase().replace('utf-8', 'utf8');
    const prefer = [process.env.LANG, 'C.UTF-8', 'en_US.UTF-8', 'es_ES.UTF-8', 'es_PA.UTF-8'].filter(Boolean);
    R_LOCALE = prefer.find((l) => avail.some((a) => norm(a) === norm(l)))
      || avail.find((a) => /utf-?8$/i.test(a)) || null;
  } catch (_) { R_LOCALE = null; }
}

// Construye el entorno con el que se invoca Rscript
function buildREnv() {
  const env = Object.assign({}, process.env);
  if (IS_WIN) {
    // Evitar que un LC_*/LANG inválido (p. ej. C.UTF-8) llegue a R en Windows
    for (const k of LC_KEYS) delete env[k];
  } else if (R_LOCALE) {
    env.LANG = R_LOCALE;
    env.LC_ALL = R_LOCALE;
  }
  return env;
}
const R_ENV = buildREnv();

// ----------------------------------------------------------------------------
// Estado en memoria de la clase
// ----------------------------------------------------------------------------
const state = {
  classCode: '# Bienvenidos a la clase de R\n# El docente escribirá aquí y ustedes verán el resultado en tiempo real.\n\n',
  classOutput: null,      // último resultado de ejecución de la clase
  runningBy: null,        // nombre de quien está ejecutando (para indicador)
  submissions: [],        // envíos de estudiantes
};

let seq = 0;
const nextId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

// clients: ws -> { id, role, name }
const clients = new Map();

// ----------------------------------------------------------------------------
// Utilidades de red / envío
// ----------------------------------------------------------------------------
function localIPv4() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch (_) { /* noop */ }
  }
}

function broadcast(obj, filter) {
  for (const [ws, info] of clients.entries()) {
    if (!filter || filter(info, ws)) send(ws, obj);
  }
}

function roster() {
  const users = [];
  for (const info of clients.values()) {
    users.push({ name: info.name, role: info.role });
  }
  // docentes primero
  users.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'docente' ? -1 : 1));
  return users;
}

function pushRoster() {
  broadcast({ type: 'roster', users: roster() });
}

function pushSubmissions() {
  broadcast({ type: 'submissions', list: state.submissions }, (info) => info.role === 'docente');
}

// ----------------------------------------------------------------------------
// Motor de ejecución de R
// ----------------------------------------------------------------------------
const RUNNER_TEMPLATE = `# --- Entorno de ejecución generado por R Aula Viva ---
.plot_dir <- {{PLOT_DIR}}
.opendev <- function(...) {
  args <- list(filename = file.path(.plot_dir, "Rplot%03d.png"),
               width = 900, height = 650, res = 120, bg = "white")
  if (isTRUE(capabilities("cairo"))) args$type <- "cairo"
  do.call(grDevices::png, args)
}
options(device = .opendev, warn = 1, max.print = 5000, width = 100)
.userfile <- {{USER_FILE}}
tryCatch(
  source(.userfile, echo = TRUE, print.eval = TRUE,
         max.deparse.length = Inf, keep.source = TRUE, spaced = FALSE),
  error = function(e) cat(sprintf("\\n[ERROR] %s\\n", conditionMessage(e)))
)
try(graphics.off(), silent = TRUE)
`;

/**
 * Ejecuta código R y devuelve texto de salida + gráficos como data URLs.
 */
function runR(code) {
  return new Promise((resolve) => {
    const runDir = path.join(RUN_ROOT, crypto.randomBytes(8).toString('hex'));
    fs.mkdirSync(runDir, { recursive: true });
    const userFile = path.join(runDir, 'user.R');
    const runnerFile = path.join(runDir, 'runner.R');

    const runner = RUNNER_TEMPLATE
      .replace('{{PLOT_DIR}}', JSON.stringify(runDir))
      .replace('{{USER_FILE}}', JSON.stringify(userFile));

    try {
      fs.writeFileSync(userFile, code, 'utf8');
      fs.writeFileSync(runnerFile, runner, 'utf8');
    } catch (e) {
      return resolve({ ok: false, output: `[Error interno al preparar la ejecución: ${e.message}]`, plots: [], timedOut: false });
    }

    const started = Date.now();
    execFile(
      'Rscript',
      ['--vanilla', runnerFile],
      {
        cwd: runDir,
        timeout: R_TIMEOUT_MS,
        maxBuffer: R_MAX_BUFFER,
        env: R_ENV,
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        const elapsed = Date.now() - started;
        const timedOut = !!(err && err.killed);
        let out = (stdout || '').toString();
        let errText = (stderr || '').toString();

        if (err && err.code === 'ENOENT') {
          errText += '\n[ERROR] No se encontró "Rscript". Instale R en esta máquina y verifique que Rscript esté en el PATH.';
        }
        if (timedOut) {
          errText += `\n[TIEMPO EXCEDIDO] La ejecución superó ${Math.round(R_TIMEOUT_MS / 1000)} s y fue detenida.`;
        }

        // Recolectar gráficos generados
        const plots = [];
        try {
          const files = fs.readdirSync(runDir)
            .filter((f) => /^Rplot\d+\.png$/.test(f))
            .sort();
          for (const f of files) {
            const fp = path.join(runDir, f);
            const stat = fs.statSync(fp);
            if (stat.size > 0 && stat.size <= MAX_PLOT_BYTES) {
              const b64 = fs.readFileSync(fp).toString('base64');
              plots.push('data:image/png;base64,' + b64);
            }
          }
        } catch (_) { /* noop */ }

        // Limpieza
        fs.rm(runDir, { recursive: true, force: true }, () => {});

        // Componer texto de salida (stdout + stderr diferenciado)
        let output = out;
        if (errText.trim()) {
          output += (output && !output.endsWith('\n') ? '\n' : '') + errText;
        }
        if (!output.trim() && plots.length === 0) {
          output = '(sin salida de texto)';
        }

        resolve({
          ok: !timedOut,
          output: output,
          plots,
          timedOut,
          elapsedMs: elapsed,
        });
      }
    );
  });
}

// ----------------------------------------------------------------------------
// Servidor HTTP estático
// ----------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  if (urlPath === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ips: localIPv4(), port: PORT }));
    return;
  }

  // Evitar path traversal
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Prohibido'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(serveStatic);

// ----------------------------------------------------------------------------
// WebSocket
// ----------------------------------------------------------------------------
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (_) { return; }
    handleMessage(ws, msg);
  });

  ws.on('close', () => {
    if (clients.has(ws)) {
      clients.delete(ws);
      pushRoster();
    }
  });
});

// Heartbeat: descartar conexiones muertas
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (_) { /* noop */ }
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

function handleMessage(ws, msg) {
  const info = clients.get(ws);

  // Primer mensaje obligatorio: hello (autenticación de rol)
  if (!info) {
    if (msg.type !== 'hello') return;
    const role = msg.role === 'docente' ? 'docente' : 'estudiante';
    const name = String(msg.name || '').trim().slice(0, 40) || (role === 'docente' ? 'Docente' : 'Estudiante');

    if (role === 'docente' && String(msg.key || '') !== TEACHER_KEY) {
      send(ws, { type: 'denied', reason: 'Clave de docente incorrecta.' });
      return;
    }

    const newInfo = { id: nextId(), role, name };
    clients.set(ws, newInfo);

    send(ws, {
      type: 'welcome',
      you: newInfo,
      classCode: state.classCode,
      classOutput: state.classOutput,
      roster: roster(),
      submissions: role === 'docente' ? state.submissions : undefined,
    });
    pushRoster();
    return;
  }

  switch (msg.type) {
    // -- Docente: escritura en vivo (espejo a estudiantes) --
    case 'codeChange': {
      if (info.role !== 'docente') return;
      state.classCode = String(msg.code || '').slice(0, 200000);
      broadcast({ type: 'codeUpdate', code: state.classCode }, (i) => i.role === 'estudiante');
      break;
    }

    // -- Docente: ejecutar código de la clase (resultado a todos) --
    case 'run': {
      if (info.role !== 'docente') return;
      const code = String(msg.code || '');
      state.classCode = code.slice(0, 200000);
      state.runningBy = info.name;
      broadcast({ type: 'running', running: true, by: info.name });
      runR(code).then((result) => {
        state.classOutput = Object.assign({ ranBy: info.name, ranAt: Date.now() }, result);
        state.runningBy = null;
        broadcast({ type: 'running', running: false });
        broadcast(Object.assign({ type: 'output', target: 'class' }, state.classOutput));
      });
      break;
    }

    // -- Estudiante: ejecutar su propio código (resultado solo a él) --
    case 'studentRun': {
      const code = String(msg.code || '');
      send(ws, { type: 'running', running: true, scope: 'self' });
      runR(code).then((result) => {
        send(ws, Object.assign({ type: 'studentResult' }, result));
      });
      break;
    }

    // -- Estudiante: enviar script al docente --
    case 'submit': {
      if (info.role !== 'estudiante') return;
      const submission = {
        id: nextId(),
        studentId: info.id,
        studentName: info.name,
        title: String(msg.title || 'Sin título').trim().slice(0, 80),
        code: String(msg.code || '').slice(0, 200000),
        ts: Date.now(),
        status: 'pendiente',
        review: null,
      };
      state.submissions.unshift(submission);
      if (state.submissions.length > 300) state.submissions.pop();
      pushSubmissions();
      send(ws, { type: 'notice', level: 'ok', text: 'Tu script fue enviado al docente.' });
      broadcast({ type: 'notice', level: 'info', text: `Nuevo envío de ${info.name}: "${submission.title}"` }, (i) => i.role === 'docente');
      break;
    }

    // -- Docente: ejecutar el código de un envío (resultado solo al docente) --
    case 'runSubmission': {
      if (info.role !== 'docente') return;
      const code = String(msg.code || '');
      send(ws, { type: 'running', running: true, scope: 'self' });
      runR(code).then((result) => {
        send(ws, Object.assign({ type: 'studentResult', reviewOf: msg.id || null }, result));
      });
      break;
    }

    // -- Docente: devolver revisión/corrección a un estudiante --
    case 'review': {
      if (info.role !== 'docente') return;
      const sub = state.submissions.find((s) => s.id === msg.id);
      if (!sub) return;
      sub.status = 'revisado';
      sub.review = {
        feedback: String(msg.feedback || '').slice(0, 20000),
        correctedCode: String(msg.correctedCode || '').slice(0, 200000),
        byName: info.name,
        ts: Date.now(),
      };
      pushSubmissions();
      // Enviar al estudiante si sigue conectado
      broadcast(
        { type: 'review', submissionId: sub.id, title: sub.title, feedback: sub.review.feedback, correctedCode: sub.review.correctedCode, byName: info.name },
        (i) => i.id === sub.studentId
      );
      send(ws, { type: 'notice', level: 'ok', text: `Revisión enviada a ${sub.studentName}.` });
      break;
    }

    // -- Docente: limpiar salida de la clase --
    case 'clearOutput': {
      if (info.role !== 'docente') return;
      state.classOutput = null;
      broadcast({ type: 'output', target: 'class', output: '', plots: [], cleared: true });
      break;
    }

    default:
      break;
  }
}

// ----------------------------------------------------------------------------
// Arranque
// ----------------------------------------------------------------------------
server.listen(PORT, '0.0.0.0', () => {
  const ips = localIPv4();
  const line = '='.repeat(64);
  console.log('\n' + line);
  console.log('  R AULA ONLINE  —  Servidor en marcha');
  console.log(line);
  console.log('  Clave del docente:  ' + TEACHER_KEY + '   (cámbiela con la variable TEACHER_KEY)');
  console.log('  Locale para R:      ' + (IS_WIN ? 'nativo de Windows (UTF-8, sin forzar)' : (R_LOCALE || 'heredado del sistema')));
  console.log('  Los estudiantes deben abrir en su navegador:');
  if (ips.length === 0) {
    console.log('     http://localhost:' + PORT + '   (no se detectó IP de red)');
  } else {
    for (const ip of ips) console.log('     http://' + ip + ':' + PORT);
  }
  console.log('  El docente usa la misma dirección y entra con la clave.');
  console.log(line + '\n');
});
