// 도트 한 장(문자 행렬)으로 SIDEY식 모션 프레임(idle/walk/doze/offline/throw/hit/stun)을 만들어 내는 순수 함수 모음
// 행렬 문자: '.' 투명, 'O' 외곽선, 'E' 눈(모션 때 감김/><로 바뀜), 'W' 흰색(맞았을 때 번쩍), 그 외 = 팔레트 색
(function (root) {
  'use strict';
  const toM = (rows) => rows.map((r) => [...r]);
  const W = (m) => (m.length ? m[0].length : 0);
  const copy = (m) => m.map((r) => r.slice());

  function trim(m) {
    let y0 = m.length, y1 = -1, x0 = W(m), x1 = -1;
    m.forEach((r, y) => r.forEach((c, x) => { if (c !== '.') { y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); } }));
    return y1 < 0 ? [['.']] : m.slice(y0, y1 + 1).map((r) => r.slice(x0, x1 + 1));
  }
  // 최근접 크기 변경 (눈 'E'는 줄어들어도 사라지지 않게 보존)
  function resize(m, sx, sy) {
    const h = m.length, w = W(m), nw = Math.max(1, Math.round(w * sx)), nh = Math.max(1, Math.round(h * sy)), out = [];
    for (let y = 0; y < nh; y++) {
      const row = [], ya = Math.min(h - 1, Math.floor(y * h / nh)), yb = Math.min(h - 1, Math.max(ya, Math.ceil((y + 1) * h / nh) - 1));
      for (let x = 0; x < nw; x++) {
        const xa = Math.min(w - 1, Math.floor(x * w / nw)), xb = Math.min(w - 1, Math.max(xa, Math.ceil((x + 1) * w / nw) - 1));
        let c = m[Math.min(h - 1, Math.floor((y + 0.5) * h / nh))][Math.min(w - 1, Math.floor((x + 0.5) * w / nw))];
        for (let yy = ya; yy <= yb; yy++) for (let xx = xa; xx <= xb; xx++) if (m[yy][xx] === 'E') c = 'E';
        row.push(c);
      }
      out.push(row);
    }
    return out;
  }
  // 위쪽일수록 k만큼 옆으로 밀기(몸 기울이기)
  function shear(m, k) {
    const h = m.length, w = W(m), nw = w + Math.abs(k), off = k < 0 ? -k : 0, out = m.map(() => Array(nw).fill('.'));
    m.forEach((r, y) => { const s = h > 1 ? Math.round(k * (h - 1 - y) / (h - 1)) : 0; r.forEach((c, x) => { if (c !== '.') out[y][x + off + s] = c; }); });
    return out;
  }
  const dropRow = (m, y) => m.filter((_, i) => i !== y);
  const eyeList = (m) => { const o = []; m.forEach((r, y) => r.forEach((c, x) => c === 'E' && o.push({ x, y }))); return o; };
  function safeRow(m) {                     // 눈에서 가장 먼 윗부분 한 줄 (숨쉬기 때 지우는 줄)
    const h = m.length, eyes = eyeList(m), lo = Math.max(1, Math.round(h * 0.08)), hi = Math.max(lo, Math.round(h * 0.25));
    let best = lo, bs = -1;
    for (let y = lo; y <= hi; y++) { const s = eyes.length ? Math.min(...eyes.map((e) => Math.abs(e.y - y))) : 9; if (s > bs) { bs = s; best = y; } }
    return best;
  }
  function fillAround(m, x, y) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) { const c = (m[y + dy] || [])[x + dx]; if (c && !'.OE'.includes(c)) return c; }
    return 'O';
  }
  const inside = (m, x, y) => y >= 0 && y < m.length && x >= 0 && x < W(m) && m[y][x] !== '.';
  function closedEyes(m) {                  // 눈 감기: 점 -> 2칸 가로선
    const o = copy(m), mid = (W(m) - 1) / 2;
    eyeList(m).forEach(({ x, y }) => { const nx = x < mid ? x + 1 : x - 1; if (inside(o, nx, y)) o[y][nx] = 'E'; });
    return o;
  }
  function hitEyes(m) {                     // 맞았을 때 눈: > <
    const o = copy(m), mid = (W(m) - 1) / 2, eyes = eyeList(m);
    eyes.forEach(({ x, y }) => { o[y][x] = fillAround(m, x, y); });
    eyes.forEach(({ x, y }) => {
      const d = x < mid ? -1 : 1;
      [[x + d, y - 1], [x, y], [x + d, y + 1]].forEach(([a, b]) => { if (inside(o, a, b)) o[b][a] = 'E'; });
    });
    return o;
  }
  function rotate(m) {                      // 시계방향 90도 (옆으로 누운 모습)
    const h = m.length, w = W(m), out = Array.from({ length: w }, () => Array(h).fill('.'));
    for (let r = 0; r < w; r++) for (let c = 0; c < h; c++) out[r][c] = m[h - 1 - c][r];
    return out;
  }
  const whiten = (m) => m.map((r) => r.map((c) => ('.OE'.includes(c) ? c : 'W')));
  function compose(m, C, dx = 0, dy = 0) {  // 정사각 캔버스의 아래 가운데에 놓기 (dy>0 = 위로 띄움)
    const h = m.length, w = W(m), out = Array.from({ length: C }, () => Array(C).fill('.')), x0 = Math.floor((C - w) / 2) + dx, y0 = C - h - dy;
    m.forEach((r, y) => r.forEach((c, x) => { const X = x0 + x, Y = y0 + y; if (c !== '.' && X >= 0 && X < C && Y >= 0 && Y < C) out[Y][X] = c; }));
    return out;
  }

  // def.rows = 기본 도트(던지기/기절의 바탕), def.poses = 모션별로 따로 그린 도트(idle/walk/doze/doze2/offline/stun) — 있으면 그걸 우선 사용
  // doze2 가 있으면 졸기 2프레임을 서로 다른 그림(예: 웅크려 졸기 <-> 하품)으로 번갈아 보여줌
  function buildMotions(def) {
    const base = trim(toM(def.rows)), baseB = def.rowsB ? trim(toM(def.rowsB)) : base;
    const hitSrc = def.alt && def.alt.hit ? trim(toM(def.alt.hit)) : null, thrSrc = def.alt && def.alt.throw ? trim(toM(def.alt.throw)) : null;
    const pose = {}; for (const k of ['idle', 'walk', 'doze', 'doze2', 'offline', 'stun']) pose[k] = def.poses && def.poses[k] ? trim(toM(def.poses[k])) : null;
    const all = [base, thrSrc, ...Object.values(pose)].filter(Boolean), dims = all.map((m) => Math.max(m.length, W(m)));
    if (hitSrc) dims.push(Math.ceil(Math.max(hitSrc.length, W(hitSrc)) * 1.25));      // 맞을 때 옆으로 퍼지는 여유
    const C = Math.max(...dims) + 4, put = (m, dx, dy) => compose(m, C, dx, dy);
    const closed = closedEyes(base), eyesHit = hitEyes(base), he = hitSrc || eyesHit, lying = rotate(closed);
    const breathe = (m) => put(dropRow(m, safeRow(m))), sway = (m, k) => put(shear(m, k));
    const P = pose;
    return {
      C, w: W(base), h: base.length,
      idle:    P.idle ? [put(P.idle), breathe(P.idle)] : [put(base), breathe(base)],                                                   // 숨쉬듯 살짝 눌림
      walk:    P.walk ? [put(P.walk), put(shear(P.walk, 1), 0, 1), put(P.walk), put(shear(P.walk, -1), 0, 1)]
                      : [put(base), put(shear(baseB, 1), 0, 1), put(base), put(shear(baseB, -1), 0, 1)],                               // 뒤뚱뒤뚱 (발걸음마다 통통)
      doze:    P.doze ? [put(P.doze), P.doze2 ? put(P.doze2) : sway(dropRow(P.doze, safeRow(P.doze)), 1)] : [put(closed), sway(dropRow(closed, safeRow(closed)), 1)],   // 졸기
      offline: P.offline ? [put(P.offline), sway(P.offline, 1)] : [put(lying), sway(lying, 1)],                                          // 누워 있기
      throw:   [put(shear(resize(base, 1, 0.94), -2)), thrSrc ? put(thrSrc) : put(shear(resize(base, 0.96, 1.06), 2)), put(base)],     // 뒤로 젖힘 -> 던짐 -> 복귀
      hit:     [put(whiten(resize(he, 1.2, 0.78))), put(resize(he, 0.9, 1.12)), put(he)],                                               // 번쩍+찌그러짐 -> 늘어남 -> 복귀
      stun:    P.stun ? [put(P.stun), sway(P.stun, 1)] : [put(eyesHit), sway(eyesHit, 1)],                                              // 기절
    };
  }
  root.Motion = { buildMotions, trim, resize, shear, closedEyes, hitEyes, rotate, whiten, compose };
  if (typeof module !== 'undefined') module.exports = root.Motion;
})(typeof window !== 'undefined' ? window : globalThis);
