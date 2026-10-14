// 뿌셔뿌셔 존: 물건이 위에서 떨어져 바닥에 쌓이고, 클릭하면 재질에 맞게 부서진다.
// 어떤 물건이 언제 어디서 떨어질지는 (방 기준 시각 t0, 번호 k) 로만 정해져서 모든 사람 화면에서 똑같이 나온다.
// 쌓이는 모양(물리)은 각자 화면에서 따로 계산한다. (부순 물건 번호만 서로 알려 줌)
(function (root) {
  // r: 반지름(px). bounce: 통통 튀는 정도. grav: 중력 배율. colors: 부서질 때 튀는 조각 색
  const MATS = {
    glass: { name: '유리병', r: 17, bounce: 0.25, grav: 1, colors: ['#bfe9ff', '#8fd0f5', '#ffffff', '#6fb8e8'] },
    plate: { name: '접시', r: 19, bounce: 0.3, grav: 1, colors: ['#ffffff', '#dfe9ff', '#7fa8e8', '#f1f1f1'] },
    wood: { name: '나무상자', r: 21, bounce: 0.15, grav: 1, colors: ['#8a6038', '#b0824f', '#6b4a2b', '#d1a36a'] },
    card: { name: '택배상자', r: 21, bounce: 0.1, grav: 0.9, colors: ['#d9b27c', '#c19a62', '#f0d9b0', '#a47c45'] },
    balloon: { name: '풍선', r: 19, bounce: 0.75, grav: 0.18, colors: [] },
    can: { name: '깡통', r: 16, bounce: 0.35, grav: 1, colors: ['#c9ced9', '#8d99ae', '#ffffff', '#e5484d'] },
    melon: { name: '수박', r: 22, bounce: 0.2, grav: 1, colors: ['#e5484d', '#ff7b7b', '#2f9e44', '#ffe3e3'] },
  };
  const ORDER = ['glass', 'plate', 'wood', 'card', 'balloon', 'can', 'melon'];
  // 속도 게이지 rate(0~100) -> 물건이 떨어지는 간격: 0 이면 4.5초에 1개, 100 이면 0.1초에 1개 (사이는 부드럽게 이어지는 지수 곡선)
  const GAP_SLOW = 4500, GAP_FAST = 100, RATE_DEFAULT = 25;
  const MAX_OBJS = 50, LIFE_MS = 150000;                // 바닥에 최대 70개, 오래되면 서서히 사라짐
  const BALLOON_COLORS = ['#ff5d73', '#ffd23f', '#4cc9f0', '#80ed99', '#c77dff', '#ff9f1c'];

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const hashK = (k, t0) => (Math.imul(k + 1, 2654435761) ^ Math.imul((t0 | 0) + 97, 40503)) >>> 0;
  // k 번째 물건: 재질, 가로 위치(0~1), 처음 회전, 회전 속도, 풍선 색
  function specOf(k, t0) {
    const R = rng(hashK(k, t0));
    return { k, mat: ORDER[Math.floor(R() * ORDER.length)], fx: 0.04 + R() * 0.92, rot: R() * 6.28, spin: (R() - 0.5) * 3, hue: BALLOON_COLORS[Math.floor(R() * BALLOON_COLORS.length)] };
  }
  const gapOf = (rate) => { const r = Math.max(0, Math.min(100, Number.isFinite(Number(rate)) ? Number(rate) : RATE_DEFAULT)); return GAP_SLOW * Math.pow(GAP_FAST / GAP_SLOW, r / 100); };
  const indexAt = (sNow, t0, rate) => Math.floor((sNow - t0) / gapOf(rate));   // 지금까지 떨어졌어야 하는 마지막 번호
  function make(k, t0, W, now) {
    const s = specOf(k, t0), M = MATS[s.mat];
    return { k, mat: s.mat, r: M.r, x: M.r + s.fx * Math.max(10, W - 2 * M.r), y: -M.r - 4, vx: 0, vy: 40, rot: s.rot, vr: s.spin, hue: s.hue, born: now, rest: 0 };
  }
  // 한 걸음 (dt 초). 바닥, 양쪽 벽, 물건끼리 부딪힘(쌓임)
  function step(objs, dt, W, floorY) {
    dt = Math.min(dt, 0.05);
    for (const o of objs) {
      const M = MATS[o.mat]; o.vy += 900 * M.grav * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vr * dt;
      if (o.mat === 'balloon') { o.vx += Math.sin(o.born / 400 + o.y / 60) * 30 * dt; o.vx *= 1 - 0.8 * dt; o.vy *= 1 - 1.2 * dt; }
      if (o.y + o.r > floorY) { o.y = floorY - o.r; if (o.vy > 60) o.vy *= -M.bounce; else o.vy = 0; o.vx *= 1 - Math.min(1, 6 * dt); o.vr *= 1 - Math.min(1, 4 * dt); }
      if (o.x - o.r < 0) { o.x = o.r; o.vx = Math.abs(o.vx) * 0.4; } else if (o.x + o.r > W) { o.x = W - o.r; o.vx = -Math.abs(o.vx) * 0.4; }
    }
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < objs.length; i++) for (let j = i + 1; j < objs.length; j++) {
        const a = objs[i], b = objs[j], dx = b.x - a.x, dy = b.y - a.y, min = (a.r + b.r) * 0.86, d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01, nx = dx / d, ny = dy / d, push = (min - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; if (rv < 0) { const imp = rv * 0.5 * 1.25; a.vx += imp * nx; a.vy += imp * ny; b.vx -= imp * nx; b.vy -= imp * ny; }
        a.vx *= 0.995; b.vx *= 0.995;
        if (ny > 0.6 && b.y > a.y) { a.vx += (a.x < b.x ? -1 : 1) * 4 * dt * 60 * 0.05; }   // 바로 위에 얹히면 살짝 옆으로 미끄러져 탑이 되지 않게
      }
    }
  }
  // 제일 위에 보이는(나중에 생긴) 물건부터 클릭 판정
  function hit(objs, x, y) { for (let i = objs.length - 1; i >= 0; i--) { const o = objs[i], r = o.r + 4; if ((x - o.x) ** 2 + (y - o.y) ** 2 <= r * r) return o; } return null; }
  // 바닥 개수 제한: 넘치면 가장 오래된 것부터 지움, 너무 오래된 것도 지움. 지운 것들을 돌려줌
  function trim(objs, now) { const gone = []; for (let i = objs.length - 1; i >= 0; i--) if (now - objs[i].born > LIFE_MS) gone.push(objs.splice(i, 1)[0]); while (objs.length > MAX_OBJS) gone.push(objs.shift()); return gone; }
  const alphaOf = (o, now) => Math.max(0, Math.min(1, (LIFE_MS - (now - o.born)) / 4000));

  // ---- 그리기 (그림 파일 없이 캔버스로 직접) ----
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
  function draw(g, o, hover) {
    const r = o.r; g.save(); g.translate(o.x, o.y); g.rotate(o.rot); g.lineWidth = 2; g.lineJoin = 'round';
    if (o.mat === 'glass') {
      g.fillStyle = 'rgba(150,215,250,.75)'; g.strokeStyle = '#3d86b8'; rr(g, -r * 0.5, -r * 0.2, r, r * 1.2, 4); g.fill(); g.stroke();
      rr(g, -r * 0.2, -r * 1.05, r * 0.4, r * 0.9, 3); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(-r * 0.32, r * 0.05, 3, r * 0.7);
    } else if (o.mat === 'plate') {
      g.fillStyle = '#fff'; g.strokeStyle = '#6f93d6'; g.beginPath(); g.arc(0, 0, r, 0, 6.29); g.fill(); g.stroke();
      g.beginPath(); g.arc(0, 0, r * 0.62, 0, 6.29); g.strokeStyle = '#9db8ea'; g.stroke();
      g.fillStyle = '#e7efff'; g.beginPath(); g.arc(0, 0, r * 0.4, 0, 6.29); g.fill();
    } else if (o.mat === 'wood') {
      g.fillStyle = '#b0824f'; g.strokeStyle = '#5c3d1e'; rr(g, -r, -r, 2 * r, 2 * r, 3); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-r, -r * 0.35); g.lineTo(r, -r * 0.35); g.moveTo(-r, r * 0.35); g.lineTo(r, r * 0.35); g.moveTo(-r, -r); g.lineTo(r, r); g.moveTo(r, -r); g.lineTo(-r, r); g.strokeStyle = '#7a5530'; g.stroke();
    } else if (o.mat === 'card') {
      g.fillStyle = '#d9b27c'; g.strokeStyle = '#8a6a3a'; rr(g, -r, -r * 0.85, 2 * r, r * 1.7, 3); g.fill(); g.stroke();
      g.fillStyle = '#efe2c4'; g.fillRect(-r * 0.18, -r * 0.85, r * 0.36, r * 1.7); g.fillStyle = '#fff'; g.strokeStyle = '#8a6a3a'; g.lineWidth = 1; g.fillRect(r * 0.3, r * 0.1, r * 0.55, r * 0.45); g.strokeRect(r * 0.3, r * 0.1, r * 0.55, r * 0.45);
    } else if (o.mat === 'balloon') {
      g.fillStyle = o.hue; g.strokeStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(0, -2, r * 0.82, r, 0, 0, 6.29); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-4, r - 2); g.lineTo(4, r - 2); g.lineTo(0, r + 4); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.moveTo(0, r + 4); g.quadraticCurveTo(6, r + 12, -2, r + 18); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(-r * 0.3, -r * 0.45, 3.5, 6, -0.5, 0, 6.29); g.fill();
    } else if (o.mat === 'can') {
      g.fillStyle = '#c9ced9'; g.strokeStyle = '#6b7280'; rr(g, -r * 0.7, -r * 0.9, r * 1.4, r * 1.8, 4); g.fill(); g.stroke();
      g.fillStyle = '#e5484d'; g.fillRect(-r * 0.7, -r * 0.3, r * 1.4, r * 0.6); g.fillStyle = '#e8ebf2'; g.beginPath(); g.ellipse(0, -r * 0.9, r * 0.7, r * 0.2, 0, 0, 6.29); g.fill(); g.stroke();
    } else if (o.mat === 'melon') {
      g.fillStyle = '#2f9e44'; g.strokeStyle = '#1b5e2c'; g.beginPath(); g.arc(0, 0, r, 0, 6.29); g.fill(); g.stroke();
      g.strokeStyle = '#1f7a35'; g.lineWidth = 3; for (let i = -2; i <= 2; i++) { g.beginPath(); g.ellipse(0, 0, r * (0.25 + 0.2 * Math.abs(i)), r, 0, -1.5, 1.5); if (i === 0) g.stroke(); else { g.save(); g.rotate(i * 0.5); g.beginPath(); g.moveTo(0, -r * 0.95); g.quadraticCurveTo(r * 0.4, 0, 0, r * 0.95); g.stroke(); g.restore(); } }
    }
    if (hover) { g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.arc(0, 0, r + 4, 0, 6.29); g.stroke(); }
    g.restore();
  }
  root.Smash = { RATE_DEFAULT, MATS, ORDER, MAX_OBJS, LIFE_MS, specOf, gapOf, indexAt, make, step, hit, trim, alphaOf, draw };
  if (typeof module !== 'undefined') module.exports = root.Smash;
})(typeof window !== 'undefined' ? window : globalThis);
