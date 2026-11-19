// Yürüme rotaları. Şimdilik elle tanımlı çıkış noktaları + koridor (CY) üzerinden;
// T0.4'te ızgara tabanlı A* ile değişecek.
export const CY = 5.8;

// a.px/a.py: kuyruktaki son hedef (planlama konumu)
export function walk(a, x, y) {
  if (Math.abs(a.px - x) + Math.abs(a.py - y) < 0.001) return;
  a.q.push({ t: 'walk', x, y }); a.px = x; a.py = y;
}
export function leave(a) { if (a.where !== 'seat') return; for (const p of a.out) walk(a, p[0], p[1]); a.where = 'hall'; }
export function enter(a) {
  if (a.where !== 'hall') return;
  walk(a, a.hall[0], a.hall[1]); [...a.out].reverse().slice(1).forEach(p => walk(a, p[0], p[1]));
  walk(a, a.seat[0], a.seat[1]); a.where = 'seat';
}
export function travel(a, x, y) { walk(a, a.px, CY); walk(a, x, CY); walk(a, x, y); }
