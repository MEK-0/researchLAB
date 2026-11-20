// researchLAB masaüstü uygulaması (Electron main process).
// Süreçleri kendisi başlatmaz: tek kaynak office/office.sh'tır (start / status --json / kill).
// Bu dosya açılışı bekler, pencereyi, menü çubuğu ikonunu, kapanış diyaloğunu ve uyku engelini yönetir.
import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, powerSaveBlocker, screen, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_REPO, EXTRA_PATH, MARK, PART_LABEL, PORTS, boundsVisible, describe, diagnose,
  exitDecision, mergePath, missingTools, parseMarked, validateRepo,
} from './logic.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, '..', 'assets');
const OFFICE_URL = `http://localhost:${PORTS.server}`;
const READY_TIMEOUT = 20000;
const POLL_MS = 5000;

app.setName('researchLAB');
// Testler gerçek ayarlara dokunmasın diye ayrı ayar klasörü verilebilir.
if (process.env.RESEARCHLAB_USER_DATA) app.setPath('userData', process.env.RESEARCHLAB_USER_DATA);
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

// ---------- ayarlar (userData/settings.json) ----------
const SETTINGS = join(app.getPath('userData'), 'settings.json');
let settings = {};
try { settings = JSON.parse(readFileSync(SETTINGS, 'utf8')); } catch { settings = {}; }
function save(patch) {
  Object.assign(settings, patch);
  try { mkdirSync(dirname(SETTINGS), { recursive: true }); writeFileSync(SETTINGS, JSON.stringify(settings, null, 2)); } catch (e) { console.error('[researchLAB] ayarlar yazılamadı', e); }
}

// ---------- ortam: PATH ve dil ----------
// Finder'dan açılışta PATH kısıtlıdır ve LANG yoktur (tmux UTF-8'i bozar).
function loginShellEnv() {
  const sh = process.env.SHELL || userInfo().shell || '/bin/zsh';
  return new Promise(resolve => {
    let out = '';
    const p = spawn(sh, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"; printf '${MARK}%s${MARK}' "$LANG"`], { stdio: ['ignore', 'pipe', 'ignore'] });
    const t = setTimeout(() => { p.kill(); resolve({}); }, 3000);
    p.stdout.on('data', d => { out += d; });
    p.on('close', () => {
      clearTimeout(t);
      const [path = '', lang = ''] = (out.match(new RegExp(`${MARK}.*?${MARK}`, 'gs')) || []).map(parseMarked);
      resolve({ path, lang });
    });
    p.on('error', () => { clearTimeout(t); resolve({}); });
  });
}
async function setupEnv() {
  const login = await loginShellEnv();
  process.env.PATH = mergePath(process.env.PATH, login.path, EXTRA_PATH.join(':'));
  if (!process.env.LANG) process.env.LANG = login.lang || 'en_US.UTF-8';
  if (!process.env.SHELL) process.env.SHELL = userInfo().shell || '/bin/zsh';
}

// ---------- office.sh ----------
let repo = null;
function office(...args) {
  return new Promise(resolve => {
    execFile(join(repo, 'office', 'office.sh'), args, { env: { ...process.env, NO_OPEN: '1' }, timeout: 30000 },
      (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, out: `${stdout}${stderr}`.trim() }));
  });
}
async function officeStatus() {
  const r = await office('status', '--json');
  try { return JSON.parse(r.out); } catch { return null; }
}
function portOpen(port) {
  return new Promise(resolve => {
    const s = net.connect({ host: '127.0.0.1', port });
    const done = ok => { s.destroy(); resolve(ok); };
    s.setTimeout(800, () => done(false)); s.once('connect', () => done(true)); s.once('error', () => done(false));
  });
}
async function apiStatus(timeout = 2000) {
  try {
    const r = await fetch(`${OFFICE_URL}/api/status`, { signal: AbortSignal.timeout(timeout), cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
async function probe() {
  const [status, open, api] = await Promise.all([
    officeStatus(),
    Promise.all(Object.keys(PART_LABEL).map(async k => [k, await portOpen(PORTS[k])])).then(Object.fromEntries),
    apiStatus(),
  ]);
  return { ...diagnose(status, open, !!api), status };
}
function logTail(name, n = 6) {
  try {
    const run = join(repo, 'office', '.run');
    return readFileSync(join(run, `${name}.log`), 'utf8').trim().split('\n').slice(-n).join('\n');
  } catch { return ''; }
}

// ---------- pencere ----------
let win = null, tray = null;
let allowQuit = false, exiting = false;

function createWindow() {
  const b = settings.bounds;
  const ok = boundsVisible(b, screen.getAllDisplays().map(d => d.workArea));
  win = new BrowserWindow({
    title: 'researchLAB', width: ok ? b.width : 1440, height: ok ? b.height : 900, x: ok ? b.x : undefined, y: ok ? b.y : undefined,
    minWidth: 900, minHeight: 600, backgroundColor: '#0f1f1c', show: false,
    icon: join(ASSETS, 'icon.png'),
    webPreferences: { preload: join(HERE, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  if (settings.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('page-title-updated', e => e.preventDefault());
  let t = null;
  const remember = () => { clearTimeout(t); t = setTimeout(() => { if (win && !win.isDestroyed() && !win.isMinimized()) save({ bounds: win.getNormalBounds(), maximized: win.isMaximized() }); }, 400); };
  win.on('resize', remember); win.on('move', remember);
  win.on('close', e => {
    if (allowQuit || win.__background) return;
    e.preventDefault(); requestExit();
  });
  win.on('closed', () => { win = null; });

  // Dış linkler varsayılan tarayıcıda; uygulama penceresi yalnızca ofiste ve kendi ekranlarında kalır.
  const internal = url => url.startsWith(OFFICE_URL + '/') || url === OFFICE_URL || url.startsWith('file://');
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Sayfadan window.close() 'close' olayına uğramadan pencereyi kapatır; kapanış tek yoldan geçsin.
  win.webContents.on('dom-ready', () => {
    if (win.webContents.getURL().startsWith(OFFICE_URL)) win.webContents.executeJavaScript('window.close = () => {}; 0').catch(() => {});
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!internal(url)) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });
  return win;
}
function showWindow() {
  if (process.platform === 'darwin') app.dock?.show();
  if (!win) { createWindow(); win.loadURL(OFFICE_URL); }
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
function screenPage(name, data) {
  if (!win) createWindow();
  return win.loadFile(join(HERE, 'screens', `${name}.html`), { query: { data: JSON.stringify(data || {}) } });
}

// Ekranlardaki düğmeler (yalnızca file:// ekranlarından kabul edilir; ofis sayfası çağıramaz)
const fromScreen = e => (e.senderFrame?.url || '').startsWith('file://');
ipcMain.on('rl:retry', e => { if (fromScreen(e)) boot(); });
ipcMain.on('rl:choose-repo', async e => { if (fromScreen(e) && await chooseRepo(true)) boot(); });
ipcMain.on('rl:quit', e => { if (fromScreen(e)) requestExit(); });
ipcMain.on('rl:open-log', (e, name) => { if (fromScreen(e) && /^(server|ttyd1|ttyd2)$/.test(name)) shell.openPath(join(repo, 'office', '.run', `${name}.log`)); });

// ---------- repo seçimi ----------
async function chooseRepo(force = false) {
  for (;;) {
    let dir = settings.repo;
    if (force || !dir) {
      const r = await dialog.showOpenDialog(win || undefined, {
        title: 'researchLAB klasörünü seç', message: 'researchLAB reposunun klasörünü seç',
        defaultPath: existsSync(settings.repo || DEFAULT_REPO) ? (settings.repo || DEFAULT_REPO) : app.getPath('home'),
        properties: ['openDirectory'], buttonLabel: 'Seç',
      });
      if (r.canceled || !r.filePaths[0]) return false;
      dir = r.filePaths[0];
    }
    const v = validateRepo(dir);
    if (v.fatal) {
      await dialog.showMessageBox(win || undefined, { type: 'error', message: 'Bu klasör kullanılamaz', detail: `${dir}\n\n${v.fatal}`, buttons: ['Başka klasör seç'] });
      force = true; continue;
    }
    if (v.warnings.length && settings.repo !== dir) {
      const r = await dialog.showMessageBox(win || undefined, {
        type: 'warning', message: 'Klasörde researchLAB dosyaları eksik', detail: `${dir}\n\n${v.warnings.join('\n')}`,
        buttons: ['Yine de kullan', 'Başka klasör seç'], defaultId: 1, cancelId: 1,
      });
      if (r.response === 1) { force = true; continue; }
    }
    if (settings.repo && repo && settings.repo !== dir) {
      save({ repo: dir });
      await dialog.showMessageBox(win || undefined, { type: 'info', message: 'Repo klasörü değişti', detail: 'Yeni klasör uygulama bir sonraki açılışında kullanılır.' });
      return false;
    }
    save({ repo: dir });
    return true;
  }
}

// ---------- açılış ----------
let booting = false;
async function boot() {
  if (booting) return; booting = true;
  try {
    const missing = missingTools(process.env.PATH);
    if (missing.length) {
      await screenPage('problem', { kind: 'missing', missing, path: process.env.PATH });
      return;
    }
    if (!settings.repo || validateRepo(settings.repo).fatal) {
      if (!(await chooseRepo(!!settings.repo))) { if (!settings.repo) await screenPage('problem', { kind: 'norepo' }); return; }
    }
    repo = settings.repo;
    await screenPage('loading', { repo });
    const started = await office('start');
    const deadline = Date.now() + READY_TIMEOUT;
    let p;
    for (;;) {
      p = await probe();
      if (p.ready) break;
      // başka bir sürecin tuttuğu port beklemekle açılmaz: hemen söyle
      const blocked = p.parts.some(x => !x.ok && /başka bir süreçte/.test(x.msg));
      if (blocked || Date.now() > deadline) break;
      await new Promise(r => setTimeout(r, 400));
    }
    if (!p.ready) {
      const parts = p.parts.map(x => ({ ...x, log: !x.ok && PART_LABEL[x.key] ? logTail(x.key) : '' }));
      await screenPage('problem', { kind: 'start', repo, parts, out: started.out, timedOut: Date.now() > deadline });
      return;
    }
    await win.loadURL(OFFICE_URL);
    startPolling();
  } finally { booting = false; }
}

// ---------- durum: menü çubuğu ve uyku engeli ----------
let blocker = null, lastStatus = null, pollTimer = null;
function applyStatus(st) {
  lastStatus = st;
  const busy = !!st?.busy;
  if (busy && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
  if (!busy && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
  if (tray) {
    const d = describe(st);
    tray.setTitle(busy ? ' çalışıyor' : '');
    tray.setToolTip(`researchLAB · ${d.short}\n${d.lines.join('\n')}`);
    tray.setContextMenu(trayMenu(d));
  }
}
function startPolling() {
  if (pollTimer) return;
  const tick = async () => applyStatus(await apiStatus());
  tick(); pollTimer = setInterval(tick, POLL_MS);
}
function trayMenu(d = describe(lastStatus)) {
  return Menu.buildFromTemplate([
    { label: 'Aç', click: showWindow },
    { label: `Durum: ${d.short}`, submenu: [...d.lines.map(l => ({ label: l, enabled: false })), { type: 'separator' }, { label: 'Ayrıntı…', click: showStatus }] },
    { type: 'separator' },
    { label: 'Tamamen kapat', click: requestExit },
  ]);
}
async function showStatus() {
  const st = await apiStatus(); applyStatus(st);
  const p = repo ? await probe() : null;
  const detail = [...describe(st).lines, '', ...(p ? p.parts.map(x => `${x.ok ? '●' : '○'} ${x.label}: ${x.msg}`) : []), '', `Repo: ${repo || '—'}`].join('\n');
  dialog.showMessageBox({ type: 'info', message: `researchLAB · ${describe(st).short}`, detail, buttons: ['Tamam'] });
}
function createTray() {
  const img = nativeImage.createFromPath(join(ASSETS, 'trayTemplate.png'));
  img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip('researchLAB');
  tray.setContextMenu(trayMenu());
}

// ---------- kapanış ----------
// Pencereyi kapatma, Cmd+Q ve menü çubuğundaki "Tamamen kapat" hepsi buradan geçer.
async function requestExit() {
  if (exiting) return; exiting = true;
  try {
    if (!repo) { allowQuit = true; app.quit(); return; }
    const st = await apiStatus();
    const tmux = st ? null : (await officeStatus())?.tmux;
    const decision = exitDecision(st, tmux ? Object.values(tmux)[0] : false);
    if (decision === 'stop') return await stopAll();
    const d = describe(st);
    const r = await dialog.showMessageBox(win && win.isVisible() ? win : undefined, {
      type: 'warning',
      message: st ? 'Bir agent hâlâ çalışıyor' : 'Durum okunamadı; Manager çalışıyor olabilir',
      detail: `${d.lines.join('\n')}\n\nDurdurursan Manager ve terminaller kapanır. Arka planda bırakırsan pencere kapanır; iş tmux içinde sürer ve menü çubuğundan yeniden açabilirsin.`,
      buttons: ['Durdurup kapat', 'Arka planda çalışsın', 'İptal'], defaultId: 1, cancelId: 2, noLink: true,
    });
    if (r.response === 0) return await stopAll();
    if (r.response === 1) return toBackground();
  } catch (e) {
    console.error('[researchLAB] kapanış başarısız; uygulama açık kalıyor', e);   // güvenli yön: hiçbir şey öldürülmez
  } finally { exiting = false; }
}
async function stopAll() {
  if (win && !win.isDestroyed()) win.hide();
  await office('kill');
  allowQuit = true; app.quit();
}
function toBackground() {
  if (win && !win.isDestroyed()) { win.__background = true; win.close(); }
  if (process.platform === 'darwin') app.dock?.hide();
}

// ---------- uygulama menüsü ----------
function appMenu() {
  return Menu.buildFromTemplate([
    { label: 'researchLAB', submenu: [
      { role: 'about', label: 'researchLAB hakkında' },
      { type: 'separator' },
      { label: 'Repo klasörünü değiştir…', click: () => chooseRepo(true) },
      { label: 'Durum…', click: showStatus },
      { type: 'separator' },
      { role: 'hide', label: 'researchLAB\'ı gizle' }, { role: 'hideOthers', label: 'Diğerlerini gizle' }, { role: 'unhide', label: 'Tümünü göster' },
      { type: 'separator' },
      { label: 'Çık', accelerator: 'Cmd+Q', click: requestExit },
    ] },
    // Edit rolleri: terminal iframe'lerinde Cmd+C / Cmd+V bunlarla çalışır
    { label: 'Düzen', submenu: [
      { role: 'undo', label: 'Geri al' }, { role: 'redo', label: 'Yinele' }, { type: 'separator' },
      { role: 'cut', label: 'Kes' }, { role: 'copy', label: 'Kopyala' }, { role: 'paste', label: 'Yapıştır' }, { role: 'selectAll', label: 'Tümünü seç' },
    ] },
    { label: 'Görünüm', submenu: [
      { role: 'reload', label: 'Yenile' }, { role: 'forceReload', label: 'Önbelleksiz yenile' }, { role: 'toggleDevTools', label: 'Geliştirici araçları' },
      { type: 'separator' }, { role: 'resetZoom', label: 'Gerçek boyut' }, { role: 'zoomIn', label: 'Yakınlaştır' }, { role: 'zoomOut', label: 'Uzaklaştır' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Tam ekran' },
    ] },
    { role: 'windowMenu', label: 'Pencere' },
  ]);
}

// ---------- yaşam döngüsü ----------
app.on('second-instance', () => showWindow());
app.on('activate', () => { if (!win && repo) showWindow(); });
app.on('before-quit', e => { if (!allowQuit) { e.preventDefault(); requestExit(); } });
app.on('window-all-closed', () => { /* arka plan modunda menü çubuğunda kalır */ });

app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock?.setIcon(join(ASSETS, 'icon.png'));
  app.setAboutPanelOptions({ applicationName: 'researchLAB', applicationVersion: app.getVersion() });
  Menu.setApplicationMenu(appMenu());
  await setupEnv();
  createTray();
  createWindow();
  boot();
});
