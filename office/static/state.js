// Agent durumları, görevler ve olay işleme (ingest).
import { walk, leave, enter, travel } from './scene/pathfind.js';

export const AG = {
  manager: { name: 'Manager', shirt: '#e8590c', hair: '#3b2a20', acc: 'tie', seat: [2.5, 0.95], out: [[4.15, 0.95], [4.15, 3.1], [2.6, 3.1], [2.6, 4.9]], visit: [2.6, 3.1] },
  sr: { name: 'Software Researcher', shirt: '#1c7ed6', hair: '#1d1d1d', acc: 'phones', seat: [12, 0.95], out: [[14.25, 0.95], [14.25, 3.1]] },
  lit: { name: 'Prof. Literatür', shirt: '#ae3ec9', hair: '#bdbdbd', acc: 'bun', seat: [1.4, 8.3], out: [[1.4, 6.3]] },
  wr: { name: 'Prof. Yazar', shirt: '#f59f00', hair: '#6b3e1f', acc: 'beret', seat: [8.2, 8.5], out: [[6.2, 8.5]] },
  ref: { name: 'Hakem', shirt: '#c92a2a', hair: '#2a2a2a', acc: 'glasses', seat: [12, 8.3], out: [[12, 6.3]] },
};
export const KEYS = Object.keys(AG);
export const M = AG.manager;
export const LBL = { idle: 'boşta', working: 'çalışıyor', deliver: 'teslim ediyor', manage: 'yönetiyor', review: 'kontrol ediyor' };
for (const k of KEYS) { const a = AG[k]; a.k = k; a.hall = a.out[a.out.length - 1]; }

// Paylaşılan durum. clock.t: simülasyon zamanı (sn)
export const clock = { t: 0 };
export const S = { tasks: [], tid: 0, active: new Set(), quiet: false, live: false, estimateTokens: true };
// UI kancaları (main.js bağlar)
export const hooks = { feed: () => {}, panels: () => {}, clearFeed: () => {} };

export function resetChar(a) {
  a.x = a.px = a.seat[0]; a.y = a.py = a.seat[1]; a.where = 'seat'; a.q = []; a.state = 'idle';
  a.walking = false; a.walkT = 0; a.face = 0; a.bubUntil = 0; a.tok = 0;
}
export function say(a, text, s) { if (!text || S.quiet) return; a.bub.textContent = text; a.bubUntil = clock.t + s; }
export const push = (a, ...acts) => a.q.push(...acts);

export function upd(a, dt) {
  for (let guard = 0; guard < 20 && a.q.length; guard++) {
    const s = a.q[0];
    if (s.t === 'walk') {
      const dx = s.x - a.x, dy = s.y - a.y, dist = Math.hypot(dx, dy), step = 4 * dt;
      a.walking = true; a.walkT += dt; const sd = dx - dy; a.face = sd > 0.01 ? 1 : sd < -0.01 ? -1 : a.face;
      if (dist <= step) { a.x = s.x; a.y = s.y; a.q.shift(); continue; }
      a.x += dx / dist * step; a.y += dy / dist * step; return;
    }
    a.walking = false;
    if (s.t === 'wait') { s.left = (s.left ?? s.s) - dt; if (s.left <= 0) { a.q.shift(); continue; } return; }
    if (s.t === 'say') { say(a, s.text, s.s); a.q.shift(); continue; }
    if (s.t === 'state') { a.state = s.v; a.q.shift(); continue; }
    if (s.t === 'fn') { s.f(); a.q.shift(); continue; }
  }
  if (!a.q.length) a.walking = false;
}

/* ---------- yardımcılar ---------- */
export const short = (t, n = 90) => { t = String(t ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const base = p => String(p || '').split('/').pop();
const norm = v => {
  v = String(v || '').toLowerCase(); if (!v) return null;
  if (v.includes('software')) return 'sr'; if (v.includes('lit')) return 'lit';
  if (v.includes('writer') || v.includes('yazar')) return 'wr'; if (v.includes('referee') || v.includes('hakem')) return 'ref';
  return null;
};
function setTask(a, st, from) { const t = [...S.tasks].reverse().find(t => t.a === a && (!from || from.includes(t.st))); if (t) t.st = st; }
function closeReviewed() { S.tasks.forEach(t => { if (t.st === 'kontrolde') t.st = 'bitti'; }); }

function toolLine(ev) {
  const ti = ev.tool_input || {}, tn = ev.tool_name || '';
  if (ev.hook_event_name === 'PostToolUse') return ev.summary && ev.summary !== tn ? 'Sonuç: ' + short(ev.summary, 80) : null;
  if (tn === 'Bash') return '$ ' + short(ti.command, 70);
  if (tn === 'Write') return 'Yazıyor: ' + base(ti.file_path);
  if (tn === 'Edit' || tn === 'MultiEdit') return 'Düzenliyor: ' + base(ti.file_path);
  if (tn === 'Read') return 'Okuyor: ' + base(ti.file_path);
  if (tn === 'WebSearch') return 'Arıyor: ' + short(ti.query, 60);
  if (tn === 'WebFetch') { try { return 'Açıyor: ' + new URL(ti.url).hostname; } catch (e) { return 'Sayfa açıyor'; } }
  if (tn === 'Grep' || tn === 'Glob') return 'Arıyor: ' + short(ti.pattern, 50);
  return tn ? tn + ' çalıştırıyor' : short(ev.summary, 80);
}

function addTok(a, ev) {
  const u = ev.usage; let n = ev.tokens;
  if (n == null && u) n = (u.input_tokens || 0) + (u.output_tokens || 0);
  if (n == null) n = S.estimateTokens ? Math.ceil(JSON.stringify(ev).length / 4) : 0;
  AG[a].tok += n;
}

/* ---------- davranışlar ---------- */
function delegate(s, desc) {
  closeReviewed(); const a = AG[s];
  S.tasks.push({ id: ++S.tid, a: s, txt: short(desc, 70), st: 'bekliyor' });
  if (S.quiet) return;
  push(M, { t: 'state', v: 'manage' }); leave(M); travel(M, ...a.hall);
  push(M, { t: 'say', text: a.name + ': ' + short(desc, 70), s: 3.2 }, { t: 'wait', s: 1.2 }, { t: 'fn', f: () => say(a, 'Tamam, başlıyorum.', 2.2) }, { t: 'wait', s: 0.6 });
  travel(M, ...M.hall); enter(M); push(M, { t: 'state', v: 'idle' });
}
function start(s) {
  S.active.add(s); const a = AG[s];
  if (S.quiet) a.state = 'working'; else push(a, { t: 'state', v: 'working' });
  setTask(s, 'çalışıyor', ['bekliyor']);
}
function deliver(s, msg) {
  S.active.delete(s); const a = AG[s]; setTask(s, 'kontrolde', ['çalışıyor', 'bekliyor']);
  if (S.quiet) { a.state = 'idle'; return; }
  push(a, { t: 'state', v: 'deliver' }); leave(a); travel(a, ...M.hall); walk(a, ...M.visit);
  push(a, { t: 'say', text: short(msg || 'İş bitti, teslim ediyorum.', 110), s: 4 }, { t: 'wait', s: 2.4 }, { t: 'fn', f: () => { M.state = 'review'; say(M, 'Kontrol ediyorum…', 2.5); } });
  walk(a, ...M.hall); travel(a, ...a.hall); enter(a);
  push(a, { t: 'state', v: 'idle' }, { t: 'fn', f: () => { if (M.state === 'review') M.state = 'idle'; } });
}

export function ingest(ev) {
  if (!ev || typeof ev !== 'object') return;
  // 20 sn'den eski olaylar (ör. sayfa yenilenince /events?replay=N) panoyu animasyonsuz kurar
  const ts = Date.parse(ev.timestamp); S.quiet = S.live && !isNaN(ts) && Date.now() - ts > 20000;
  const n = ev.hook_event_name || '?', ti = ev.tool_input || {}, deleg = /^(Agent|Task)$/.test(ev.tool_name || '');
  let a = deleg ? 'manager' : (norm(ev.agent_type || ev.agent_name || (ev.agent && (ev.agent.agent_type || ev.agent.type))) || (/ToolUse/.test(n) && S.active.size === 1 ? [...S.active][0] : 'manager'));
  let msg = '';
  if (n === 'SessionStart') { msg = 'Oturum açıldı'; say(M, 'Günaydın ekip, ofis açık.', 3); }
  else if (n === 'UserPromptSubmit') { msg = short(ev.prompt || ev.summary, 80); say(M, 'Yeni görev: ' + short(ev.prompt || ev.summary, 80), 4.5); }
  else if (deleg && n === 'PreToolUse') { const s = norm(ti.subagent_type) || 'sr'; msg = '→ ' + AG[s].name + ': ' + short(ti.description || ti.prompt, 60); delegate(s, ti.description || ti.prompt || 'Görev'); }
  else if (deleg) { msg = 'alt agent dönüşü'; }
  else if (n === 'SubagentStart') { a = norm(ev.agent_type || (ev.agent && ev.agent.agent_type)) || 'sr'; msg = 'işe başladı'; start(a); }
  else if (n === 'SubagentStop') { a = norm(ev.agent_type || (ev.agent && ev.agent.agent_type)) || (S.active.size === 1 ? [...S.active][0] : 'sr'); msg = short(ev.last_assistant_message || 'bitti', 80); deliver(a, ev.last_assistant_message); }
  else if (n === 'Stop') { msg = 'tur tamamlandı'; closeReviewed(); say(M, 'Tur tamamlandı. Rapor hazır.', 4); }
  else if (n === 'Notification') { msg = short(ev.message || ev.summary, 80); say(M, 'Dikkat: ' + msg, 4); }
  else if (/ToolUse/.test(n)) {
    const line = toolLine(ev); msg = line || short(ev.summary || ev.tool_name, 80); const c = AG[a];
    if (a !== 'manager' && !S.active.has(a)) start(a);
    if (line && !S.quiet) (c.q.length ? push(c, { t: 'say', text: line, s: 2.6 }) : say(c, line, 2.6));
  }
  else msg = short(ev.summary, 80);
  addTok(a, ev); hooks.feed(a, ev, msg); hooks.panels();
}

export function resetAll() {
  clock.t = 0; S.tasks = []; S.tid = 0; S.active.clear();
  KEYS.forEach(k => resetChar(AG[k])); hooks.clearFeed(); hooks.panels();
}
