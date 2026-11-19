// Giriş noktası: sahneyi kurar, modu seçer (canlı / demo) ve çizim döngüsünü çalıştırır.
import { W, setCtx } from './scene/iso.js';
import { room } from './scene/room.js';
import { ITEMS } from './scene/furniture.js';
import { sprite } from './scene/sprites.js';
import { AG, KEYS, S, clock, hooks, ingest, resetAll, resetChar, upd } from './state.js';
import { P } from './scene/iso.js';
import { feed, clearFeed, panels } from './ui/panels.js';
import { initTerminals, isLocal } from './ui/terminals.js';
import { connectEvents } from './api.js';
import { demo, initDemoControls, setSource, speed, stopPlayback, tick } from './demo.js';

const cv = document.getElementById('cv');
setCtx(cv.getContext('2d'));
const ov = document.getElementById('ov'), scene = document.getElementById('scene');

hooks.feed = feed; hooks.clearFeed = clearFeed; hooks.panels = panels;

// Konuşma balonu ve isim etiketi (DOM katmanı)
for (const k of KEYS) {
  const a = AG[k];
  a.bub = document.createElement('div'); a.bub.className = 'bub'; ov.appendChild(a.bub);
  a.tag = document.createElement('div'); a.tag.className = 'tag';
  a.tag.textContent = k === 'manager' ? 'Manager' : a.name.replace('Software Researcher', 'Software'); ov.appendChild(a.tag);
}

export function draw() {
  room();
  const list = ITEMS.map(i => ({ k: i.k, d: i.d }));
  for (const k of KEYS) { const a = AG[k]; list.push({ k: a.x + a.y, d: () => sprite(a) }); }
  list.sort((p, q) => p.k - q.k).forEach(i => i.d());
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

initTerminals();
initDemoControls();

// Yerel canlı mod: office/server.py /events üzerinden SSE yayınlar.
window.researchLAB = { ingest };
const FZ = /#freeze(=(\w+))?/.exec(location.hash); // test: sabit tek kare
if (!FZ && isLocal) {
  try {
    S.live = true;
    connectEvents({ replay: 300, onOpen: () => { stopPlayback(); resetAll(); setSource('canlı (events.jsonl)'); }, onEvent: ingest });
  } catch (_) { /* SSE yok */ }
}

let last = performance.now(), pt = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; const sd = dt * speed(); clock.t += sd;
  tick(dt);
  KEYS.forEach(k => upd(AG[k], sd)); draw(); overlay();
  pt += dt; if (pt > 0.4) { pt = 0; panels(); }
  requestAnimationFrame(frame);
}

KEYS.forEach(k => resetChar(AG[k])); panels();
if (FZ) {
  // Görsel regresyon testi: sabit zamanda tek kare çiz, pikselleri DOM'a yaz
  clock.t = 1.0;
  if (FZ[2] === 'work') KEYS.forEach(k => { AG[k].state = k === 'manager' ? 'manage' : 'working'; });
  draw(); document.documentElement.dataset.canvas = cv.toDataURL();
} else { demo(); requestAnimationFrame(frame); }
