/* ============================================================
   R Aula Viva · UNACHI — Lógica del cliente
   ============================================================ */
(function () {
  'use strict';

  // -------- utilidades --------
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hhmm = (ts) => new Date(ts).toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' });

  // -------- guardar / abrir archivos .R (local) --------
  function stamp() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  // Descarga el texto del editor como archivo .R en la máquina local
  function saveRFile(getText, defaultBase) {
    const text = getText();
    let name = window.prompt('Nombre del archivo a guardar:', defaultBase + '.R');
    if (name === null) return;                 // el usuario canceló
    name = name.trim() || (defaultBase + '.R');
    if (!/\.[rR]$/.test(name)) name += '.R';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('Guardado: ' + name, 'ok');
  }

  // Conecta un botón "Abrir" + input de archivo a un editor CodeMirror
  function bindOpenR(btnSel, inputSel, getCM) {
    const btn = $(btnSel), input = $(inputSel);
    if (!btn || !input) return;
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        getCM().setValue(String(reader.result || ''));
        toast('Archivo cargado: ' + f.name, 'ok');
      };
      reader.onerror = () => toast('No se pudo leer el archivo.', 'err');
      reader.readAsText(f, 'utf-8');
      input.value = '';                        // permitir reabrir el mismo archivo
    });
  }

  // -------- exportar la salida a un informe HTML (estilo RStudio) --------
  // Recolecta código, texto de consola y gráficos de un panel de resultados
  function collectReport(outSel, getCM) {
    const out = $(outSel);
    const code = getCM ? getCM().getValue() : '';
    const pre = out ? out.querySelector('.out-text') : null;
    const outputText = pre ? pre.innerText : '';
    const plots = out ? Array.from(out.querySelectorAll('.plots img')).map((im) => im.src) : [];
    return { code, outputText, plots };
  }

  // Construye un documento HTML autónomo (con los gráficos incrustados en base64)
  function buildReportHTML(data) {
    const when = new Date().toLocaleString('es-PA');
    const author = me ? `${me.name} (${me.role})` : '';
    const codeBlock = data.code && data.code.trim()
      ? `<h2>Código R</h2><pre class="r-code"><code>${esc(data.code)}</code></pre>` : '';
    const outBlock = data.outputText && data.outputText.trim()
      ? `<h2>Salida de la consola</h2><pre class="r-out">${esc(data.outputText)}</pre>` : '';
    const plotsBlock = data.plots.length
      ? '<h2>Gráficos</h2>' + data.plots.map((s, i) =>
          `<figure><img src="${s}" alt="Gráfico ${i + 1}"><figcaption>Figura ${i + 1}</figcaption></figure>`).join('\n')
      : '';
    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(data.title || 'Informe R')}</title>
<style>
  :root{--azul:#0b3d6b;--linea:#dfe5ec;--tinta:#1a2230;--gris:#5b6674}
  *{box-sizing:border-box}
  body{font-family:Georgia,"Times New Roman",serif;color:var(--tinta);max-width:900px;margin:0 auto;padding:40px 24px;line-height:1.6}
  header{border-bottom:3px solid var(--azul);padding-bottom:14px;margin-bottom:24px}
  h1{color:var(--azul);font-size:1.7rem;margin:0 0 6px}
  .meta{color:var(--gris);font-size:.9rem;font-family:system-ui,-apple-system,sans-serif}
  h2{color:var(--azul);font-size:1.15rem;border-bottom:1px solid var(--linea);padding-bottom:5px;margin-top:32px;font-family:system-ui,-apple-system,sans-serif}
  pre{font-family:"SFMono-Regular",Consolas,Menlo,monospace;font-size:13.5px;line-height:1.5;border-radius:8px;padding:14px 16px;overflow:auto;white-space:pre-wrap;word-break:break-word}
  pre.r-code{background:#f3f6f9;border:1px solid var(--linea);color:#0f2740}
  pre.r-out{background:#0f1b2a;color:#dbe7f5}
  figure{margin:16px 0;text-align:center}
  figure img{max-width:100%;border:1px solid var(--linea);border-radius:8px}
  figcaption{color:var(--gris);font-size:.85rem;font-family:system-ui,-apple-system,sans-serif;margin-top:6px}
  footer{margin-top:40px;border-top:1px solid var(--linea);padding-top:12px;color:var(--gris);font-size:.82rem;font-family:system-ui,-apple-system,sans-serif}
  @media print{body{max-width:none;padding:0}}
</style></head>
<body>
<header>
  <h1>${esc(data.title || 'Informe de resultados — R')}</h1>
  <div class="meta">Autor: ${esc(author)} · Generado: ${esc(when)} · R Aula Viva · UNACHI</div>
</header>
${codeBlock}
${outBlock}
${plotsBlock}
<footer>Documento generado con R Aula Viva — Universidad Autónoma de Chiriquí.</footer>
</body></html>`;
  }

  // Genera el informe, lo descarga y lo abre en una pestaña nueva
  function exportReportHTML(outSel, getCM, defaultBase, title) {
    const data = collectReport(outSel, getCM);
    if (!data.outputText.trim() && !data.plots.length) {
      toast('No hay resultados para exportar. Ejecute el código primero.', 'err');
      return;
    }
    data.title = title;
    let name = window.prompt('Nombre del archivo HTML:', defaultBase + '.html');
    if (name === null) return;
    name = name.trim() || (defaultBase + '.html');
    if (!/\.html?$/i.test(name)) name += '.html';

    const blob = new Blob([buildReportHTML(data)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    // Guardar (descargar)
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    // Abrir en pestaña nueva
    const win = window.open(url, '_blank');
    toast(win ? ('Informe HTML generado: ' + name)
              : ('Informe guardado: ' + name + ' (habilite ventanas emergentes para abrirlo).'), 'ok');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // -------- estado --------
  let ws = null;
  let me = null;                 // {id, role, name}
  let pending = null;            // credenciales para (re)enviar hello
  let selectedRole = null;
  let reconnectTimer = null;
  let reconnectDelay = 800;
  const editors = {};            // cmDoc | cmClass | cmMine
  let currentSubmission = null;  // envío abierto en el modal (docente)

  // ============================================================
  //  ACCESO
  // ============================================================
  // Mostrar URL del servidor
  fetch('/api/info').then((r) => r.json()).then((d) => {
    const ip = (d.ips && d.ips[0]) || location.hostname;
    $('#serverUrl').textContent = 'http://' + ip + ':' + d.port;
  }).catch(() => {
    $('#serverUrl').textContent = location.origin;
  });

  $$('.role-card').forEach((card) => {
    card.addEventListener('click', () => {
      selectedRole = card.dataset.role;
      $$('.role-card').forEach((c) => c.classList.toggle('is-active', c === card));
      $('#loginForm').hidden = false;
      $('#keyField').hidden = selectedRole !== 'docente';
      $('#loginError').hidden = true;
      $('#nameInput').focus();
    });
  });

  $('#backBtn').addEventListener('click', () => {
    $('#loginForm').hidden = true;
    selectedRole = null;
    $$('.role-card').forEach((c) => c.classList.remove('is-active'));
  });

  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#nameInput').value.trim();
    if (!name) { showLoginError('Escribe tu nombre.'); return; }
    if (selectedRole === 'docente' && !$('#keyInput').value) {
      showLoginError('Ingresa la clave del docente.'); return;
    }
    pending = { role: selectedRole, name, key: $('#keyInput').value };
    $('#enterBtn').disabled = true;
    connect();
  });

  function showLoginError(msg) {
    const el = $('#loginError');
    el.textContent = msg; el.hidden = false;
    $('#enterBtn').disabled = false;
  }

  $('#exitBtn').addEventListener('click', () => {
    if (ws) { ws.onclose = null; ws.close(); }
    location.reload();
  });

  // ============================================================
  //  WEBSOCKET
  // ============================================================
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(proto + '://' + location.host);

    ws.addEventListener('open', () => {
      reconnectDelay = 800;
      setConn(true);
      if (pending) ws.send(JSON.stringify(Object.assign({ type: 'hello' }, pending)));
    });

    ws.addEventListener('message', (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
      onMessage(msg);
    });

    ws.addEventListener('close', () => {
      setConn(false);
      if (!me) { $('#enterBtn').disabled = false; return; }
      // reconexión automática si ya estábamos dentro
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.6, 8000);
    });

    ws.addEventListener('error', () => { /* el evento close se encargará */ });
  }

  function sendWS(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function setConn(on) {
    const el = $('#connState');
    if (!el) return;
    el.textContent = on ? '● conectado' : '● reconectando…';
    el.className = 'conn ' + (on ? 'conn-on' : 'conn-off');
  }

  // ============================================================
  //  ENRUTADOR DE MENSAJES
  // ============================================================
  function onMessage(msg) {
    switch (msg.type) {
      case 'denied':
        showLoginError(msg.reason || 'Acceso denegado.');
        if (ws) { ws.onclose = null; ws.close(); }
        me = null; pending = null;
        break;

      case 'welcome':
        me = msg.you;
        enterApp(msg);
        break;

      case 'roster':
        renderRoster(msg.users);
        break;

      case 'codeUpdate':
        if (editors.cmClass) setCM(editors.cmClass, msg.code);
        break;

      case 'running':
        handleRunning(msg);
        break;

      case 'output': // resultado de la clase (a todos)
        if (msg.cleared) { clearOutput(classOutputEl()); break; }
        renderOutput(classOutputEl(), msg);
        setRunning(false);
        break;

      case 'studentResult': // resultado individual (estudiante) o de un envío (docente)
        if (me.role === 'docente') {
          renderOutput($('#modalMiniOut'), msg, true);
          const b = $('#modalRunBtn'); if (b) b.disabled = false;
        } else {
          renderOutput($('#out-mine'), msg);
          toggle('#runningTagM', false);
        }
        break;

      case 'submissions':
        renderSubmissions(msg.list);
        break;

      case 'review':
        addReview(msg);
        break;

      case 'notice':
        toast(msg.text, msg.level);
        break;
    }
  }

  function classOutputEl() {
    return me && me.role === 'docente' ? $('#out-class') : $('#out-class-student');
  }

  function handleRunning(msg) {
    if (msg.scope === 'self') {
      if (me.role === 'estudiante') toggle('#runningTagM', !!msg.running);
      else { const b = $('#modalRunBtn'); if (b) b.disabled = !!msg.running; }
      return;
    }
    setRunning(!!msg.running);
  }

  function setRunning(on) {
    toggle('#runningTag', on);
    toggle('#runningTagC', on);
  }
  function toggle(sel, on) { const el = $(sel); if (el) el.hidden = !on; }

  // ============================================================
  //  ENTRAR A LA APP
  // ============================================================
  function enterApp(welcome) {
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#roleBadge').textContent = me.role;
    $('#userName').textContent = me.name;

    if (me.role === 'docente') initDocente(welcome);
    else initEstudiante(welcome);
  }

  function baseCM(textarea, opts) {
    return CodeMirror.fromTextArea(textarea, Object.assign({
      mode: 'r',
      lineNumbers: true,
      matchBrackets: true,
      styleActiveLine: true,
      indentUnit: 2,
      lineWrapping: false,
      viewportMargin: Infinity,
    }, opts));
  }

  function setCM(cm, value) {
    if (cm.getValue() === value) return;
    const cur = cm.getCursor();
    cm.setValue(value == null ? '' : value);
    if (!cm.getOption('readOnly')) cm.setCursor(cur);
  }

  // ---------- DOCENTE ----------
  function initDocente(welcome) {
    $('#viewDocente').hidden = false;
    const cm = baseCM($('#ed-docente'), { placeholder: '# Escribe aquí tu código R…' });
    editors.cmDoc = cm;
    cm.setValue(welcome.classCode || '');
    setTimeout(() => cm.refresh(), 30);

    // Espejo en vivo (a estudiantes) + auto-ejecutar opcional
    let mirrorT = null, autoT = null;
    cm.on('change', () => {
      clearTimeout(mirrorT);
      mirrorT = setTimeout(() => sendWS({ type: 'codeChange', code: cm.getValue() }), 120);
      if ($('#autoRun').checked) {
        clearTimeout(autoT);
        autoT = setTimeout(runClass, 1200);
      }
    });

    cm.setOption('extraKeys', { 'Ctrl-Enter': runClass, 'Cmd-Enter': runClass });
    $('#runBtn').addEventListener('click', runClass);
    $('#clearBtn').addEventListener('click', () => sendWS({ type: 'clearOutput' }));
    $('#clearEditorBtn').addEventListener('click', () => {
      if (!cm.getValue().trim() || window.confirm('¿Borrar todo el código del editor?')) {
        cm.setValue('');
        cm.focus();
      }
    });

    // Guardar / abrir archivos .R
    bindOpenR('#openDocBtn', '#fileDoc', () => cm);
    $('#saveDocBtn').addEventListener('click', () => saveRFile(() => cm.getValue(), 'clase_' + stamp()));

    // Exportar resultados a informe HTML
    $('#exportDocBtn').addEventListener('click', () =>
      exportReportHTML('#out-class', () => cm, 'reporte_clase_' + stamp(), 'Informe de la clase — R'));

    if (welcome.classOutput) renderOutput($('#out-class'), welcome.classOutput);
    renderRoster(welcome.roster || []);
    renderSubmissions(welcome.submissions || []);

    function runClass() { sendWS({ type: 'run', code: cm.getValue() }); }
  }

  function renderRoster(users) {
    const list = $('#rosterList'); if (!list) return;
    list.innerHTML = '';
    users.forEach((u) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="dot ${u.role === 'docente' ? 'doc' : ''}"></span>
        <span>${esc(u.name)}</span><span class="rrole">${esc(u.role)}</span>`;
      list.appendChild(li);
    });
    const c = $('#rosterCount'); if (c) c.textContent = users.length;
  }

  function renderSubmissions(list) {
    const el = $('#subList'); if (!el) return;
    el.innerHTML = '';
    if (!list.length) { el.innerHTML = '<p class="empty">Sin envíos todavía.</p>'; }
    list.forEach((s) => {
      const li = document.createElement('li');
      li.className = 'sub';
      li.innerHTML = `
        <div class="sub-top">
          <span class="sub-title">${esc(s.title)}</span>
          <span class="sub-when">${hhmm(s.ts)}</span>
        </div>
        <div class="sub-by">${esc(s.studentName)}</div>
        <span class="estado ${s.status}">${s.status}</span>`;
      li.addEventListener('click', () => openReviewModal(s));
      el.appendChild(li);
    });
    const c = $('#subCount'); if (c) c.textContent = list.length;
  }

  // ---------- ESTUDIANTE ----------
  const reviews = [];
  function initEstudiante(welcome) {
    $('#viewEstudiante').hidden = false;
    $('#studentTabs').hidden = false;

    editors.cmClass = baseCM($('#ed-clase'), { readOnly: 'nocursor' });
    editors.cmClass.setValue(welcome.classCode || '');
    editors.cmMine = baseCM($('#ed-taller'), { placeholder: '# Tu espacio para practicar R…\n' });

    setTimeout(() => editors.cmClass.refresh(), 30);
    if (welcome.classOutput) renderOutput($('#out-class-student'), welcome.classOutput);

    // Tabs
    $$('.tab').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));

    // Ejecutar mi taller
    const runMine = () => sendWS({ type: 'studentRun', code: editors.cmMine.getValue() });
    editors.cmMine.setOption('extraKeys', { 'Ctrl-Enter': runMine, 'Cmd-Enter': runMine });
    $('#runMineBtn').addEventListener('click', runMine);

    // Enviar al docente
    $('#submitBtn').addEventListener('click', openSubmitModal);

    // Copiar código del docente a mi taller
    $('#copyToTaller').addEventListener('click', () => {
      editors.cmMine.setValue(editors.cmClass.getValue());
      selectTab('taller');
      toast('Código copiado a tu taller.', 'ok');
    });

    // Guardar / abrir archivos .R
    bindOpenR('#openMineBtn', '#fileMine', () => editors.cmMine);
    $('#saveMineBtn').addEventListener('click', () => saveRFile(() => editors.cmMine.getValue(), 'mi_script_' + stamp()));
    $('#saveClassBtn').addEventListener('click', () => saveRFile(() => editors.cmClass.getValue(), 'clase_' + stamp()));

    // Exportar resultados a informe HTML
    $('#exportMineBtn').addEventListener('click', () =>
      exportReportHTML('#out-mine', () => editors.cmMine, 'reporte_taller_' + stamp(), 'Mi informe — R'));
    $('#exportClassBtn').addEventListener('click', () =>
      exportReportHTML('#out-class-student', () => editors.cmClass, 'reporte_clase_' + stamp(), 'Informe de la clase — R'));
  }

  function selectTab(name) {
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
    ['clase', 'taller', 'revisiones'].forEach((n) => {
      $('#tab-' + n).hidden = n !== name;
    });
    if (name === 'clase' && editors.cmClass) setTimeout(() => editors.cmClass.refresh(), 20);
    if (name === 'taller' && editors.cmMine) setTimeout(() => editors.cmMine.refresh(), 20);
    if (name === 'revisiones') { $('#revBadge').hidden = true; }
  }

  function addReview(msg) {
    reviews.unshift(msg);
    const list = $('#revList');
    const empty = $('.empty', list); if (empty) empty.remove();
    const card = document.createElement('div');
    card.className = 'rev-card';
    const hasCode = msg.correctedCode && msg.correctedCode.trim();
    card.innerHTML = `
      <h4><span>Revisión: ${esc(msg.title || 'tu envío')}</span><span style="font-size:.78rem;color:var(--gris)">${esc(msg.byName || 'Docente')}</span></h4>
      <div class="rev-fb">${msg.feedback ? esc(msg.feedback) : '<em>Sin comentarios escritos.</em>'}</div>
      ${hasCode ? `<pre>${esc(msg.correctedCode)}</pre>
        <div class="rev-actions"><button class="btn btn-primary btn-sm" type="button">Cargar corrección en mi taller</button></div>` : ''}`;
    if (hasCode) {
      $('.btn', card).addEventListener('click', () => {
        editors.cmMine.setValue(msg.correctedCode);
        selectTab('taller');
        toast('Corrección cargada en tu taller.', 'ok');
      });
    }
    list.insertBefore(card, list.firstChild);

    const badge = $('#revBadge');
    badge.hidden = false;
    badge.textContent = (parseInt(badge.textContent || '0', 10) || 0) + 1;
    toast('El docente revisó tu envío: ' + (msg.title || ''), 'ok');
  }

  // ============================================================
  //  RENDER DE SALIDA (texto + gráficos)
  // ============================================================
  function renderOutput(root, result, isMini) {
    if (!root) return;
    const pre = isMini ? root.querySelector('pre') : root.querySelector('.out-text');
    const plotsBox = isMini ? root.querySelector('.plots') : root.querySelector('.plots');
    const text = result.output || '';
    if (pre) pre.innerHTML = highlight(text);
    if (plotsBox) {
      plotsBox.innerHTML = '';
      (result.plots || []).forEach((src) => {
        const img = new Image();
        img.src = src;
        img.alt = 'Gráfico R';
        plotsBox.appendChild(img);
      });
    }
    if (!isMini) root.scrollTop = 0;
  }

  function clearOutput(root) {
    if (!root) return;
    const pre = root.querySelector('.out-text'); if (pre) pre.textContent = '';
    const pb = root.querySelector('.plots'); if (pb) pb.innerHTML = '';
  }

  function highlight(text) {
    return esc(text)
      .replace(/(\[ERROR\][^\n]*)/g, '<span class="err">$1</span>')
      .replace(/(\[TIEMPO EXCEDIDO\][^\n]*)/g, '<span class="err">$1</span>');
  }

  // ============================================================
  //  MODALES
  // ============================================================
  function openModal(title, html) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; currentSubmission = null; }
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  // -- Estudiante: enviar script --
  function openSubmitModal() {
    openModal('Enviar script al docente', `
      <label for="subTitle">Título / descripción breve</label>
      <input id="subTitle" type="text" maxlength="80" placeholder="Ej.: Ejercicio 3 — regresión lineal" />
      <label>Código que se enviará</label>
      <div class="code-view">${esc(editors.cmMine.getValue() || '(vacío)')}</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" id="subCancel">Cancelar</button>
        <button class="btn btn-primary" type="button" id="subConfirm">Enviar</button>
      </div>`);
    $('#subCancel').addEventListener('click', closeModal);
    $('#subConfirm').addEventListener('click', () => {
      const code = editors.cmMine.getValue();
      if (!code.trim()) { toast('Tu editor está vacío.', 'err'); return; }
      sendWS({ type: 'submit', title: $('#subTitle').value || 'Sin título', code });
      closeModal();
    });
    setTimeout(() => $('#subTitle').focus(), 40);
  }

  // -- Docente: revisar envío --
  function openReviewModal(s) {
    currentSubmission = s;
    const rev = s.review || {};
    openModal('Revisar: ' + s.title, `
      <p style="margin:.2rem 0 .6rem;color:var(--gris)">De <strong>${esc(s.studentName)}</strong> · ${hhmm(s.ts)}</p>
      <label>Código enviado por el estudiante</label>
      <div class="code-view" id="modalCode">${esc(s.code || '(vacío)')}</div>
      <div class="modal-actions" style="justify-content:flex-start;margin:.6rem 0">
        <button class="btn btn-run btn-sm" type="button" id="modalRunBtn">▶ Ejecutar este código</button>
      </div>
      <div class="mini-out" id="modalMiniOut"><pre></pre><div class="plots"></div></div>
      <label for="fbText">Comentarios / retroalimentación</label>
      <textarea id="fbText" placeholder="Explica los errores y cómo corregirlos…">${esc(rev.feedback || '')}</textarea>
      <label for="fixCode">Código corregido (opcional, el estudiante podrá cargarlo)</label>
      <textarea id="fixCode" placeholder="Versión corregida del script…">${esc(rev.correctedCode || s.code || '')}</textarea>
      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" id="revCancel">Cerrar</button>
        <button class="btn btn-primary" type="button" id="revSend">Enviar revisión al estudiante</button>
      </div>`);
    $('#modalRunBtn').addEventListener('click', () => {
      sendWS({ type: 'runSubmission', id: s.id, code: s.code });
    });
    $('#revCancel').addEventListener('click', closeModal);
    $('#revSend').addEventListener('click', () => {
      sendWS({
        type: 'review', id: s.id,
        feedback: $('#fbText').value,
        correctedCode: $('#fixCode').value,
      });
      closeModal();
    });
  }

  // ============================================================
  //  TOASTS
  // ============================================================
  function toast(text, level) {
    const t = document.createElement('div');
    t.className = 'toast ' + (level || 'info');
    t.textContent = text;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 3600);
    setTimeout(() => t.remove(), 4000);
  }

})();
