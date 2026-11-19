// Ekip, Görev panosu ve Olay akışı panelleri.
import { AG, KEYS, LBL, S } from '../state.js';

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function feed(a, ev, msg) {
  const li = document.createElement('li'); const d = ev.timestamp ? new Date(ev.timestamp) : new Date();
  const hh = isNaN(d) ? '' : d.toTimeString().slice(0, 8);
  li.innerHTML = `<time>${hh}</time><span class="who"><span class="dot" style="background:${AG[a].shirt};width:9px;height:9px;border-width:1px"></span> ${esc(AG[a].name.split(' ').pop())}</span><span class="msg"><span class="ev">${esc(ev.hook_event_name || '?')}</span> ${esc(msg || '')}</span>`;
  const f = document.getElementById('feed'); f.prepend(li); while (f.children.length > 80) f.lastChild.remove();
}
export function clearFeed() { document.getElementById('feed').innerHTML = ''; }

export function panels() {
  const max = Math.max(1, ...KEYS.map(k => AG[k].tok));
  document.getElementById('team').innerHTML = KEYS.map(k => {
    const a = AG[k]; const st = a.walking ? 'yürüyor' : LBL[a.state] || a.state;
    return `<div class="row"><span class="dot" style="background:${a.shirt}"></span><span>${esc(a.name)}<span class="st">${st}</span></span><span class="bar"><i style="width:${(a.tok / max * 100).toFixed(1)}%;background:${a.shirt}"></i></span><span class="num">${a.tok.toLocaleString('tr-TR')}</span></div>`;
  }).join('');
  const cols = [['bekliyor', 'Bekliyor'], ['çalışıyor', 'Çalışıyor'], ['kontrolde', 'Kontrolde'], ['bitti', 'Bitti']];
  document.getElementById('kb').innerHTML = cols.map(([c, l]) => {
    const ts = S.tasks.filter(t => t.st === c);
    return `<div class="col"><h3>${l} · ${ts.length}</h3>${ts.length ? ts.slice(-6).reverse().map(t => `<div class="tk"><b><span class="dot" style="background:${AG[t.a].shirt}"></span>${esc(AG[t.a].name.split(' ').pop())}</b>${esc(t.txt)}</div>`).join('') : '<div class="empty">boş</div>'}</div>`;
  }).join('');
}
