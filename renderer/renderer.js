const { BUBBLES, THROWABLES, draw, height, width, bounds } = Sprites;
const IA = Interaction;                      // SIDEY의 조작 규칙 (shared/interaction.js)
const cfg = window.api.settings;             // {uid, nickname, character, bubble, throwable, activeCode, showOffline, quietMode, throwGuard, serverUrl}
const cv = document.getElementById('c'), g = cv.getContext('2d');
let W, H;
function fit() { W = cv.width = innerWidth; H = cv.height = innerHeight; g.imageSmoothingEnabled = false; }
fit(); addEventListener('resize', fit);

const GROUND = () => H - 8;
const SPEED = 24;                                    // 걷는 속도(px/초) - SIDEY처럼 느긋하게
const DOUBLE_MS = cfg.doubleClickMs || 500;          // 더블클릭 인정 시간 (Windows 기본값)
const bubbleStyle = (id) => BUBBLES.find((b) => b.id === id) || BUBBLES[0];
const myThrow = (THROWABLES.find((t) => t.id === cfg.throwable) || THROWABLES[0]).emoji;
const showOffline = cfg.showOffline !== false;
let quiet = !!cfg.quietMode;                         // 조용히 모드: 말풍선/입력 중 표시를 숨김
window.api.onQuiet((v) => (quiet = v));

// ---------- 상태 ----------
const peers = new Map();   // id -> 캐릭터 (오프라인 멤버는 id가 'off:uid')
const shots = [];
let myId = null, myState = 'online', status = '', stop = false;

function addPeer(o, me) {
  peers.set(o.id, { id: o.id, uid: o.uid, name: o.name, look: o.look, state: o.state || 'online', x: me ? Math.random() * W : W / 2, rx: 0.5, dir: 1,
    walking: false, wait: 0, tx: null, bubble: null, typing: 0, hitAt: 0, throwAt: 0, stunUntil: 0, pulseAt: 0, hits: [], bw: 0, bh: 0, init: !!me });
}
const hasUid = (uid) => [...peers.values()].some((p) => p.uid === uid);
function addOffline(o) {
  if (!showOffline || hasUid(o.uid)) return;
  addPeer({ id: 'off:' + o.uid, uid: o.uid, name: o.name, look: o.look, state: 'offline' }); const p = peers.get('off:' + o.uid); p.x = 40 + Math.random() * (W - 80); p.init = true;
}

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
  else if (m.t === 'pos') { const p = peers.get(m.id); if (!p) return; p.rx = m.x; if (!p.init) { p.x = m.x * W; p.init = true; } }
  else if (m.t === 'chat') { const p = peers.get(m.id); if (p) { p.typing = 0; p.bubble = { text: m.text, style: bubbleStyle(m.bubble), until: now + 5000 }; } }
  else if (m.t === 'throw') {
    const a = peers.get(m.from), b = peers.get(m.to); if (!a || !b) return;
    a.throwAt = now; a.dir = Math.sign(b.x - a.x) || a.dir;                       // 던지는 모션 (받는 쪽을 바라봄)
    shots.push({ x0: a.x, y0: GROUND() - (a.bh || height(a.look)) / 2, to: b, item: m.item || THROWABLES[0].emoji, start: now + 130, dur: 650 });
  }
}

// ---------- 효과음 ----------
const AC = new (window.AudioContext || window.webkitAudioContext)();
function boop() {
  const o = AC.createOscillator(), v = AC.createGain();
  o.type = 'square'; o.frequency.setValueAtTime(260, AC.currentTime); o.frequency.exponentialRampToValueAtTime(90, AC.currentTime + 0.14);
  v.gain.setValueAtTime(0.08, AC.currentTime); v.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 0.16);
  o.connect(v).connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.17);
}
function onHit(p, now) {                       // 맞음: 모션 + 기절 판정 (10초 안에 10번 -> 6초 기절)
  p.hitAt = now; boop();
  p.hits = p.hits.filter((t) => now - t < IA.STUN.windowMs); p.hits.push(now);
  if (p.hits.length >= IA.STUN.hits) { p.stunUntil = now + IA.STUN.durationMs; p.hits = []; }
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
    if (Math.abs(x - p.x) < (p.bw || width(p.look)) / 2 + 4 && y > GROUND() - (p.bh || height(p.look)) && y < GROUND()) return p;
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

let last = performance.now(), lastPos = 0, lastRegions = 0, lastRegionKey = '', lastRegionSend = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  g.clearRect(0, 0, W, H);

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
      p.walking = Math.abs(d) > 1 && !frozen(p, now); if (Math.abs(d) > 1 && p.state === 'online') p.dir = Math.sign(d);
      p.x += d * Math.min(1, dt * 8);
    }
  }
  const me = peers.get(myId);
  if (me && now - lastPos > 200) { lastPos = now; send({ t: 'pos', x: me.x / W }); }

  for (const p of peers.values()) {
    const [state, t] = motionOf(p, now), base = bounds(p.look, state, t);
    let scale = 1;                                  // 크기 효과: 1배 -> 7배 -> 1배 (오프라인은 제외)
    if (p.state !== 'offline' && p.pulseAt) { const el = (now - p.pulseAt) / 1000; if (el > IA.PULSE.up + IA.PULSE.down) p.pulseAt = 0; else scale = IA.pulseScale(el); }
    scale = Math.min(scale, Math.max(1, (H - 34) / Math.max(1, base.h)));      // 화면 위로 잘리지 않게
    p.bw = base.w * scale; p.bh = base.h * scale;
    g.globalAlpha = p.state === 'offline' ? 0.75 : 1;
    const top = draw(g, p.look, p.x, GROUND(), { state, t, flip: p.dir < 0, scale });
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
      const w = (p.bw || width(p.look)) + 8, h = (p.bh || height(p.look)) + 4; rects.push({ x: Math.round(p.x - w / 2), y: Math.round(GROUND() - h + 2), w: Math.round(w), h: Math.round(h) });
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
    const s = shots[i]; if (now < s.start) continue;
    const t = (now - s.start) / s.dur;
    if (t >= 1) { onHit(s.to, now); shots.splice(i, 1); continue; }
    const tx = s.to.x, ty = GROUND() - (s.to.bh || height(s.to.look)) / 2;
    g.font = '22px serif'; g.textAlign = 'center';
    g.fillText(s.item, s.x0 + (tx - s.x0) * t, s.y0 + (ty - s.y0) * t - Math.sin(Math.PI * t) * 70);
  }
  if (status) {                                    // 연결 상태 안내: 연결 중 = 주황, 그 외 = 빨강
    g.fillStyle = status.startsWith('연결 중') ? DOT.away : DOT.offline; g.beginPath(); g.arc(14, H - 12, 4, 0, 7); g.fill();
    g.font = '12px system-ui, sans-serif'; g.textAlign = 'left'; g.fillStyle = '#2b2d42'; g.fillText(status, 24, H - 8);
  }
  requestAnimationFrame(frame);
}
connect(); requestAnimationFrame(frame);
