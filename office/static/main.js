// Giriş noktası: layout ve agent'ları yükler, modu seçer (canlı / demo) ve çizim döngüsünü çalıştırır.
import { W, P, setCtx } from './scene/iso.js';
import { room } from './scene/room.js';
import { TYPES, depthOf } from './scene/furniture.js';
import { sprite } from './scene/sprites.js';
import { setGrid } from './scene/pathfind.js';
import { AG, KEYS, S, agentInfo, clock, hooks, ingest, initAgents, itemOn, resetAll, upd } from './state.js';
import { feed, clearFeed, panels } from './ui/panels.js';
import { initManagerWatch, initTerminals, isLocal } from './ui/terminals.js';
import { connectEvents, getJSON } from './api.js';
import { demo, initDemoControls, speed, tick } from './demo.js';

const $ = id => document.getElementById(id);
const cv = $('cv');
setCtx(cv.getContext('2d'));
const ov = $('ov'), scene = $('scene');

// Konuşma balonu ve isim etiketi (DOM katmanı)
hooks.feed = feed; hooks.clearFeed = clearFeed; hooks.panels = panels;
hooks.agentAdded = a => {
  a.bub = document.createElement('div'); a.bub.className = 'bub'; ov.appendChild(a.bub);
  a.tag = document.createElement('div'); a.tag.className = 'tag'; a.tag.textContent = a.label; ov.appendChild(a.tag);
};

let ITEMS = []; // [{depth, it}] çizim sırasına göre (zemin katmanı hariç)
const env = { on: itemOn, t: 0 };

export function draw() {
  env.t = clock.t;
  room(S.layout, S.tasks.map(t => ({ st: t.st, color: agentInfo(t.a).shirt })));
  const list = ITEMS.map(({ depth, it }) => ({ k: depth, d: () => TYPES[it.type].draw(it, env) }));
  for (const k of KEYS) { const a = AG[k]; list.push({ k: a.x + a.y, d: () => sprite(a) }); }
  list.sort((p, q) => p.k - q.k).forEach(i => i.d()); // sort kararlı: eşit anahtarda layout sırası
}

function overlay() {
  const r = cv.getBoundingClientRect(), s = r.width / W; scene.classList.toggle('small', s < 1.55);
  for (const k of KEYS) {
    const a = AG[k]; const [sx, sy] = P(a.x, a.y);
    const show = clock.t < a.bubUntil; a.bub.classList.toggle('show', show);
    if (show) {
      const bw = a.bub.offsetWidth;
      a.bub.style.left = Math.min(Math.max(sx * s, bw / 2 + 4), r.width - bw / 2 - 4) + 'px';
      a.bub.style.top = Math.max((sy - 26) * s, a.bub.offsetHeight + 6) + 'px';
    }
    a.tag.style.left = sx * s + 'px'; a.tag.style.top = sy * s + 'px';
  }
}

function loadLayout(layout, agents) {
  for (const it of layout.items) if (!TYPES[it.type]) console.warn(`[ofis] bilinmeyen eşya tipi "${it.type}" (${it.id})`);
  ITEMS = layout.items.filter(it => TYPES[it.type] && TYPES[it.type].layer !== 'floor').map(it => ({ depth: depthOf(it), it }));
  setGrid(layout);
  initAgents(layout, agents);
}

// Mod seçimi: #demo → demo oynatıcı; #freeze[=work] → görsel test karesi; aksi halde her zaman canlı.
const FZ = /^#freeze(=(\w+))?$/.exec(location.hash);
const DEMO = location.hash === '#demo';
window.addEventListener('hashchange', () => location.reload());
window.researchLAB = { ingest };

function startLive() {
  S.live = true; S.estimateTokens = false;
  $('lede').textContent = "Agent'ların hook olaylarından beslenen canlı ofis. Sayfa yenilenince son oturum sessizce geri yüklenir.";
  $('toknote').textContent = 'Token: alt agent bitince (SubagentStop) ve her tur sonunda (Stop) transcript usage alanından gerçek değer.';
  const src = $('src');
  if (!isLocal) { src.textContent = 'Kaynak: canlı bağlantı yok. Ofisi ./office/office.sh ile aç (http://localhost:8765) ya da demo için #demo.'; return; }
  let es = null;
  try {
    es = connectEvents({ replay: 300, onOpen: () => { resetAll(); src.textContent = 'Kaynak: canlı (events.jsonl)'; }, onEvent: ingest });
  } catch (_) { es = null; }
  if (!es) { src.textContent = 'Kaynak: bu tarayıcı SSE desteklemiyor.'; return; }
  es.addEventListener('error', () => { src.textContent = 'Kaynak: sunucuya bağlanılamıyor, yeniden deneniyor…'; });
}

function startDemo() {
  S.live = false; S.estimateTokens = true;
  $('demobadge').hidden = false; $('democtrl').hidden = false;
  $('lede').innerHTML = 'Demo: iris-baseline testini taklit eden örnek olaylar oynuyor. Kendi <code>events.jsonl</code> dosyanı yükleyerek bir oturumu yeniden oynatabilirsin. Canlı ofis için adresin sonundaki <code>#demo</code>\'yu kaldır.';
  $('toknote').textContent = 'Token değerleri demo için örnektir.';
  initDemoControls(); demo();
}

let last = performance.now(), pt = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; const sd = dt * speed(); clock.t += sd;
  tick(dt);
  KEYS.forEach(k => upd(AG[k], sd)); draw(); overlay();
  pt += dt; if (pt > 0.4) { pt = 0; panels(); }
  requestAnimationFrame(frame);
}

async function boot() {
  let layout, agents;
  try {
    [layout, agents] = await Promise.all([getJSON('/api/layout'), getJSON('/api/agents')]);
  } catch (e) {
    $('src').textContent = 'Ofis düzeni yüklenemedi (' + e.message + '). Sayfayı ./office/office.sh ile açılan sunucudan aç.';
    return;
  }
  loadLayout(layout, agents.agents || []);
  // Test: #freeze ya da ?terms=0 iken gerçek terminallere (tmux) bağlanma
  if (!FZ && new URLSearchParams(location.search).get('terms') !== '0') { initTerminals(); initManagerWatch(); }
  panels();
  if (FZ) {
    // Görsel regresyon testi: sabit zamanda tek kare çiz, pikselleri DOM'a yaz
    clock.t = 1.0;
    if (FZ[2] === 'work') KEYS.forEach(k => { AG[k].state = k === 'manager' ? 'manage' : 'working'; });
    draw(); document.documentElement.dataset.canvas = cv.toDataURL();
    return;
  }
  if (DEMO) startDemo(); else startLive();
  requestAnimationFrame(frame);
}
boot();
