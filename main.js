const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, clipboard, powerMonitor, dialog, shell } = require('electron');
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const WebSocket = require('ws');

// 앱 이름을 바꿔도 기존 설정/그룹/신원이 사라지지 않게 데이터 폴더 이름은 고정한다 (Windows: %APPDATA%\pixel-pals, Mac: ~/Library/Application Support/pixel-pals)
app.setPath('userData', path.join(app.getPath('appData'), 'pixel-pals'));

const H = 420; // 오버레이 높이(px): 크기 효과(최대 7배)가 잘리지 않을 만큼 넉넉하게
let win, settingsWin, historyWin, composerWin, tray, settings, settingsPath, cachedGroups = [], away = false;

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } };
// 설정값: 앱에 들어 있는 config.json 위에, 사용자 폴더의 config.json(있으면)을 덮어쓴다 -> 설치 후에도 서버 주소 등을 고칠 수 있음
const bundled = readJson(path.join(__dirname, 'config.json')), userCfg = readJson(path.join(app.getPath('userData'), 'config.json'));
const base = { ...bundled, ...userCfg, shortcuts: { ...bundled.shortcuts, ...userCfg.shortcuts } };
const serverUrl = process.env.PIXELPALS_SERVER || base.serverUrl || 'ws://localhost:8080';
const AWAY_SECONDS = base.awaySeconds || 60;   // 이 시간 동안 입력이 없으면 '자리 비움' -> 캐릭터가 졸아요
const SC = { overlay: 'Ctrl+Alt+H', composer: base.shortcut || 'Ctrl+Alt+I', quiet: 'Ctrl+Alt+M', history: 'Ctrl+Alt+R', ...(base.shortcuts || {}) };

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => openSettings());

// ---- 내 설정 (이 PC에 저장) ----
function loadSettings() {
  settingsPath = path.join(app.getPath('userData'), 'settings.json');
  let s = {}; try { s = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}
  settings = { uid: crypto.randomUUID(), nickname: '', character: 0, bubble: 'default', throwable: 'ball', activeCode: '', showOffline: true, quietMode: false,
    throwGuard: false, soundOn: true, composerPlacement: null, groupSnapshots: [], ...s };
  saveFile();
}
function saveFile() { fs.mkdirSync(path.dirname(settingsPath), { recursive: true }); fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2)); }
const view = () => ({ ...settings, serverUrl, doubleClickMs: base.doubleClickMs });

ipcMain.on('settings:get', (e) => (e.returnValue = view()));
ipcMain.handle('settings:set', (_e, p = {}) => {
  if (typeof p.nickname === 'string') settings.nickname = [...p.nickname.trim()].slice(0, 8).join('');
  if (Number.isInteger(p.character) && p.character >= 0 && p.character < 100) settings.character = p.character;
  if (typeof p.bubble === 'string') settings.bubble = p.bubble.slice(0, 16);
  if (typeof p.throwable === 'string') settings.throwable = p.throwable.slice(0, 16);
  if (typeof p.showOffline === 'boolean') settings.showOffline = p.showOffline;
  if (typeof p.throwGuard === 'boolean') settings.throwGuard = p.throwGuard;
  if (typeof p.soundOn === 'boolean') settings.soundOn = p.soundOn;
  if (typeof p.activeCode === 'string') { const changed = p.activeCode !== settings.activeCode; settings.activeCode = p.activeCode.slice(0, 20); if (changed && historyWin) historyWin.webContents.send('history:refresh'); }
  saveFile();
  if (win) win.webContents.reload();          // 오버레이가 새 설정으로 다시 접속
  return view();
});
ipcMain.on('clipboard', (_e, t) => clipboard.writeText(String(t)));
ipcMain.on('history:pin', (_e, on) => { if (historyWin) historyWin.setAlwaysOnTop(!!on, 'floating'); });

// ---- 서버에 간단히 물어보기 (그룹 목록 / 복원) ----
function rpc(op, data = {}) {
  return new Promise((resolve, reject) => {
    const rid = crypto.randomUUID(); let done = false, ws;
    const end = (fn, v) => { if (done) return; done = true; clearTimeout(to); try { ws.close(); } catch {} fn(v); };
    const to = setTimeout(() => end(reject, new Error('시간 초과')), 8000);
    ws = new WebSocket(serverUrl);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'rpc', rid, op, uid: settings.uid, ...data })));
    ws.on('message', (d) => { const m = JSON.parse(d); if (m.rid === rid) (m.ok ? end(resolve, m.data) : end(reject, new Error(m.msg))); });
    ws.on('error', (e) => end(reject, e));
  });
}
// 무료 서버는 파일이 지워질 수 있어서, 그룹 정보를 내 PC에도 복사해 두었다가 서버가 비어 있으면 같은 초대코드로 되살린다
const toSnapshot = (g) => ({ code: g.code, groupName: g.name, owner: (g.members.find((m) => m.owner) || g.members[0] || {}).uid, members: g.members.map((m) => ({ uid: m.uid, name: m.name, look: m.look })) });
async function refreshGroups() {
  try {
    let list = await rpc('list');
    if (!list.length) {
      const st = await rpc('status');
      if (st.empty && settings.groupSnapshots.length) {                         // 서버 데이터가 사라진 경우 -> 복원
        for (const s of settings.groupSnapshots) { try { await rpc('restore', s); } catch {} }
        list = await rpc('list');
        if (list.length && win) win.webContents.reload();                       // 되살린 그룹으로 다시 접속
      } else if (!st.empty) { settings.groupSnapshots = []; saveFile(); }       // 서버는 멀쩡한데 내 그룹이 없음 -> 복원할 게 없음
    }
    if (list.length) { settings.groupSnapshots = list.map(toSnapshot); saveFile(); }
    cachedGroups = list.map((g) => ({ code: g.code, name: g.name }));
  } catch {}
}
ipcMain.on('groups:push', (_e, list) => {
  if (!Array.isArray(list) || !list.length) return;
  cachedGroups = list.map((g) => ({ code: String(g.code), name: String(g.name) }));
  settings.groupSnapshots = list.filter((g) => Array.isArray(g.members)).map(toSnapshot); saveFile();
});
ipcMain.on('groups:refresh', () => refreshGroups());
ipcMain.on('group:forget', (_e, code) => {                                       // 그룹을 나갔거나 삭제/제외됨 -> 복원 정보도 지움 (되살아나지 않게)
  settings.groupSnapshots = settings.groupSnapshots.filter((s) => s.code !== code);
  cachedGroups = cachedGroups.filter((g) => g.code !== code);
  if (settings.activeCode === code) settings.activeCode = '';
  saveFile();
});

// ---- 오버레이 창 ----
function createOverlay() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    x: workArea.x, y: workArea.y + workArea.height - H, width: workArea.width, height: H,
    transparent: true, frame: false, resizable: false, hasShadow: false, skipTaskbar: true, alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, autoplayPolicy: 'no-user-gesture-required' },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('did-start-loading', resetClickThrough);      // 로드를 '시작'할 때 비운다 (끝날 때 비우면, 새 페이지가 먼저 보낸 영역을 지워버릴 수 있음)
  win.webContents.on('did-finish-load', () => { win.webContents.send('presence', away ? 'away' : 'online'); win.webContents.send('composer:visibility', composerOpen()); });
}
// 클릭 통과 제어: 화면(오버레이)이 알려준 '클릭 가능한 영역'(캐릭터 위치) 안에 마우스가 있으면 클릭을 받고, 아니면 아래 창으로 통과시킨다.
// 웹페이지가 받는 마우스 이동 신호(forward)에 의존하지 않고 앱 본체가 마우스 위치를 직접 읽기 때문에 환경과 상관없이 같게 동작한다.
let regions = [], captured = false;
ipcMain.on('hit:regions', (_e, list) => {
  regions = (Array.isArray(list) ? list : []).slice(0, 40).filter((r) => r && [r.x, r.y, r.w, r.h].every(Number.isFinite));
});
// (테스트 전용) PIXELPALS_TEST_CURSOR 에 파일 경로를 주면 마우스 위치를 그 파일({x,y})에서 읽는다. 평소에는 시스템의 실제 마우스 위치를 쓴다.
const cursorPoint = () => {
  if (process.env.PIXELPALS_TEST_CURSOR) { try { return JSON.parse(fs.readFileSync(process.env.PIXELPALS_TEST_CURSOR, 'utf8')); } catch {} }
  return screen.getCursorScreenPoint();
};
function resetClickThrough() { regions = []; captured = false; if (win) win.setIgnoreMouseEvents(true, { forward: true }); }
function pollCursor() {
  if (!win || !win.isVisible()) return;
  const p = cursorPoint(), b = win.getBounds(), x = p.x - b.x, y = p.y - b.y;
  const inside = regions.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  if (inside !== captured) { captured = inside; win.setIgnoreMouseEvents(!inside, { forward: true }); }
}

// ---- 입력창 (별도 창: 400x56, 기본 위치는 화면 위 가운데, 드래그하면 위치를 기억) ----
const CW = 400, CH = 56;
let placing = false, moveTimer, pendingChat = null;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
let composerShown = false;                      // 입력창이 보이는지는 시스템(isVisible)에 묻지 않고 직접 기록한다 (미리 만든 숨은 창이 '보임'으로 나오는 환경이 있어서)
const composerOpen = () => composerShown;
function notifyComposer() { if (!win) return; const v = composerOpen(); win.webContents.send('composer:visibility', v); if (!v) win.webContents.send('composer:typing', false); }
function createComposer() {
  composerWin = new BrowserWindow({
    width: CW, height: CH, show: false, frame: false, transparent: true, resizable: false, maximizable: false, fullscreenable: false, hasShadow: false, skipTaskbar: true, alwaysOnTop: true,
    title: 'DDuknip-friends 메시지', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  composerWin.setAlwaysOnTop(true, 'screen-saver');
  composerWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  composerWin.loadFile(path.join(__dirname, 'composer', 'index.html'));
  composerWin.on('show', () => { composerShown = true; notifyComposer(); }); composerWin.on('hide', () => { composerShown = false; notifyComposer(); });
  composerWin.on('move', () => { if (placing || !composerShown) return; clearTimeout(moveTimer); moveTimer = setTimeout(savePlacement, 400); });   // 보이는 상태에서 사용자가 옮겼을 때만 위치 저장 (만들어질 때 운영체제가 정한 자리를 저장하면 안 됨)
  composerWin.on('closed', () => { composerWin = null; composerShown = false; });
}
function placeComposer() {
  const pl = settings.composerPlacement, displays = screen.getAllDisplays();
  const d = (pl && displays.find((x) => String(x.id) === String(pl.display))) || screen.getPrimaryDisplay(), wa = d.workArea;
  const maxX = Math.max(0, wa.width - CW), maxY = Math.max(0, wa.height - CH);
  const x = pl ? clamp(pl.x, 0, maxX) : maxX / 2, y = pl ? clamp(pl.y, 0, maxY) : 10;        // 저장된 위치가 없으면: 가운데 위, 위에서 10
  placing = true; composerWin.setBounds({ x: Math.round(wa.x + x), y: Math.round(wa.y + y), width: CW, height: CH }); setTimeout(() => (placing = false), 50);
}
function savePlacement() {
  if (!composerWin) return;
  const b = composerWin.getBounds(), d = screen.getDisplayMatching(b);
  settings.composerPlacement = { display: d.id, x: b.x - d.workArea.x, y: b.y - d.workArea.y }; saveFile();
}
let wantComposer = false;                       // 마지막으로 요청된 상태 (열기 요청 뒤 곧바로 닫기 요청이 오면 열지 않음)
function showComposer() {
  wantComposer = true;
  if (composerOpen()) { composerWin.focus(); return; }
  const go = () => { if (!wantComposer || !composerWin) return; placeComposer(); composerWin.show(); app.focus({ steal: true }); composerWin.focus(); composerWin.webContents.send('composer:shown'); };
  if (!composerWin) createComposer();
  if (composerWin.webContents.isLoading()) composerWin.webContents.once('did-finish-load', go); else go();
}
const hideComposer = () => { wantComposer = false; if (composerWin && composerShown) composerWin.hide(); };
const toggleComposer = () => (composerOpen() ? hideComposer() : showComposer());
ipcMain.on('composer:set', (_e, v) => (v ? showComposer() : hideComposer()));
ipcMain.on('composer:close', hideComposer);
ipcMain.on('composer:typing', (_e, on) => { if (win) win.webContents.send('composer:typing', !!on); });
// 입력창에서 보낸 메시지는 오버레이(서버 연결을 가진 쪽)로 전달하고, 보냈는지 결과를 돌려준다
ipcMain.handle('chat:send', (_e, text) => new Promise((resolve) => {
  if (pendingChat) pendingChat(false); pendingChat = resolve;
  win.webContents.send('chat:send', String(text).slice(0, 200));
  setTimeout(() => { if (pendingChat === resolve) { pendingChat = null; resolve(false); } }, 3000);
}));
ipcMain.on('chat:result', (_e, ok) => { if (pendingChat) { const r = pendingChat; pendingChat = null; r(!!ok); } });

// ---- 트레이 메뉴의 동작들 ----
function toggleSound() {                          // 효과음 켜기/끄기 (트레이 메뉴): 바로 적용되고 저장돼요
  settings.soundOn = !settings.soundOn; saveFile(); if (win) win.webContents.send('sound', settings.soundOn);
}
const toggleOverlay = () => (win.isVisible() ? win.hide() : win.showInactive());
function toggleQuiet() {                       // 조용히 모드: 말풍선과 입력 중 표시를 숨김 (접속 상태 점은 그대로)
  settings.quietMode = !settings.quietMode; saveFile(); win.webContents.send('quiet', settings.quietMode);
}
function switchGroup(code) {
  settings.activeCode = code; saveFile(); win.webContents.reload();
  if (historyWin) historyWin.webContents.send('history:refresh');
}
const loginOpts = () => (app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] });   // 개발 중(npm start)에도 동작하게
const loginEnabled = () => { try { return app.getLoginItemSettings(loginOpts()).openAtLogin; } catch { return false; } };
const setLogin = (on) => app.setLoginItemSettings({ openAtLogin: on, ...loginOpts() });

function openSettings(page = 'profile') {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); settingsWin.webContents.send('settings:page', page); return; }
  app.focus({ steal: true });
  settingsWin = new BrowserWindow({
    width: 940, height: 720, minWidth: 720, minHeight: 520, title: 'DDuknip-friends 설정', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, 'settings', 'index.html'), { hash: page });
  settingsWin.on('closed', () => (settingsWin = null));
}
function openHistory() {
  if (historyWin) { historyWin.show(); historyWin.focus(); return; }
  app.focus({ steal: true });
  historyWin = new BrowserWindow({
    width: 420, height: 640, minWidth: 340, minHeight: 360, title: 'DDuknip-friends · 최근 기록', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  historyWin.setMenu(null);
  historyWin.loadFile(path.join(__dirname, 'history', 'index.html'));
  historyWin.on('closed', () => (historyWin = null));
}
const toggleHistory = () => (historyWin ? historyWin.close() : openHistory());

// ---- 업데이트 확인: config.json 의 updateUrl 이 가리키는 JSON {"version","url","notes"} 와 현재 버전을 비교 ----
const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
async function checkUpdate() {
  if (!base.updateUrl) return dialog.showMessageBox({ type: 'info', title: '업데이트 확인', message: '업데이트 주소가 설정되지 않았어요.', detail: 'config.json 의 updateUrl 에 최신 버전 정보(JSON) 주소를 넣으면 확인할 수 있어요.' });
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
    const info = await (await fetch(base.updateUrl, { signal: ctl.signal })).json(); clearTimeout(t);
    if (!info.version || !newer(info.version, app.getVersion())) return dialog.showMessageBox({ type: 'info', title: '업데이트 확인', message: `최신 버전이에요. (v${app.getVersion()})` });
    const r = await dialog.showMessageBox({ type: 'info', title: '업데이트 확인', message: `새 버전 v${info.version}이 나왔어요.`, detail: info.notes || '', buttons: ['다운로드', '나중에'], defaultId: 0 });
    if (r.response === 0 && /^https:\/\//.test(info.url || '')) shell.openExternal(info.url);
  } catch { dialog.showMessageBox({ type: 'error', title: '업데이트 확인', message: '업데이트 정보를 가져오지 못했어요.', detail: '잠시 후 다시 시도해 주세요.' }); }
}

// ---- 트레이 우클릭 메뉴 (SIDEY와 같은 구성, 상점 제외). 열 때마다 새로 만들어서 상태가 항상 맞게 ----
function buildMenu() {
  const groupItems = cachedGroups.length
    ? cachedGroups.map((g) => ({ label: g.name, type: 'radio', checked: g.code === settings.activeCode, click: () => switchGroup(g.code) }))
    : [{ label: '참여 중인 그룹이 없어요', enabled: false }];
  const hint = (key) => ({ accelerator: SC[key], registerAccelerator: false });   // 단축키는 표시만 (실제 등록은 아래에서)
  return Menu.buildFromTemplate([
    { label: win.isVisible() ? '픽셀 월드 숨기기' : '픽셀 월드 보이기', ...hint('overlay'), click: toggleOverlay },
    { label: '메시지 작성…', ...hint('composer'), click: showComposer },
    { type: 'separator' },
    { label: '사용 중인 그룹', submenu: groupItems },
    { label: '조용히 모드', type: 'checkbox', checked: !!settings.quietMode, ...hint('quiet'), click: toggleQuiet },
    { label: '효과음', type: 'checkbox', checked: settings.soundOn !== false, click: toggleSound },
    { label: '최근 기록…', ...hint('history'), click: openHistory },
    { label: '그룹 설정…', click: () => openSettings('groups') },
    { label: '로그인 시 자동 실행', type: 'checkbox', checked: loginEnabled(), click: (item) => setLogin(item.checked) },
    { type: 'separator' },
    { label: '업데이트 확인…', click: checkUpdate },
    { label: '설정…', click: () => openSettings('profile') },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]);
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  loadSettings();
  createOverlay();
  createComposer();                                     // 숨긴 채로 미리 만들어 두면 첫 클릭에도 바로 열림
  setInterval(pollCursor, 25);                          // 마우스가 캐릭터 위에 있는지 확인 (클릭 통과 제어)
  refreshGroups(); setInterval(refreshGroups, 60000);

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')));
  tray.setToolTip('DDuknip-friends');
  tray.on('right-click', () => { tray.popUpContextMenu(buildMenu()); refreshGroups(); });
  tray.on('click', () => (process.platform === 'darwin' ? tray.popUpContextMenu(buildMenu()) : openSettings()));
  if (process.platform === 'linux') tray.setContextMenu(buildMenu());

  setInterval(() => {                                   // 입력이 없으면 자리 비움 -> 졸기 모션
    const a = powerMonitor.getSystemIdleTime() >= AWAY_SECONDS;
    if (a !== away) { away = a; if (win) win.webContents.send('presence', a ? 'away' : 'online'); }
  }, 3000);

  const failed = [];
  [['overlay', toggleOverlay], ['composer', toggleComposer], ['quiet', toggleQuiet], ['history', toggleHistory]].forEach(([k, fn]) => { if (!globalShortcut.register(SC[k], fn)) failed.push(SC[k]); });
  if (failed.length) { console.warn('단축키 등록 실패:', failed.join(', ')); if (process.platform === 'win32') tray.displayBalloon({ title: 'DDuknip-friends', content: `다른 앱이 쓰는 단축키라 사용할 수 없어요: ${failed.join(', ')}\n트레이 메뉴를 이용해 주세요.` }); }
  if (!settings.nickname || !settings.activeCode) openSettings();   // 처음 실행하면 설정부터
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', (e) => e.preventDefault());
