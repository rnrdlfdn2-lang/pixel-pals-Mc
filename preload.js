const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  settings: ipcRenderer.sendSync('settings:get'),                 // 페이지가 열릴 때의 설정
  getSettings: () => ipcRenderer.sendSync('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  copy: (t) => ipcRenderer.send('clipboard', t),
  pushGroups: (list) => ipcRenderer.send('groups:push', list),    // 설정 창이 알고 있는 그룹 목록(복원용 정보 포함)을 메인에 전달
  refreshGroups: () => ipcRenderer.send('groups:refresh'),         // 그룹 목록을 지금 확인(필요하면 서버에 복원)
  forgetGroup: (code) => ipcRenderer.send('group:forget', code),  // 그룹을 나가거나 삭제됐을 때 복원 정보를 지움
  historyPin: (on) => ipcRenderer.send('history:pin', on),
  setRegions: (rects) => ipcRenderer.send('hit:regions', rects),   // 클릭 가능한 영역을 본체에 전달
  // 오버레이 <-> 입력창
  setComposer: (v) => ipcRenderer.send('composer:set', !!v),
  selfClick: () => ipcRenderer.send('overlay:selfclick'),                       // 내 캐릭터를 눌렀다고 알림(채팅창 '다른 곳 클릭' 닫기와 구분)
  setShortcut: (name, accel) => ipcRenderer.invoke('shortcuts:set', name, accel),
  resetShortcut: (name) => ipcRenderer.invoke('shortcuts:reset', name),
  pauseShortcuts: (on) => ipcRenderer.send('shortcuts:pause', !!on),
  onComposerVisibility: (cb) => ipcRenderer.on('composer:visibility', (_e, v) => cb(v)),
  onChatSend: (cb) => ipcRenderer.on('chat:send', (_e, text) => cb(text)),
  chatResult: (ok) => ipcRenderer.send('chat:result', !!ok),
  onComposerTyping: (cb) => ipcRenderer.on('composer:typing', (_e, on) => cb(on)),
  sendChat: (text) => ipcRenderer.invoke('chat:send', text),
  composerTyping: (on) => ipcRenderer.send('composer:typing', !!on),
  closeComposer: () => ipcRenderer.send('composer:close'),
  onComposerShown: (cb) => ipcRenderer.on('composer:shown', () => cb()),
  // 그 밖
  onPresence: (cb) => ipcRenderer.on('presence', (_e, s) => cb(s)),
  listDisplays: () => ipcRenderer.invoke('displays:list'),          // 연결된 모니터 목록
  identifyDisplays: () => ipcRenderer.invoke('displays:identify'),  // 각 모니터에 번호 띄우기
  checkUpdate: () => ipcRenderer.invoke('update:check'),            // 업데이트 확인
  onQuiet: (cb) => ipcRenderer.on('quiet', (_e, v) => cb(v)),
  onSound: (cb) => ipcRenderer.on('sound', (_e, v) => cb(v)),
  onShowPage: (cb) => ipcRenderer.on('settings:page', (_e, p) => cb(p)),
  onHistoryRefresh: (cb) => ipcRenderer.on('history:refresh', () => cb()),
});
