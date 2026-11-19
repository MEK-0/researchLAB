// Karakter çizimi. Görünüş parametreleri: shirt, hair, acc (aksesuar).
import { P, shade, getCtx } from './iso.js';
import { clock } from '../state.js';

export function sprite(a) {
  const ctx = getCtx(), simT = clock.t;
  const [sx, sy0] = P(a.x, a.y); const sit = !a.walking && Math.hypot(a.x - a.seat[0], a.y - a.seat[1]) < 0.05;
  const work = a.state === 'working' || a.state === 'review' || a.state === 'manage';
  const by = sy0 - (sit ? 3 : 0) - (work && sit && Math.floor(simT * 5) % 2 ? 1 : 0); const f = a.face;
  if (!sit) { ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(sx - 5, sy0 - 1, 10, 2); }
  const ph = a.walking ? Math.floor(a.walkT * 8) % 2 : 0;
  ctx.fillStyle = '#2b2b3a'; ctx.fillRect(sx - 4, by - 5, 3, 5 - ph); ctx.fillRect(sx + 1, by - 5, 3, 4 + ph);
  ctx.fillStyle = a.shirt; ctx.fillRect(sx - 5, by - 12, 10, 7); ctx.fillStyle = shade(a.shirt, 0.72); ctx.fillRect(sx - 6, by - 11, 1, 5); ctx.fillRect(sx + 5, by - 11, 1, 5);
  if (work && sit) { ctx.fillStyle = '#f1c7a0'; const t = Math.floor(simT * 8) % 2; ctx.fillRect(sx - 4 + t, by - 6, 2, 1); ctx.fillRect(sx + 2 - t, by - 6, 2, 1); }
  ctx.fillStyle = '#f1c7a0'; ctx.fillRect(sx - 4, by - 19, 8, 7);
  ctx.fillStyle = a.hair; ctx.fillRect(sx - 4, by - 20, 8, 2); ctx.fillRect(sx - 4, by - 19, 1, 3); ctx.fillRect(sx + 3, by - 19, 1, 3);
  if (a.acc === 'bun') ctx.fillRect(sx - 1, by - 23, 3, 3);
  if (a.acc === 'beret') { ctx.fillStyle = '#7a1f2b'; ctx.fillRect(sx - 5, by - 22, 10, 2); ctx.fillRect(sx - 1, by - 23, 2, 1); }
  if (a.acc === 'phones') { ctx.fillStyle = '#212529'; ctx.fillRect(sx - 5, by - 18, 1, 3); ctx.fillRect(sx + 4, by - 18, 1, 3); ctx.fillRect(sx - 4, by - 21, 8, 1); }
  if (a.acc === 'tie') { ctx.fillStyle = '#1b2a4a'; ctx.fillRect(sx, by - 12, 1, 5); }
  if (a.acc === 'glasses') { ctx.fillStyle = '#e9ecef'; ctx.fillRect(sx - 3 + f, by - 17, 3, 2); ctx.fillRect(sx + 1 + f, by - 17, 3, 2); }
  ctx.fillStyle = '#1b1b1b';
  if (a.state === 'idle' && sit && simT % 6 > 4.6) { ctx.fillRect(sx - 3 + f, by - 16, 2, 1); ctx.fillRect(sx + 1 + f, by - 16, 2, 1); }
  else { ctx.fillRect(sx - 2 + f, by - 16, 1, 1); ctx.fillRect(sx + 2 + f, by - 16, 1, 1); }
}
