(() => {
const api = window.api, input = document.getElementById('in'), bar = document.getElementById('bar'), sendBtn = document.getElementById('send');
const PLACEHOLDER = '메시지를 입력해 주세요', MEGA_PH = '확성기로 모두에게 알릴 말을 입력해 주세요', MEGA_CD = 8000;
const mega = document.getElementById('mega'), megaL = document.getElementById('megaL');
let autoClose = 0, busy = false, lastMega = -1e9;
const ph = () => (mega.checked ? MEGA_PH : PLACEHOLDER);
mega.addEventListener('change', () => { megaL.classList.toggle('on', mega.checked); input.placeholder = ph(); input.focus(); });
const clearAuto = () => { clearTimeout(autoClose); autoClose = 0; };

let errTimer = 0;
function showErr(msg) {                                                        // 오류는 입력창 자리에 잠깐 보여 주고, 쓰던 글은 그대로 돌려놓음
  bar.classList.add('err'); input.title = msg; clearTimeout(errTimer);
  const keep = input.value; input.value = ''; input.placeholder = msg;
  errTimer = setTimeout(() => { if (!input.value) input.value = keep; input.placeholder = ph(); bar.classList.remove('err'); input.select(); }, 2200);
}
async function send() {
  const text = input.value.trim(); if (!text || busy) return;
  if (!api.getSettings().activeCode) return showErr('프로필을 설정하고 메시지를 보낼 그룹을 선택해 주세요.');
  const useMega = mega.checked; if (useMega && Date.now() - lastMega < MEGA_CD) return showErr(`확성기는 ${Math.ceil((MEGA_CD - (Date.now() - lastMega)) / 1000)}초 뒤에 다시 쓸 수 있어요.`);
  busy = true; const ok = await api.sendChat(text, useMega); busy = false;
  if (!ok) return showErr('메시지를 보내지 못했어요. 연결 상태를 확인해 주세요.');
  if (useMega) { lastMega = Date.now(); mega.checked = false; megaL.classList.remove('on'); input.placeholder = PLACEHOLDER; }          // 확성기는 한 번 쓰면 꺼짐
  input.value = ''; api.composerTyping(false);
  clearAuto(); autoClose = setTimeout(() => { if (!input.value) api.closeComposer(); }, 5000);     // 보낸 뒤 5초 동안 새로 입력하지 않으면 자동으로 닫힘
}
input.addEventListener('input', () => {
  clearAuto(); bar.classList.remove('err'); input.placeholder = ph(); input.title = '';
  api.composerTyping(input.value.trim().length > 0);                    // 친구 화면에 '입력 중' 표시
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); }   // 한글 입력 중(조합 중)의 Enter는 무시
  else if (e.key === 'Escape') api.closeComposer();
});
sendBtn.addEventListener('click', send);
api.onComposerShown(() => { clearAuto(); bar.classList.remove('err'); input.placeholder = ph(); input.focus(); input.select(); });
addEventListener('focus', () => input.focus());
})();
