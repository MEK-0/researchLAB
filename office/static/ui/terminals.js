// Terminaller: office.sh iki ttyd (tmux destekli) sunucusunu bu portlarda başlatır.
const TERMS = [{ id: 't1', link: 'l1', port: 7681 }, { id: 't2', link: 'l2', port: 7682 }];
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

export function initTerminals() {
  TERMS.forEach((t, i) => {
    const box = document.getElementById(t.id), a = document.getElementById(t.link);
    if (isLocal) { const url = `${location.protocol}//${location.hostname}:${t.port}`; box.innerHTML = `<iframe src="${url}" title="Terminal ${i + 1}"></iframe>`; a.href = url; }
    else { box.innerHTML = `<pre class="fake">${FAKE[i]}\n\n<span class="n">Örnek görünüm. Gerçek terminal, ofis ./office.sh ile yerelde açıldığında burada çalışır.</span></pre>`; a.remove(); }
  });
}
