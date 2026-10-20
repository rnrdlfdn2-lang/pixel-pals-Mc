(() => {
const api = window.api, input = document.getElementById('in'), btn = document.getElementById('go');
let sent = false;
function submit() { const t = input.value.trim(); if (!t || sent) return; sent = true; api.answerSubmit(t); }
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); } });
btn.addEventListener('click', submit);
api.onAnswerShown(() => { sent = false; input.value = ''; input.focus(); });
addEventListener('focus', () => input.focus());
})();
