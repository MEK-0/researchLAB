// Izgara tabanlı A* yol bulma (çeyrek kare çözünürlük).
// Engeller layout'taki eşyaların footprint'lerinden (furniture.obstaclesOf) ve oda
// sınırlarından üretilir; kapılarda yalnızca kasa dikmeleri engeldir.
import { obstaclesOf } from './furniture.js';

export const RES = 4;          // kare başına hücre
const MARGIN = 0.12;           // agent yarıçapı: engeller bu kadar şişirilir
const CLEAR = 0.45;            // başlangıç/hedef çevresinde serbest bırakılan yarıçap
const SQ2 = Math.SQRT2;

/** layout → { w, h, blocked: Uint8Array } */
export function buildGrid(layout) {
  const w = layout.room.gx * RES, h = layout.room.gy * RES, blocked = new Uint8Array(w * h);
  const center = i => (i + 0.5) / RES;
  for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
    const x = center(cx), y = center(cy);
    if (x < MARGIN + 0.05 || y < MARGIN + 0.05 || x > layout.room.gx - MARGIN || y > layout.room.gy - MARGIN) blocked[cy * w + cx] = 1;
  }
  for (const it of layout.items) {
    for (const [ox, oy, ow, od] of obstaclesOf(it)) {
      const x0 = ox - MARGIN, y0 = oy - MARGIN, x1 = ox + ow + MARGIN, y1 = oy + od + MARGIN;
      for (let cy = Math.max(0, Math.floor(y0 * RES)); cy < Math.min(h, Math.ceil(y1 * RES)); cy++) {
        for (let cx = Math.max(0, Math.floor(x0 * RES)); cx < Math.min(w, Math.ceil(x1 * RES)); cx++) {
          const x = center(cx), y = center(cy);
          if (x > x0 && x < x1 && y > y0 && y < y1) blocked[cy * w + cx] = 1;
        }
      }
    }
  }
  return { w, h, blocked };
}

const cellOf = (g, [x, y]) => [Math.min(g.w - 1, Math.max(0, Math.floor(x * RES))), Math.min(g.h - 1, Math.max(0, Math.floor(y * RES)))];

// Başlangıç ve hedef çevresini serbest bırakan engel testi
function makeBlocked(g, from, to) {
  return (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h) return true;
    if (!g.blocked[cy * g.w + cx]) return false;
    const x = (cx + 0.5) / RES, y = (cy + 0.5) / RES;
    return Math.hypot(x - from[0], y - from[1]) > CLEAR && Math.hypot(x - to[0], y - to[1]) > CLEAR;
  };
}

// İkili yığın (öncelik kuyruğu)
class Heap {
  constructor() { this.a = []; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top[1];
  }
  get size() { return this.a.length; }
}

/** A*: from/to dünya koordinatı. Bulursa hücre yolunu [[cx, cy], ...], bulamazsa null döner. */
export function astar(g, from, to) {
  const isBlocked = makeBlocked(g, from, to);
  const [sx, sy] = cellOf(g, from), [tx, ty] = cellOf(g, to);
  const idx = (x, y) => y * g.w + x;
  const gScore = new Float64Array(g.w * g.h).fill(Infinity), came = new Int32Array(g.w * g.h).fill(-1), closed = new Uint8Array(g.w * g.h);
  const hfn = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy); };
  const open = new Heap(); gScore[idx(sx, sy)] = 0; open.push(hfn(sx, sy), idx(sx, sy));
  while (open.size) {
    const cur = open.pop(); if (closed[cur]) continue; closed[cur] = 1;
    const cx = cur % g.w, cy = (cur / g.w) | 0;
    if (cx === tx && cy === ty) {
      const out = []; for (let c = cur; c !== -1; c = came[c]) out.push([c % g.w, (c / g.w) | 0]);
      return out.reverse();
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy; if (isBlocked(nx, ny)) continue;
      if (dx && dy && (isBlocked(cx + dx, cy) || isBlocked(cx, cy + dy))) continue; // köşe kesme yok
      const ni = idx(nx, ny); if (closed[ni]) continue;
      const ng = gScore[cur] + (dx && dy ? SQ2 : 1);
      if (ng < gScore[ni]) { gScore[ni] = ng; came[ni] = cur; open.push(ng + hfn(nx, ny), ni); }
    }
  }
  return null;
}

// a → b doğrusu engelsiz mi? (küçük adımlarla hücre örneklemesi)
function lineFree(g, isBlocked, a, b) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * RES * 3);
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0, [cx, cy] = cellOf(g, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    if (isBlocked(cx, cy)) return false;
  }
  return true;
}

/** Dünya koordinatlarında düzleştirilmiş yol: [ara noktalar..., hedef] (başlangıç hariç). Yoksa null. */
export function findPath(g, from, to) {
  const cells = astar(g, from, to); if (!cells) return null;
  const isBlocked = makeBlocked(g, from, to);
  const pts = [from, ...cells.slice(1, -1).map(([x, y]) => [(x + 0.5) / RES, (y + 0.5) / RES]), to];
  // görüş hattıyla düzleştirme (string pulling)
  const out = []; let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineFree(g, isBlocked, pts[i], pts[j])) j--;
    out.push(pts[j]); i = j;
  }
  return out;
}

let grid = null;
export function setGrid(layout) { grid = buildGrid(layout); }
export function getGrid() { return grid; }

/** state.js kullanır: yol bulunamazsa düz çizgi + konsol uyarısı. */
export function route(from, to) {
  if (!grid) return [to];
  const p = findPath(grid, from, to);
  if (!p) { console.warn(`[ofis] yol bulunamadı (${from.map(v => v.toFixed(2))} → ${to.map(v => v.toFixed(2))}), düz çizgi`); return [to]; }
  return p;
}
