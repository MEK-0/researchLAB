// Electron'a bağlı olmayan saf mantık: PATH, araç denetimi, repo doğrulama,
// açılış teşhisi ve kapanış kararı. tests/desktop.test.mjs bunları doğrudan test eder.
import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const PORTS = {
  server: +(process.env.OFFICE_PORT || 8765),
  ttyd1: +(process.env.OFFICE_T1 || 7681),
  ttyd2: +(process.env.OFFICE_T2 || 7682),
};
export const PART_LABEL = { server: 'Ofis sunucusu (server.py)', ttyd1: 'Terminal 1 (ttyd)', ttyd2: 'Terminal 2 (ttyd)' };
export const DEFAULT_REPO = join(homedir(), 'Desktop', 'researchLAB');

// Finder'dan açılan uygulamada PATH yalnızca /usr/bin:/bin:/usr/sbin:/sbin olur.
export const EXTRA_PATH = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', join(homedir(), '.local', 'bin')];

export const TOOLS = [
  { name: 'claude', install: 'curl -fsSL https://claude.ai/install.sh | bash' },
  { name: 'tmux', install: 'brew install tmux' },
  { name: 'ttyd', install: 'brew install ttyd' },
  { name: 'python3', install: 'xcode-select --install   # ya da: brew install python' },
];

/** PATH listelerini sırayı koruyarak birleştirir, tekrarları ve boşları atar. */
export function mergePath(...parts) {
  const out = [];
  for (const p of parts) for (const d of String(p || '').split(':')) if (d && !out.includes(d)) out.push(d);
  return out.join(':');
}

// Login shell çıktısındaki işaretli değeri ayıklar (rc dosyaları başka şeyler de yazabilir).
export const MARK = '__RESEARCHLAB__';
export function parseMarked(stdout) {
  const m = new RegExp(`${MARK}(.*?)${MARK}`, 's').exec(String(stdout || ''));
  return m ? m[1].trim() : '';
}

export function findTool(name, path) {
  for (const d of String(path || '').split(':')) {
    if (!d) continue;
    try { accessSync(join(d, name), constants.X_OK); return join(d, name); } catch { /* yok */ }
  }
  return null;
}

/** Eksik araçlar: [{name, install}] */
export function missingTools(path, tools = TOOLS) {
  return tools.filter(t => !findTool(t.name, path));
}

/** Repo klasörü denetimi.
 *  fatal: office/office.sh yok → bu klasörde ofis çalışamaz.
 *  warnings: CLAUDE.md veya .claude/agents/ yok → kullanıcı yine de seçebilir. */
export function validateRepo(dir) {
  const isDir = p => { try { return statSync(p).isDirectory(); } catch { return false; } };
  if (!dir || !isDir(dir)) return { fatal: 'Klasör bulunamadı.', warnings: [] };
  if (!existsSync(join(dir, 'office', 'office.sh'))) return { fatal: 'Bu klasörde office/office.sh yok; researchLAB reposu değil gibi görünüyor.', warnings: [] };
  const warnings = [];
  if (!existsSync(join(dir, 'CLAUDE.md'))) warnings.push('CLAUDE.md yok (Manager anayasası).');
  if (!isDir(join(dir, '.claude', 'agents'))) warnings.push('.claude/agents/ yok (alt agent tanımları).');
  return { fatal: null, warnings };
}

/** office.sh status --json + port yoklaması → parça parça teşhis.
 *  status: office.sh çıktısı; open: {server: bool, ...}; apiOk: /api/status yanıt verdi mi.
 *  Döner: {ready, parts:[{key, label, ok, msg}]} */
export function diagnose(status, open, apiOk) {
  const parts = Object.keys(PART_LABEL).map(key => {
    const s = status?.[key] || {};
    const port = PORTS[key];
    let ok = false, msg;
    if (s.port_busy && !s.owned && !s.alive) msg = `${port} portu başka bir süreçte; researchLAB'ın değil. Portu boşalt ya da o süreci kapat.`;
    else if (!s.alive) msg = 'Süreç çalışmıyor (başlatılamadı ya da hemen kapandı).';
    else if (!open?.[key]) msg = `Süreç çalışıyor ama ${port} portu henüz açılmadı.`;
    else if (key === 'server' && !apiOk) msg = '/api/status yanıt vermiyor.';
    else { ok = true; msg = `çalışıyor (port ${port})`; }
    return { key, label: PART_LABEL[key], ok, msg };
  });
  const tmux = status?.tmux || {};
  for (const [name, up] of Object.entries(tmux)) parts.push({ key: 'tmux:' + name, label: `tmux ${name}`, ok: !!up, msg: up ? 'açık' : 'yok' });
  return { ready: parts.filter(p => !p.key.startsWith('tmux:')).every(p => p.ok), parts };
}

/** Kapanış kararı. status: /api/status yanıtı ya da null (okunamadı).
 *  'stop'  → hiçbir agent çalışmıyor: her şeyi kapat.
 *  'ask'   → agent çalışıyor ya da durum bilinmiyor ama Manager oturumu olabilir: diyalog. */
export function exitDecision(status, managerSessionExists) {
  if (!status) return managerSessionExists ? 'ask' : 'stop';
  return status.busy ? 'ask' : 'stop';
}

/** Diyalog ve menü çubuğu için kısa durum metni. */
export function describe(status) {
  if (!status) return { short: 'bilinmiyor', lines: ['Sunucuya ulaşılamadı.'] };
  const lines = [];
  lines.push(status.manager_running ? (status.manager_busy ? 'Manager: çalışıyor (tur sürüyor)' : 'Manager: açık, boşta') : 'Manager: kapalı');
  const subs = status.active_subagents || [];
  if (subs.length) lines.push('Aktif alt agent: ' + subs.map(s => s.agent_type || '?').join(', '));
  return { short: status.busy ? 'çalışıyor' : 'boşta', lines };
}

/** Kayıtlı pencere konumu ekranlardan birinde görünüyor mu? displays: [{x,y,width,height}] */
export function boundsVisible(b, displays) {
  if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y) || b.width < 400 || b.height < 300) return false;
  return displays.some(d => b.x + 80 > d.x && b.y + 40 > d.y && b.x < d.x + d.width - 80 && b.y < d.y + d.height - 40);
}
