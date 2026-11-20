// Sorun ekranı: eksik araçlar, repo seçilmedi, açılış başarısız.
const d = JSON.parse(new URLSearchParams(location.search).get('data') || '{}');
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (label, fn, sec) => { const b = el('button', sec ? 'sec' : '', label); b.type = 'button'; b.onclick = fn; $('actions').append(b); return b; };

if (d.kind === 'missing') {
  $('title').textContent = 'Gerekli araçlar bulunamadı';
  $('lede').textContent = "researchLAB'ın çalışması için şunlar gerekiyor. Terminalde kurulum komutunu çalıştırıp “Tekrar dene”ye bas.";
  for (const m of d.missing) {
    const li = el('li', 'bad'); li.append(el('b', '', m.name), el('pre', '', m.install)); $('list').append(li);
  }
  const det = el('details'); det.append(el('summary', '', 'Aranan PATH'), el('pre', '', (d.path || '').split(':').join('\n'))); $('extra').append(det);
  btn('Tekrar dene', () => rl.retry()); btn('Çık', () => rl.quit(), true);
} else if (d.kind === 'norepo') {
  $('title').textContent = 'Repo klasörü seçilmedi';
  $('lede').textContent = 'researchLAB reposunun klasörünü seç (varsayılan ~/Desktop/researchLAB).';
  btn('Klasör seç…', () => rl.chooseRepo()); btn('Çık', () => rl.quit(), true);
} else {
  $('title').textContent = d.timedOut ? 'Ofis 20 saniyede açılmadı' : 'Ofis açılamadı';
  $('lede').textContent = 'Başlamayan parça kırmızı. Log satırları office/.run/ altındaki dosyalardan.';
  for (const p of d.parts || []) {
    const li = el('li', p.ok ? 'ok' : 'bad'); li.append(el('b', '', p.label), el('span', '', p.msg));
    if (p.log) li.append(el('pre', '', p.log));
    if (!p.ok && /^(server|ttyd1|ttyd2)$/.test(p.key)) { const a = el('a', '', ' logu aç'); a.href = '#'; a.onclick = e => { e.preventDefault(); rl.openLog(p.key); }; li.append(a); }
    $('list').append(li);
  }
  if (d.out) { const det = el('details'); det.append(el('summary', '', 'office.sh start çıktısı'), el('pre', '', d.out)); $('extra').append(det); }
  btn('Tekrar dene', () => rl.retry()); btn('Repo klasörünü değiştir…', () => rl.chooseRepo(), true); btn('Çık', () => rl.quit(), true);
}
