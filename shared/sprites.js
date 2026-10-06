// 캐릭터/말풍선/던지기 카탈로그 + 모션 그리기 (오버레이와 설정 창이 같이 사용)
(function (root) {
  // 기본 캐릭터 8종(shared/basicchars.js) 뒤에 직접 그림으로 만든 캐릭터(shared/pixelchars.js)가 이어진다.
  // ← 캐릭터를 추가하려면 해당 데이터 파일에 항목을 추가 (순서 = 저장되는 번호)
  const CHARACTERS = [...(root.BasicChars || []), ...(root.PixelChars || [])];
  const BUBBLES = [
    { id: 'default', name: '기본 말풍선',   bg: '#ffffff', border: '#2b2d42', text: '#2b2d42' },
    { id: 'pink',    name: '분홍 말풍선',   bg: '#ffd6e0', border: '#a4385d', text: '#5a1a30' },
    { id: 'butter',  name: '버터 말풍선',   bg: '#fff3b0', border: '#8a6d00', text: '#4a3b00' },
    { id: 'night',   name: '밤하늘 말풍선', bg: '#3a2e6e', border: '#cdb4ff', text: '#ffffff' },
  ];
  const THROWABLES = [
    { id: 'ball', name: '기본 말랑공', emoji: '🥎' }, { id: 'baseball', name: '야구공', emoji: '⚾' },
    { id: 'heart', name: '하트', emoji: '💖' }, { id: 'star', name: '별', emoji: '⭐' },
    { id: 'banana', name: '바나나', emoji: '🍌' }, { id: 'cheese', name: '치즈', emoji: '🧀' }, { id: 'snowflake', name: '눈송이', emoji: '❄️' },
  ];

  const defOf = (i) => { const d = CHARACTERS[i] || CHARACTERS[0]; if (!d.m) d.m = root.Motion.buildMotions(d); return d; };
  // 모션별 프레임 고르기. t: idle/walk/doze/offline/stun = 흐른 시간(ms), hit/throw = 시작 후 경과(ms)
  function pick(m, state, t) {
    switch (state) {
      case 'walk': return m.walk[Math.floor(t / 160) % 4];
      case 'doze': return m.doze[Math.floor(t / 900) % 2];
      case 'offline': return m.offline[Math.floor(t / 1000) % 2];
      case 'stun': return m.stun[Math.floor(t / 200) % 2];
      case 'hit': return m.hit[t < 110 ? 0 : t < 260 ? 1 : 2];     // 번쩍 -> 늘어남 -> 복귀 (총 0.44초)
      case 'throw': return m.throw[t < 130 ? 0 : t < 260 ? 1 : 2];
      default: return m.idle[Math.floor(t / 700) % 2];
    }
  }
  const cache = new WeakMap(), ext = new WeakMap();
  function extent(m) {                      // 프레임 안에서 실제로 그려진 범위
    let e = ext.get(m); if (e) return e;
    let top = m.length, left = m.length, right = -1;
    m.forEach((row, y) => row.forEach((c, x) => { if (c !== '.') { top = Math.min(top, y); left = Math.min(left, x); right = Math.max(right, x); } }));
    e = { top, w: right - left + 1, h: m.length - top }; ext.set(m, e); return e;
  }
  function canvasOf(matrix, palette) {
    let c = cache.get(matrix); if (c) return c;
    const n = matrix.length; c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'), img = g.createImageData(n, n);
    matrix.forEach((row, y) => row.forEach((ch, x) => {
      const hex = palette[ch]; if (ch === '.' || !hex) return;
      const k = (y * n + x) * 4; img.data[k] = parseInt(hex.slice(1, 3), 16); img.data[k + 1] = parseInt(hex.slice(3, 5), 16); img.data[k + 2] = parseInt(hex.slice(5, 7), 16); img.data[k + 3] = 255;
    }));
    g.putImageData(img, 0, 0); cache.set(matrix, c); return c;
  }

  // o: {state, t, flip, fit, dx, dy}  반환: 이름표 기준 높이(서 있는 머리 위치)
  function draw(g, i, cx, bottom, o = {}) {
    const d = defOf(i), m = pick(d.m, o.state || 'idle', o.t || 0), e = extent(m), s = (o.fit ? Math.max(1, Math.floor(o.fit / e.h)) : o.s || d.s) * (o.scale || 1), size = m.length * s;
    g.imageSmoothingEnabled = false; g.save();
    g.translate(Math.round(cx + (o.dx || 0)), Math.round(bottom - (o.dy || 0)));
    if (o.flip) g.scale(-1, 1);
    g.drawImage(canvasOf(m, d.palette), -size / 2, -size, size, size);
    g.restore();
    return bottom - e.h * s;                  // 이 프레임의 실제 머리 위치
  }
  const height = (i) => { const d = defOf(i); return d.m.h * d.s; };
  const width = (i) => { const d = defOf(i); return d.m.w * d.s; };
  // 지금 모션에서 실제로 보이는 크기(화면 px) - 클릭 범위/던지기 목표 높이에 사용
  function bounds(i, state, tms) { const d = defOf(i), e = extent(pick(d.m, state || 'idle', tms || 0)); return { w: e.w * d.s, h: e.h * d.s }; }
  root.Sprites = { CHARACTERS, BUBBLES, THROWABLES, draw, height, width, bounds };
})(window);
