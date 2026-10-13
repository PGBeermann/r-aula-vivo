/* Prueba end-to-end: simula docente + estudiante sobre WebSocket. */
const WebSocket = require('ws');
const PORT = process.env.PORT || 4321;
const URL = `ws://127.0.0.1:${PORT}`;
const KEY = process.env.TEACHER_KEY || 'clave-test';

const log = (...a) => console.log(...a);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; log('  ✔', m); } else { fail++; log('  ✘', m); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function mk(role, name, key) {
  const ws = new WebSocket(URL);
  ws.inbox = [];
  ws.on('message', (d) => { try { ws.inbox.push(JSON.parse(d.toString())); } catch (_) {} });
  return new Promise((res) => {
    ws.on('open', () => { ws.send(JSON.stringify({ type: 'hello', role, name, key })); res(ws); });
  });
}
const last = (ws, type) => [...ws.inbox].reverse().find((m) => m.type === type);
async function until(ws, type, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const m = last(ws, type); if (m) return m; await wait(50); }
  return null;
}

(async () => {
  log('\n== PRUEBA 1: acceso ==');
  const bad = new WebSocket(URL);
  await new Promise((r) => bad.on('open', () => { bad.send(JSON.stringify({ type: 'hello', role: 'docente', name: 'X', key: 'malo' })); r(); }));
  const denied = await new Promise((r) => bad.on('message', (d) => r(JSON.parse(d.toString()))));
  ok(denied.type === 'denied', 'Clave incorrecta es rechazada');
  bad.close();

  const doc = await mk('docente', 'Dra. Prueba', KEY);
  const w = await until(doc, 'welcome');
  ok(w && w.you.role === 'docente', 'Docente entra con clave correcta');

  const est = await mk('estudiante', 'Ana Estudiante');
  const we = await until(est, 'welcome');
  ok(we && we.you.role === 'estudiante', 'Estudiante entra sin clave');
  ok(typeof we.classCode === 'string', 'Estudiante recibe el código actual de la clase');

  log('\n== PRUEBA 2: espejo de código en vivo ==');
  doc.send(JSON.stringify({ type: 'codeChange', code: 'x <- 1:10\nmean(x)' }));
  const cu = await until(est, 'codeUpdate');
  ok(cu && cu.code.includes('mean(x)'), 'El estudiante recibe el código del docente en vivo');

  log('\n== PRUEBA 3: ejecución de R (texto) a toda la clase ==');
  doc.send(JSON.stringify({ type: 'run', code: 'print(summary(1:100))\ncat("HOLA-UNACHI\\n")' }));
  const o1 = await until(doc, 'output');
  const o1e = await until(est, 'output');
  ok(o1 && /HOLA-UNACHI/.test(o1.output), 'Docente recibe la salida de texto');
  ok(o1e && /HOLA-UNACHI/.test(o1e.output), 'Estudiante recibe la misma salida (broadcast)');
  ok(o1 && /Median/.test(o1.output), 'La salida incluye el resultado de summary()');

  log('\n== PRUEBA 4: gráfico ==');
  doc.send(JSON.stringify({ type: 'run', code: 'plot(1:10, (1:10)^2, main="Prueba", col="blue", pch=19)' }));
  // esperar una salida nueva con plots
  let g = null; const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    const m = last(doc, 'output'); if (m && m.plots && m.plots.length) { g = m; break; } await wait(80);
  }
  ok(g && g.plots.length >= 1, 'Se generó al menos un gráfico');
  ok(g && /^data:image\/png;base64,/.test(g.plots[0]), 'El gráfico llega como PNG en data URL');

  log('\n== PRUEBA 5: manejo de errores ==');
  doc.send(JSON.stringify({ type: 'run', code: 'estoNoExiste(123)' }));
  let er = null; const t1 = Date.now();
  while (Date.now() - t1 < 8000) { const m = last(doc, 'output'); if (m && /ERROR|no se pudo|could not|Error/.test(m.output)) { er = m; break; } await wait(80); }
  ok(er && /ERROR|Error/.test(er.output), 'Un error de R se captura y se reporta');

  log('\n== PRUEBA 6: ejecución individual del estudiante ==');
  est.inbox.length = 0;
  est.send(JSON.stringify({ type: 'studentRun', code: 'cat("SOLO-YO\\n"); 2+2' }));
  const sr = await until(est, 'studentResult');
  ok(sr && /SOLO-YO/.test(sr.output), 'El estudiante recibe su resultado individual');
  ok(!last(doc, 'studentResult'), 'El resultado individual NO se envía al docente');

  log('\n== PRUEBA 7: envío y revisión ==');
  est.send(JSON.stringify({ type: 'submit', title: 'Ejercicio 1', code: 'sd(c(2,4,6,8))' }));
  const subs = await until(doc, 'submissions');
  ok(subs && subs.list.length >= 1 && subs.list[0].title === 'Ejercicio 1', 'El docente recibe el envío del estudiante');
  const subId = subs.list[0].id;

  doc.send(JSON.stringify({ type: 'runSubmission', id: subId, code: 'sd(c(2,4,6,8))' }));
  const rres = await until(doc, 'studentResult');
  ok(rres && /2\.58/.test(rres.output), 'El docente puede ejecutar el envío (sd ≈ 2.58)');

  doc.send(JSON.stringify({ type: 'review', id: subId, feedback: 'Bien, pero usa var().', correctedCode: 'var(c(2,4,6,8))' }));
  const rev = await until(est, 'review');
  ok(rev && rev.feedback.includes('var()') && rev.correctedCode.includes('var('), 'El estudiante recibe la revisión y el código corregido');

  log('\n== PRUEBA 8: roster ==');
  const ro = last(doc, 'roster') || we && null;
  const roster = await until(doc, 'roster');
  ok(roster && roster.users.length >= 2, 'El roster refleja al menos 2 conectados');

  log(`\n==== RESULTADO: ${pass} pasadas, ${fail} fallidas ====\n`);
  doc.close(); est.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR EN PRUEBA:', e); process.exit(2); });
