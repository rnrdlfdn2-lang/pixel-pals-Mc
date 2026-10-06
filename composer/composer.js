(() => {
const api = window.api, input = document.getElementById('in'), bar = document.getElementById('bar'), sendBtn = document.getElementById('send');
const PLACEHOLDER = '메시지를 입력해 주세요';
let autoClose = 0, busy = false;
const clearAuto = () => { clearTimeout(autoClose); autoClose = 0; };

function showErr(msg) { bar.classList.add('err'); input.title = msg; if (!input.value) input.placeholder = msg; }
async function send() {
  const text = input.value.trim(); if (!text || busy) return;
  if (!api.getSettings().activeCode) return showErr('프로필을 설정하고 메시지를 보낼 그룹을 선택해 주세요.');
  busy = true; const ok = await api.sendChat(text); busy = false;
  if (!ok) return showErr('메시지를 보내지 못했어요. 연결 상태를 확인해 주세요.');
  input.value = ''; api.composerTyping(false);
  clearAuto(); autoClose = setTimeout(() => { if (!input.value) api.closeComposer(); }, 5000);     // 보낸 뒤 5초 동안 새로 입력하지 않으면 자동으로 닫힘
}
input.addEventListener('input', () => {
  clearAuto(); bar.classList.remove('err'); input.placeholder = PLACEHOLDER; input.title = '';
  api.composerTyping(input.value.trim().length > 0);                    // 친구 화면에 '입력 중' 표시
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); }   // 한글 입력 중(조합 중)의 Enter는 무시
  else if (e.key === 'Escape') api.closeComposer();
});
sendBtn.addEventListener('click', send);
api.onComposerShown(() => { clearAuto(); bar.classList.remove('err'); input.placeholder = PLACEHOLDER; input.focus(); input.select(); });
addEventListener('focus', () => input.focus());
})();
