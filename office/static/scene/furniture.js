// Eşya tipleri. Her tip:
//   draw(it, env)   çizim; env.on(it) → eşyaya bağlı agent çalışıyor mu, env.t → simülasyon zamanı
//   footprint(it)   [x, y, w, d] zemin alanı (yol bulma ve çizim sırası için)
//   seat(it)        (yalnızca masalar) [x, y] oturma noktası; rot'tan türetilir
//   depthBias       çizim sırası düzeltmesi (varsayılan 0)
//   blocks          yol bulmada engel mi (varsayılan true)
// it = { id, type, x, y, rot, props }. x, y tipin çapa noktasıdır (aşağıda her tipte belirtilmiş).
// rot (derece): 0 → agent +y'ye bakar (oturma tarafı -y), 90 → +x'e bakar (oturma tarafı -x), 180, 270.
import { P, poly, box, wallQ, backQ, C } from './iso.js';

const color = c => (Array.isArray(c) ? c : C[c] || C.white);
const p = it => it.props || {};

/* ---------- çizim parçaları ---------- */
export function deskBody(x, y, w, d, rot) {
  for (const [lx, ly] of [[x + 0.05, y + 0.05], [x + w - 0.17, y + 0.05], [x + 0.05, y + d - 0.17], [x + w - 0.17, y + d - 0.17]]) box(lx, ly, 0.12, 0.12, 9, C.leg);
  // ön panel oturma tarafının karşısında
  if (rot === 0) box(x + 0.2, y + d - 0.25, w - 0.4, 0.08, 5, C.grey, 4);
  else if (rot === 90) box(x + w - 0.25, y + 0.2, 0.08, d - 0.4, 5, C.grey, 4);
  else if (rot === 180) box(x + 0.2, y + 0.17, w - 0.4, 0.08, 5, C.grey, 4);
  else box(x + 0.17, y + 0.2, 0.08, d - 0.4, 5, C.grey, 4);
  box(x, y, w, d, 1.5, C.desk, 9);
}
export function monitor(x, y, on, t, w = 0.9) {
  box(x + w / 2 - 0.2, y, 0.4, 0.28, 0.6, C.leg, 10.5); box(x + w / 2 - 0.05, y + 0.06, 0.1, 0.1, 3, C.leg, 11);
  box(x, y + 0.1, w, 0.1, 7, C.mon, 13.5);
  const s = y + 0.2; poly([P(x + 0.07, s, 14.3), P(x + w - 0.07, s, 14.3), P(x + w - 0.07, s, 19.8), P(x + 0.07, s, 19.8)], on ? '#7ee0ff' : '#2a3a44');
  if (on) {
    const f = Math.floor(t * 4) % 3;
    for (let i = 0; i < 3; i++) { const z = 18.6 - i * 1.6, l = 0.14 + ((i + f) % 3) * 0.12; poly([P(x + l, s, z), P(x + l + 0.32, s, z), P(x + l + 0.32, s, z - 0.8), P(x + l, s, z - 0.8)], '#1b5e7a'); }
  }
}
export function chairAt(cx, cy, rot) {
  box(cx - 0.26, cy - 0.26, 0.52, 0.52, 0.8, C.chair); box(cx - 0.05, cy - 0.05, 0.1, 0.1, 4, C.leg, 0.8);
  box(cx - 0.3, cy - 0.3, 0.6, 0.6, 1.5, C.chair, 4.8);
  if (rot === 0) box(cx - 0.3, cy - 0.44, 0.6, 0.12, 9, C.chair, 5.5);
  if (rot === 180) box(cx - 0.3, cy + 0.32, 0.6, 0.12, 9, C.chair, 5.5);
  if (rot === 90) box(cx - 0.44, cy - 0.3, 0.12, 0.6, 9, C.chair, 5.5);
  if (rot === 270) box(cx + 0.32, cy - 0.3, 0.12, 0.6, 9, C.chair, 5.5);
}
export function plantAt(x, y, tall) {
  box(x, y, 0.6, 0.6, tall ? 9 : 6, C.pot); const z = tall ? 9 : 6;
  box(x + 0.05, y + 0.05, 0.5, 0.5, tall ? 8 : 6, C.leaf, z); box(x - 0.05, y + 0.15, 0.35, 0.35, 6, C.leaf2, z + (tall ? 6 : 4)); box(x + 0.3, y - 0.02, 0.35, 0.35, 6, C.leaf, z + (tall ? 9 : 5));
  if (tall) { box(x + 0.1, y + 0.1, 0.4, 0.4, 7, C.leaf2, z + 14); box(x + 0.2, y + 0.2, 0.25, 0.25, 5, C.leaf, z + 20); }
}
export function lampAt(x, y, on) {
  box(x, y, 0.3, 0.3, 0.6, C.dark, 10.5); box(x + 0.12, y + 0.12, 0.06, 0.06, 8, C.leg, 11);
  box(x - 0.05, y - 0.05, 0.4, 0.4, 3, on ? ['#ffe066', '#fab005', '#f08c00'] : ['#e9ecef', '#adb5bd', '#868e96'], 19);
}
const BOOKS = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22', '#34495e', '#ecf0f1'];

/* ---------- tipler ---------- */
const rect = it => [it.x, it.y, p(it).w, p(it).d];

export const TYPES = {
  // çapa: sol-üst köşe. props: w, d, seat_dist (varsayılan 0.7), deco[]
  desk: {
    footprint: rect,
    seat(it) {
      const { w, d } = p(it), s = p(it).seat_dist ?? 0.7, r = it.rot || 0;
      if (r === 90) return [it.x - s, it.y + d / 2];
      if (r === 180) return [it.x + w / 2, it.y + d + s];
      if (r === 270) return [it.x + w + s, it.y + d / 2];
      return [it.x + w / 2, it.y - s];
    },
    // masanın önü: oturma tarafının karşısı
    front(it, dist) {
      const { w, d } = p(it), r = it.rot || 0;
      if (r === 90) return [it.x + w + dist, it.y + d / 2];
      if (r === 180) return [it.x + w / 2, it.y - dist];
      if (r === 270) return [it.x - dist, it.y + d / 2];
      return [it.x + w / 2, it.y + d + dist];
    },
    draw(it, env) {
      const { w, d } = p(it), on = env.on(it);
      deskBody(it.x, it.y, w, d, it.rot || 0);
      for (const o of p(it).deco || []) {
        const x = it.x + o.dx, y = it.y + o.dy;
        if (o.t === 'monitor') monitor(x, y, on, env.t, o.w ?? 0.9);
        else if (o.t === 'lamp') lampAt(x, y, on);
        else if (o.t === 'box') box(x, y, o.w, o.d, on && o.h_on != null ? o.h_on : o.h, color(o.c), o.z ?? 10.5);
      }
    },
  },
  // çapa: merkez
  chair: {
    footprint: it => [it.x - 0.3, it.y - 0.3, 0.6, 0.6],
    depthBias: -0.2, // üzerinde oturan agent'tan önce çizilir
    draw: it => chairAt(it.x, it.y, it.rot || 0),
  },
  // çapa: saksının sol-üst köşesi. props: tall
  plant: {
    footprint: it => [it.x, it.y, 0.6, 0.6],
    draw: it => plantAt(it.x, it.y, !!p(it).tall),
  },
  // çapa: sol-üst köşe. props: w, d, h, plant {dx, dy}
  cabinet: {
    footprint: rect,
    draw(it) {
      const q = p(it); box(it.x, it.y, q.w, q.d, q.h ?? 14, C.white);
      if (q.plant) plantAt(it.x + q.plant.dx, it.y + q.plant.dy, false);
    },
  },
  // çapa: sol-üst köşe; sırt -x tarafında (rot 90). props: w, d
  sofa: {
    footprint: rect,
    draw(it) { const { w, d } = p(it); box(it.x, it.y, w, d, 5, C.sofa); box(it.x, it.y, 0.25, d, 11, C.sofa); },
  },
  printer: {
    footprint: it => [it.x, it.y, 1.0, 0.7],
    draw(it) {
      const { x, y } = it; box(x, y, 1.0, 0.7, 10, C.grey);
      box(x + 0.15, y + 0.1, 0.7, 0.5, 1, C.dark, 10); box(x + 0.25, y + 0.15, 0.5, 0.4, 0.6, C.paper, 11);
    },
  },
  // çapa: masa üstünün sol-üst köşesi. props: w, d
  meeting_table: {
    footprint: rect,
    draw(it) {
      const { x, y } = it, { w, d } = p(it);
      box(x + 1.1, y + 0.5, 0.6, 0.4, 6, C.leg); box(x, y, w, d, 1.5, C.desk, 6);
      box(x + 0.4, y + 0.3, 0.6, 0.4, 0.6, C.dark, 7.5); box(x + 2.0, y + 0.7, 0.18, 0.18, 2, C.white, 7.5);
    },
  },
  // props: linked_desk → o masanın agent'ı çalışırken ışıklar yanıp söner
  server_rack: {
    footprint: it => [it.x, it.y, 0.9, 0.8],
    draw(it, env) {
      const { x, y } = it, fy = y + 0.8; box(x, y, 0.9, 0.8, 40, C.dark); const on = env.on(it);
      for (let r = 0; r < 7; r++) {
        const z = 6 + r * 5; poly([P(x + 0.1, fy, z), P(x + 0.8, fy, z), P(x + 0.8, fy, z + 3), P(x + 0.1, fy, z + 3)], '#1b1e23');
        const b = on && ((Math.floor(env.t * 6) + r) % 3 === 0);
        poly([P(x + 0.6, fy, z + 1), P(x + 0.7, fy, z + 1), P(x + 0.7, fy, z + 2), P(x + 0.6, fy, z + 2)], b ? '#ffd43b' : '#51cf66');
      }
    },
  },
  // çapa: sol-üst köşe, sol duvara yaslı (rot 90). props: d
  bookshelf: {
    footprint: it => [it.x, it.y, 0.7, p(it).d],
    draw(it) {
      const { x, y } = it, d = p(it).d, fx = x + 0.7; box(x, y, 0.7, d, 44, C.white);
      for (let r = 0; r < 4; r++) {
        const z0 = 3 + r * 10; let i = r * 3 + Math.round(y);
        for (let yy = y + 0.08; yy < y + d - 0.15; yy += 0.19) { const h = 6 + ((i * 7) % 3); if ((i * 5) % 11 !== 0) poly([P(fx, yy, z0), P(fx, yy + 0.15, z0), P(fx, yy + 0.15, z0 + h), P(fx, yy, z0 + h)], BOOKS[i % BOOKS.length]); i++; }
        poly([P(fx, y, z0 - 1), P(fx, y + d, z0 - 1), P(fx, y + d, z0), P(fx, y, z0)], '#d2d2cc');
      }
    },
  },
  kitchen: {
    footprint: it => [it.x, it.y, 0.9, 2.0],
    draw(it) {
      const { x, y } = it; box(x, y, 0.9, 2.0, 12, C.white); box(x + 0.15, y + 0.2, 0.55, 0.5, 7, C.dark, 12);
      box(x + 0.3, y + 1.0, 0.18, 0.18, 2, C.white, 12); box(x + 0.3, y + 1.35, 0.18, 0.18, 2, ['#e8590c', '#c44a0a', '#a83f08'], 12);
    },
  },
  water_cooler: {
    footprint: it => [it.x, it.y, 0.7, 0.7],
    draw(it) { box(it.x, it.y, 0.7, 0.7, 14, C.white); box(it.x + 0.1, it.y + 0.1, 0.5, 0.5, 8, ['#a5d8ff', '#74c0fc', '#4dabf7'], 14); },
  },
  // çapa: duvar çizgisinin başı. rot 0: x boyunca (sabit y), rot 90: y boyunca (sabit x). props: len
  glass_wall: {
    footprint: it => (it.rot === 90 ? [it.x - 0.05, it.y, 0.1, p(it).len] : [it.x, it.y - 0.05, p(it).len, 0.1]),
    draw(it) {
      const L = p(it).len;
      if (it.rot === 90) {
        const x = it.x, y1 = it.y, y2 = it.y + L;
        wallQ(y1, y2, 2, 46, 'rgba(185,222,238,.32)', x); wallQ(y1, y2, 0, 2, '#8f9aa1', x); wallQ(y1, y2, 46, 48, '#8f9aa1', x); wallQ(y1, y1 + 0.06, 0, 48, '#8f9aa1', x);
        poly([P(x, y1 + 0.25, 10), P(x, y1 + 0.45, 10), P(x, y1 + 0.75, 40), P(x, y1 + 0.55, 40)], 'rgba(255,255,255,.28)');
      } else {
        const y = it.y, x1 = it.x, x2 = it.x + L;
        backQ(x1, x2, 2, 46, 'rgba(185,222,238,.32)', y); backQ(x1, x2, 0, 2, '#8f9aa1', y); backQ(x1, x2, 46, 48, '#8f9aa1', y); backQ(x2 - 0.06, x2, 0, 48, '#8f9aa1', y);
        poly([P(x1 + 0.3, y, 10), P(x1 + 0.5, y, 10), P(x1 + 0.8, y, 40), P(x1 + 0.6, y, 40)], 'rgba(255,255,255,.28)');
      }
    },
  },
  // Kapı kasası: iki dikme + üst kasa; arası geçilebilir. Çapa ve rot glass_wall ile aynı.
  door: {
    footprint: it => (it.rot === 90 ? [it.x - 0.05, it.y, 0.1, p(it).len] : [it.x, it.y - 0.05, p(it).len, 0.1]),
    // yalnızca dikmeler engel
    obstacles: it => {
      const L = p(it).len;
      return it.rot === 90
        ? [[it.x - 0.05, it.y, 0.1, 0.06], [it.x - 0.05, it.y + L - 0.06, 0.1, 0.06]]
        : [[it.x, it.y - 0.05, 0.06, 0.1], [it.x + L - 0.06, it.y - 0.05, 0.06, 0.1]];
    },
    draw(it) {
      const L = p(it).len;
      if (it.rot === 90) {
        const x = it.x, y = it.y;
        wallQ(y, y + 0.06, 0, 48, '#8f9aa1', x); wallQ(y + L - 0.06, y + L, 0, 48, '#8f9aa1', x); wallQ(y + 0.06, y + L - 0.06, 46, 48, '#8f9aa1', x);
      } else {
        const x = it.x, y = it.y;
        backQ(x, x + 0.06, 0, 48, '#8f9aa1', y); backQ(x + L - 0.06, x + L, 0, 48, '#8f9aa1', y); backQ(x + 0.06, x + L - 0.06, 46, 48, '#8f9aa1', y);
      }
    },
  },
  // Zemin katmanı (oda ile birlikte, eşyalardan önce çizilir). props: w, d, color, inner {inset, color}
  carpet: {
    layer: 'floor', blocks: false,
    footprint: rect,
    draw: () => {}, // room.js çizer
  },
};

// Çizim sırası anahtarı: kapladığı alanın merkezinin x+y'si (+ tip düzeltmesi); props.depth elle verilebilir.
export function depthOf(it) {
  if (p(it).depth != null) return p(it).depth;
  const T = TYPES[it.type]; const [x, y, w, d] = T.footprint(it);
  return x + w / 2 + y + d / 2 + (T.depthBias || 0);
}

// Yol bulma engelleri: [x, y, w, d] listesi
export function obstaclesOf(it) {
  const T = TYPES[it.type]; if (!T || T.blocks === false || T.layer === 'floor') return [];
  return T.obstacles ? T.obstacles(it) : [T.footprint(it)];
}
