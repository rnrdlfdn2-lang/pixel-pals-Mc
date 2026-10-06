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
  $('#profile').hidden = p !== 'profile'; $('#groups').hidden = p !== 'groups';
  if (p === 'groups') refreshGroups();
}
addEventListener('focus', () => !$('#groups').hidden && refreshGroups());

// ---------- 내 프로필 ----------
function options(list, isSel, make, onPick) {
  return el('div', { class: 'opts' }, list.map((it, i) =>
    el('button', { class: 'opt' + (isSel(it, i) ? ' sel' : ''), onclick: () => onPick(it, i) }, make(it, i), el('span', { text: it.name }), el('span', { class: 'check', text: '✓' }))));
}
function renderProfile() {
  $('#nick').value = st.nickname;
  $('#showoff').checked = st.showOffline !== false;
  $('#throwguard').checked = !!st.throwGuard;
  $('#chars').replaceChildren(options(CHARACTERS, (_, i) => i === st.character, (_, i) => icon(i), (_, i) => save({ character: i }, true)));
  $('#bubbles').replaceChildren(options(BUBBLES, (b) => b.id === st.bubble,
    (b) => el('div', { class: 'pill', style: `background:${b.bg};border-color:${b.border};color:${b.text}`, text: '안녕' }), (b) => save({ bubble: b.id })));
  $('#throws').replaceChildren(options(THROWABLES, (t) => t.id === st.throwable, (t) => el('div', { class: 'emoji', text: t.emoji }), (t) => save({ throwable: t.id })));
}
$('#showoff').addEventListener('change', () => save({ showOffline: $('#showoff').checked }).then(() => toast('저장했어요')));
$('#throwguard').addEventListener('change', () => save({ throwGuard: $('#throwguard').checked }).then(() => toast('저장했어요')));
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
    api.pushGroups(list.map((g) => ({ code: g.code, name: g.name, members: g.members.map((m) => ({ uid: m.uid, name: m.name, look: m.look, owner: m.owner })) })));
    renderGroups();
  } catch (e) { $('#list').replaceChildren(el('p', { class: 'sub', text: e.message })); }
}
const act = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast(e.message, true); } };
function needNick() { if ([...st.nickname].length < 2) { showPage('profile'); throw new Error('먼저 닉네임을 정해 주세요.'); } }

function renderGroups() {
  $('#list').replaceChildren(...(list.length ? list.map(groupCard) : [el('div', { class: 'card', text: '아직 그룹이 없어요. 아래에서 만들거나 초대 코드로 참여해 보세요.' })]));
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
  card.append(el('div', { class: 'gbody' }, members, foot));
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
