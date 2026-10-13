// 뿌셔뿌셔 존의 상사 봉제인형: 이름/말풍선 색/대사. 대사는 1초마다 바뀌고, 어떤 대사가 나올지는 (인형, 방 기준 시각, 초) 로만 정해져서 모두의 화면에서 똑같다.
(function (root) {
  const HP = 50;
  const LINES = {
    m: [
      '요즘 친구들은 참 편하게 회사 다녀', '그건 실무자가 판단했어야지', '내가 원하는 건 이런 게 아니었는데', '결국 담당자가 챙겼어야 하는 부분이지',
      '열정이라는 게 좀 보여야 하지 않겠어?', '방향은 좋은데, 처음부터 다시 해보자고', '내가 딱 보면 알 수 있게 해달라는 거야', '내가 다른 직원한테는 이런 말 안 해',
      '센스 있게 좀 해봐', '내가 언제 그렇게 하라고 했어?', '제가 애들 데리고 고생 좀 했습니다', '이번 성과는 제가 직접 진두지휘한 결과입니다',
      '네, 대표님. 그 부분은 제가 직접 챙겼습니다', '이번 성과는 제가 전략을 잘 세운 덕분이라고 봅니다',
    ],
    f: [
      '나만 걔 좀 이상하다고 생각하는 거 아니지?', '아, 나 진짜 오늘 너무 짜증 나', '내가 진짜 회사 때려치우고 싶다니까?', '나는 맨날 남 좋은 일만 시키는 것 같아',
      '아니, 왜 맨날 나만 이렇게 바쁜 거야아?', '아휴우~ 진짜 다 귀찮아', '아… 이거 언제 다 하지이?', '나 지금 일이 너무 많아서 죽겠어. 어떡하지?', '한 대리이~ 나 좀 살려줘어.',
    ],
  };
  const META = {
    m: { name: '남자상사', img: 'doll_m.png', h: 128, style: { bg: '#eef0f6', border: '#3b4252', text: '#1f2430' }, cotton: ['#fff6e0', '#e9d9c2', '#4a4650', '#3b3a40'] },
    f: { name: '여자상사', img: 'doll_f.png', h: 122, style: { bg: '#ffe3ee', border: '#a4385d', text: '#5a1a30' }, cotton: ['#fff6e0', '#f1dcc0', '#7a5238', '#5b3a26'] },
  };
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mulberry = (seed) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // 대사를 한 바퀴(전부 한 번씩) 섞어서 돌리고, 바퀴가 바뀔 때도 직전 대사가 연달아 나오지 않게 함 -> 같은 대사가 연속으로 나오지 않고, 모두의 화면에서 똑같다
  const rawPerm = (id, t0, e) => { const n = LINES[id].length, R = mulberry((hash(id) ^ Math.imul((t0 | 0) + 7, 2654435761) ^ Math.imul(e + 13, 40503)) >>> 0), a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function lineIdx(id, t0, sec) {
    const n = LINES[id].length, e = Math.floor(sec / n), pos = ((sec % n) + n) % n, p = rawPerm(id, t0, e);
    if (pos <= 1 && p[0] === rawPerm(id, t0, e - 1)[n - 1]) [p[0], p[1]] = [p[1], p[0]];
    return p[pos];
  }
  const lineAt = (id, t0, sec) => LINES[id][lineIdx(id, t0, sec)];
  root.Dolls = { HP, LINES, META, lineIdx, lineAt };
  if (typeof module !== 'undefined') module.exports = root.Dolls;
})(typeof window !== 'undefined' ? window : globalThis);
