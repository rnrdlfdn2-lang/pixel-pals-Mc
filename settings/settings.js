(() => {
const { CHARACTERS, BUBBLES, THROWABLES, draw } = Sprites;
const api = window.api;
let st = api.getSettings();
const $ = (s) => document.querySelector(s);

// 안전하게 DOM 만들기 (다른 사람 닉네임이 들어가므로 innerHTML은 쓰지 않는다)
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid);
  return e;
}
let tt;
function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(tt); tt = setTimeout(() => (t.className = ''), 2400); }
function icon(look, s = 2) {                // 캐릭터 미리보기: 서 있는 모습의 첫 프레임 (s=2 카드, s=1 멤버 줄)
  const n = s === 1 ? 40 : 76, c = el('canvas', { width: n, height: n }), g = c.getContext('2d');
  draw(g, look, n / 2, n - 2, { state: 'walk', t: 0, s }); return c;
}

function itemIcon(name) {                   // 도트 아이템 미리보기 (이모지처럼 한 칸에 들어가게)
  const c = el('canvas', { width: 64, height: 44 }), g = c.getContext('2d'); const inf = Sprites.itemInfo(name), sc = Math.max(1, Math.floor(Math.min(2, 60 / inf.w, 40 / inf.h) * 2) / 2); Sprites.drawItem(g, name, 32, 22, { s: sc }); c.style.display = 'block'; return c;
}

// ---------- 단축키 ----------
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const SC_ITEMS = [['composer', '채팅창 열기/닫기', '메시지 입력창을 켜고 꺼요.'], ['overlay', '픽셀 월드 숨기기/보이기', '캐릭터들이 돌아다니는 화면을 잠깐 숨겨요.'], ['quiet', '조용히 모드', '말풍선과 효과음을 잠시 꺼요.'], ['history', '최근 기록 창', '최근에 오간 채팅을 모아 봐요.']];
let recording = null, scErr = {};
const pretty = (a) => String(a || '').replace(/^Cmd\+|\+Cmd\+/g, (m) => m.replace('Cmd', IS_MAC ? '⌘' : 'Cmd')).replace(/Super/g, IS_MAC ? '⌘' : 'Win');
function stopRecord() { if (recording === null) return; recording = null; removeEventListener('keydown', onRecordKey, true); api.pauseShortcuts(false); renderShortcuts(); }
function startRecord(key) { if (recording) stopRecord(); recording = key; scErr = {}; api.pauseShortcuts(true); addEventListener('keydown', onRecordKey, true); renderShortcuts(); }     // 입력받는 동안은 지금 단축키를 잠시 꺼 둠
async function onRecordKey(e) {
  e.preventDefault(); e.stopPropagation();
  if (e.key === 'Escape') return stopRecord();
  const accel = Shortcuts.fromEvent(e, IS_MAC); if (!accel) return;                               // 수정키만 누른 상태면 계속 기다림
  const key = recording, r = await api.setShortcut(key, accel);
  if (r.ok) { st.shortcuts = r.shortcuts; scErr = {}; recording = null; removeEventListener('keydown', onRecordKey, true); renderShortcuts(); toast(`${pretty(r.accel)} 로 바꿨어요`); }
  else { scErr = { [key]: r.error }; renderShortcuts(); }                                          // 안 되는 조합이면 이유를 보여주고 다시 입력받음
}
function renderShortcuts() {
  const cur = st.shortcuts || {}, def = st.shortcutDefaults || {};
  $('#sclist').replaceChildren(...SC_ITEMS.map(([k, name, desc]) => {
    const rec = recording === k;
    return el('div', { class: 'card row scrow' }, el('div', {}, el('div', { class: 'label', text: name }), el('div', { class: 'desc', text: desc }), scErr[k] ? el('div', { class: 'err', text: scErr[k] }) : ''),
      el('div', { class: 'keys' }, el('kbd', { class: rec ? 'rec' : '', text: rec ? '키를 눌러 주세요…' : pretty(cur[k]) }),
        rec ? el('button', { onclick: stopRecord, text: '취소' }) : el('button', { onclick: () => startRecord(k), text: '변경' }),
        !rec && cur[k] !== def[k] ? el('button', { onclick: async () => { const r = await api.resetShortcut(k); st.shortcuts = r.shortcuts; scErr = {}; renderShortcuts(); toast('기본값으로 돌렸어요'); }, text: '기본값' }) : ''));
  }));
}
addEventListener('blur', () => stopRecord());                                                     // 창을 벗어나면 입력받기를 멈추고 단축키를 다시 켬

// ---------- 서버 요청 (짧게 연결 → 요청 → 응답 → 닫기) ----------
const NET = '서버에 연결할 수 없어요. 서버 주소(config.json)를 확인해 주세요.';
function rpc(op, data = {}) {
  return new Promise((res, rej) => {
    const rid = Math.random().toString(36).slice(2); let done = false;
    const end = (fn, v) => { if (done) return; done = true; clearTimeout(to); try { ws.close(); } catch {} fn(v); };
    const ws = new WebSocket(st.serverUrl), to = setTimeout(() => end(rej, new Error(NET)), 6000);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'rpc', rid, op, uid: st.uid, ...data }));
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.rid === rid) m.ok ? end(res, m.data) : end(rej, new Error(m.msg)); };
    ws.onerror = () => end(rej, new Error(NET));
  });
}
async function save(patch, syncProfile) {
  st = await api.saveSettings(patch);
  if (syncProfile && [...st.nickname].length >= 2) rpc('profile', { name: st.nickname, look: st.character }).catch(() => {});
  renderProfile();
}

// ---------- 페이지 전환 ----------
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));
function showPage(p) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.page === p));
  $('#profile').hidden = p !== 'profile'; $('#groups').hidden = p !== 'groups'; $('#shortcuts').hidden = p !== 'shortcuts';
  if (p !== 'shortcuts') stopRecord(); else renderShortcuts();
  if (p === 'groups') refreshGroups();
}
addEventListener('focus', () => !$('#groups').hidden && refreshGroups());

// ---------- 내 프로필 ----------
function options(list, isSel, make, onPick, lockOf) {
  return el('div', { class: 'opts' }, list.map((it, i) => { const lk = lockOf ? lockOf(it, i) : ''; return el('button', { class: 'opt' + (isSel(it, i) ? ' sel' : '') + (lk ? ' locked' : ''), onclick: () => onPick(it, i) }, make(it, i), el('span', { text: lk ? `🔒 ${it.name}` : it.name }), lk ? el('span', { class: 'lk', text: lk }) : null, el('span', { class: 'check', text: '✓' })); }));
}
function renderProfile() {
  try { const fresh = api.getSettings(); if (fresh && fresh.xp) st.xp = fresh.xp; } catch {}
  const myLv = Bosses.levelInfo(Number((st.xp || {})[st.activeCode]) || 0).lv;
  $('#nick').value = st.nickname;
  $('#showoff').checked = st.showOffline !== false;
  $('#throwguard').checked = !!st.throwGuard;
  $('#soundon').checked = st.soundOn !== false;
  $('#closeonblur').checked = st.closeOnBlur !== false;
  $('#autoupd').checked = st.autoUpdateCheck !== false;
  $('#size').value = Math.round((st.sizeScale || 1) * 100); $('#sizeval').textContent = $('#size').value + '%';
  $('#verdesc').textContent = `DDuknip-friends v${st.appVersion || ''} · 새 버전이 나오면 파일을 따로 받지 않고 여기서 바로 업데이트할 수 있어요.`;
  renderDisplays();
  $('#chars').replaceChildren(options(CHARACTERS, (_, i) => i === st.character, (_, i) => icon(i), (_, i) => save({ character: i }, true)));
  $('#bubbles').replaceChildren(options(BUBBLES, (b) => b.id === st.bubble,
    (b) => el('div', { class: 'pill', style: `background:${b.bg};border-color:${b.border};color:${b.text}`, text: '안녕' }), (b) => save({ bubble: b.id })));
  $('#throws').replaceChildren(options(THROWABLES, (t) => t.id === Sprites.normThrow(st.throwable), (t) => (t.sprite ? itemIcon(t.sprite) : el('div', { class: 'emoji', text: t.emoji })), (t) => (t.unlock && myLv < t.unlock ? toast(`🔒 ${t.name}은(는) Lv.${t.unlock} 부터 쓸 수 있어요 (지금 Lv.${myLv})`, true) : save({ throwable: t.id })), (t) => (t.unlock && myLv < t.unlock ? `Lv.${t.unlock}` : '')));
}
$('#showoff').addEventListener('change', () => save({ showOffline: $('#showoff').checked }).then(() => toast('저장했어요')));
$('#throwguard').addEventListener('change', () => save({ throwGuard: $('#throwguard').checked }).then(() => toast('저장했어요')));
$('#closeonblur').addEventListener('change', () => save({ closeOnBlur: $('#closeonblur').checked }).then(() => toast($('#closeonblur').checked ? '다른 곳을 누르면 채팅창이 닫혀요' : '채팅창은 직접 닫아야 해요')));
$('#soundon').addEventListener('change', () => save({ soundOn: $('#soundon').checked }).then(() => toast($('#soundon').checked ? '효과음을 켰어요' : '효과음을 껐어요')));
async function renderDisplays() {                         // 연결된 모니터 목록 (왼쪽부터 1, 2, 3...)
  let list = []; try { list = await api.listDisplays(); } catch {}
  $('#displays').replaceChildren(...list.map((d) => el('button', { class: 'opt disp' + (d.selected ? ' sel' : ''), onclick: () => save({ displayId: d.id }).then(() => toast(`모니터 ${d.n}에서 돌아다녀요`)) },
    el('span', { text: `모니터 ${d.n}` }), el('small', { text: `${d.w}×${d.h}${d.primary ? ' · 주 모니터' : ''}` }), el('span', { class: 'check', text: '✓' }))));
}
$('#identify').addEventListener('click', () => api.identifyDisplays());
$('#size').addEventListener('input', () => ($('#sizeval').textContent = $('#size').value + '%'));
$('#size').addEventListener('change', () => save({ sizeScale: Number($('#size').value) / 100 }).then(() => toast('캐릭터 크기를 바꿨어요')));
$('#sizereset').addEventListener('click', () => save({ sizeScale: 1 }).then(() => toast('기본 크기로 돌렸어요')));
$('#autoupd').addEventListener('change', () => save({ autoUpdateCheck: $('#autoupd').checked }).then(() => toast($('#autoupd').checked ? '자동 확인을 켰어요' : '자동 확인을 껐어요')));
$('#checkupd').addEventListener('click', async () => { const b = $('#checkupd'); b.disabled = true; b.textContent = '확인 중…'; try { await api.checkUpdate(); } finally { b.disabled = false; b.textContent = '업데이트 확인'; } });
$('#nick').addEventListener('input', () => ($('#nickerr').textContent = ''));
$('#nick').addEventListener('change', () => {
  const v = $('#nick').value.trim(), n = [...v].length;
  if (n < 2 || n > 8) { $('#nickerr').textContent = '닉네임은 2~8자로 입력해 주세요.'; return; }
  save({ nickname: v }, true).then(() => toast('프로필을 저장했어요'));
});

// ---------- 그룹 ----------
let list = [], open = new Set(), renaming = null;
async function setActive(code) { st = await api.saveSettings({ activeCode: code }); }
async function refreshGroups() {
  try {
    list = await rpc('list');
    if (list.length && !list.some((g) => g.code === st.activeCode)) await setActive(list[0].code);   // 내 그룹이 아니면 첫 그룹으로 (목록이 비었을 땐 건드리지 않음: 서버 데이터가 사라진 경우 현재 그룹을 지키려고)
    api.pushGroups(list.map((g) => ({ code: g.code, name: g.name, members: g.members.map((m) => ({ uid: m.uid, name: m.name, look: m.look, owner: m.owner })), boss: g.boss ? { on: !!g.boss.on, everyMin: g.boss.everyMin, lastsMin: g.boss.lastsMin } : undefined, quiz: g.quiz ? { on: !!g.quiz.on, everyMin: g.quiz.everyMin } : undefined })));
    renderGroups();
  } catch (e) { $('#list').replaceChildren(el('p', { class: 'sub', text: e.message })); }
}
const act = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast(e.message, true); } };
function needNick() { if ([...st.nickname].length < 2) { showPage('profile'); throw new Error('먼저 닉네임을 정해 주세요.'); } }

function renderGroups() {
  $('#list').replaceChildren(...(list.length ? list.map(groupCard) : [el('div', { class: 'card', text: '아직 그룹이 없어요. 아래에서 만들거나 초대 코드로 참여해 보세요.' })]));
}
const BOSS_EVERY = [5, 10, 20, 30, 60, 120, 180, 360, 720, 1440], BOSS_LASTS = [3, 5, 10, 20, 30, 60, 120];
const fmtMin = (n) => (n >= 60 && n % 60 === 0 ? `${n / 60}시간` : `${n}분`);
function bossSelect(values, cur, onChange) {
  const vals = values.includes(cur) ? values : [...values, cur].sort((a, b) => a - b), sel = el('select', {}, vals.map((v) => el('option', { value: v, text: fmtMin(v) })));
  sel.value = String(cur); sel.addEventListener('change', () => onChange(Number(sel.value))); return sel;
}
function quizPanel(g) {                                                              // 랜덤퀴즈: 방장은 켜기/끄기 + 주기, 모두에게 같이 적용
  const q = g.quiz || { on: false, everyMin: 60 }, box = el('div', { class: 'bosspanel' }, el('div', { class: 'bt', text: '🧠 랜덤퀴즈' }));
  box.append(el('div', { class: 'stat', text: q.active ? '지금 퀴즈가 진행 중이에요!' : q.on ? `다음 퀴즈: 약 ${Math.max(1, Math.ceil((q.nextInMs || 0) / 60000))}분 뒤 (앱을 켜 둔 그룹원이 있을 때만)` : '랜덤퀴즈가 꺼져 있어요' }));
  if (g.owner) {
    const save = (patch) => act(async () => { await rpc('quizcfg', { code: g.code, ...patch }); await refreshGroups(); }, '퀴즈 설정을 바꿨어요 (그룹원 모두에게 적용)');
    const cb = el('input', { type: 'checkbox' }); cb.checked = !!q.on; cb.addEventListener('change', () => save({ on: cb.checked }));
    const go = el('button', { class: 'b', text: '지금 시작', onclick: () => act(async () => { await rpc('quiznow', { code: g.code }); await refreshGroups(); }, '퀴즈 공지를 띄웠어요!') }); if (!q.on || q.active) go.disabled = true;
    box.append(el('div', { class: 'ctl' }, el('label', {}, cb, el('span', { text: '랜덤퀴즈' })), el('label', {}, el('span', { text: '출제 주기' }), bossSelect(BOSS_EVERY, q.everyMin, (v) => save({ everyMin: v })), el('span', { text: '마다' })), go));
  } else box.append(el('div', { class: 'stat', text: `방장 설정: ${q.on ? '켜짐' : '꺼짐'} · ${fmtMin(q.everyMin)}마다 출제` }));
  box.append(el('div', { class: 'note', text: '공지가 뜨면 1분 안에 수락/거절! 수락한 사람끼리 1문제를 풀고, 맞히면 경험치 +10을 받아요. (주제는 시계/게임/애니 중 무작위)' }));
  return box;
}
function bossPanel(g) {                                                              // 방장: 켜기/끄기, 출현 주기, 머무는 시간 / 모두: 내 레벨, 지금 상태
  const b = g.boss || { on: false, everyMin: 60, lastsMin: 10 }, li = Bosses.levelInfo(g.xp || 0), box = el('div', { class: 'bosspanel' }, el('div', { class: 'bt', text: '👹 보스 몬스터' }));
  box.append(el('div', { class: 'lvl', text: `내 레벨 Lv.${li.lv} · ${li.max ? `EXP ${li.xp} (MAX)` : `EXP ${li.xp} / ${li.next}`} · 공격력 +${Bosses.dmgBonus(li.lv)}` }), el('div', { class: 'bar' }, el('i', { style: `width:${li.max ? 100 : Math.round(100 * li.into / li.need)}%` })));
  const act1 = b.active ? Bosses.BOSSES[b.active.type] : null;
  box.append(el('div', { class: 'stat', text: act1 ? `지금 ${act1.emoji} ${act1.name} 출현 중 · 약 ${Math.max(1, Math.ceil(b.active.leftMs / 60000))}분 남음` : b.on ? `다음 출현: 약 ${Math.max(1, Math.ceil((b.nextInMs || 0) / 60000))}분 뒤 (앱을 켜 둔 그룹원이 있을 때만)` : '보스 출현이 꺼져 있어요' }));
  if (g.owner) {
    const save = (patch) => act(async () => { await rpc('bosscfg', { code: g.code, ...patch }); await refreshGroups(); }, '보스 설정을 바꿨어요 (그룹원 모두에게 적용)');
    const cb = el('input', { type: 'checkbox' }); cb.checked = !!b.on; cb.addEventListener('change', () => save({ on: cb.checked }));
    box.append(el('div', { class: 'ctl' }, el('label', {}, cb, el('span', { text: '보스 출현' })),
      el('label', {}, el('span', { text: '출현 주기' }), bossSelect(BOSS_EVERY, b.everyMin, (v) => save({ everyMin: v })), el('span', { text: '마다' })),
      el('label', {}, el('span', { text: '머무는 시간' }), bossSelect(BOSS_LASTS, b.lastsMin, (v) => save({ lastsMin: v })), el('span', { text: '동안' })),
      el('button', { class: 'b', text: '지금 소환', onclick: () => act(async () => { await rpc('bossnow', { code: g.code }); await refreshGroups(); }, '보스를 불렀어요!') })));
    if (!b.on || act1) box.lastChild.lastChild.disabled = true;
  } else box.append(el('div', { class: 'stat', text: `방장 설정: ${b.on ? '켜짐' : '꺼짐'} · ${fmtMin(b.everyMin)}마다 출현 · ${fmtMin(b.lastsMin)} 동안 머묾` }));
  box.append(el('div', { class: 'note', text: '보스를 공격해서 체력 100을 깎으면 처치! 경험치를 받아요. (내 캐릭터를 오른쪽 클릭하면 레벨이 보여요)' }));
  return box;
}
function groupCard(g) {
  const isOpen = open.has(g.code), active = g.code === st.activeCode;
  const head = el('div', { class: 'ghead' },
    el('div', { class: 'ic', text: '👥' }),
    el('div', { class: 't' }, el('b', { text: g.name }), el('span', { text: `${g.members.length}/${g.max}명 · 초대 코드 ••••••••-${g.code.slice(-4)}` })),
    active ? el('span', { class: 'cur', text: '현재 그룹' })
           : el('button', { class: 'b', text: '전환', onclick: () => act(async () => { await setActive(g.code); renderGroups(); }, '현재 그룹을 바꿨어요') }),
    el('button', { class: 'b', text: '초대 코드 복사', onclick: () => { api.copy(g.code); toast('초대 코드를 복사했어요'); } }),
    el('button', { class: 'b', text: isOpen ? '︿' : '﹀', onclick: () => { isOpen ? open.delete(g.code) : open.add(g.code); renderGroups(); } }));
  const card = el('div', { class: 'gcard' }, head);
  if (!isOpen) return card;

  const members = g.members.map((m) => el('div', { class: 'mem' }, icon(m.look, 1),
    el('div', { class: 'n' }, el('span', { class: 'dot ' + (m.state || 'offline') }), m.owner ? el('span', { text: '👑' }) : null, el('span', { text: m.name }), m.me ? el('span', { class: 'badge', text: '나' }) : null,
      m.state === 'online' ? null : el('span', { class: 'off', text: m.state === 'away' ? '자리 비움' : '오프라인' })),
    g.owner && !m.me ? el('button', { class: 'b', text: '내보내기', onclick: () => confirm(`'${m.name}'님을 내보낼까요?`) && act(async () => { await rpc('kick', { code: g.code, target: m.uid }); await refreshGroups(); }, '멤버를 내보냈어요') }) : null));

  const foot = el('div', { class: 'gfoot' });
  if (renaming === g.code) {
    const inp = el('input', { maxlength: 20, value: g.name });
    foot.append(inp,
      el('button', { class: 'b primary', text: '저장', onclick: () => act(async () => { await rpc('rename', { code: g.code, groupName: inp.value }); renaming = null; await refreshGroups(); }, '그룹 이름을 바꿨어요') }),
      el('button', { class: 'b', text: '취소', onclick: () => { renaming = null; renderGroups(); } }));
  } else {
    foot.append(el('button', { class: 'b', text: '그룹 나가기', onclick: () => confirm(`'${g.name}' 그룹에서 나갈까요?${g.owner ? '\n가장 오래된 멤버가 방장이 돼요.' : ''}`) && act(async () => { await rpc('leave', { code: g.code }); api.forgetGroup(g.code); await refreshGroups(); }, '그룹에서 나갔어요') }));
    if (g.owner) foot.append(
      el('button', { class: 'b', text: '이름 변경', onclick: () => { renaming = g.code; renderGroups(); } }),
      el('button', { class: 'b danger', text: '그룹 삭제', onclick: () => confirm(`'${g.name}' 그룹을 삭제할까요?\n되돌릴 수 없어요.`) && act(async () => { await rpc('delete', { code: g.code }); api.forgetGroup(g.code); await refreshGroups(); }, '그룹을 삭제했어요') }));
  }
  card.append(el('div', { class: 'gbody' }, members, bossPanel(g), quizPanel(g), foot));
  return card;
}

$('#gcreate').addEventListener('click', () => act(async () => {
  needNick();
  const gn = $('#gname').value.trim();
  if (![...gn].length || [...gn].length > 20) throw new Error('그룹 이름은 1~20자로 입력해 주세요.');
  const r = await rpc('create', { name: st.nickname, look: st.character, groupName: gn });
  $('#gname').value = ''; open.add(r.code); await setActive(r.code); await refreshGroups();
}, '그룹을 만들었어요'));
$('#gjoin').addEventListener('click', () => act(async () => {
  needNick();
  const code = $('#gcode').value.trim();
  if (!code) throw new Error('초대 코드를 입력해 주세요.');
  const r = await rpc('join', { name: st.nickname, look: st.character, code });
  $('#gcode').value = ''; open.add(r.code); await setActive(r.code); await refreshGroups();
}, '그룹에 참여했어요'));

setInterval(() => { if (!$('#groups').hidden && document.hasFocus()) refreshGroups(); }, 8000);   // 그룹 페이지를 보고 있으면 접속 상태를 주기적으로 갱신
renderProfile();
if (!st.nickname) $('#nick').focus();
api.onShowPage((p) => showPage(p === 'groups' ? 'groups' : 'profile'));          // 트레이 '그룹 설정…'에서 열 때
if (location.hash === '#groups') showPage('groups');
})();
