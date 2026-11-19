// Oda: duvarlar, duvar öğeleri (pencere, tablo, saat, beyaz tahta), zemin ve halılar. Hepsi layout.json'dan.
import { W, H, WH, P, poly, backQ, wallQ, floorQ, getCtx } from './iso.js';

const FRAME = '#9aa3a8', GLASS = '#cfeaf5', LIGHT = '#e2f3fa', BLIND = '#eef4f6', ART_FRAME = '#3b3f45';
// Duvara göre dörtgen: back → backQ (y = 0), left → wallQ (x = 0)
const quad = (wall, a, b, z1, z2, c) => (wall === 'left' ? wallQ(a, b, z1, z2, c) : backQ(a, b, z1, z2, c));

function windowItem(w) {
  const q = w.props || {}, a = w.from + 0.15, b = w.to - 0.15, z1 = w.z1 + 1.5, z2 = w.z2 - 1.5;
  quad(w.wall, w.from, w.to, w.z1, w.z2, FRAME); quad(w.wall, a, b, z1, z2, GLASS);
  if (q.light_to) quad(w.wall, a, b, z1, q.light_to, LIGHT);
  if (q.mullion) quad(w.wall, q.mullion[0], q.mullion[1], z1, z2, FRAME);
  if (q.blinds) for (let z = q.blinds[0]; z < q.blinds[1]; z += 2) quad(w.wall, a, b, z, z + 1, BLIND);
}
function paintingItem(w) {
  const q = w.props || {};
  quad(w.wall, w.from, w.to, w.z1, w.z2, ART_FRAME); quad(w.wall, w.from + 0.15, w.to - 0.15, w.z1 + 1.5, w.z2 - 1.5, q.canvas || '#f4f1ea');
  for (const [a, b, z1, z2, c] of q.shapes || []) quad(w.wall, a, b, z1, z2, c);
}
function clockItem(w) {
  const ctx = getCtx(); const [cx, cy] = w.wall === 'left' ? P(0, w.at, w.z) : P(w.at, 0, w.z);
  ctx.fillStyle = '#3b3f45'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 7); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(cx, cy - 2, 1, 2); ctx.fillRect(cx, cy, 2, 1);
}
// Beyaz tahta görev panosunu yansıtır: tasks = [{st, color}]
function whiteboardItem(w, tasks) {
  const a = w.from + 0.15, b = w.to - 0.15;
  quad(w.wall, w.from, w.to, w.z1, w.z2, '#9aa1a7'); quad(w.wall, a, b, w.z1 + 1.5, w.z2 - 1.5, '#fdfdfb'); quad(w.wall, w.from + 0.3, w.to - 0.3, w.z1 - 1, w.z1 + 0.5, '#9aa1a7');
  const cols = ['bekliyor', 'çalışıyor', 'kontrolde', 'bitti'], cw = (b - a) / 4;
  cols.forEach((c, i) => {
    const x0 = a + i * cw; if (i) quad(w.wall, x0 - 0.02, x0 + 0.02, 20.5, 49.5, '#d5d9dc'); quad(w.wall, x0 + 0.12, x0 + cw - 0.12, 46, 48, '#adb5bd');
    tasks.filter(t => t.st === c).slice(-5).forEach((t, j) => { const z = 42 - j * 5.2; quad(w.wall, x0 + 0.14, x0 + cw - 0.14, z - 4, z, t.color); });
  });
}

export function room(layout, tasks) {
  const ctx = getCtx(), { gx: GX, gy: GY } = layout.room;
  ctx.fillStyle = '#232b2f'; ctx.fillRect(0, 0, W, H);
  // duvarlar
  backQ(0, GX, 0, WH, '#efefeb'); wallQ(0, GY, 0, WH, '#dcdcd7');
  backQ(0, GX, 0, 3, '#b5b5ae'); wallQ(0, GY, 0, 3, '#a8a8a1');
  poly([P(0, 0, WH), P(GX, 0, WH), P(GX, -0.35, WH), P(-0.35, -0.35, WH)], '#c7c7c1'); poly([P(0, 0, WH), P(0, GY, WH), P(-0.35, GY, WH), P(-0.35, -0.35, WH)], '#bdbdb7');
  const wallItems = layout.wall_items || [];
  for (const w of wallItems) {
    if (w.type === 'window') windowItem(w);
    else if (w.type === 'painting') paintingItem(w);
    else if (w.type === 'clock') clockItem(w);
  }
  // zemin: açık meşe parke
  for (let x = 0; x < GX; x++) for (let y = 0; y < GY; y++) { const v = (x * 7 + y * 13) % 5; floorQ(x, y, x + 1, y + 1, v < 2 ? '#dcc09a' : v < 4 ? '#d5b88f' : '#cfb188'); }
  ctx.strokeStyle = 'rgba(120,85,50,.16)'; ctx.lineWidth = 1;
  for (let y = 0; y <= GY; y++) { const a = P(0, y), b = P(GX, y); ctx.beginPath(); ctx.moveTo(a[0], a[1] + .5); ctx.lineTo(b[0], b[1] + .5); ctx.stroke(); }
  // halılar
  for (const it of layout.items) {
    if (it.type !== 'carpet') continue;
    const q = it.props; floorQ(it.x, it.y, it.x + q.w, it.y + q.d, q.color);
    if (q.inner) { const s = q.inner.inset; floorQ(it.x + s, it.y + s, it.x + q.w - s, it.y + q.d - s, q.inner.color); }
  }
  for (const w of wallItems) if (w.type === 'whiteboard') whiteboardItem(w, tasks);
}
