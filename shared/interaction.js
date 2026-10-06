// SIDEY 앱의 조작 규칙 (앱 내부 데이터에서 읽은 값). 화면(UI)과 분리해서 순수 로직으로 두었다.
(function (root) {
  'use strict';
  // 크기 효과: 0.2초 동안 1배 -> 7배, 이어서 0.6초 동안 7배 -> 1배 (총 0.8초)
  const PULSE = { up: 0.2, down: 0.6, peak: 7.0, cooldownMs: 1000 };
  const pulseScale = (t) => (t <= PULSE.up ? 1 + (PULSE.peak - 1) * t / PULSE.up
    : t <= PULSE.up + PULSE.down ? PULSE.peak - (PULSE.peak - 1) * (t - PULSE.up) / PULSE.down : 1);
  const THROW = { cooldownMs: 500, armMs: 10000 };     // 던지기 0.5초 쿨다운 / '오른쪽 두 번 클릭' 뒤 10초 동안만 던질 수 있음
  const HIT_MS = 440, STUN = { hits: 10, windowMs: 10000, durationMs: 6000 };

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

  root.Interaction = { PULSE, THROW, HIT_MS, STUN, pulseScale, Cooldown, SelfClick, RightClick, throwEnabled };
  if (typeof module !== 'undefined') module.exports = root.Interaction;
})(typeof window !== 'undefined' ? window : globalThis);
