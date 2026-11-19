// İzometrik çizim yardımcıları. Tüm sahne 352x250'lik bir canvas'a piksel sanatı olarak çizilir.
export const W = 352, H = 250, TW = 24, TH = 12, GX = 16, GY = 12, WH = 64, OX = 152, OY = 72;

let ctx = null;
export function setCtx(c) { ctx = c; ctx.imageSmoothingEnabled = false; }
export function getCtx() { return ctx; }

// Izgara (x, y, yükseklik z) → ekran pikseli
export const P = (x, y, z = 0) => [Math.round(OX + (x - y) * TW / 2), Math.round(OY + (x + y) * TH / 2 - z)];

export function poly(pts, c) {
  ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fill();
}

// c = [üst, ön (y+d yüzü), yan (x+w yüzü)]
export function box(x, y, w, d, h, c, z = 0) {
  poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], c[1]);
  poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], c[2]);
  poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], c[0]);
}

export const wallQ = (y1, y2, z1, z2, c, x = 0) => poly([P(x, y1, z1), P(x, y2, z1), P(x, y2, z2), P(x, y1, z2)], c);
export const backQ = (x1, x2, z1, z2, c, y = 0) => poly([P(x1, y, z1), P(x2, y, z1), P(x2, y, z2), P(x1, y, z2)], c);
export const floorQ = (x1, y1, x2, y2, c) => poly([P(x1, y1), P(x2, y1), P(x2, y2), P(x1, y2)], c);

export const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round((n >> 16) * f), g = Math.round((n >> 8 & 255) * f), b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
};

export const C = {
  desk: ['#f6f6f3', '#dcdcd7', '#cbcbc5'], leg: ['#9aa0a6', '#7a8086', '#6a7076'], mon: ['#2d3138', '#1f2329', '#171a1f'],
  white: ['#fbfbf9', '#e3e3de', '#d2d2cc'], grey: ['#ccd1d6', '#aeb4ba', '#9aa0a6'], dark: ['#3a3f47', '#2b2f36', '#22262c'],
  chair: ['#3f4652', '#2e343d', '#262b32'], pot: ['#f2f2ee', '#d8d8d2', '#c6c6bf'], leaf: ['#5aa469', '#468f55', '#387a46'],
  leaf2: ['#7cc58a', '#5aa469', '#468f55'], sofa: ['#5b6f8a', '#4b5d75', '#3f4f64'], paper: ['#ffffff', '#e9ecef', '#dee2e6'],
};
