// 던지기 아이템이 날아가는 경로 계산 (화면과 분리한 순수 함수). 좌표는 화면 픽셀(y 는 아래로 증가).
(function (root) {
  'use strict';
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (x0, y0, x1, y1) => Math.hypot(x1 - x0, y1 - y0);

  // 포물선: 직선으로 가면서 위로 솟았다 내려옴 (똥, 폭탄, 공 같은 던지는 물건)
  const arcPos = (x0, y0, x1, y1, t, h = 70) => ({ x: lerp(x0, x1, t), y: lerp(y0, y1, t) - Math.sin(Math.PI * t) * h });

  // 곡선(매직미사일): 2차 베지어. 제어점을 중간점에서 '위쪽으로' amp*2 만큼 벗어나게 해서 실제로 amp 쯤 크게 휘어 날아감(2차 곡선은 제어점 거리의 절반만 휘므로 2배).
  // 위쪽으로만 휘게 해서 바닥 아래로 꺼지지 않음. swirl(-0.2~0.2)은 휘는 지점을 앞/뒤로 살짝 옮겨 매번 모양이 조금 다르게 함
  const curveControl = (x0, y0, x1, y1, amp, swirl = 0, lift = 0) => {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1; let nx = -dy / len, ny = dx / len; if (ny > 0) { nx = -nx; ny = -ny; }
    return { cx: (x0 + x1) / 2 + nx * amp * 2 + (dx / len) * len * swirl, cy: (y0 + y1) / 2 + ny * amp * 2 - lift };
  };
  const bezier = (x0, y0, cx, cy, x1, y1, t) => { const u = 1 - t; return { x: u * u * x0 + 2 * u * t * cx + t * t * x1, y: u * u * y0 + 2 * u * t * cy + t * t * y1 }; };
  const bezierAngle = (x0, y0, cx, cy, x1, y1, t) => Math.atan2(2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy), 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx));   // 진행 방향(라디안)
  const curveAmp = (x0, y0, x1, y1) => Math.min(220, Math.max(90, dist(x0, y0, x1, y1) * 0.45));      // 가까워도 곡선이 보이게 최소 90px

  // 직선(총알): 일직선. 속도가 일정해서 먼 곳은 조금 더 오래 걸림 (최소/최대 시간 제한)
  const linePos = (x0, y0, x1, y1, t) => ({ x: lerp(x0, x1, t), y: lerp(y0, y1, t) });
  const bulletMs = (x0, y0, x1, y1, pxPerSec = 1800) => Math.min(320, Math.max(110, dist(x0, y0, x1, y1) / pxPerSec * 1000));

  // 아이템 종류별 비행 시간(ms)과 던진 뒤 날아가기 시작하는 지연
  const FLIGHT = { arc: 650, poop: 650, bomb: 700, missile: 900 };
  const RELEASE_MS = 130;                                            // 던지는 모션에서 손을 떠나는 순간

  // 총을 어깨/손에 들었을 때 조준 각도: 대상 쪽(라디안)
  const aimAngle = (px, py, tx, ty) => Math.atan2(ty - py, tx - px);
  // 총 스프라이트(도트)의 점(칸 단위)이 조준 각도로 놓였을 때의 화면 좌표. sx,sy=손잡이 화면 위치, pivot=손잡이 칸, pt=구하려는 칸, s=확대, forward=스프라이트가 원래 향한 각도(라디안)
  function gunPoint(sx, sy, pivot, pt, s, forward, aim) {
    const flip = Math.cos(aim) < 0, ang = flip ? Math.PI - aim : aim, rot = ang - forward;
    const lx = (pt[0] - pivot[0]) * s, ly = (pt[1] - pivot[1]) * s;
    const rx = lx * Math.cos(rot) - ly * Math.sin(rot), ry = lx * Math.sin(rot) + ly * Math.cos(rot);
    return { x: sx + (flip ? -rx : rx), y: sy + ry };
  }

  root.Projectiles = { lerp, dist, arcPos, curveControl, bezier, bezierAngle, curveAmp, linePos, bulletMs, FLIGHT, RELEASE_MS, aimAngle, gunPoint };
  if (typeof module !== 'undefined') module.exports = root.Projectiles;
})(typeof window !== 'undefined' ? window : globalThis);
