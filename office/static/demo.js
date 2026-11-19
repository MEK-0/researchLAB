// Demo verisi (iris-baseline testini taklit eder) ve oynatıcı.
import { ingest, resetAll } from './state.js';

// [önceki olaydan sonra bekleme (ms), olay, örnek token]
export const DEMO_EVENTS = [
  [300, { hook_event_name: 'SessionStart', source: 'startup' }, 120],
  [1300, { hook_event_name: 'UserPromptSubmit', prompt: 'Deneme projesi başlat: iris-baseline. Logistic regression, kısa literatür, mini makale, hakem, rapor.' }, 900],
  [1800, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'cp -R workspace/_template workspace/iris-baseline' } }, 600],
  [1000, { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: 'workspace/iris-baseline/STATUS.md' } }, 700],
  [1300, { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'software-researcher', description: 'Iris logistic regression baseline: kod, CV ve test metrikleri' } }, 1400],
  [2600, { hook_event_name: 'SubagentStart', agent_type: 'software-researcher', agent_id: 'a1' }, 2200],
  [1400, { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'professor-lit', description: 'Iris ve logistic regression için en fazla 3 kaynak' } }, 1100],
  [2600, { hook_event_name: 'SubagentStart', agent_type: 'professor-lit', agent_id: 'a2' }, 1800],
  [900, { hook_event_name: 'PreToolUse', agent_type: 'software-researcher', tool_name: 'Write', tool_input: { file_path: 'code/train.py' } }, 3400],
  [1400, { hook_event_name: 'PreToolUse', agent_type: 'professor-lit', tool_name: 'WebSearch', tool_input: { query: 'Fisher 1936 multiple measurements taxonomic problems' } }, 2600],
  [1500, { hook_event_name: 'PreToolUse', agent_type: 'software-researcher', tool_name: 'Bash', tool_input: { command: 'python3 -m venv code/.venv && pip install -r code/requirements.txt' } }, 900],
  [1600, { hook_event_name: 'PreToolUse', agent_type: 'professor-lit', tool_name: 'WebFetch', tool_input: { url: 'https://archive.ics.uci.edu/dataset/53/iris' } }, 4100],
  [1600, { hook_event_name: 'PreToolUse', agent_type: 'software-researcher', tool_name: 'Bash', tool_input: { command: 'code/.venv/bin/python code/train.py' } }, 800],
  [2200, { hook_event_name: 'PostToolUse', agent_type: 'software-researcher', tool_name: 'Bash', summary: 'CV 0.9583 ± 0.0264 · test 0.9333' }, 1900],
  [1300, { hook_event_name: 'PreToolUse', agent_type: 'professor-lit', tool_name: 'Write', tool_input: { file_path: 'literature/references.bib' } }, 1500],
  [1600, { hook_event_name: 'SubagentStop', agent_type: 'professor-lit', last_assistant_message: '3 kaynak hazır: Fisher 1936, UCI Iris, scikit-learn. Hepsinin linki var.' }, 700],
  [1500, { hook_event_name: 'PreToolUse', agent_type: 'software-researcher', tool_name: 'Write', tool_input: { file_path: 'results/SUMMARY.md' } }, 1600],
  [1800, { hook_event_name: 'SubagentStop', agent_type: 'software-researcher', last_assistant_message: 'Kod çalıştı. CV 0.9583 ± 0.0264, test doğruluğu 0.9333 (28/30).' }, 800],
  [3000, { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: 'agent_logs/002-software-researcher.md' } }, 900],
  [1300, { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'professor-writer', description: 'Sonuçlar ve literatürden 2 sayfalık mini makale' } }, 1300],
  [2600, { hook_event_name: 'SubagentStart', agent_type: 'professor-writer', agent_id: 'a3' }, 2500],
  [1200, { hook_event_name: 'PreToolUse', agent_type: 'professor-writer', tool_name: 'Read', tool_input: { file_path: 'results/metrics.json' } }, 1200],
  [1600, { hook_event_name: 'PreToolUse', agent_type: 'professor-writer', tool_name: 'Write', tool_input: { file_path: 'paper/paper.md' } }, 5200],
  [2000, { hook_event_name: 'PreToolUse', agent_type: 'professor-writer', tool_name: 'Edit', tool_input: { file_path: 'paper/paper.md' } }, 1400],
  [1600, { hook_event_name: 'SubagentStop', agent_type: 'professor-writer', last_assistant_message: 'Taslak hazır: paper/paper.md. Tüm sayılar metrics.json ile aynı.' }, 900],
  [3000, { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'referee', description: 'paper.md için hakem değerlendirmesi' } }, 1000],
  [2600, { hook_event_name: 'SubagentStart', agent_type: 'referee', agent_id: 'a4' }, 2300],
  [1200, { hook_event_name: 'PreToolUse', agent_type: 'referee', tool_name: 'Read', tool_input: { file_path: 'paper/paper.md' } }, 4300],
  [1600, { hook_event_name: 'PreToolUse', agent_type: 'referee', tool_name: 'Grep', tool_input: { pattern: '0.9333' } }, 500],
  [2000, { hook_event_name: 'SubagentStop', agent_type: 'referee', last_assistant_message: 'Karar: küçük revizyon. UCI kaynağının yazar ve yıl bilgisi düzeltilmeli.' }, 1700],
  [3000, { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'professor-writer', description: 'Revizyon 1: UCI kaynağını düzelt' } }, 800],
  [2600, { hook_event_name: 'SubagentStart', agent_type: 'professor-writer', agent_id: 'a5' }, 1200],
  [1600, { hook_event_name: 'PreToolUse', agent_type: 'professor-writer', tool_name: 'Edit', tool_input: { file_path: 'paper/paper.md' } }, 900],
  [1600, { hook_event_name: 'SubagentStop', agent_type: 'professor-writer', last_assistant_message: 'Revizyon tamam: UCI kaynağı düzeltildi.' }, 400],
  [3000, { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: 'reports/2026-11-19.md' } }, 1800],
  [1800, { hook_event_name: 'Stop' }, 200],
];

const P = { queue: [], playing: false, speed: 1, acc: 0 };
let playBtn, srcEl;

function playList(list, label) {
  resetAll(); P.queue = list; P.acc = 0; P.playing = true;
  srcEl.textContent = 'Kaynak: ' + label; playBtn.textContent = 'Duraklat';
}
export function demo() { playList(DEMO_EVENTS.map(([d, e, t]) => ({ d, e: { ...e, tokens: t, timestamp: null } })), 'demo (iris-baseline)'); }

// Her karede çağrılır; dt gerçek saniye
export function tick(dt) {
  if (!P.playing || !P.queue.length) return;
  P.acc += dt * 1000 * P.speed;
  while (P.queue.length && P.acc >= P.queue[0].d) { P.acc -= P.queue[0].d; ingest(P.queue.shift().e); }
  if (!P.queue.length) { P.playing = false; playBtn.textContent = 'Demoyu tekrar oynat'; }
}
export const speed = () => P.speed;

export function initDemoControls() {
  playBtn = document.getElementById('play'); srcEl = document.getElementById('src');
  playBtn.addEventListener('click', () => { if (!P.queue.length) { demo(); return; } P.playing = !P.playing; playBtn.textContent = P.playing ? 'Duraklat' : 'Devam et'; });
  document.getElementById('reset').addEventListener('click', demo);
  document.querySelectorAll('[data-sp]').forEach(b => b.addEventListener('click', () => {
    P.speed = +b.dataset.sp; document.querySelectorAll('[data-sp]').forEach(x => x.classList.toggle('on', x === b));
  }));
  document.getElementById('file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const evs = (await f.text()).split(/\r?\n/).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
    let prev = null;
    const list = evs.map(ev => { const t = Date.parse(ev.timestamp); const d = prev != null && !isNaN(t) ? Math.min(Math.max(t - prev, 250), 2500) : 600; if (!isNaN(t)) prev = t; return { d, e: ev }; });
    playList(list, `${f.name} (${evs.length} olay)`);
    document.getElementById('toknote').textContent = 'Token değerleri olay verisinden kaba tahmindir; gerçek değer için transcript usage alanı gerekir.';
    e.target.value = '';
  });
}
