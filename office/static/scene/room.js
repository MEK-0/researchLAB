// Oda: duvarlar, pencereler, tablolar, saat, zemin, halılar ve beyaz tahta.
import { W, H, GX, GY, WH, P, poly, backQ, wallQ, floorQ, getCtx } from './iso.js';
import { AG, S } from '../state.js';

export function room() {
  const ctx = getCtx();
  ctx.fillStyle = '#232b2f'; ctx.fillRect(0, 0, W, H);
  // walls
  backQ(0, GX, 0, WH, '#efefeb'); wallQ(0, GY, 0, WH, '#dcdcd7');
  backQ(0, GX, 0, 3, '#b5b5ae'); wallQ(0, GY, 0, 3, '#a8a8a1');
  poly([P(0, 0, WH), P(GX, 0, WH), P(GX, -0.35, WH), P(-0.35, -0.35, WH)], '#c7c7c1'); poly([P(0, 0, WH), P(0, GY, WH), P(-0.35, GY, WH), P(-0.35, -0.35, WH)], '#bdbdb7');
  // back windows above software desk
  backQ(10.5, 14.05, 22, 56, '#9aa3a8'); backQ(10.65, 13.9, 23.5, 54.5, '#cfeaf5'); backQ(10.65, 13.9, 23.5, 36, '#e2f3fa');
  backQ(12.22, 12.33, 23.5, 54.5, '#9aa3a8'); for (let z = 46; z < 54; z += 2) backQ(10.65, 13.9, z, z + 1, '#eef4f6');
  // left window in manager office
  wallQ(1.4, 3.8, 24, 56, '#9aa3a8'); wallQ(1.55, 3.65, 25.5, 54.5, '#cfeaf5'); wallQ(1.55, 3.65, 25.5, 36, '#e2f3fa'); wallQ(2.55, 2.65, 25.5, 54.5, '#9aa3a8');
  // art
  backQ(0.8, 2.6, 30, 48, '#3b3f45'); backQ(0.95, 2.45, 31.5, 46.5, '#f4f1ea'); backQ(1.2, 1.9, 34, 44, '#e8590c'); backQ(1.75, 2.25, 33, 39, '#2f6f6a');
  wallQ(10.3, 11.7, 20, 42, '#3b3f45'); wallQ(10.45, 11.55, 21.5, 40.5, '#f2c14e'); wallQ(10.75, 11.25, 25, 35, '#2f6f6a');
  // clock
  const [cx, cy] = P(5.1, 0, 52); ctx.fillStyle = '#3b3f45'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 7); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(cx, cy - 2, 1, 2); ctx.fillRect(cx, cy, 2, 1);
  // floor: light oak planks
  for (let x = 0; x < GX; x++) for (let y = 0; y < GY; y++) { const v = (x * 7 + y * 13) % 5; floorQ(x, y, x + 1, y + 1, v < 2 ? '#dcc09a' : v < 4 ? '#d5b88f' : '#cfb188'); }
  ctx.strokeStyle = 'rgba(120,85,50,.16)'; ctx.lineWidth = 1;
  for (let y = 0; y <= GY; y++) { const a = P(0, y), b = P(GX, y); ctx.beginPath(); ctx.moveTo(a[0], a[1] + .5); ctx.lineTo(b[0], b[1] + .5); ctx.stroke(); }
  // carpets
  floorQ(0.15, 0.15, 4.55, 4.15, '#8693a3'); floorQ(0.3, 0.3, 4.4, 4.0, '#94a1b1');
  floorQ(5.7, 1.4, 10.3, 4.9, '#7d9e97'); floorQ(5.9, 1.6, 10.1, 4.7, '#8aaba3');
  floorQ(0.9, 6.1, 3.6, 10.3, '#c7a6b0');
  // whiteboard kanban mirrors the task board
  backQ(5.9, 10.1, 18, 52, '#9aa1a7'); backQ(6.05, 9.95, 19.5, 50.5, '#fdfdfb'); backQ(6.2, 9.8, 17, 18.5, '#9aa1a7');
  const cols = ['bekliyor', 'çalışıyor', 'kontrolde', 'bitti'], cw = (9.95 - 6.05) / 4;
  cols.forEach((c, i) => {
    const x0 = 6.05 + i * cw; if (i) backQ(x0 - 0.02, x0 + 0.02, 20.5, 49.5, '#d5d9dc'); backQ(x0 + 0.12, x0 + cw - 0.12, 46, 48, '#adb5bd');
    S.tasks.filter(t => t.st === c).slice(-5).forEach((t, j) => { const z = 42 - j * 5.2; backQ(x0 + 0.14, x0 + cw - 0.14, z - 4, z, AG[t.a].shirt); });
  });
}
