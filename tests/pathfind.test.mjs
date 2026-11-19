// office/static/scene/pathfind.js: A* birim testleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGrid, findPath, astar } from '../office/static/scene/pathfind.js';
import { TYPES, obstaclesOf } from '../office/static/scene/furniture.js';

// Yol üzerindeki noktalar hiçbir engelin (payı olmadan) içine girmemeli; uç noktaların yakını hariç.
function assertClear(layout, from, path, to) {
  const pts = [from, ...path];
  const rects = layout.items.flatMap(obstaclesOf);
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 20);
    for (let k = 0; k <= n; k++) {
      const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n;
      if (Math.hypot(x - from[0], y - from[1]) < 0.5 || Math.hypot(x - to[0], y - to[1]) < 0.5) continue;
      for (const [rx, ry, rw, rd] of rects) {
        assert.ok(!(x > rx && x < rx + rw && y > ry && y < ry + rd), `(${x.toFixed(2)}, ${y.toFixed(2)}) engelin içinde [${rx}, ${ry}, ${rw}, ${rd}]`);
      }
    }
  }
}

// 6x6 oda, y = 3'te duvar; x 2..3 arasında kapı
const mini = {
  room: { gx: 6, gy: 6 },
  items: [
    { id: 'w1', type: 'glass_wall', x: 0, y: 3, rot: 0, props: { len: 2 } },
    { id: 'door', type: 'door', x: 2, y: 3, rot: 0, props: { len: 1 } },
    { id: 'w2', type: 'glass_wall', x: 3, y: 3, rot: 0, props: { len: 3 } },
  ],
};

test('duvardaki kapıdan geçer', () => {
  const g = buildGrid(mini), from = [0.6, 1], to = [5.2, 5];
  const p = findPath(g, from, to);
  assert.ok(p, 'yol bulunmalı');
  assert.deepEqual(p.at(-1), to);
  assertClear(mini, from, p, to);
  // y = 3 çizgisini kapı açıklığında keser
  const pts = [from, ...p];
  const cross = pts.findIndex((q, i) => i && (pts[i - 1][1] - 3) * (q[1] - 3) <= 0);
  const [a, b] = [pts[cross - 1], pts[cross]], t = (3 - a[1]) / (b[1] - a[1]), x = a[0] + (b[0] - a[0]) * t;
  assert.ok(x > 2.06 && x < 2.94, `kapıdan geçmeli, x = ${x}`);
});

test('kapı yoksa ulaşılamaz → null', () => {
  const closed = { room: mini.room, items: [{ id: 'w', type: 'glass_wall', x: 0, y: 3, rot: 0, props: { len: 6 } }] };
  const g = buildGrid(closed);
  assert.equal(astar(g, [1, 1], [1, 5]), null);
  assert.equal(findPath(g, [1, 1], [1, 5]), null);
});

test('engel yoksa düz çizgi (tek nokta)', () => {
  const g = buildGrid({ room: { gx: 6, gy: 6 }, items: [] });
  assert.deepEqual(findPath(g, [1, 1], [4, 4]), [[4, 4]]);
});

test('gerçek ofis: her masa ile teslim noktası ve Manager arasında yol var, eşyalardan geçmiyor', () => {
  const layout = JSON.parse(readFileSync(new URL('../office/layout.json', import.meta.url)));
  const g = buildGrid(layout), items = Object.fromEntries(layout.items.map(i => [i.id, i]));
  const seat = id => TYPES.desk.seat(items[id]);
  const h = layout.handoff, handoff = TYPES.desk.front(items[h.desk], h.dist);
  for (const deskId of Object.keys(layout.desks)) {
    const s = seat(deskId);
    for (const [from, to] of [[s, handoff], [handoff, s], [seat('desk-manager'), s]]) {
      if (Math.hypot(from[0] - to[0], from[1] - to[1]) < 0.01) continue;
      const p = findPath(g, from, to);
      assert.ok(p, `${deskId}: yol yok ${from} → ${to}`);
      assertClear(layout, from, p, to);
    }
  }
});

test('Manager odasından çıkış kapıdan', () => {
  const layout = JSON.parse(readFileSync(new URL('../office/layout.json', import.meta.url)));
  const g = buildGrid(layout), items = Object.fromEntries(layout.items.map(i => [i.id, i]));
  const from = TYPES.desk.seat(items['desk-manager']), to = TYPES.desk.seat(items['desk-referee']);
  const pts = [from, ...findPath(g, from, to)];
  const i = pts.findIndex((q, k) => k && (pts[k - 1][1] - 4.2) * (q[1] - 4.2) <= 0 && Math.min(pts[k - 1][0], q[0]) < 4.6);
  assert.ok(i > 0, 'y = 4.2 çizgisini cam duvar bölgesinde kesmeli');
  const [a, b] = [pts[i - 1], pts[i]], t = (4.2 - a[1]) / (b[1] - a[1]), x = a[0] + (b[0] - a[0]) * t;
  assert.ok(x > 2.0 && x < 3.2, `kapı açıklığından (2.0–3.2) geçmeli, x = ${x}`);
});
