// SIDEY 앱의 조작 규칙 (앱 내부 데이터에서 읽은 값). 화면(UI)과 분리해서 순수 로직으로 두었다.
(function (root) {
  'use strict';
  // 크기 효과: 0.2초 동안 1배 -> 7배, 이어서 0.6초 동안 7배 -> 1배 (총 0.8초)
  const PULSE = { up: 0.2, down: 0.6, peak: 7.0, cooldownMs: 1000 };
  const pulseScale = (t) => (t <= PULSE.up ? 1 + (PULSE.peak - 1) * t / PULSE.up
    : t <= PULSE.up + PULSE.down ? PULSE.peak - (PULSE.peak - 1) * (t - PULSE.up) / PULSE.down : 1);
  const THROW = { cooldownMs: 500, armMs: 10000 };     // 던지기 0.5초 쿨다운 / '오른쪽 두 번 클릭' 뒤 10초 동안만 던질 수 있음
  const HIT_MS = 440, STUN = { hits: 10, windowMs: 10000, durationMs: 6000, guardAfterMs: 2000 };   // 10초 안에 10번 맞으면 6초 기절, 기절이 풀린 뒤 2초는 더 무적

  class Cooldown {                                       // key 별로 ms 안에 다시 오면 거절
    constructor(ms) { this.ms = ms; this.last = new Map(); }
    accept(key, now) { const p = this.last.get(key); if (p !== undefined && now - p < this.ms) return false; this.last.set(key, now); return true; }
  }

  // 내 캐릭터 왼쪽 클릭: 한 번 -> 0.1초 뒤 입력창 토글 / 두 번(더블클릭 시간+30ms 안) -> 토글을 되돌리고 크기 효과
  class SelfClick {
    constructor(o) { Object.assign(this, { delayMs: 100, doubleMs: 500, schedule: (fn, ms) => setTimeout(fn, ms), clear: (k) => clearTimeout(k) }, o); this.s = null; }   // 화살표 함수로 감싸야 브라우저에서 'Illegal invocation' 이 안 남
    click(now) {
      const s = this.s;
      if (s && now - s.at <= this.doubleMs + 30) {
        this.clear(s.timer); this.clear(s.expire); this.s = null;
        if (s.applied) this.setVisible(s.initialVisible);   // 첫 클릭이 바꾼 입력창 상태를 원래대로
        this.onDouble(); return 'double';
      }
      if (s) { this.clear(s.timer); this.clear(s.expire); }
      const n = { at: now, initialVisible: !!this.getVisible(), applied: false };
      n.timer = this.schedule(() => { n.applied = true; this.setVisible(!n.initialVisible); }, this.delayMs);
      n.expire = this.schedule(() => { if (this.s === n) this.s = null; }, this.doubleMs + 31);   // 인정 시간(+30ms)이 끝난 직후에 정리
      this.s = n; return 'single';
    }
  }

  // 내 캐릭터 오른쪽 클릭: 두 번이면 true (던지기 대기 켜기)
  class RightClick {
    constructor(doubleMs = 500) { this.doubleMs = doubleMs; this.at = null; }
    press(now) { if (this.at !== null && now - this.at <= this.doubleMs) { this.at = null; return true; } this.at = now; return false; }
  }

  // 친구 캐릭터를 눌러 던질 수 있는 조건: 연결됨 + 내가 기절 중이 아님 + (보호 꺼짐 또는 대기 중)
  const throwEnabled = ({ connected, stunned, guard, armedUntil, now }) => !!connected && !stunned && (!guard || armedUntil > now);

  // 다른 사람 캐릭터가 '걷는 중'인지 판단: 위치 신호가 늦게 몰려 와도(네트워크 흔들림) 걷던 동작이 끊기지 않게,
  // 마지막으로 움직임이 있은 뒤 holdMs 동안은 계속 걷는 중으로 본다. (목표와 catchUpPx 이상 멀면 따라잡는 중이니 걷는 중)
  // 보내는 쪽이 '걷는 중'을 직접 알려 주면(syncWalk 가 true/false) 그 값을 그대로 쓴다 -> 신호가 늦게 와도 상태가 흔들리지 않음.
  // 알려 주지 않는 예전 버전이면(syncWalk 가 undefined) 위치가 움직였는지로 추측하되, 끊김에 덜 흔들리게 holdMs 를 길게 잡는다.
  const REMOTE = { holdMs: 1500, minMovePx: 0.5, catchUpPx: 6, catchUpFarPx: 14 };
  const remoteWalking = (now, lastMoveAt, d, syncWalk) => (syncWalk === undefined
    ? now - lastMoveAt < REMOTE.holdMs || Math.abs(d) > REMOTE.catchUpPx
    : !!syncWalk || Math.abs(d) > REMOTE.catchUpFarPx);                // 알려 준 상태 + (너무 멀리 뒤처졌을 때만) 따라잡는 중

  // 말풍선: 연속으로 보낸 채팅은 위로 쌓아서(최대 MAX 개) 새 말풍선이 뜬 뒤에도 조금 더 보이다가 차례로 사라진다.
  // 새 채팅이 오면 그 말풍선은 SHOW_MS 동안 보이고, 아직 남아 있던 이전 말풍선은 그 바로 뒤(위쪽일수록 STAGGER 만큼 일찍)까지 보이도록 늘려 준다.
  const BUBBLE = { SHOW_MS: 5000, MAX: 3, STAGGER: 500, FADE_MS: 350 };
  function pushBubble(list, text, style, now) {
    const alive = (list || []).filter((b) => now < b.until);
    const next = [...alive, { text, style, at: now, until: now + BUBBLE.SHOW_MS }].slice(-BUBBLE.MAX);
    const newest = next[next.length - 1];
    next.forEach((b, i) => { const age = next.length - 1 - i; if (age > 0) b.until = Math.max(b.until, newest.until - age * BUBBLE.STAGGER); });   // 이전 말풍선은 새 것보다 조금 일찍, 위쪽부터 사라짐
    return next;
  }
  // 지금 보이는 말풍선(오래된 것 -> 최신 순)과 각 투명도(사라지기 직전 FADE_MS 동안 서서히)
  const visibleBubbles = (list, now) => (list || []).filter((b) => now < b.until).map((b) => ({ ...b, alpha: Math.min(1, (b.until - now) / BUBBLE.FADE_MS) }));

  // 무적: 기절해 있는 동안 + 기절이 풀린 뒤 STUN.guardAfterMs 동안은 공격을 받지 않는다 (guardUntil 까지)
  const isGuarded = (p, now) => now < (p.guardUntil || 0);
  // ---- 넉백(기절하면서 날아가기) ----
  // 기절 직전 burstMs 안에 맞은 횟수로 세기를 정한다: 1번이면 level 0, 기절에 필요한 횟수(STUN.hits)를 전부 그 안에 맞았으면 level 1.
  // 날아가는 거리 = 화면 너비 * (minFrac ~ maxFrac), level 이 클수록 훨씬 멀리. maxFrac 가 1 보다 커서 최대로 맞으면 반대쪽 벽에 부딪혀 튕긴다.
  // 방향은 맞은 방향(공격이 날아온 쪽)의 반대. 마찰은 일정한 감속(decelPerW * 화면너비 px/s^2).
  const KB = { burstMs: 3000, minFrac: 0.04, maxFrac: 1.3, curve: 1.5, decelPerW: 1.2, restitution: 0.55, stopSpeed: 30, wallPad: 24, maxSubstep: 0.008 };
  function knockInfo(log, now) {
    const burst = log.filter((h) => now - h.t <= KB.burstMs), n = burst.length, sum = burst.reduce((a, h) => a + h.dir, 0), last = log[log.length - 1];
    return { n, level: Math.min(1, Math.max(0, (n - 1) / (STUN.hits - 1))), dir: Math.sign(sum) || (last && last.dir) || 1 };
  }
  const knockDistance = (level, W) => (KB.minFrac + (KB.maxFrac - KB.minFrac) * Math.pow(level, KB.curve)) * W;            // 벽이 없다면 날아갈 거리(px)
  function startKnock(p, W, knock = p.knock) {
    if (!knock) return null; const a = KB.decelPerW * W, v0 = Math.sqrt(2 * a * knockDistance(knock.level, W));
    p.kb = { v: knock.dir * v0, a, v0: Math.abs(v0), spin: 0, bounces: 0, level: knock.level, n: knock.n }; return p.kb;
  }
  // dt 만큼 날아가는 계산(아주 빠르면 벽을 건너뛰지 않게 잘게 쪼갬). 돌려주는 값: {bounced: 이번에 벽에 부딪힌 횟수, impact: 가장 센 충돌 속도, done: 끝났는지}
  function stepKnock(p, dt, W) {
    const kb = p.kb; if (!kb) return { bounced: 0, impact: 0, done: true }; let t = dt, bounced = 0, impact = 0; const minX = KB.wallPad, maxX = W - KB.wallPad;
    while (t > 1e-9 && p.kb) {
      const h = Math.min(t, KB.maxSubstep); t -= h; const sp = Math.abs(kb.v), dv = kb.a * h;
      kb.v = sp <= dv ? 0 : kb.v - Math.sign(kb.v) * dv; p.x += kb.v * h;
      if ((p.x < minX && kb.v < 0) || (p.x > maxX && kb.v > 0)) { p.x = p.x < minX ? minX : maxX; impact = Math.max(impact, Math.abs(kb.v)); kb.v = -kb.v * KB.restitution; bounced++; kb.bounces++; }
      else if (p.x < minX) p.x = minX; else if (p.x > maxX) p.x = maxX;
      if (Math.abs(kb.v) < KB.stopSpeed) p.kb = null;
    }
    return { bounced, impact, done: !p.kb };
  }

  // 맞음을 기록하고 기절 여부 판정. 무적이면 'blocked'(아무 일도 없음), 아니면 'hit', 10번째면 'stun'(기절 시작 + 무적 시작 + 넉백 정보 p.knock).
  // dir: 공격이 날아온 방향(+1 = 왼쪽에서 오른쪽으로 날아옴 -> 오른쪽으로 밀림, -1 = 반대). 모르면 0.
  function registerHit(p, now, dir = 0) {
    if (isGuarded(p, now)) return 'blocked';
    p.hitLog = (p.hitLog || []).filter((h) => now - h.t < STUN.windowMs); p.hitLog.push({ t: now, dir: Math.sign(dir) || 0 }); p.hits = p.hitLog.map((h) => h.t);
    if (p.hitLog.length >= STUN.hits) { p.knock = knockInfo(p.hitLog, now); p.stunUntil = now + STUN.durationMs; p.guardUntil = p.stunUntil + STUN.guardAfterMs; p.hitLog = []; p.hits = []; return 'stun'; }
    return 'hit';
  }

  // 캐릭터가 겹쳐서 말풍선/이름표가 안 보일 때: 겹친 순간 서로 빨리 걸어서(평소의 speedMul 배) 벗어난다.
  // 겹침 판단은 두 중심의 거리가 (폭 합/2)*비율 보다 작을 때. 들어갈 땐 enterRatio, 벗어났다고 볼 땐 exitRatio(더 멀리) 로 해서 경계에서 왔다갔다 하지 않게 한다.
  const ESCAPE = { speedMul: 3, enterRatio: 0.7, exitRatio: 1.05, margin: 6, edge: 20 };
  const overlapping = (ax, aw, bx, bw, ratio) => Math.abs(ax - bx) < (aw + bw) / 2 * ratio;
  // x,w: 내 캐릭터 위치/폭, others: [{id,x,w}] (움직이지 못하는 졸고 있는 캐릭터도 포함 -> 내가 비켜줌), W: 화면 너비, escaping: 지금 벗어나는 중인지
  function escapePlan({ x, w, others, W, escaping, myId }) {
    const ratio = escaping ? ESCAPE.exitRatio : ESCAPE.enterRatio;
    const hit = (others || []).filter((o) => overlapping(x, w, o.x, o.w, ratio));
    if (!hit.length) return { escape: false };
    const near = hit.reduce((a, b) => (Math.abs(x - a.x) <= Math.abs(x - b.x) ? a : b));
    let dir = Math.sign(x - near.x) || (String(myId) < String(near.id) ? -1 : 1);                 // 완전히 같은 자리면 id 순서로 서로 반대쪽으로 (둘이 같은 방향으로 가지 않게)
    const room = dir > 0 ? W - ESCAPE.edge - x : x - ESCAPE.edge; if (room < 30) dir = -dir;       // 화면 끝에 막히면 반대쪽으로
    const target = Math.min(W - ESCAPE.edge, Math.max(ESCAPE.edge, near.x + dir * ((w + near.w) / 2 * ESCAPE.exitRatio + ESCAPE.margin)));
    return { escape: true, dir, target };
  }

  root.Interaction = { KB, knockInfo, knockDistance, startKnock, stepKnock, ESCAPE, escapePlan, overlapping, isGuarded, registerHit, PULSE, THROW, HIT_MS, STUN, REMOTE, BUBBLE, pulseScale, remoteWalking, pushBubble, visibleBubbles, Cooldown, SelfClick, RightClick, throwEnabled };
  if (typeof module !== 'undefined') module.exports = root.Interaction;
})(typeof window !== 'undefined' ? window : globalThis);
