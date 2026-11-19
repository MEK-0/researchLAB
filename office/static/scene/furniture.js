// Eşya çizimleri ve sahnedeki eşya listesi.
import { P, poly, box, wallQ, backQ, C } from './iso.js';
import { AG, M, clock } from '../state.js';

export function desk(x, y, w, d, side) {
  for (const [lx, ly] of [[x + 0.05, y + 0.05], [x + w - 0.17, y + 0.05], [x + 0.05, y + d - 0.17], [x + w - 0.17, y + d - 0.17]]) box(lx, ly, 0.12, 0.12, 9, C.leg);
  if (side === 'y') box(x + 0.2, y + d - 0.25, w - 0.4, 0.08, 5, C.grey, 4); else box(x + w - 0.25, y + 0.2, 0.08, d - 0.4, 5, C.grey, 4);
  box(x, y, w, d, 1.5, C.desk, 9);
}
export function monitor(x, y, on, w = 0.9) {
  box(x + w / 2 - 0.2, y, 0.4, 0.28, 0.6, C.leg, 10.5); box(x + w / 2 - 0.05, y + 0.06, 0.1, 0.1, 3, C.leg, 11);
  box(x, y + 0.1, w, 0.1, 7, C.mon, 13.5);
  const s = y + 0.2; poly([P(x + 0.07, s, 14.3), P(x + w - 0.07, s, 14.3), P(x + w - 0.07, s, 19.8), P(x + 0.07, s, 19.8)], on ? '#7ee0ff' : '#2a3a44');
  if (on) {
    const f = Math.floor(clock.t * 4) % 3;
    for (let i = 0; i < 3; i++) { const z = 18.6 - i * 1.6, l = 0.14 + ((i + f) % 3) * 0.12; poly([P(x + l, s, z), P(x + l + 0.32, s, z), P(x + l + 0.32, s, z - 0.8), P(x + l, s, z - 0.8)], '#1b5e7a'); }
  }
}
export function chair(cx, cy, dir) {
  box(cx - 0.26, cy - 0.26, 0.52, 0.52, 0.8, C.chair); box(cx - 0.05, cy - 0.05, 0.1, 0.1, 4, C.leg, 0.8);
  box(cx - 0.3, cy - 0.3, 0.6, 0.6, 1.5, C.chair, 4.8);
  if (dir === 'n') box(cx - 0.3, cy - 0.44, 0.6, 0.12, 9, C.chair, 5.5);
  if (dir === 's') box(cx - 0.3, cy + 0.32, 0.6, 0.12, 9, C.chair, 5.5);
  if (dir === 'w') box(cx - 0.44, cy - 0.3, 0.12, 0.6, 9, C.chair, 5.5);
}
export function plant(x, y, tall) {
  box(x, y, 0.6, 0.6, tall ? 9 : 6, C.pot); const z = tall ? 9 : 6;
  box(x + 0.05, y + 0.05, 0.5, 0.5, tall ? 8 : 6, C.leaf, z); box(x - 0.05, y + 0.15, 0.35, 0.35, 6, C.leaf2, z + (tall ? 6 : 4)); box(x + 0.3, y - 0.02, 0.35, 0.35, 6, C.leaf, z + (tall ? 9 : 5));
  if (tall) { box(x + 0.1, y + 0.1, 0.4, 0.4, 7, C.leaf2, z + 14); box(x + 0.2, y + 0.2, 0.25, 0.25, 5, C.leaf, z + 20); }
}
export function lamp(x, y, on) {
  box(x, y, 0.3, 0.3, 0.6, C.dark, 10.5); box(x + 0.12, y + 0.12, 0.06, 0.06, 8, C.leg, 11);
  box(x - 0.05, y - 0.05, 0.4, 0.4, 3, on ? ['#ffe066', '#fab005', '#f08c00'] : ['#e9ecef', '#adb5bd', '#868e96'], 19);
}
const BOOKS = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22', '#34495e', '#ecf0f1'];
export function shelf(y, d) {
  box(0, y, 0.7, d, 44, C.white);
  for (let r = 0; r < 4; r++) {
    const z0 = 3 + r * 10; let i = r * 3 + Math.round(y);
    for (let yy = y + 0.08; yy < y + d - 0.15; yy += 0.19) { const h = 6 + ((i * 7) % 3); if ((i * 5) % 11 !== 0) poly([P(0.7, yy, z0), P(0.7, yy + 0.15, z0), P(0.7, yy + 0.15, z0 + h), P(0.7, yy, z0 + h)], BOOKS[i % BOOKS.length]); i++; }
    poly([P(0.7, y, z0 - 1), P(0.7, y + d, z0 - 1), P(0.7, y + d, z0), P(0.7, y, z0)], '#d2d2cc');
  }
}
export function glassX(y1, y2) {
  const x = 4.6; wallQ(y1, y2, 2, 46, 'rgba(185,222,238,.32)', x); wallQ(y1, y2, 0, 2, '#8f9aa1', x); wallQ(y1, y2, 46, 48, '#8f9aa1', x); wallQ(y1, y1 + 0.06, 0, 48, '#8f9aa1', x);
  poly([P(x, y1 + 0.25, 10), P(x, y1 + 0.45, 10), P(x, y1 + 0.75, 40), P(x, y1 + 0.55, 40)], 'rgba(255,255,255,.28)');
}
export function glassY(x1, x2) {
  const y = 4.2; backQ(x1, x2, 2, 46, 'rgba(185,222,238,.32)', y); backQ(x1, x2, 0, 2, '#8f9aa1', y); backQ(x1, x2, 46, 48, '#8f9aa1', y); backQ(x2 - 0.06, x2, 0, 48, '#8f9aa1', y);
  poly([P(x1 + 0.3, y, 10), P(x1 + 0.5, y, 10), P(x1 + 0.8, y, 40), P(x1 + 0.6, y, 40)], 'rgba(255,255,255,.28)');
}

// k: çizim sırası (ressam algoritması; küçük k önce çizilir)
export const ITEMS = [
  // manager glass office
  { k: 1.2, d: () => { box(0, 0.3, 0.6, 1.2, 14, C.white); plant(0.05, 0.55, false); } },
  { k: 3.9, d: () => { box(0.2, 2.6, 0.8, 1.4, 5, C.sofa); box(0.2, 2.6, 0.25, 1.4, 11, C.sofa); } },
  { k: 3.25, d: () => chair(2.5, 0.95, 'n') },
  { k: 4.7, d: () => { desk(1.0, 1.7, 3.0, 1.0, 'y'); monitor(1.55, 1.75, M.state === 'manage' || M.state === 'review'); box(3.35, 1.95, 0.2, 0.2, 2.5, C.white, 10.5); box(2.75, 2.05, 0.5, 0.4, 0.6, C.paper, 10.5); } },
  { k: 4.65, d: () => plant(3.9, 0.2, true) },
  { k: 5.1, d: () => glassX(0, 1) }, { k: 6.1, d: () => glassX(1, 2) }, { k: 7.1, d: () => glassX(2, 3) }, { k: 8.2, d: () => glassX(3, 4.2) },
  { k: 4.7, d: () => glassY(0, 1) }, { k: 5.7, d: () => glassY(1, 2) }, { k: 8.1, d: () => glassY(3.2, 4.6) },
  { k: 6.8, d: () => { backQ(1.94, 2.0, 0, 48, '#8f9aa1', 4.2); backQ(3.2, 3.26, 0, 48, '#8f9aa1', 4.2); backQ(2.0, 3.2, 46, 48, '#8f9aa1', 4.2); } },
  { k: 8.8, d: () => plant(3.7, 4.5, false) },
  // printer + meeting area
  { k: 6.05, d: () => { box(4.95, 0.3, 1.0, 0.7, 10, C.grey); box(5.1, 0.4, 0.7, 0.5, 1, C.dark, 10); box(5.2, 0.45, 0.5, 0.4, 0.6, C.paper, 11); } },
  { k: 9.05, d: () => chair(7.1, 1.95, 'n') }, { k: 10.85, d: () => chair(8.9, 1.95, 'n') },
  { k: 11.1, d: () => { box(7.7, 2.9, 0.6, 0.4, 6, C.leg); box(6.6, 2.4, 2.8, 1.4, 1.5, C.desk, 6); box(7.0, 2.7, 0.6, 0.4, 0.6, C.dark, 7.5); box(8.6, 3.1, 0.18, 0.18, 2, C.white, 7.5); } },
  { k: 11.35, d: () => chair(7.1, 4.25, 's') }, { k: 13.15, d: () => chair(8.9, 4.25, 's') },
  // software researcher
  { k: 12.75, d: () => chair(12, 0.95, 'n') },
  { k: 14.1, d: () => { const o = AG.sr.state === 'working'; desk(10.2, 1.6, 3.6, 1.0, 'y'); monitor(10.3, 1.7, o); monitor(11.25, 1.7, o); box(11.75, 1.72, 0.75, 0.25, 0.6, C.white, 10.5); box(13.2, 1.9, 0.2, 0.2, 2.5, ['#e8590c', '#c44a0a', '#a83f08'], 10.5); } },
  { k: 15.75, d: () => {
    box(14.7, 0.2, 0.9, 0.8, 40, C.dark); const on = AG.sr.state === 'working';
    for (let r = 0; r < 7; r++) {
      const z = 6 + r * 5; poly([P(14.8, 1.0, z), P(15.5, 1.0, z), P(15.5, 1.0, z + 3), P(14.8, 1.0, z + 3)], '#1b1e23');
      const b = on && ((Math.floor(clock.t * 6) + r) % 3 === 0); poly([P(15.3, 1.0, z + 1), P(15.4, 1.0, z + 1), P(15.4, 1.0, z + 2), P(15.3, 1.0, z + 2)], b ? '#ffd43b' : '#51cf66');
    }
  } },
  { k: 10.8, d: () => plant(10.0, 0.2, true) },
  // literature corner
  { k: 7.25, d: () => shelf(5.9, 2.0) }, { k: 9.35, d: () => shelf(8.0, 2.0) },
  { k: 9.5, d: () => chair(1.4, 8.3, 'w') },
  { k: 10.9, d: () => { const o = AG.lit.state === 'working'; desk(2.1, 7.0, 1.0, 2.6, 'x'); box(2.25, 7.1, 0.55, 0.45, 4, ['#7048e8', '#5f3dc4', '#4c2fa3'], 10.5); box(2.3, 7.15, 0.45, 0.35, 2.5, ['#e03131', '#c92a2a', '#a61e1e'], 14.5); lamp(2.65, 7.75, o); box(2.25, 8.0, 0.6, 0.55, o ? 1.2 : 0.6, C.paper, 10.5); } },
  // writer
  { k: 16.5, d: () => chair(8.2, 8.5, 'n') },
  { k: 17.9, d: () => { const o = AG.wr.state === 'working'; desk(6.6, 9.2, 3.2, 1.0, 'y'); monitor(6.8, 9.3, o); box(8.9, 9.35, 0.5, 0.55, o ? 4 : 2, C.paper, 10.5); box(9.55, 9.5, 0.18, 0.18, 2.5, C.white, 10.5); } },
  // referee
  { k: 20.1, d: () => chair(12, 8.3, 'w') },
  { k: 21.5, d: () => { const o = AG.ref.state === 'working'; desk(12.7, 7.0, 1.0, 2.6, 'x'); lamp(13.15, 7.15, o); box(12.85, 8.0, 0.6, 0.5, o ? 2 : 1, C.paper, 10.5); box(13.1, 8.75, 0.22, 0.22, 2, ['#e03131', '#c92a2a', '#a61e1e'], 10.5); } },
  // kitchen corner + decor
  { k: 20.85, d: () => { box(15.0, 4.4, 0.9, 2.0, 12, C.white); box(15.15, 4.6, 0.55, 0.5, 7, C.dark, 12); box(15.3, 5.4, 0.18, 0.18, 2, C.white, 12); box(15.3, 5.75, 0.18, 0.18, 2, ['#e8590c', '#c44a0a', '#a83f08'], 12); } },
  { k: 23, d: () => { box(15.1, 7.2, 0.7, 0.7, 14, C.white); box(15.2, 7.3, 0.5, 0.5, 8, ['#a5d8ff', '#74c0fc', '#4dabf7'], 14); } },
  { k: 11.9, d: () => plant(0.3, 11.0, true) }, { k: 26.7, d: () => plant(15.1, 11.0, true) },
];
