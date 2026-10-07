const { BUBBLES, THROWABLES, findThrowable, draw, drawItem, itemInfo, height, width, bounds } = Sprites;
const PJ = Projectiles;                      // 던지기 아이템 경로 계산 (shared/projectiles.js)
const IA = Interaction;
const SIZE = Math.min(1.6, Math.max(0.7, Number(window.api.settings.sizeScale) || 1));   // 내 화면의 캐릭터 크기 배율 (설정에서 70%~160%)                      // SIDEY의 조작 규칙 (shared/interaction.js)
const cfg = window.api.settings;             // {uid, nickname, character, bubble, throwable, activeCode, showOffline, quietMode, throwGuard, serverUrl}
const cv = document.getElementById('c'), g = cv.getContext('2d');
let W, H;
function fit() { W = cv.width = innerWidth; H = cv.height = innerHeight; g.imageSmoothingEnabled = false; }
fit(); addEventListener('resize', fit);

const GROUND = () => H - 8;
const SPEED = 24;                                    // 걷는 속도(px/초) - SIDEY처럼 느긋하게
const DOUBLE_MS = cfg.doubleClickMs || 500;          // 더블클릭 인정 시간 (Windows 기본값)
const bubbleStyle = (id) => BUBBLES.find((b) => b.id === id) || BUBBLES[0];
const myT = THROWABLES.find((t) => t.id === cfg.throwable) || THROWABLES[0];
const myThrow = myT.sprite ? myT.id : myT.emoji;            // 던질 때 서버로 보내는 값: 도트 아이템은 id, 이모지 아이템은 이모지
const showOffline = cfg.showOffline !== false;
let soundOn = cfg.soundOn !== false;                // 효과음 켜기/끄기 (설정 또는 트레이 메뉴)
window.api.onSound((v) => (soundOn = v));
let quiet = !!cfg.quietMode;                         // 조용히 모드: 말풍선/입력 중 표시를 숨김
window.api.onQuiet((v) => (quiet = v));

// ---------- 상태 ----------
const peers = new Map();   // id -> 캐릭터 (오프라인 멤버는 id가 'off:uid')
const shots = [];          // 날아가는 아이템
const fx = [];             // 폭발/불꽃/파편 같은 효과
let shakeUntil = 0;        // 폭발 때 화면이 살짝 흔들리는 시간
let myId = null, myState = 'online', status = '', stop = false;

function addPeer(o, me) {
  peers.set(o.id, { id: o.id, uid: o.uid, name: o.name, look: o.look, state: o.state || 'online', x: me ? Math.random() * W : W / 2, rx: 0.5, dir: 1,
    walking: false, wait: 0, tx: null, bubble: null, typing: 0, hitAt: 0, throwAt: 0, stunUntil: 0, pulseAt: 0, hits: [], bw: 0, bh: 0, lastMoveAt: -1e9, sc: 1,
    equip: me ? cfg.throwable : null, gunUntil: 0, aimUntil: 0, aimTarget: null, recoilAt: 0, init: !!me });
}
const hasUid = (uid) => [...peers.values()].some((p) => p.uid === uid);
function addOffline(o) {
  if (!showOffline || hasUid(o.uid)) return;
  addPeer({ id: 'off:' + o.uid, uid: o.uid, name: o.name, look: o.look, state: 'offline' }); const p = peers.get('off:' + o.uid); p.x = 40 + Math.random() * (W - 80); p.init = true;
}

addEventListener('resize', () => { for (const p of peers.values()) p.x = Math.min(p.x, Math.max(20, W - 20)); });   // 모니터를 바꾸는 등 화면 폭이 줄어도 캐릭터가 화면 밖에 남지 않게

// ---------- 네트워크 ----------
let ws;
const send = (m) => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));
function connect() {
  if (!cfg.activeCode) { status = '트레이 아이콘 → 설정에서 그룹을 만들거나 참여해 주세요'; return; }
  status = '연결 중…';
  ws = new WebSocket(cfg.serverUrl);
  ws.onopen = () => { status = ''; send({ t: 'join', uid: cfg.uid, code: cfg.activeCode }); };
  ws.onclose = () => { myId = null; peers.clear(); if (!stop) { status = '연결 중…'; setTimeout(connect, 3000); } };
  ws.onmessage = (e) => handle(JSON.parse(e.data));
}
function handle(m) {
  const now = performance.now();
  if (m.t === 'welcome') {
    myId = m.id; addPeer({ id: m.id, uid: cfg.uid, name: cfg.nickname || '나', look: cfg.character, state: myState }, true);
    m.peers.forEach((p) => addPeer(p)); (m.offline || []).forEach(addOffline);
    if (myState === 'away') send({ t: 'presence', state: 'away' });
  }
  else if (m.t === 'peer') { peers.delete('off:' + m.uid); addPeer(m); }
  else if (m.t === 'leave') { const p = peers.get(m.id); peers.delete(m.id); if (p && m.member !== false) addOffline(p); }   // 나가면 '오프라인'으로 누움
  else if (m.t === 'member') addOffline(m);
  else if (m.t === 'gone') peers.delete('off:' + m.uid);
  else if (m.t === 'peerupdate') { for (const p of peers.values()) if (p.uid === m.uid) { p.name = m.name; p.look = m.look; } }
  else if (m.t === 'presence') { const p = peers.get(m.id); if (p) p.state = m.state; }
  else if (m.t === 'typing') { const p = peers.get(m.id); if (p) p.typing = m.on ? now + 4000 : 0; }
  else if (m.t === 'pulse') { const p = peers.get(m.id); if (p) acceptPulse(p, now); }
  else if (m.t === 'err' || m.t === 'kicked') {
    status = m.msg || '연결이 종료됐어요.'; stop = true;
    if (m.gone) window.api.forgetGroup(cfg.activeCode);   // gone: 이 그룹에서 완전히 빠짐
    if (m.t === 'err') window.api.refreshGroups();         // 접속 실패: 서버가 비어 있을 수 있으니 바로 확인해서 복원 (성공하면 자동으로 다시 접속)
  }
  else if (m.t === 'pos') {
    const p = peers.get(m.id); if (!p) return; const dx = (m.x - p.rx) * W; p.rx = m.x;
    if (!p.init) p.x = m.x * W, p.init = true;
    if (m.e !== undefined) p.equip = String(m.e).slice(0, 12);                                   // 상대가 들고 있는(고른) 던지기 아이템 (총이면 들고 있는 모습)
    if (m.w !== undefined) { p.syncWalk = !!m.w; p.dir = m.d === -1 ? -1 : 1; }                // 보내는 쪽이 알려 준 상태를 그대로 사용
    else if (Math.abs(dx) > IA.REMOTE.minMovePx) { p.lastMoveAt = now; p.dir = dx > 0 ? 1 : -1; }   // (예전 버전) 위치 변화로 추측
  }
  else if (m.t === 'chat') { const p = peers.get(m.id); if (p) { p.typing = 0; p.bubble = { text: m.text, style: bubbleStyle(m.bubble), until: now + 5000 }; } }
  else if (m.t === 'throw') {
    const a = peers.get(m.from), b = peers.get(m.to); if (!a || !b) return;
    a.throwAt = now; a.dir = Math.sign(b.x - a.x) || a.dir;                       // 던지는 모션 (받는 쪽을 바라봄)
    spawnShot(findThrowable(m.item), m.item, a, b, now);
  }
}

// ---------- 효과음 (WebAudio 로 합성) ----------
const AC = new (window.AudioContext || window.webkitAudioContext)();
function tone(f0, f1, dur, type, gain) {
  if (!soundOn) return;
  const o = AC.createOscillator(), v = AC.createGain(), t = AC.currentTime; o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  v.gain.setValueAtTime(gain, t); v.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(v).connect(AC.destination); o.start(); o.stop(t + dur + 0.02);
}
function noise(dur, f0, f1, gain, type = 'lowpass') {
  if (!soundOn) return;
  const n = Math.floor(AC.sampleRate * dur), buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = AC.createBufferSource(), f = AC.createBiquadFilter(), v = AC.createGain(), t = AC.currentTime; src.buffer = buf; f.type = type;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur); v.gain.setValueAtTime(gain, t); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(v).connect(AC.destination); src.start();
}
const boop = () => tone(260, 90, 0.14, 'square', 0.08);
const SND = {
  boop,
  boom: () => { noise(0.6, 1400, 90, 0.5); tone(110, 35, 0.5, 'sine', 0.35); },                                   // 폭발: 쿵 + 우르릉
  shot: () => { noise(0.09, 3500, 700, 0.35, 'bandpass'); tone(800, 160, 0.1, 'square', 0.12); },                 // 총소리
  tick: () => tone(1200, 400, 0.06, 'square', 0.08),                                                              // 총알이 맞는 소리
  zap: () => { tone(500, 1500, 0.28, 'triangle', 0.12); noise(0.2, 6000, 1500, 0.08, 'highpass'); },              // 마법이 터지는 소리
  whoosh: () => noise(0.5, 400, 3000, 0.1, 'bandpass'),                                                           // 미사일이 날아가는 소리
  splat: () => { noise(0.14, 700, 200, 0.3); tone(170, 70, 0.12, 'sine', 0.2); },                                 // 철퍼덕
};
function onHit(p, now, snd = 'boop') {          // 맞음: 모션 + 소리 + 기절 판정 (10초 안에 10번 -> 6초 기절)
  p.hitAt = now; (SND[snd] || boop)();
  p.hits = p.hits.filter((t) => now - t < IA.STUN.windowMs); p.hits.push(now);
  if (p.hits.length >= IA.STUN.hits) { p.stunUntil = now + IA.STUN.durationMs; p.hits = []; }
}

// ---------- 던지기 아이템: 날아가기 / 총 / 효과 ----------
const rad = (d) => d * Math.PI / 180, rnd = (a, b) => a + Math.random() * (b - a);
const center = (p) => ({ x: p.x, y: GROUND() - (p.bh || height(p.look) * SIZE) / 2 });
function gunPivot(p) { return { x: p.x + (p.dir >= 0 ? 1 : -1) * (p.bw || width(p.look) * SIZE) * 0.22, y: GROUND() - (p.bh || height(p.look) * SIZE) * 0.40 }; }   // 총을 쥔 손 위치(몸 앞쪽)
function gunAim(p, now) {                                                      // 총이 향하는 각도: 쏘는 중이면 대상 쪽, 평소엔 보는 방향
  if (now < p.aimUntil && p.aimTarget) { const pv = gunPivot(p), t = center(p.aimTarget); return PJ.aimAngle(pv.x, pv.y, t.x, t.y); }
  return p.dir >= 0 ? 0 : Math.PI;
}
function gunMuzzle(p, now) { const info = itemInfo('gun'), pv = gunPivot(p); return PJ.gunPoint(pv.x, pv.y, info.pivot, info.muzzle, 2 * (p.sc || 1), rad(info.forward), gunAim(p, now)); }
function drawHeldGun(p, now) {
  const info = itemInfo('gun'), s = 2 * (p.sc || 1), pv = gunPivot(p), aim = gunAim(p, now), since = now - p.recoilAt;
  const rec = since >= 0 && since < 120 ? -(1 - since / 120) * 5 * (p.sc || 1) : 0;                                  // 쏘는 순간 반동
  const flip = Math.cos(aim) < 0, ang = flip ? Math.PI - aim : aim;
  g.save(); g.translate(pv.x + Math.cos(aim) * rec, pv.y + Math.sin(aim) * rec); if (flip) g.scale(-1, 1); g.rotate(ang - rad(info.forward));
  drawItem(g, 'gun', 0, 0, { s, ax: info.pivot[0], ay: info.pivot[1] }); g.restore();
}
function spawnShot(T, item, a, b, now) {
  const kind = T.kind || 'arc', c = center(a), t = center(b);
  const s = { kind, sprite: T.sprite || null, emoji: T.sprite ? null : (T.emoji || item), to: b, start: now + PJ.RELEASE_MS, x0: c.x, y0: c.y, spin: (Math.random() < 0.5 ? -1 : 1) * rnd(4, 7), fired: false };
  if (kind === 'gun') {
    a.gunUntil = now + 2500; a.aimTarget = b; a.aimUntil = now + 480; a.recoilAt = now + PJ.RELEASE_MS;               // 총을 대상 쪽으로 들고 쏨
    const mz = gunMuzzle(a, now); s.x0 = mz.x; s.y0 = mz.y; s.dur = PJ.bulletMs(mz.x, mz.y, t.x, t.y);
  } else if (kind === 'missile') {
    s.dur = PJ.FLIGHT.missile; const amp = PJ.curveAmp(c.x, c.y, t.x, t.y) * rnd(0.85, 1.15), cc = PJ.curveControl(c.x, c.y, t.x, t.y, amp, rnd(-0.2, 0.2)); s.cx = cc.cx; s.cy = cc.cy;
  } else s.dur = PJ.FLIGHT[kind] || PJ.FLIGHT.arc;
  shots.push(s);
}
function parts(x, y, n, colors, o = {}) {                                        // 사방으로 튀는 네모 파편들
  for (let i = 0; i < n; i++) { const an = o.angle !== undefined ? o.angle + rnd(-(o.spread || 0.6), o.spread || 0.6) : rnd(0, Math.PI * 2), sp = rnd(o.min || 60, o.max || 220);
    fx.push({ type: 'dot', x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - (o.up || 0), gy: o.gy === undefined ? 420 : o.gy, size: o.size || (Math.random() < 0.5 ? 4 : 6), color: colors[(Math.random() * colors.length) | 0], start: performance.now(), dur: rnd(o.dmin || 300, o.dmax || 560) }); }
}
function impact(s, t, now) {
  if (s.kind === 'bomb') { onHit(s.to, now, 'boom'); fx.push({ type: 'boom', x: t.x, y: t.y, start: now, dur: 620, seed: Math.random() * 6 }); parts(t.x, t.y, 14, ['#3a3a40', '#ff9f1c', '#ffd23f', '#8d99ae'], { min: 90, max: 300, up: 90, dmin: 450, dmax: 800 }); shakeUntil = now + 320; }
  else if (s.kind === 'missile') { onHit(s.to, now, 'zap'); parts(t.x, t.y, 18, ['#9b8cff', '#d7bfff', '#ffffff', '#7a6bff'], { min: 80, max: 260, gy: 0, dmin: 350, dmax: 600 }); fx.push({ type: 'ring', x: t.x, y: t.y, start: now, dur: 380, color: '#b9a9ff' }); }
  else if (s.kind === 'gun') { onHit(s.to, now, 'tick'); parts(t.x, t.y, 8, ['#fff6b0', '#ffd23f', '#ffffff'], { min: 80, max: 240, gy: 200, dmin: 160, dmax: 300, size: 4 }); }
  else if (s.sprite === 'poop') { onHit(s.to, now, 'splat'); parts(t.x, t.y, 12, ['#b47449', '#9e643c', '#915a35'], { min: 60, max: 200, up: 70, dmin: 350, dmax: 600 }); }
  else onHit(s.to, now, 'boop');
}
function drawFx(f, now) {                                                          // false 를 돌려주면 끝난 효과
  const t = (now - f.start) / f.dur; if (t >= 1) return false; const q = (v) => Math.round(v / 4) * 4;                // 도트 느낌으로 4px 격자에 맞춤
  if (f.type === 'dot') { const el = (now - f.start) / 1000; g.globalAlpha = 1 - t; g.fillStyle = f.color; g.fillRect(q(f.x + f.vx * el), q(f.y + f.vy * el + 0.5 * f.gy * el * el), f.size, f.size); g.globalAlpha = 1; }
  else if (f.type === 'boom') {                                                    // 도트 폭발: 노랑->주황->빨강->연기, 안쪽부터 사라지는 별 모양
    const R = (16 + 74 * Math.sqrt(t)) * SIZE, cell = 4; g.globalAlpha = 1 - Math.max(0, (t - 0.55) / 0.45);
    for (let gx = -R; gx <= R; gx += cell) for (let gy = -R; gy <= R; gy += cell) {
      const d = Math.hypot(gx, gy), an = Math.atan2(gy, gx), rr = R * (0.8 + 0.25 * Math.sin(5 * an + f.seed)); if (d > rr) continue; if (t > 0.5 && d < rr * (t - 0.5) * 1.4) continue;
      const k = d / rr; g.fillStyle = k < 0.3 ? '#fff3b0' : k < 0.55 ? '#ffb703' : k < 0.8 ? '#fb5607' : '#5c3a2e'; g.fillRect(q(f.x + gx), q(f.y + gy), cell, cell);
    } g.globalAlpha = 1;
  } else if (f.type === 'ring') { g.globalAlpha = 1 - t; g.strokeStyle = f.color; g.lineWidth = 4; g.beginPath(); g.arc(f.x, f.y, 10 + 60 * t, 0, 7); g.stroke(); g.globalAlpha = 1; }
  else if (f.type === 'flash') { g.globalAlpha = 1 - t; g.fillStyle = '#fff6b0'; const r = 6 + 10 * (1 - t); g.save(); g.translate(f.x, f.y); g.rotate(f.angle); g.fillRect(0, -3, r * 2, 6); g.fillRect(0, -r / 2, r, r); g.fillStyle = '#ff9f1c'; g.fillRect(4, -2, r * 1.4, 4); g.restore(); g.globalAlpha = 1; }
  return true;
}

// ---------- 조작 (SIDEY와 같은 규칙) ----------
const pulseCd = new IA.Cooldown(IA.PULSE.cooldownMs), throwCd = new IA.Cooldown(IA.THROW.cooldownMs);
function acceptPulse(p, now) { if (p.state === 'offline' || !pulseCd.accept(p.id, now)) return false; p.pulseAt = now; return true; }   // 크기 효과 (1초 쿨다운)
function selfPulse(now) { const me = peers.get(myId); if (me && acceptPulse(me, now)) send({ t: 'pulse' }); }

let composerOpen = false, armedUntil = 0;
window.api.onComposerVisibility((v) => (composerOpen = v));
const selfClick = new IA.SelfClick({ doubleMs: DOUBLE_MS, getVisible: () => composerOpen, setVisible: (v) => window.api.setComposer(v), onDouble: () => selfPulse(performance.now()) });
const rightClick = new IA.RightClick(DOUBLE_MS);
const selfStunned = (now) => { const me = peers.get(myId); return !!me && me.stunUntil > now; };
const throwOn = (now) => IA.throwEnabled({ connected: !!myId, stunned: selfStunned(now), guard: !!cfg.throwGuard, armedUntil, now });

const hitTest = (x, y, now) => {
  for (const p of peers.values()) {
    if (p.state === 'offline' || (p.id !== myId && !throwOn(now))) continue;                // 친구는 던질 수 있을 때만 클릭 대상 (아니면 클릭이 아래 창으로 통과)
    if (Math.abs(x - p.x) < (p.bw || width(p.look) * SIZE) / 2 + 4 && y > GROUND() - (p.bh || height(p.look) * SIZE) && y < GROUND()) return p;
  }
  return null;
};
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('mousedown', (e) => {
  const now = performance.now(), p = hitTest(e.offsetX, e.offsetY, now); if (!p) return;
  if (p.id === myId) {
    if (e.button === 0) selfClick.click(now);                                                  // 한 번: 입력창 / 두 번: 크기 효과
    else if (e.button === 2 && cfg.throwGuard && rightClick.press(now)) armedUntil = now + IA.THROW.armMs;   // 오른쪽 두 번: 10초 동안 던지기 대기
  } else if (e.button === 0 && throwCd.accept('throw', now)) { AC.resume(); armedUntil = 0; send({ t: 'throw', to: p.id, item: myThrow }); }
});

// 입력창(별도 창)과의 연결: 메시지 보내기 / 입력 중 표시
let typingOn = false, typingTimer = 0;
function setTyping(on) {
  clearTimeout(typingTimer); if (on) typingTimer = setTimeout(() => setTyping(false), 4000);
  if (on !== typingOn) { typingOn = on; send({ t: 'typing', on }); const me = peers.get(myId); if (me) me.typing = on ? performance.now() + 4000 : 0; }
}
window.api.onComposerTyping(setTyping);
window.api.onChatSend((text) => { const ok = !!myId && ws && ws.readyState === 1; if (ok) { send({ t: 'chat', text, bubble: cfg.bubble }); setTyping(false); } window.api.chatResult(ok); });
window.api.onPresence((s) => { myState = s; send({ t: 'presence', state: s }); const me = peers.get(myId); if (me) me.state = s; });

// ---------- 그리기 ----------
const DOT = { online: '#34c759', away: '#ff9f0a', offline: '#ff453a' };   // 초록=온라인, 주황=자리 비움, 빨강=오프라인
function nameplate(p, top) {                         // SIDEY처럼: [●] (이름 · 나) 알약
  const label = p.name + (p.id === myId ? ' · 나' : '');
  g.font = '600 12px system-ui, sans-serif';
  const pw = Math.ceil(g.measureText(label).width) + 18, h = 20, gap = 5, dotR = 4, total = dotR * 2 + gap + pw;
  const x0 = Math.min(W - total - 4, Math.max(4, p.x - total / 2)), y = top - 6 - h;
  g.fillStyle = 'rgba(36,40,48,0.9)'; g.beginPath(); g.roundRect(x0 + dotR * 2 + gap, y, pw, h, 8); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(label, x0 + dotR * 2 + gap + pw / 2, y + 14.5);
  g.fillStyle = DOT[p.state] || DOT.online; g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(x0 + dotR, y + h / 2, dotR, 0, 7); g.fill(); g.stroke();
}
function bubble(text, cx, bottom, st) {
  g.font = '13px system-ui, sans-serif';
  const lines = []; let line = '';
  for (const w of text.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > 170 && line) { lines.push(line); line = w; } else line = t;
  }
  lines.push(line);
  const w = Math.max(...lines.map((l) => g.measureText(l).width)) + 16, h = lines.length * 16 + 10;
  const x = Math.min(W - w - 4, Math.max(4, cx - w / 2)), y = bottom - h - 8;
  g.fillStyle = st.bg; g.strokeStyle = st.border; g.lineWidth = 2;
  g.beginPath(); g.roundRect(x, y, w, h, 8); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(cx - 5, y + h); g.lineTo(cx, y + h + 7); g.lineTo(cx + 5, y + h); g.fill();
  g.fillStyle = st.text; g.textAlign = 'left';
  lines.forEach((l, i) => g.fillText(l, x + 8, y + 18 + i * 16));
}
function typingDots(cx, bottom, now) {               // 입력 중: 점 세 개가 통통
  g.fillStyle = '#fff'; g.strokeStyle = '#2b2d42'; g.lineWidth = 2;
  g.beginPath(); g.roundRect(cx - 18, bottom - 22, 36, 18, 9); g.fill(); g.stroke();
  g.fillStyle = '#2b2d42';
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cx - 9 + i * 9, bottom - 13 - Math.max(0, Math.sin(now / 150 - i)) * 3, 2, 0, 7); g.fill(); }
}
function motionOf(p, now) {                          // 지금 어떤 모션인지 (SIDEY와 같은 우선순위)
  if (p.state === 'offline') return ['offline', now];
  if (p.stunUntil > now) return ['stun', now];
  if (p.hitAt && now - p.hitAt < IA.HIT_MS) return ['hit', now - p.hitAt];
  if (p.throwAt && now - p.throwAt < 390) return ['throw', now - p.throwAt];
  if (p.state === 'away') return ['doze', now];
  return [p.walking ? 'walk' : 'idle', now];
}
const frozen = (p, now) => p.state !== 'online' || p.stunUntil > now || now - p.hitAt < IA.HIT_MS || now - p.throwAt < 390;

let last = performance.now(), lastPos = 0, sentWalk = false, lastRegions = 0, lastRegionKey = '', lastRegionSend = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  g.clearRect(0, 0, W, H); g.save();
  if (now < shakeUntil) g.translate(rnd(-4, 4), rnd(-3, 3));                  // 폭발할 때 화면이 살짝 흔들림

  for (const p of peers.values()) {
    if (p.state === 'offline') continue;
    if (p.id === myId) {                           // 내 캐릭터: 혼자 어슬렁어슬렁 (졸거나 맞는 중엔 멈춤)
      if (frozen(p, now)) p.walking = false;
      else if (p.wait > 0) { p.wait -= dt; p.walking = false; }
      else {
        if (p.tx == null) p.tx = 40 + Math.random() * (W - 80);
        const d = p.tx - p.x;
        if (Math.abs(d) < 2) { p.tx = null; p.wait = 1 + Math.random() * 4; p.walking = false; }
        else { p.dir = Math.sign(d); p.x += p.dir * SPEED * dt; p.walking = true; }
      }
    } else {                                       // 친구 캐릭터: 받은 위치로 부드럽게
      const d = p.rx * W - p.x;
      p.walking = IA.remoteWalking(now, p.lastMoveAt, d, p.syncWalk) && !frozen(p, now);          // 보내는 쪽이 알려 준 상태를 따름 (신호가 늦어도 안 흔들림)
      p.x += d * Math.min(1, dt * 8);
    }
  }
  const me = peers.get(myId);
  if (me && (now - lastPos > 200 || !!me.walking !== sentWalk)) { lastPos = now; sentWalk = !!me.walking; send({ t: 'pos', x: me.x / W, w: sentWalk ? 1 : 0, d: me.dir < 0 ? -1 : 1, e: cfg.throwable }); }   // 걷는 중 여부(w)와 방향(d)을 같이 알림

  for (const p of peers.values()) {
    const [state, t] = motionOf(p, now), b0 = bounds(p.look, state, t), base = { w: b0.w * SIZE, h: b0.h * SIZE };
    let scale = 1;                                  // 크기 효과: 1배 -> 7배 -> 1배 (오프라인은 제외)
    if (p.state !== 'offline' && p.pulseAt) { const el = (now - p.pulseAt) / 1000; if (el > IA.PULSE.up + IA.PULSE.down) p.pulseAt = 0; else scale = IA.pulseScale(el); }
    scale = Math.min(scale, Math.max(1, (H - 34) / Math.max(1, base.h)));      // 화면 위로 잘리지 않게
    p.bw = base.w * scale; p.bh = base.h * scale; p.sc = scale * SIZE;
    g.globalAlpha = p.state === 'offline' ? 0.75 : 1;
    const top = draw(g, p.look, p.x, GROUND(), { state, t, flip: p.dir < 0, scale: scale * SIZE });
    if (p.state !== 'offline' && (p.equip === 'gun' || now < p.gunUntil)) drawHeldGun(p, now);        // 저격총을 고른 캐릭터는 총을 들고 있음 (쏠 땐 대상을 겨눔)
    g.globalAlpha = 1;
    nameplate(p, top);
    if (!quiet) {
      if (p.bubble && now < p.bubble.until) bubble(p.bubble.text, p.x, top - 32, p.bubble.style);
      else if (p.typing > now) typingDots(p.x, top - 32, now);
    }
    if (state === 'doze') {                        // 졸 때: z z Z 가 위로 떠오름
      g.fillStyle = '#5b5f9a'; g.textAlign = 'left';
      for (let i = 0; i < 3; i++) { const k = ((now / 1200) + i / 3) % 1; g.globalAlpha = 1 - k; g.font = (10 + i * 3) + 'px system-ui'; g.fillText('z', p.x + 12 + k * 10, top + 6 - k * 22); }
      g.globalAlpha = 1;
    }
    if (state === 'stun') {                        // 기절: 별이 머리 위를 빙글빙글
      g.font = '12px serif'; g.textAlign = 'center';
      for (let i = 0; i < 3; i++) { const a = now / 280 + i * 2.094; g.fillText('⭐', p.x + Math.cos(a) * 16, top + 2 + Math.sin(a) * 4); }
    }
  }
  // 클릭 가능한 영역(내 캐릭터, 던질 수 있을 때의 친구 캐릭터)을 앱 본체에 알려준다 -> 본체가 마우스 위치로 클릭 통과를 제어
  if (now - lastRegions > 60) {
    lastRegions = now; const rects = [];
    for (const p of peers.values()) {
      if (p.state === 'offline' || (p.id !== myId && !throwOn(now))) continue;
      const w = (p.bw || width(p.look) * SIZE) + 8, h = (p.bh || height(p.look) * SIZE) + 4; rects.push({ x: Math.round(p.x - w / 2), y: Math.round(GROUND() - h + 2), w: Math.round(w), h: Math.round(h) });
    }
    const key = JSON.stringify(rects); if (key !== lastRegionKey || now - lastRegionSend > 1000) { lastRegionKey = key; lastRegionSend = now; window.api.setRegions(rects); }   // 바뀌었거나 1초마다 다시 보냄(혹시 놓쳐도 복구)
  }
  if (cfg.throwGuard && armedUntil > now) {        // 던지기 대기 중: 친구 캐릭터에 점선 원 + 남은 시간
    g.setLineDash([5, 4]); g.strokeStyle = '#ff9f0a'; g.lineWidth = 2;
    for (const p of peers.values()) if (p.id !== myId && p.state !== 'offline') { g.beginPath(); g.arc(p.x, GROUND() - p.bh / 2, Math.max(p.bw, p.bh) / 2 + 8, 0, 7); g.stroke(); }
    g.setLineDash([]);
    if (me) { g.font = '600 12px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ff9f0a'; g.fillText(`던질 친구를 클릭 · ${Math.ceil((armedUntil - now) / 1000)}초`, me.x, GROUND() - me.bh - 36); }
  }
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; if (now < s.start) continue; const tc = center(s.to), t = Math.min(1, (now - s.start) / s.dur);
    if (!s.fired) {                                                                // 발사/출발하는 순간
      s.fired = true;
      if (s.kind === 'gun') { SND.shot(); fx.push({ type: 'flash', x: s.x0, y: s.y0, start: now, dur: 110, angle: Math.atan2(tc.y - s.y0, tc.x - s.x0) }); }
      else if (s.kind === 'missile') SND.whoosh();
    }
    if (t >= 1) { impact(s, tc, now); shots.splice(i, 1); continue; }
    if (s.kind === 'gun') {                                                        // 총알: 일직선, 아주 빠름
      const p = PJ.linePos(s.x0, s.y0, tc.x, tc.y, t), ang = Math.atan2(tc.y - s.y0, tc.x - s.x0);
      g.save(); g.translate(p.x, p.y); g.rotate(ang); g.fillStyle = 'rgba(255,214,102,0.45)'; g.fillRect(-46, -1, 40, 2); g.fillStyle = '#ffd23f'; g.fillRect(-14, -2, 10, 4); g.fillStyle = '#fff8d0'; g.fillRect(-4, -3, 14, 6); g.restore();
    } else if (s.kind === 'missile') {                                             // 매직미사일: 곡선을 그리며 날아가고 불꽃 꼬리를 흘림
      const tt = Math.pow(t, 1.25), p = PJ.bezier(s.x0, s.y0, s.cx, s.cy, tc.x, tc.y, tt), ang = PJ.bezierAngle(s.x0, s.y0, s.cx, s.cy, tc.x, tc.y, tt);
      drawItem(g, 'missile', p.x, p.y, { s: 2 * SIZE, angle: ang - rad(itemInfo('missile').forward) });
      parts(p.x - Math.cos(ang) * 8, p.y - Math.sin(ang) * 8, 2, ['#9b8cff', '#d7bfff', '#ffffff'], { min: 5, max: 40, gy: -30, size: 4, dmin: 280, dmax: 420 });
    } else {
      const p = PJ.arcPos(s.x0, s.y0, tc.x, tc.y, t, (s.kind === 'bomb' ? 95 : 70) * SIZE);
      if (s.sprite) {
        const ang = t * s.spin * (s.kind === 'bomb' ? 0.5 : 1); drawItem(g, s.sprite, p.x, p.y, { s: 2 * SIZE, angle: ang });
        if (s.kind === 'bomb') {                                                   // 도화선 불꽃이 깜빡이며 튐
          const fu = itemInfo('bomb').fuse, it = itemInfo('bomb'), lx = (fu[0] - it.w / 2) * 2 * SIZE, ly = (fu[1] - it.h / 2) * 2 * SIZE, fxp = p.x + lx * Math.cos(ang) - ly * Math.sin(ang), fyp = p.y + lx * Math.sin(ang) + ly * Math.cos(ang);
          g.fillStyle = Math.floor(now / 70) % 2 ? '#ffd23f' : '#ff9f1c'; g.fillRect(Math.round(fxp) - 3, Math.round(fyp) - 3, 6, 6);
          if (Math.random() < 0.5) parts(fxp, fyp, 1, ['#ffd23f', '#ff9f1c', '#ffffff'], { min: 20, max: 80, gy: 100, size: 4, dmin: 150, dmax: 300 });
        }
      } else { g.font = '22px serif'; g.textAlign = 'center'; g.fillText(s.emoji, p.x, p.y); }
    }
  }
  for (let i = fx.length - 1; i >= 0; i--) if (!drawFx(fx[i], now)) fx.splice(i, 1);
  if (status) {                                    // 연결 상태 안내: 연결 중 = 주황, 그 외 = 빨강
    g.fillStyle = status.startsWith('연결 중') ? DOT.away : DOT.offline; g.beginPath(); g.arc(14, H - 12, 4, 0, 7); g.fill();
    g.font = '12px system-ui, sans-serif'; g.textAlign = 'left'; g.fillStyle = '#2b2d42'; g.fillText(status, 24, H - 8);
  }
  g.restore(); requestAnimationFrame(frame);
}
connect(); requestAnimationFrame(frame);
