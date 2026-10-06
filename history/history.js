(() => {
const api = window.api;
let st = api.getSettings(), msgs = [], more = false, lastTs = 0, pinned = false, busy = false;
const $ = (s) => document.querySelector(s), list = $('#list');

// 다른 사람 메시지가 들어가므로 innerHTML 대신 안전하게 DOM 생성
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
  for (const kid of kids.flat()) if (kid != null) e.append(kid);
  return e;
}
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

const fmtTime = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
function dayLabel(ts) {
  const d = new Date(ts), n = new Date(), y = new Date(n); y.setDate(n.getDate() - 1);
  return d.toDateString() === n.toDateString() ? '오늘' : d.toDateString() === y.toDateString() ? '어제' : `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 60;

// mode: 'bottom' 맨 아래로 / 'older' 위에 이전 글을 붙였을 때 보던 위치 유지 / 'keep'
function render(mode) {
  const prevH = list.scrollHeight, prevTop = list.scrollTop;
  list.replaceChildren();
  if (!st.activeCode) { list.append(el('div', { class: 'empty', text: '사용 중인 그룹이 없어요.\n설정에서 그룹을 만들거나 참여해 주세요.' })); return; }
  if (!msgs.length) { list.append(el('div', { class: 'empty', text: '아직 메시지가 없어요.\n이 그룹의 최근 메시지가 여기에 표시돼요.' })); return; }
  list.append(more ? el('button', { class: 'more', text: '이전 메시지 더 보기', onclick: loadOlder }) : el('div', { class: 'note', text: '보관된 메시지의 끝이에요' }));
  let last = '';
  for (const m of msgs) {
    const day = dayLabel(m.ts); if (day !== last) { list.append(el('div', { class: 'day', text: day })); last = day; }
    list.append(el('div', { class: 'msg' + (m.me ? ' me' : '') }, el('div', { class: 'meta' }, el('b', { text: m.name }), el('span', { text: fmtTime(m.ts) })), el('div', { class: 'text', text: m.text })));
  }
  if (mode === 'bottom') list.scrollTop = list.scrollHeight;
  else if (mode === 'older') list.scrollTop = list.scrollHeight - prevH + prevTop;
  else list.scrollTop = prevTop;
  $('#jump').hidden = nearBottom();
}

async function load() {
  st = api.getSettings(); msgs = []; more = false; lastTs = 0;
  if (!st.activeCode) { $('#group').textContent = ''; return render('bottom'); }
  try {
    const r = await rpc('history', { code: st.activeCode, limit: 50 });
    $('#group').textContent = r.groupName; if (r.retainMs) { const h = Math.round(r.retainMs / 3600000); $('footer').textContent = `메시지는 ${h >= 48 ? Math.round(h / 24) + '일' : h + '시간'} 뒤 자동으로 삭제돼요.`; } msgs = r.messages; more = r.more; lastTs = msgs.length ? msgs[msgs.length - 1].ts : 0; render('bottom');
  } catch (e) { list.replaceChildren(el('div', { class: 'empty', text: e.message })); }
}
async function loadOlder() {
  if (busy || !msgs.length) return; busy = true;
  try { const r = await rpc('history', { code: st.activeCode, before: msgs[0].ts, limit: 50 }); msgs = [...r.messages, ...msgs]; more = r.more; render('older'); }
  catch (e) { alert(e.message); } finally { busy = false; }
}
async function poll() {                              // 3초마다 새 메시지 확인
  if (!st.activeCode || busy) return;
  try {
    const r = await rpc('history', { code: st.activeCode, after: lastTs });
    if (!r.messages.length) return;
    const stick = nearBottom(); msgs = [...msgs, ...r.messages]; lastTs = msgs[msgs.length - 1].ts; render(stick ? 'bottom' : 'keep');
  } catch {}
}

function setPin(on) { pinned = on; api.historyPin(on); $('#pin').classList.toggle('on', on); $('#pin').textContent = on ? '항상 위에 해제' : '항상 위에'; }
$('#pin').addEventListener('click', () => setPin(!pinned));
addEventListener('keydown', (e) => { if (e.altKey && e.key === 'ArrowUp') setPin(true); else if (e.altKey && e.key === 'ArrowDown') setPin(false); });
$('#jump').addEventListener('click', () => { list.scrollTop = list.scrollHeight; });
list.addEventListener('scroll', () => ($('#jump').hidden = nearBottom()));
addEventListener('focus', () => { if (api.getSettings().activeCode !== st.activeCode) load(); });   // 다른 그룹으로 바꿨으면 다시 불러오기
api.onHistoryRefresh(load);

load(); setInterval(poll, 3000);
})();
