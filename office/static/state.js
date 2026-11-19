// Agent durumları, görevler ve olay işleme (ingest).
// Agent'lar /api/agents + layout.json masa atamalarından kurulur; kimlik olaydaki agent_type'ın tam adıdır.
import { TYPES } from './scene/furniture.js';
import { route } from './scene/pathfind.js';

export const AG = {};      // ad → agent (yalnızca masası olanlar; ofiste çizilir)
export const KEYS = [];    // çizim/panel sırası, 'manager' ilk
export let M = null;       // Manager
export const LBL = { idle: 'boşta', working: 'çalışıyor', deliver: 'teslim ediyor', manage: 'yönetiyor', review: 'kontrol ediyor' };
const WORKING = new Set(['working', 'manage', 'review']);

// Paylaşılan durum. clock.t: simülasyon zamanı (sn)
export const clock = { t: 0 };
export const S = { tasks: [], tid: 0, active: new Set(), quiet: false, live: false, estimateTokens: true, layout: null, handoff: null };
// UI kancaları (main.js bağlar)
export const hooks = { feed: () => {}, panels: () => {}, clearFeed: () => {}, agentAdded: () => {} };

const UNKNOWN_COLOR = '#868e96';
const warned = new Set();

/** layout + /api/agents yanıtından ofis ekibini kurar. */
export function initAgents(layout, agents) {
  S.layout = layout;
  for (const k of Object.keys(AG)) delete AG[k];
  KEYS.length = 0;
  const byName = Object.fromEntries(agents.map(a => [a.name, a]));
  const items = Object.fromEntries(layout.items.map(i => [i.id, i]));
  for (const [deskId, name] of Object.entries(layout.desks || {})) {
    const desk = items[deskId], info = byName[name];
    if (!desk || TYPES[desk.type]?.seat == null) { console.warn(`[ofis] ${deskId}: masa bulunamadı`); continue; }
    if (!info) { console.warn(`[ofis] ${name}: agents.json'da görünüş yok, çizilmiyor`); continue; }
    AG[name] = {
      k: name, name: info.display_name || name, label: info.label || info.display_name || name,
      shirt: info.shirt, hair: info.hair, acc: info.accessory, desk, seat: TYPES[desk.type].seat(desk),
      description: info.description || '', model: info.model || '',
    };
  }
  KEYS.push(...Object.keys(AG).sort((a, b) => (a === 'manager' ? -1 : b === 'manager' ? 1 : 0)));
  M = AG.manager || null;
  const h = layout.handoff, hd = h && items[h.desk];
  S.handoff = hd && TYPES[hd.type].front ? TYPES[hd.type].front(hd, h.dist ?? 0.45) : (M ? M.seat : [1, 1]);
  KEYS.forEach(k => { resetChar(AG[k]); hooks.agentAdded(AG[k]); });
}

/** Panel ve olay akışı için: bilinmeyen agent'lar gri ve ham adıyla görünür. */
export function agentInfo(name) {
  const a = AG[name];
  return a ? { name: a.name, shirt: a.shirt, known: true } : { name: name || '?', shirt: UNKNOWN_COLOR, known: false };
}

/** Eşyaya bağlı agent çalışıyor mu? (masa → atanan agent; server_rack → linked_desk) */
export function itemOn(it) {
  const deskId = it.type === 'desk' ? it.id : it.props?.linked_desk;
  const owner = deskId && S.layout?.desks?.[deskId];
  const a = owner && AG[owner];
  return !!a && WORKING.has(a.state);
}

export function resetChar(a) {
  a.x = a.px = a.seat[0]; a.y = a.py = a.seat[1]; a.q = []; a.state = 'idle';
  a.walking = false; a.walkT = 0; a.face = 0; a.bubUntil = 0; a.tok = 0;
}
export function say(a, text, s) { if (!text || S.quiet || !a.bub) return; a.bub.textContent = text; a.bubUntil = clock.t + s; }
export const push = (a, ...acts) => a.q.push(...acts);

// Planlanan son konumdan (px, py) hedefe rota çıkarıp kuyruğa ekler. stop: hedefe bu kadar kala dur.
export function goTo(a, x, y, stop = 0) {
  let pts = route([a.px, a.py], [x, y]);
  if (stop > 0 && pts.length) pts = truncate([[a.px, a.py], ...pts], stop).slice(1);
  for (const [px, py] of pts) {
    if (Math.abs(a.px - px) + Math.abs(a.py - py) < 0.001) continue;
    a.q.push({ t: 'walk', x: px, y: py }); a.px = px; a.py = py;
  }
}
// Yolu sondan `dist` kadar kısaltır
function truncate(pts, dist) {
  let left = dist;
  for (let i = pts.length - 1; i > 0; i--) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i], seg = Math.hypot(x2 - x1, y2 - y1);
    if (seg > left) { const f = (seg - left) / seg; return [...pts.slice(0, i), [x1 + (x2 - x1) * f, y1 + (y2 - y1) * f]]; }
    left -= seg;
  }
  return pts.slice(0, 1);
}
const goHome = a => goTo(a, a.seat[0], a.seat[1]);

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
function setTask(a, st, from) { const t = [...S.tasks].reverse().find(t => t.a === a && (!from || from.includes(t.st))); if (t) t.st = st; }
function closeReviewed() { S.tasks.forEach(t => { if (t.st === 'kontrolde') t.st = 'bitti'; }); }
function known(name, ev) {
  if (AG[name]) return true;
  if (!warned.has(name)) { warned.add(name); console.warn(`[ofis] bilinmeyen agent_type "${name}": olay akışında görünür, ofiste çizilmez (${ev.hook_event_name})`); }
  return false;
}

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
  if (!AG[a]) return;
  const u = ev.usage; let n = ev.tokens;
  if (n == null && u) n = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0);
  if (n == null) n = S.estimateTokens ? Math.ceil(JSON.stringify(ev).length / 4) : 0;
  AG[a].tok += n;
}

/* ---------- davranışlar ---------- */
function delegate(s, desc) {
  closeReviewed();
  S.tasks.push({ id: ++S.tid, a: s, txt: short(desc, 70), st: 'bekliyor' });
  const a = AG[s];
  if (S.quiet || !a || !M) return;
  push(M, { t: 'state', v: 'manage' }); goTo(M, a.seat[0], a.seat[1], 0.9);
  push(M, { t: 'say', text: a.name + ': ' + short(desc, 70), s: 3.2 }, { t: 'wait', s: 1.2 }, { t: 'fn', f: () => say(a, 'Tamam, başlıyorum.', 2.2) }, { t: 'wait', s: 0.6 });
  goHome(M); push(M, { t: 'state', v: 'idle' });
}
function start(s) {
  S.active.add(s); const a = AG[s];
  if (a) { if (S.quiet) a.state = 'working'; else push(a, { t: 'state', v: 'working' }); }
  setTask(s, 'çalışıyor', ['bekliyor']);
}
function deliver(s, msg) {
  S.active.delete(s); setTask(s, 'kontrolde', ['çalışıyor', 'bekliyor']);
  const a = AG[s]; if (!a) return;
  if (S.quiet || !M) { a.state = 'idle'; return; }
  push(a, { t: 'state', v: 'deliver' }); goTo(a, ...S.handoff);
  push(a, { t: 'say', text: short(msg || 'İş bitti, teslim ediyorum.', 110), s: 4 }, { t: 'wait', s: 2.4 }, { t: 'fn', f: () => { M.state = 'review'; say(M, 'Kontrol ediyorum…', 2.5); } });
  goHome(a);
  push(a, { t: 'state', v: 'idle' }, { t: 'fn', f: () => { if (M.state === 'review') M.state = 'idle'; } });
}

export function ingest(ev) {
  if (!ev || typeof ev !== 'object') return;
  // 20 sn'den eski olaylar (ör. sayfa yenilenince /events?replay=N) panoyu animasyonsuz kurar
  const ts = Date.parse(ev.timestamp); S.quiet = S.live && !isNaN(ts) && Date.now() - ts > 20000;
  const n = ev.hook_event_name || '?', ti = ev.tool_input || {}, deleg = /^(Agent|Task)$/.test(ev.tool_name || '');
  // agent_type yoksa olay ana oturumundur (Manager)
  const at = ev.agent_type || ev.agent_name || (ev.agent && ev.agent.agent_type) || null;
  const a = deleg || !at ? 'manager' : at;
  const k = known(a, ev);
  let msg = '';
  if (n === 'SessionStart') { msg = 'Oturum açıldı'; if (M) say(M, 'Günaydın ekip, ofis açık.', 3); }
  else if (n === 'UserPromptSubmit') { msg = short(ev.prompt || ev.summary, 80); if (M) say(M, 'Yeni görev: ' + short(ev.prompt || ev.summary, 80), 4.5); }
  else if (deleg && n === 'PreToolUse') {
    const s = ti.subagent_type || 'general-purpose'; known(s, ev);
    msg = '→ ' + agentInfo(s).name + ': ' + short(ti.description || ti.prompt, 60); delegate(s, ti.description || ti.prompt || 'Görev');
  }
  else if (deleg) { msg = 'alt agent dönüşü'; }
  else if (n === 'SubagentStart') { msg = 'işe başladı'; start(a); }
  else if (n === 'SubagentStop') { msg = short(ev.last_assistant_message || 'bitti', 80); deliver(a, ev.last_assistant_message); }
  else if (n === 'Stop') { msg = 'tur tamamlandı'; closeReviewed(); if (M) say(M, 'Tur tamamlandı. Rapor hazır.', 4); }
  else if (n === 'Notification') { msg = short(ev.message || ev.summary, 80); if (M) say(M, 'Dikkat: ' + msg, 4); }
  else if (/ToolUse/.test(n)) {
    const line = toolLine(ev); msg = line || short(ev.summary || ev.tool_name, 80);
    if (a !== 'manager' && !S.active.has(a)) start(a);
    const c = AG[a];
    if (k && line && !S.quiet) (c.q.length ? push(c, { t: 'say', text: line, s: 2.6 }) : say(c, line, 2.6));
  }
  else msg = short(ev.summary, 80);
  addTok(a, ev); hooks.feed(a, ev, msg); hooks.panels();
}

export function resetAll() {
  clock.t = 0; S.tasks = []; S.tid = 0; S.active.clear();
  KEYS.forEach(k => resetChar(AG[k])); hooks.clearFeed(); hooks.panels();
}
