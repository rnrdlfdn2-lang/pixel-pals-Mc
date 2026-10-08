// 단축키 문자열(Electron 가속키 형식, 예: "Ctrl+Alt+I") 만들기/검사. 화면(설정 창)과 앱 본체가 같이 쓴다.
(function (root) {
  'use strict';
  const CODE_KEYS = { Space: 'Space', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/' };
  const MODS = ['Ctrl', 'Alt', 'Shift', 'Super', 'Cmd'];
  const KEY_RE = /^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Tab|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|[`\-=\[\]\\;',./])$/;
  // 다른 프로그램의 기본 동작을 망가뜨리는, 흔히 쓰는 단축키는 막는다 (전역으로 가로채면 복사/붙여넣기 등이 안 됨)
  const COMMON = ['C', 'V', 'X', 'Z', 'Y', 'A', 'S', 'F', 'P', 'N', 'O', 'W', 'T', 'R', 'Q', 'H'];
  const isBlocked = (mods, key) => (mods.length === 1 && (mods[0] === 'Ctrl' || mods[0] === 'Cmd') && COMMON.includes(key)) || (mods.length === 1 && mods[0] === 'Alt' && ['F4', 'Tab', 'Space'].includes(key)) || (key === 'Delete' && mods.includes('Ctrl') && mods.includes('Alt'));

  // 키 입력(KeyboardEvent)을 단축키 문자열로. 수정키(Ctrl/Alt/Shift)만 눌린 상태면 null
  function fromEvent(e, isMac) {
    const c = e.code || '', key = /^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit\d$/.test(c) ? c.slice(5) : /^F\d{1,2}$/.test(c) ? c : CODE_KEYS[c];
    if (!key) return null;
    const mods = []; if (e.ctrlKey) mods.push('Ctrl'); if (e.altKey) mods.push('Alt'); if (e.shiftKey) mods.push('Shift'); if (e.metaKey) mods.push(isMac ? 'Cmd' : 'Super');
    return [...mods, key].join('+');
  }
  // 올바른 단축키인지 검사: {ok:true, accel:정리된 문자열} 또는 {ok:false, error:'이유'}
  function validate(accel) {
    if (typeof accel !== 'string' || !accel.trim()) return { ok: false, error: '단축키를 입력해 주세요.' };
    const parts = accel.split('+').map((s) => s.trim()); const key = parts.pop(), mods = parts;
    if (!KEY_RE.test(key)) return { ok: false, error: '사용할 수 없는 키예요.' };
    if (mods.some((m) => !MODS.includes(m)) || new Set(mods).size !== mods.length) return { ok: false, error: '단축키 형식이 올바르지 않아요.' };
    const isF = /^F\d{1,2}$/.test(key), strong = mods.some((m) => m !== 'Shift');
    if (!isF && !strong) return { ok: false, error: 'Ctrl, Alt 같은 키와 함께 눌러 주세요. (그냥 글자만 쓰면 타이핑이 안 돼요)' };
    if (isBlocked(mods, key)) return { ok: false, error: '복사·붙여넣기처럼 자주 쓰는 단축키라 쓸 수 없어요.' };
    const order = (m) => MODS.indexOf(m); return { ok: true, accel: [...mods].sort((a, b) => order(a) - order(b)).concat(key).join('+') };
  }
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  root.Shortcuts = { fromEvent, validate, same };
  if (typeof module !== 'undefined') module.exports = root.Shortcuts;
})(typeof window !== 'undefined' ? window : globalThis);
