// Terminaller: office.sh iki ttyd (tmux destekli) sunucusunu başlatır; portları sunucu
// index.html'e <meta name="office-terminals"> olarak yazar (varsayılan 7681, 7682).
const PORTS = (document.querySelector('meta[name="office-terminals"]')?.content || '7681,7682').split(',').map(Number);
const TERMS = [{ id: 't1', link: 'l1', port: PORTS[0] || 7681 }, { id: 't2', link: 'l2', port: PORTS[1] || 7682 }];
export const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

const FAKE = [`<span class="n">~/researchLAB</span> <span class="p">$</span> claude
<span class="m">●</span> Manager hazır. Ne üzerinde çalışalım?

<span class="p">&gt;</span> iris-baseline projesini başlat, kısa tut

<span class="m">●</span> Proje klasörünü oluşturuyorum…
  ⎿ workspace/iris-baseline/ hazır
<span class="m">●</span> Agent(software-researcher) Iris baseline: kod + metrikler
<span class="m">●</span> Agent(professor-lit) En fazla 3 kaynak
  ⎿ Çalışıyor…`, `<span class="n">~/researchLAB</span> <span class="p">$</span> tail -f events/events.jsonl | jq -c '{e:.hook_event_name,a:.agent_type}'
{"e":"SubagentStart","a":"software-researcher"}
{"e":"PreToolUse","a":"software-researcher"}
{"e":"SubagentStart","a":"professor-lit"}
{"e":"PreToolUse","a":"professor-lit"}`];

const $ = id => document.getElementById(id);

export function initTerminals() {
  TERMS.forEach((t, i) => {
    const box = document.getElementById(t.id), a = document.getElementById(t.link);
    if (isLocal) { const url = `${location.protocol}//${location.hostname}:${t.port}`; box.innerHTML = `<iframe src="${url}" title="Terminal ${i + 1}"></iframe>`; a.href = url; }
    else { box.innerHTML = `<pre class="fake">${FAKE[i]}\n\n<span class="n">Örnek görünüm. Gerçek terminal, ofis ./office.sh ile yerelde açıldığında burada çalışır.</span></pre>`; a.remove(); }
  });
}

// Terminal 1'de Manager (claude) kapalıysa başlıkta uyarı + "Manager'ı başlat".
// Durum /api/status'tan 3 sn'de bir okunur; düğme POST /api/manager/start çağırır
// (sunucu office.sh manager-start ile başlatır; önceki konuşmaya --resume ile devam eder).
export function initManagerWatch({ every = 3000 } = {}) {
  const box = $('mgr'), msg = $('mgrmsg'), btn = $('mgrstart');
  if (!box || !isLocal) return;
  const token = document.querySelector('meta[name="office-token"]')?.content || '';
  let pending = false;
  const show = st => {
    box.hidden = st.manager_running;
    if (!pending) msg.textContent = st.session_exists ? 'Manager kapalı' : 'Manager oturumu yok';
  };
  const poll = async () => {
    try { const r = await fetch('/api/status', { cache: 'no-store' }); if (r.ok) show(await r.json()); } catch (_) { /* sunucu yok */ }
  };
  btn.addEventListener('click', async () => {
    pending = true; btn.disabled = true; msg.textContent = 'Başlatılıyor…';
    try {
      const r = await fetch('/api/manager/start', { method: 'POST', headers: { 'X-Office-Token': token } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) msg.textContent = d.error || `Başlatılamadı (${r.status})`;
      // oturum yeniden kurulduysa terminal bağlantısı kopmuştur: iframe'i yenile
      if (d.action === 'created') { const f = $('t1').querySelector('iframe'); if (f) f.src = f.src; }
    } catch (e) { msg.textContent = 'Başlatılamadı: ' + e.message; }
    setTimeout(() => { pending = false; btn.disabled = false; poll(); }, 1500);
  });
  poll(); setInterval(poll, every);
}

