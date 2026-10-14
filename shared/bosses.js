// 보스 몬스터 규칙과 움직임 (화면과 분리한 순수 계산). 서버는 출현 시각(t0)과 seed 만 알려 주고,
// 모든 친구의 앱이 같은 식으로 위치를 계산하므로 보스가 모두에게 같은 자리에 보인다 (위치 신호를 따로 주고받지 않음).
(function (root) {
  'use strict';
  // ---- 레벨 / 경험치: LEVELS[n-1] = 레벨 n 이 되는 누적 경험치 (레벨 1~10) ----
  const LEVELS = [0, 50, 125, 225, 350, 500, 700, 950, 1250, 1600], MAX_LV = LEVELS.length;
  // 레벨 보너스: 2레벨마다 공격력 +1 (Lv2 +1, Lv4 +2, Lv6 +3, Lv8 +4, Lv10 +5). 후광 단계도 같은 기준 (0 = 없음, 1~5)
  const dmgBonus = (lv) => Math.floor(Math.max(1, lv | 0) / 2), auraTier = (lv) => Math.min(5, Math.floor(Math.max(1, lv | 0) / 2));
  function levelInfo(xp) {
    xp = Math.max(0, Math.floor(Number(xp) || 0)); let lv = 1;
    while (lv < MAX_LV && xp >= LEVELS[lv]) lv++;
    const base = LEVELS[lv - 1], next = lv < MAX_LV ? LEVELS[lv] : null;
    return { lv, xp, base, next, into: xp - base, need: next === null ? 0 : next - base, max: lv >= MAX_LV };
  }

  // ---- 보스 목록 (id 는 서버와 같아야 함) ----
  // face: 그림이 원래 바라보는 방향(-1 = 왼쪽, 0 = 상관없음). weight/xp 는 서버 쪽 값과 같게 맞춰 둠(화면 설명용).
  const HP = 100;
  const BOSSES = {
    bat:  { id: 'bat',  name: '박쥐 보스',   emoji: '🦇', face: 0,  xp: 120, weight: 24, desc: '하늘을 날아다녀요' },
    liz:  { id: 'liz',  name: '도마뱀 보스', emoji: '🦎', face: -1, xp: 150, weight: 22, desc: '화면 가장자리 벽도 기어다녀요' },
    pig:  { id: 'pig',  name: '불돼지 보스', emoji: '🐗', face: -1, xp: 200, weight: 16, desc: '불덩이라 ❄️눈송이만 통해요' },
    mole: { id: 'mole', name: '두더지 보스', emoji: '🕳️', face: 0,  xp: 130, weight: 22, desc: '땅속을 오가다 올라올 때만 맞아요' },
    frog: { id: 'frog', name: '개구리 보스', emoji: '🐸', face: -1, xp: 140, weight: 16, desc: '폴짝폴짝 뛰어다녀요' },
    // 특별 보스: Lv6 이상이 3명 이상 접속해 있어야 나옴. 체력 600, 회피 20%, 체력 400/200 에서 "심판"(한 명만 남기고 기절 -> 문제를 맞혀야 계속)
    lord: { id: 'lord', name: '차원 마왕', emoji: '👿', face: 0, xp: 400, weight: 20, desc: '날고, 달리고, 주먹으로 날려 버려요 (Lv6 이상 3명 이상일 때)', hp: 600, evade: 0.2 },
  };
  const bossOf = (type) => BOSSES[type] || BOSSES.bat;

  // ---- 결정적 난수 / 보조 ----
  function hash(a, b, c) {
    let h = (a | 0) ^ Math.imul(b | 0, 0x9E3779B1) ^ Math.imul(c | 0, 0x85EBCA6B);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const smooth = (u) => u * u * (3 - 2 * u), clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, u) => a + (b - a) * u;
  const chains = new Map();                                        // 같은 seed 의 경유지 목록을 재사용 (k 번째 경유지는 앞 것에 이어서 계산)
  function chain(key, k, next) {
    let c = chains.get(key); if (!c) { c = []; chains.set(key, c); if (chains.size > 40) chains.delete(chains.keys().next().value); }
    while (c.length <= k) c.push(next(c.length, c.length ? c[c.length - 1] : null));
    return c[k];
  }
  // 경유지(0~1 비율): 앞 경유지에서 최소 minStep 이상 떨어진 곳으로 (같은 곳에서 제자리걸음 안 하게)
  const jump = (seed, salt, minStep, maxStep) => (i, prev) => {
    if (!prev) return 0.2 + 0.6 * hash(seed, 9999, salt);
    const step = (minStep + (maxStep - minStep) * hash(seed, i, salt)) * (hash(seed, i, salt + 1) < 0.5 ? -1 : 1);
    let x = prev + step; if (x < 0.08 || x > 0.92) x = prev - step; return clamp(x, 0.06, 0.94);
  };

  // ---- 위치 계산 ----
  // boss: {type, seed, t0(서버 ms)}, now: 서버 기준 현재(ms), v: {W, H, bw, bh}(화면 크기와 보스 그림 크기 px)
  // 돌려주는 값: {cx, cy 중심, rot 라디안, flip, sprite 'idle'|'a1'|'a2', sx, sy 찌그러짐, vulnerable, phase 상태 이름(바뀔 때 효과를 내려고), fx}
  function pose(boss, now, v) {
    const t = Math.max(0, (now - boss.t0) / 1000), P = POSE[boss.type] || POSE.bat; return P(boss.seed | 0, t, v);
  }
  const groundY = (v) => v.H - 8;
  const base = (o) => Object.assign({ anchor: 'bottom', rot: 0, flip: false, sprite: 'idle', sx: 1, sy: 1, vulnerable: true, phase: 'idle' }, o);
  const dirSign = (fn, t) => Math.sign(fn(t + 0.08) - fn(t - 0.08));

  const POSE = {
    // 박쥐: 좌우로 크게 날아다니고, 10초마다 낮게 급강하(a1), 가끔 독 구슬(a2)
    bat(seed, t, v) {
      const f1 = hash(seed, 1, 1) * 6.28, f2 = hash(seed, 2, 1) * 6.28, f3 = hash(seed, 3, 1) * 6.28;
      const X = (tt) => v.W * clamp(0.5 + 0.40 * Math.sin(0.29 * tt + f1) + 0.07 * Math.sin(0.83 * tt + f2), 0.07, 0.93);
      const cyc = (t + 3) % 10, dive = cyc < 1.8 ? Math.sin(Math.PI * cyc / 1.8) : 0, orb = (t + 3) % 10 >= 5 && (t + 3) % 10 < 6.3;
      const alt = v.H * (0.24 + 0.12 * Math.sin(0.7 * t + f3)) - dive * v.H * 0.19;
      const cy = clamp(groundY(v) - v.bh / 2 - alt, v.bh / 2 + 8, groundY(v) - v.bh / 2), dx = dirSign(X, t);
      return base({ anchor: 'center', cx: X(t), cy, flip: dx > 0, sprite: dive > 0.05 ? 'a1' : orb ? 'a2' : 'idle', sy: 1 + 0.07 * Math.sin(t * 9), phase: dive > 0.05 ? 'dive' : orb ? 'orb' : 'fly', rot: 0.08 * Math.sin(t * 2.2) });
    },
    // 도마뱀: 화면 가장자리(바닥 → 오른쪽 벽 → 천장 → 왼쪽 벽)를 한 바퀴 기어다님. 14초마다 불 뿜기(a1), 7초 어긋나게 바위 던지기(a2)
    liz(seed, t, v) {
      const PERIOD = 80, u = ((t / PERIOD) + hash(seed, 0, 5)) % 1, xmin = v.bh / 2, xmax = v.W - v.bh / 2, ymin = v.bh / 2, ymax = groundY(v) - v.bh / 2;
      const Lg = xmax - xmin, Lw = ymax - ymin, total = 2 * (Lg + Lw); let d = u * total, cx, cy, rot, seg;
      if (d < Lg) { seg = 0; cx = xmin + d; cy = ymax; rot = 0; }
      else if ((d -= Lg) < Lw) { seg = 1; cx = xmax; cy = ymax - d; rot = -Math.PI / 2; }
      else if ((d -= Lw) < Lg) { seg = 2; cx = xmax - d; cy = ymin; rot = Math.PI; }
      else { d -= Lg; seg = 3; cx = xmin; cy = ymin + d; rot = Math.PI / 2; }
      const c = (t + 5) % 14, c2 = (t + 12) % 14;                                 // 불 뿜기 / 바위
      const breath = c < 1.6, rock = c2 < 1.4;
      return base({ cx, cy, rot, flip: true, sprite: breath ? 'a1' : rock ? 'a2' : 'idle', sy: 1 + 0.03 * Math.sin(t * 6), phase: breath ? 'breath' : rock ? 'rock' : 'crawl' + seg });
    },
    // 불돼지: 7초 주기 [천천히 배회 3초 → 몸을 부풀리며 준비 1초(a2) → 불꽃 돌진 1초(a1) → 숨 고르기 2초]. 눈송이만 통함
    pig(seed, t, v) {
      const T = 7, k = Math.floor(t / T), ph = t - k * T, ch = (i) => chain('pig' + seed, i, jump(seed, 11, 0.28, 0.5));      // 경유지 i -> i+1 이 k 번째 주기의 돌진 구간
      const x0 = ch(k), x1 = ch(k + 1), dir = x1 >= x0 ? 1 : -1, cy = groundY(v) - v.bh / 2; let x = x0, sprite = 'idle', phase = 'patrol', shake = 0;
      if (ph < 3) x = x0 + dir * 0.03 * Math.sin(Math.PI * ph / 3);
      else if (ph < 4) { sprite = 'a2'; phase = 'windup'; shake = Math.sin(ph * 60) * 3; }
      else if (ph < 5) { sprite = 'a1'; phase = 'charge'; x = lerp(x0, x1, Math.pow(ph - 4, 1.4)); }
      else { x = x1; phase = 'rest'; }
      return base({ cx: x * v.W + shake, cy, flip: dir > 0, sprite, phase: phase + ':' + k, sy: ph >= 3 && ph < 4 ? 1.06 : 1 });
    },
    // 두더지: 10초 주기 [땅속 이동 5초(맞지 않음) → 솟아오름 → 올라와 있는 3.7초(맞음) → 다시 파고듦]
    mole(seed, t, v) {
      const T = 10, k = Math.floor(t / T), ph = t - k * T, ch = (i) => chain('mole' + seed, i, jump(seed, 21, 0.25, 0.5));
      const x0 = ch(k), x1 = ch(k + 1), dir = x1 >= x0 ? 1 : -1, bottom = groundY(v); let x = x0, sprite = 'a2', phase = 'dig', sy = 1, vul = false;
      if (ph < 5) x = lerp(x0, x1, smooth(ph / 5));
      else { x = x1; if (ph < 5.7) { sprite = 'a1'; phase = 'emerge'; sy = 0.55 + 0.45 * smooth((ph - 5) / 0.7); vul = ph > 5.3; } else if (ph < 9) { sprite = 'idle'; phase = 'up'; vul = true; } else if (ph < 9.5) { sprite = 'a1'; phase = 'sink'; sy = 1 - 0.45 * smooth((ph - 9) / 0.5); } else { sprite = 'a2'; phase = 'dig'; } }
      return base({ cx: x * v.W, cy: bottom - (v.bh * sy) / 2, flip: dir > 0, sprite, phase: phase + ':' + k, sy, vulnerable: vul });
    },
    // 개구리: 1.5초마다 폴짝(웅크림 → 공중 → 착지 물보라 a2). 가끔(약 18%) 제자리에서 혀 공격(a1)
    frog(seed, t, v) {
      const T = 1.5, k = Math.floor(t / T), ph = t - k * T, tongue = (i) => hash(seed, i, 4) < 0.18;
      const wp = (i) => chain('frog' + seed, i, (j, prev) => (prev === null ? 0.2 + 0.6 * hash(seed, 9999, 31) : tongue(j - 1) ? prev : jump(seed, 33, 0.07, 0.22)(j, prev)));   // 경유지 k -> k+1 이 k 번째 주기의 폴짝
      const x0 = wp(k), x1 = wp(k + 1); let dir = 0; for (let j = k; j >= 0 && !dir; j--) dir = Math.sign(wp(j + 1) - wp(j)); dir = dir || 1;
      const gy = groundY(v); let x = x0, lift = 0, sprite = 'idle', phase = 'sit', sx = 1, sy = 1;
      if (tongue(k)) { sprite = ph < 1.3 ? 'a1' : 'idle'; phase = 'tongue'; }
      else if (ph < 0.3) { phase = 'crouch'; sx = 1.07; sy = 0.88; }
      else if (ph < 1.0) { const u = (ph - 0.3) / 0.7; x = lerp(x0, x1, u); lift = Math.sin(Math.PI * u) * v.H * 0.2; phase = 'air'; sx = 0.95; sy = 1.1; }
      else { x = x1; sprite = 'a2'; phase = 'land'; }
      return base({ cx: x * v.W, cy: gy - (v.bh * sy) / 2 - lift, flip: dir > 0, sprite, sx, sy, phase: phase + ':' + k });
    },
    // 차원 마왕: 14초 주기 [걷기 3.5 → 주먹 준비 0.9(바닥에 빨간 경고) → 주먹 0.4 → 쉬기 0.3 → 날아오르기/날아다니기 4 → 질주 1.4 → 착지 0.6 → 걷기 1.6 → 주먹 준비/주먹/쉬기 1.6]
    // 주먹은 바라보는 쪽 바닥으로 뻗음 (fist: 0~1 뻗은 정도, dir: 방향, reach: 닿는 거리 배율). 그림은 한 장이라 sprite 는 항상 idle.
    lord(seed, t, v) {
      const T = 14, k = Math.floor(t / T), ph = t - k * T, ch = (i) => chain('lord' + seed, i, jump(seed, 41, 0.22, 0.5));
      const c0 = ch(4 * k), c1 = ch(4 * k + 1), c2 = ch(4 * k + 2), c3 = ch(4 * k + 3), c4 = ch(4 * k + 4), gy = groundY(v), lift0 = v.H * 0.3, bob = Math.abs(Math.sin(t * 7)) * 5;
      const dA = c1 >= c0 ? 1 : -1, dB = c3 >= c2 ? 1 : -1, dC = c4 >= c3 ? 1 : -1; let x = c0, alt = 0, phase = 'walk', sx = 1, sy = 1, rot = 0, fist = 0, dir = dA;
      const walk = () => { sy = 1 + 0.025 * Math.sin(t * 14); rot = 0.035 * Math.sin(t * 7); alt = bob; };
      if (ph < 3.5) { x = lerp(c0, c1, smooth(ph / 3.5)); walk(); }
      else if (ph < 4.4) { x = c1; phase = 'windup'; sy = 0.96 + 0.03 * Math.sin(t * 30); dir = dA; }
      else if (ph < 4.8) { x = c1; fist = Math.sin(Math.PI * (ph - 4.4) / 0.4); phase = 'punch'; dir = dA; sx = 1 + 0.06 * fist; }
      else if (ph < 5.1) { x = c1; phase = 'rest'; dir = dA; }
      else if (ph < 9.1) {                                                                  // 날아다니기: 올라가며 c1 -> c2 로 출렁이며 이동
        const u = (ph - 5.1) / 4, rise = smooth(Math.min(1, (ph - 5.1) / 0.8)), fl = Math.sin(t * 16);
        x = lerp(c1, c2, smooth(u)) + Math.sin(u * 12.6) * 0.04 * Math.sin(Math.PI * u); alt = lift0 * rise * (1 + 0.25 * Math.sin(u * 9.4)); phase = 'fly'; sx = 1 + 0.05 * fl; sy = 1 - 0.05 * fl; rot = 0.05 * Math.sin(t * 3);
        dir = Math.sign(c2 - c1) || 1;
      }
      else if (ph < 10.5) { const u = (ph - 9.1) / 1.4; x = lerp(c2, c3, Math.pow(u, 1.6)); alt = lift0 * (1 - 0.35 * u); phase = 'dash'; sx = 1.18; sy = 0.9; dir = dB; rot = 0.12 * dB; }   // 빠르게 질주
      else if (ph < 11.1) { const u = (ph - 10.5) / 0.6; x = c3; alt = lift0 * 0.65 * (1 - smooth(u)); phase = 'land'; dir = dB; }
      else if (ph < 12.6) { x = lerp(c3, c4, smooth((ph - 11.1) / 1.5)); phase = 'walk'; walk(); dir = dC; }
      else if (ph < 13.5) { x = c4; phase = 'windup2'; sy = 0.96 + 0.03 * Math.sin(t * 30); dir = dC; }
      else if (ph < 13.9) { x = c4; fist = Math.sin(Math.PI * (ph - 13.5) / 0.4); phase = 'punch2'; dir = dC; sx = 1 + 0.06 * fist; }
      else { x = c4; phase = 'rest'; dir = dC; }
      return base({ anchor: 'center', cx: x * v.W, cy: gy - v.bh / 2 - alt, rot, flip: false, sprite: 'idle', sx, sy, phase: phase + ':' + k, fist, dir, air: alt > 40 });
    },
  };

  // ---- 데미지 규칙 ----
  // T: 던지기 아이템(Sprites.THROWABLES 한 칸: {id, dmg}), p: pose() 결과. 돌려주는 값: {dmg, why} (dmg 0 이면 why = 안내 문구)
  function damageOf(boss, T, p) {
    const dmg = Math.max(1, Math.floor((T && T.dmg) || 1));
    if (boss.type === 'pig' && !(T && T.id === 'snowflake')) return { dmg: 0, why: '🔥 불덩이라 ❄️눈송이만 통해요!' };
    if (p && p.vulnerable === false) return { dmg: 0, why: '땅속이라 맞지 않아요!' };
    return { dmg, why: '' };
  }

  root.Bosses = { dmgBonus, auraTier, LEVELS, MAX_LV, levelInfo, HP, BOSSES, bossOf, pose, damageOf, hash };
  if (typeof module !== 'undefined') module.exports = root.Bosses;
})(typeof window !== 'undefined' ? window : globalThis);
