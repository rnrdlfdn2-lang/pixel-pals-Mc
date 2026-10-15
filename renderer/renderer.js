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
const myT = findThrowable(cfg.throwable);
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
    equip: me ? myT.id : null, gunUntil: 0, aimUntil: 0, aimTarget: null, recoilAt: 0, init: !!me });
}
const hasUid = (uid) => [...peers.values()].some((p) => p.uid === uid);
function addOffline(o) {
  if (!showOffline || hasUid(o.uid)) return;
  addPeer({ id: 'off:' + o.uid, uid: o.uid, name: o.name, look: o.look, state: 'offline' }); const p = peers.get('off:' + o.uid); p.x = 40 + Math.random() * (W - 80); p.init = true;
}

addEventListener('resize', () => { for (const p of peers.values()) p.x = Math.min(p.x, Math.max(20, W - 20)); });   // 모니터를 바꾸는 등 화면 폭이 줄어도 캐릭터가 화면 밖에 남지 않게

// ---------- 보스 상태 ----------
const Bz = Bosses;
let boss = null, clockOff = 0, xps = {};                                    // boss: 지금 나와 있는 보스 / clockOff: 서버 시계와의 차이 / xps: 그룹원 uid -> 경험치
let lks = {}, quizSaved = null, fleeFx = null;                              // lks: 차원 마왕 처치 횟수(uid -> 횟수) / quizSaved: 마왕 문제 카드를 띄우는 동안 잠깐 치워 둔 일반 퀴즈 / fleeFx: 마왕이 차원의 문으로 도망가는 연출
const lordImg = new Image(), fistImg = new Image(), mImgs = { fire: new Image(), bolt: new Image(), water: new Image() };
lordImg.src = '../shared/boss_lord.png'; fistImg.src = '../shared/lord_fist.png'; for (const k of Object.keys(mImgs)) mImgs[k].src = '../shared/m_' + k + '.png';
const bossProxy = { isBoss: true, id: 'boss', state: 'online', x: 0, cy: 0, bw: 40, bh: 40 };   // 던지기 대상으로 쓰는 보스의 현재 위치/크기
const serverNow = () => Date.now() + clockOff;
const syncClock = (n) => { if (Number.isFinite(n)) clockOff = n - Date.now(); };

// ---------- 네트워크 ----------
let ws;
const send = (m) => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));
function connect() {
  if (!cfg.activeCode) { status = '트레이 아이콘 → 설정에서 그룹을 만들거나 참여해 주세요'; return; }
  status = '연결 중…';
  ws = new WebSocket(cfg.serverUrl);
  ws.onopen = () => { status = ''; send({ t: 'join', uid: cfg.uid, code: cfg.activeCode, xp: Number((cfg.xp || {})[cfg.activeCode]) || 0, lk: Number((cfg.lk || {})[cfg.activeCode]) || 0 }); };
  ws.onclose = () => { myId = null; peers.clear(); boss = null; quiz = null; quizSaved = null; fleeFx = null; sobjs.length = 0; sNextK = null; dolls.length = 0; if (!stop) { status = '연결 중…'; setTimeout(connect, 3000); } };
  ws.onmessage = (e) => handle(JSON.parse(e.data));
}
function handle(m) {
  const now = performance.now();
  if (m.t === 'welcome') {
    myId = m.id; addPeer({ id: m.id, uid: cfg.uid, name: cfg.nickname || '나', look: cfg.character, state: myState }, true);
    m.peers.forEach((p) => addPeer(p)); (m.offline || []).forEach(addOffline);
    if (myState === 'away') send({ t: 'presence', state: 'away' });
    xps = { ...(m.xps || {}) }; const mine = Number((cfg.xp || {})[cfg.activeCode]) || 0; if (mine > (xps[cfg.uid] || 0)) xps[cfg.uid] = mine; window.api.saveXp(cfg.activeCode, xps[cfg.uid] || 0);
    lks = { ...(m.lks || {}) }; const mk = Number((cfg.lk || {})[cfg.activeCode]) || 0; if (mk > (lks[cfg.uid] || 0)) lks[cfg.uid] = mk; if (window.api.saveLordKills) window.api.saveLordKills(cfg.activeCode, lks[cfg.uid] || 0);
    boss = null; if (m.boss) { syncClock(m.boss.now); setBoss(m.boss, false, now); }
    setFx(m.fx, false, now);
  }
  else if (m.t === 'fxcfg') setFx(m, true, now);
  else if (m.t === 'sthrow') { const a = peers.get(m.from), dl = m.d ? dolls.find((q) => q.id === m.d && q.hp > 0) : null, o = m.d ? dl : sobjs.find((q) => q.k === m.k); if (a && o) { a.throwAt = now; a.dir = Math.sign(o.x - a.x) || a.dir; spawnShot(findThrowable(m.item), m.item, a, dl ? dollTgt(dl) : objTgt(o), now); } }
  else if (m.t === 'dhp') dollHp(m, now);
  else if (m.t === 'smash') { for (const k of [].concat(m.k)) { const o = sobjs.find((q) => q.k === k); sBroken.add(k); if (o) breakObj(o, now, false); } }
  else if (m.t === 'boss') { syncClock(m.boss.now); setBoss(m.boss, true, now); }
  else if (m.t === 'bhp') { if (boss && boss.id === m.id) { boss.hp = m.hp; boss.hitAt = now; const P = bossProxy; if (m.heal > 0) fx.push({ type: 'text', x: P.x + rnd(-30, 30), y: P.cy - P.bh / 2 - 30, text: `+${m.heal} 회복`, start: now, dur: 1000, color: '#6bf08a', size: 14 }); fx.push({ type: 'text', x: P.x + rnd(-24, 24), y: P.cy - P.bh / 2 - 6, text: `-${m.dmg}`, start: now, dur: 900, color: m.dmg >= 5 ? '#ffd23f' : '#ff8a8a', size: 12 + Math.min(14, m.dmg * 2) }); } }
  else if (m.t === 'bossend') endBoss(m, now);
  else if (m.t === 'bjudge') lordJudge(m, now);
  else if (m.t === 'bjres') lordRes(m, now);
  else if (m.t === 'bmiss') { if (boss && boss.id === m.id) { const P = bossProxy; fx.push({ type: 'text', x: P.x + rnd(-30, 30), y: P.cy - P.bh / 2 + 20, text: 'MISS!', start: now, dur: 900, color: '#cfd4e4', size: 20 }); parts(P.x, P.cy, 8, ['#c8a2ff', '#ffffff'], { min: 60, max: 200, gy: 0, dmin: 250, dmax: 450 }); if (!quiet) SND.whoosh(); } }
  else if (m.t === 'lhit') { const q = peers.get(m.who); if (q && boss && boss.id === m.id) lordHitFx(q, m.dir, now); }
  else if (m.t === 'quiz' || m.t === 'qprog' || m.t === 'qstart' || m.t === 'qq' || m.t === 'qa' || m.t === 'qres' || m.t === 'qend') quizMsg(m, now);
  else if (m.t === 'bthrow') { const a = peers.get(m.from); if (a && boss && !boss.dead) { a.dir = Math.sign(bossProxy.x - a.x) || a.dir; a.throwAt = now; spawnShot(findThrowable(m.item), m.item, a, bossProxy, now); } }
  else if (m.t === 'peer') { peers.delete('off:' + m.uid); addPeer(m); if (m.xp !== undefined) xps[m.uid] = m.xp; }
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
  else if (m.t === 'chat' && m.bubble === 'mega') { const p = peers.get(m.id); if (p) p.typing = 0; pushMega(p ? p.name : '누군가', m.text, now); }           // 확성기: 캐릭터 위가 아니라 화면 가운데에 크게 (이전 앱에선 그냥 말풍선으로 보임)
  else if (m.t === 'chat') { const p = peers.get(m.id); if (p) { p.typing = 0; p.bubbles = IA.pushBubble(p.bubbles, m.text, bubbleStyle(m.bubble), now); if (isShout(m.text)) p.bubbles[p.bubbles.length - 1].shout = true; } }       // 연속 채팅은 위로 쌓여서 조금 더 보임
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
  mega: () => { tone(660, 880, 0.12, 'square', 0.09); setTimeout(() => tone(880, 1320, 0.2, 'square', 0.09), 130); },                         // 확성기 알림음 (띠링)
  zap: () => { tone(500, 1500, 0.28, 'triangle', 0.12); noise(0.2, 6000, 1500, 0.08, 'highpass'); },              // 마법이 터지는 소리
  whoosh: () => noise(0.5, 400, 3000, 0.1, 'bandpass'),
  bump: (power = 0.5) => { noise(0.14, 700, 100, 0.2 + 0.3 * power); tone(140, 50, 0.12, 'sine', 0.2 + 0.25 * power); },       // 벽에 쿵
  block: () => { tone(900, 1500, 0.09, 'triangle', 0.09); tone(1800, 2400, 0.05, 'sine', 0.04); },               // 무적이라 막힌 소리 (띵)                                                           // 미사일이 날아가는 소리
  splat: () => { noise(0.14, 700, 200, 0.3); tone(170, 70, 0.12, 'sine', 0.2); },
  cannon: () => { noise(0.35, 900, 60, 0.55); tone(90, 30, 0.35, 'sine', 0.45); },                                 // 대포 발사: 쾅
  thud: () => { noise(0.1, 500, 90, 0.35); tone(120, 60, 0.1, 'square', 0.14); },                                 // 도끼가 퍽 박힘
  twang: () => { tone(420, 180, 0.12, 'triangle', 0.14); noise(0.06, 4000, 1500, 0.08, 'highpass'); },            // 활시위가 튕김
  flame: () => { noise(0.85, 2200, 500, 0.3, 'bandpass'); noise(0.85, 500, 120, 0.25); },                          // 화르륵
  slash: () => { noise(0.18, 5000, 1200, 0.35, 'highpass'); tone(1500, 500, 0.12, 'sawtooth', 0.1); setTimeout(() => tone(2400, 1200, 0.08, 'triangle', 0.08), 60); },   // 스윽 챙
  burn: () => { noise(0.3, 1500, 200, 0.3); tone(220, 80, 0.2, 'sawtooth', 0.12); },
  gat: () => { noise(0.05, 3000, 900, 0.22, 'bandpass'); tone(500, 150, 0.05, 'square', 0.07); },
  quiz: () => { tone(660, 990, 0.1, 'triangle', 0.1); setTimeout(() => tone(990, 1320, 0.14, 'triangle', 0.1), 110); },
  ok: () => { tone(880, 1320, 0.12, 'square', 0.08); setTimeout(() => tone(1320, 1760, 0.18, 'square', 0.08), 120); },
  no: () => tone(220, 110, 0.25, 'sawtooth', 0.09),
  // 뿌셔뿌셔 존: 재질마다 부서지는 소리가 다름
  sm_glass: () => { noise(0.3, 7000, 2500, 0.3, 'highpass'); [0, 40, 85, 140].forEach((d, i) => setTimeout(() => tone(2600 + i * 700, 1800 + i * 300, 0.12, 'triangle', 0.1), d)); },     // 챙그랑
  sm_plate: () => { noise(0.14, 4500, 1200, 0.32, 'bandpass'); tone(1500, 700, 0.08, 'square', 0.12); setTimeout(() => { tone(1100, 500, 0.07, 'square', 0.09); noise(0.08, 3500, 900, 0.18, 'bandpass'); }, 70); },   // 와장창 달그락
  sm_wood: () => { noise(0.12, 1200, 200, 0.45); tone(190, 80, 0.12, 'square', 0.22); setTimeout(() => { noise(0.08, 900, 200, 0.3); tone(240, 100, 0.07, 'square', 0.14); }, 60); },   // 우지직 퍽
  sm_card: () => { noise(0.22, 900, 150, 0.32, 'lowpass'); tone(130, 70, 0.14, 'sine', 0.2); },                     // 푸석
  sm_balloon: () => { noise(0.05, 9000, 3000, 0.6, 'highpass'); tone(320, 70, 0.1, 'sine', 0.35); },                // 빵!
  sm_can: () => { tone(900, 420, 0.16, 'square', 0.14); tone(1800, 900, 0.1, 'triangle', 0.08); noise(0.1, 6000, 2500, 0.22, 'highpass'); },   // 깡! 찌그러짐
  sm_melon: () => { noise(0.28, 700, 120, 0.5); tone(150, 55, 0.22, 'sine', 0.4); setTimeout(() => noise(0.12, 1800, 400, 0.22, 'bandpass'), 70); },   // 퍽! 철퍼덕
  sm_plush: () => { noise(0.16, 700, 160, 0.38); tone(180, 70, 0.14, 'sine', 0.26); tone(520, 260, 0.06, 'triangle', 0.07); },     // 푹신 퍽
  punch: () => { noise(0.2, 1800, 80, 0.6); tone(150, 40, 0.3, 'sawtooth', 0.35); tone(900, 200, 0.12, 'square', 0.12); },   // 황금 장갑 한 방                                 // 철퍼덕
};
function globalOnHit(p, now, snd = 'boop', dir = 0, power = 1) {  // 맞음: 모션 + 소리 + 기절 판정 (10초 안에 10번 -> 6초 기절, 기절 중/풀린 뒤 2초는 무적이라 안 맞음). dir: 공격이 날아온 방향
  const r = IA.registerHit(p, now, dir, power); if (r === 'blocked') return false;
  p.hitAt = now; (SND[snd] || boop)();
  if (r === 'stun') launch(p, now);               // 기절하면서 맞은 반대 방향으로 날아감 (세기 = 기절 직전 3초 안에 맞은 횟수)
  return true;
}
function launch(p, now) {                         // 모든 사람 화면에서 같은 입력으로 같은 계산을 하므로 서버 없이도 똑같이 날아감
  if (!IA.startKnock(p, W)) return; p.dir = -Math.sign(p.kb.v) || p.dir;      // 날아가는 동안 때린 쪽을 바라봄
  SND.whoosh(); parts(p.x, GROUND() - 20, 8 + Math.round(p.kb.level * 10), ['#ffffff', '#d7dbe6', '#a9b0c5'], { angle: p.kb.v > 0 ? Math.PI : 0, spread: 0.7, min: 60, max: 240, gy: 60, dmin: 250, dmax: 500 });
}
function wallFx(p, impact, now) {                 // 벽에 부딪힘: 먼지 + 소리 + 화면이 흔들림 (세게 부딪힐수록 크게)
  const side = p.x < W / 2 ? -1 : 1, power = Math.min(1, impact / 1500); SND.bump(power);
  parts(p.x + side * 8, GROUND() - 24, 6 + Math.round(power * 12), ['#ffffff', '#cfd4e4', '#ffd23f'], { angle: side < 0 ? 0 : Math.PI, spread: 1.0, min: 50, max: 120 + 260 * power, gy: 300, dmin: 250, dmax: 600 });
  fx.push({ type: 'ring', x: p.x + side * 10, y: GROUND() - 26, start: now, dur: 300, color: '#ffffff' }); shakeUntil = Math.max(shakeUntil, now + 120 + 260 * power);
}
function blockFx(t, now) {                      // 무적이라 막혔을 때: 파란 방어막 효과
  SND.block(); fx.push({ type: 'ring', x: t.x, y: t.y, start: now, dur: 320, color: '#8ecbff' });
  parts(t.x, t.y, 6, ['#8ecbff', '#ffffff', '#c9e8ff'], { min: 60, max: 160, gy: 0, dmin: 200, dmax: 380, size: 4 });
}

// ---------- 던지기 아이템: 날아가기 / 총 / 효과 ----------
const rad = (d) => d * Math.PI / 180, rnd = (a, b) => a + Math.random() * (b - a);
const center = (p) => (p.isObj ? { x: p.o.x, y: p.o.y } : p.isBoss ? { x: p.x, y: p.cy } : { x: p.x, y: GROUND() - (p.bh || height(p.look) * SIZE) / 2 });
function gunPivot(p) { return { x: p.x + (p.lx || 0) + (p.dir >= 0 ? 1 : -1) * (p.bw || width(p.look) * SIZE) * 0.22, y: GROUND() - (p.bh || height(p.look) * SIZE) * 0.40 }; }   // 총을 쥔 손 위치(몸 앞쪽)
function gunAim(p, now) {                                                      // 총이 향하는 각도: 쏘는 중이면 대상 쪽, 평소엔 보는 방향
  if (now < p.aimUntil && p.aimTarget) { const pv = gunPivot(p), t = center(p.aimTarget); return PJ.aimAngle(pv.x, pv.y, t.x, t.y); }
  return p.dir >= 0 ? 0 : Math.PI;
}
function gunMuzzle(p, now, name = 'gun', hs = 2) { const info = itemInfo(name), pv = gunPivot(p); return PJ.gunPoint(pv.x, pv.y, info.pivot, info.muzzle, hs * (p.sc || 1), rad(info.forward), gunAim(p, now)); }
function heldOf(p, now) {                                                     // 지금 들고 있는 무기: 방금 쓴 것(2.5초) 또는 고른 것 (hold 무기만)
  if (now < (p.hideHeldUntil || 0)) return null;
  if (now < (p.gunUntil || 0) && p.heldItem) return findThrowable(p.heldItem);
  const T = p.equip ? findThrowable(p.equip) : null; return T && T.hold ? T : null;
}
function drawArrow(x, y, ang, sc) {                                           // (x,y) = 화살 가운데. 도트 느낌의 화살
  const px = Math.max(2, Math.round(2 * sc)), L = 13 * px; g.save(); g.translate(x, y); g.rotate(ang);
  g.fillStyle = '#262626'; g.fillRect(-L / 2 - 2, -px / 2 - 2, L - 2 * px + 4, px + 4);
  g.fillStyle = '#d9a066'; g.fillRect(-L / 2, -px / 2, L - 3 * px, px);
  g.fillStyle = '#262626'; g.beginPath(); g.moveTo(L / 2 + 2, 0); g.lineTo(L / 2 - 3.6 * px, -1.9 * px); g.lineTo(L / 2 - 3.6 * px, 1.9 * px); g.closePath(); g.fill();
  g.fillStyle = '#b8bfca'; g.beginPath(); g.moveTo(L / 2, 0); g.lineTo(L / 2 - 3 * px, -1.4 * px); g.lineTo(L / 2 - 3 * px, 1.4 * px); g.closePath(); g.fill();
  g.fillStyle = '#f4f4f4'; g.fillRect(-L / 2 - 1, -1.5 * px, 2 * px, px); g.fillRect(-L / 2 - 1, px / 2, 2 * px, px); g.restore();
}
// 황금 장갑 펀치: 0~0.18초 팔을 뒤로 젖힘 -> 0.18~0.27초 번개처럼 휘둘러 내리침(몸도 상대 쪽으로 돌진) -> 0.27~0.4초 유지 -> 0.62초까지 제자리로
const PUNCH_MS = 620, PUNCH_HIT_MS = 250;
function lungeX(p, now) {                                                          // 화면에서만 그려지는 몸의 쏠림(실제 위치는 그대로)
  let off = 0;
  if (p.punch) { const el = now - p.punch.start; if (el >= PUNCH_MS) p.punch = null; else { const d = p.punch.dist, u = (el - 180) / 90;
    off = p.punch.dir * (el < 180 ? -10 * (el / 180) : el < 270 ? -10 + (d + 10) * u * u : el < 400 ? d : d * (1 - (el - 400) / 220)); } }
  if (p.kick) { const el = now - p.kick.start; if (el >= 200) p.kick = null; else if (el >= 0) off += p.kick.dir * 14 * (1 - el / 200) * (p.sc || 1); }                    // 대포 반동으로 뒤로 밀림
  return off;
}
function drawSlash(p, now) {                                                         // 사무라이 칼: 뒤로 번쩍 젖혔다가 대각선으로 베어 내림 + 하얀 궤적
  const el = now - p.punch.start, sg = p.punch.dir, sc = p.sc || 1, pv = gunPivot(p), info = itemInfo('katana'), hs = 1.0 * sc;
  const th = (e) => e < 180 ? -1.05 - 1.25 * Math.pow(e / 180, 2) : e < 270 ? -2.3 + 3.0 * Math.pow((e - 180) / 90, 2) : e < 400 ? 0.7 : 0.7 - 1.75 * ((e - 400) / 200);
  const R = info.w * hs * 0.9;
  if (el >= 180 && el < 480) { const e1 = Math.min(el, 280), a1 = th(e1); g.lineCap = 'round';
    for (const [w, col, al] of [[14, 'rgba(120,200,255,.45)', 1], [6, 'rgba(255,255,255,.95)', 1]]) { g.strokeStyle = col; g.lineWidth = w * sc * (1 - Math.max(0, el - 270) / 260); g.globalAlpha = al * (1 - Math.max(0, el - 300) / 180);
      g.beginPath(); for (let i = 0; i <= 10; i++) { const aa = th(Math.max(180, e1 - 90)) + (a1 - th(Math.max(180, e1 - 90))) * i / 10, qx = pv.x + sg * R * Math.cos(aa), qy = pv.y + R * Math.sin(aa); i ? g.lineTo(qx, qy) : g.moveTo(qx, qy); } g.stroke(); } g.globalAlpha = 1; }
  g.save(); g.translate(pv.x, pv.y); g.scale(sg, 1); g.rotate(th(el)); drawItem(g, 'katana', 0, 0, { s: hs, ax: info.pivot[0], ay: info.pivot[1] }); g.restore();
  return true;
}
function drawPunch(p, now) {
  if (!p.punch) return false; if (p.punch.slash) return now - p.punch.start < 600 ? drawSlash(p, now) : false; const el = now - p.punch.start; if (el >= 400) return false;
  const sg = p.punch.dir, sc = p.sc || 1, pv = gunPivot(p), R = 30 * sc, info = itemInfo('glove'), u = Math.min(1, Math.max(0, (el - 180) / 90));
  const th = (k) => el < 180 ? -2.3 * (el / 180) * (el / 180) : -2.3 * Math.pow(1 - Math.min(1, Math.max(0, k)), 2);
  const at = (k, rr) => ({ x: pv.x + sg * rr * Math.cos(th(k)), y: pv.y + rr * Math.sin(th(k)) });
  const rr = el < 180 ? R : R * (1 + 0.3 * u), opt = (k) => ({ s: 2.6 * sc, flip: sg < 0, angle: th(k) * 0.6, ax: info.pivot[0], ay: info.pivot[1] });
  if (el >= 180) {                                                                  // 휘두른 궤적(초승달) + 잔상
    g.lineCap = 'round';
    for (const [w, col] of [[10, 'rgba(255,226,122,.55)'], [4, 'rgba(255,255,255,.9)']]) { g.strokeStyle = col; g.lineWidth = w * sc; g.beginPath(); for (let i = 0; i <= 8; i++) { const q = at(u - 0.6 * (1 - i / 8), rr); i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); } g.stroke(); }
    for (let k = 3; k >= 1; k--) { const q = at(u - k * 0.12, rr); g.globalAlpha = 0.2; drawItem(g, 'glove', q.x, q.y, opt(u - k * 0.12)); }
    g.globalAlpha = 1;
  }
  const q = at(u, rr); drawItem(g, 'glove', q.x, q.y, opt(u));
  return true;
}
function drawHeld(p, now, T) {
  const info = itemInfo(T.sprite), sc = p.sc || 1, s = (T.hs || (T.sprite === 'glove' ? 1.6 : 2)) * sc, pv = gunPivot(p), since = now - p.recoilAt;
  let aim = gunAim(p, now); if (T.kind === 'staff') aim = -Math.PI / 2; if (T.kind === 'wave' && !(now < p.aimUntil && p.aimTarget)) aim = p.dir >= 0 ? -1.05 : Math.PI + 1.05;      // 칼은 평소에 어깨 위로 비스듬히 들고 있음
  if (T.kind === 'wave' && p.swingAt && now >= p.swingAt && now < p.swingAt + 360) { const u = ((now - p.swingAt) % 110) / 110, off = -1.0 + 1.9 * (1 - Math.pow(1 - u, 2)); aim += off * (Math.cos(aim) >= 0 ? 1 : -1); }       // 칼질 3번: 위에서 아래로 쓱쓱쓱
  const rec = T.kind === 'bow' ? 0 : since >= 0 && since < 140 ? -(1 - since / 140) * (T.kind === 'cannon' ? 9 : 5) * sc : 0;       // 쏘는 순간 반동
  const flip = Math.cos(aim) < 0, ang = flip ? Math.PI - aim : aim;
  g.save(); g.translate(pv.x + Math.cos(aim) * rec, pv.y + Math.sin(aim) * rec); if (flip) g.scale(-1, 1); g.rotate(ang - rad(info.forward));
  drawItem(g, T.sprite, 0, 0, { s, ax: info.pivot[0], ay: info.pivot[1] }); g.restore();
  if (T.kind === 'staff') {                                                    // 스태프 끝 보석이 빛남 (쏘는 동안 미사일 색으로 번쩍)
    const gx = pv.x + (info.muzzle[0] - info.pivot[0]) * s, gy = pv.y + (info.muzzle[1] - info.pivot[1]) * s, casting = now < p.castUntil, ci = Math.max(0, Math.min(2, Math.floor((now - (p.castAt || 0) - 300) / 400))), col = casting ? ['#ff6a3d', '#ffe14d', '#4db8ff'][ci] : '#ff5a5a', rr = (casting ? 30 + 8 * Math.sin(now / 50) : 14 + 3 * Math.sin(now / 200)) * sc;
    g.save(); g.globalCompositeOperation = 'lighter'; const gr = g.createRadialGradient(gx, gy, 0, gx, gy, rr); gr.addColorStop(0, withAlpha(col, casting ? 0.95 : 0.5)); gr.addColorStop(1, withAlpha(col, 0)); g.fillStyle = gr; g.beginPath(); g.arc(gx, gy, rr, 0, 7); g.fill(); g.restore();
  }
  if (T.kind === 'bow') {                                                      // 시위: 평소엔 곧게, 쏠 땐 화살을 걸고 뒤로 당김
    const pt = (c) => PJ.gunPoint(pv.x, pv.y, info.pivot, c, s, 0, aim), A = pt(info.tips[0]), B = pt(info.tips[1]), ux = Math.cos(aim), uy = Math.sin(aim);
    const bd = p.bowDraw, pull = bd && now < bd.release ? Math.min(1, Math.max(0, (now - bd.start) / (bd.release - bd.start))) : 0;
    const mx = (A.x + B.x) / 2 - ux * pull * 16 * sc, my = (A.y + B.y) / 2 - uy * pull * 16 * sc;
    g.strokeStyle = '#efe3c6'; g.lineWidth = 2; g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(mx, my); g.lineTo(B.x, B.y); g.stroke();
    if (bd && now >= bd.start && now < bd.release) drawArrow(mx + ux * 13 * sc, my + uy * 13 * sc, aim, sc);
  }
}
function spawnShot(T, item, a, b, now) {
  const kind = T.kind || 'arc', c = center(a), t = center(b);
  const s = { kind, sprite: T.sprite || null, emoji: T.sprite ? null : (T.emoji || item), to: b, start: now + PJ.RELEASE_MS, x0: c.x, y0: c.y, spin: (Math.random() < 0.5 ? -1 : 1) * rnd(4, 7), fired: false };
  s.power = T.power || 1; s.T = T; s.fromMe = a.id === myId; s.tier = Bz.auraTier(Bz.levelInfo(xps[a.uid] || 0).lv);
  if (kind === 'gun' || kind === 'cannon') {
    a.heldItem = T.id; a.gunUntil = now + 2500; a.aimTarget = b; a.aimUntil = now + (kind === 'cannon' ? 700 : 480); a.recoilAt = now + PJ.RELEASE_MS;               // 총/대포를 대상 쪽으로 들고 쏨
    const mz = gunMuzzle(a, now, T.sprite, T.hs || 2); s.x0 = mz.x; s.y0 = mz.y;
    if (kind === 'cannon') a.kick = { start: now + PJ.RELEASE_MS, dir: -(Math.sign(t.x - c.x) || 1) };
    s.dur = kind === 'cannon' ? Math.min(520, Math.max(240, PJ.dist(mz.x, mz.y, t.x, t.y) / 1500 * 1000)) : PJ.bulletMs(mz.x, mz.y, t.x, t.y);
  } else if (kind === 'bow') {                                                       // 활: 0.45초 동안 시위를 당긴 뒤 화살이 날아감
    const pv = gunPivot(a), aim = PJ.aimAngle(pv.x, pv.y, t.x, t.y), sc = a.sc || 1;
    a.heldItem = T.id; a.gunUntil = now + 450 + 2500; a.aimTarget = b; a.aimUntil = now + 450 + 400; a.bowDraw = { start: now + 60, release: now + 450 };
    a.throwAt = now + 450; s.start = now + 450; s.x0 = pv.x + Math.cos(aim) * 14 * sc; s.y0 = pv.y + Math.sin(aim) * 14 * sc; s.dur = Math.min(620, Math.max(300, PJ.dist(s.x0, s.y0, t.x, t.y) / 1300 * 1000));
  } else if (kind === 'flame') {                                                     // 화염방사기: 0.8초 동안 불길을 뿜고, 끝에 대상이 불에 맞음
    a.heldItem = T.id; a.gunUntil = now + 2500; a.aimTarget = b; a.aimUntil = now + PJ.RELEASE_MS + 900; a.recoilAt = now + PJ.RELEASE_MS;
    const mz = gunMuzzle(a, now, T.sprite, T.hs); s.x0 = mz.x; s.y0 = mz.y; s.from = a; s.start = now + PJ.RELEASE_MS; s.dur = 800;
  } else if (kind === 'axe') {
    s.dur = 620; s.sign = Math.sign(t.x - c.x) || 1;
  } else if (kind === 'wave') {                                                      // 사무라이 칼: 한 번에 칼질 3번, 참격 3개를 0.11초 간격으로 연달아 날림
    const dir = Math.sign(t.x - c.x) || 1; a.dir = dir; a.heldItem = T.id; a.gunUntil = now + 2500; a.aimTarget = b; a.aimUntil = now + PJ.RELEASE_MS + 330 + 160; a.swingAt = now + PJ.RELEASE_MS - 20;
    const mz = gunMuzzle(a, now, T.sprite, T.hs || 1), n = T.waves || 3; s.x0 = mz.x; s.y0 = mz.y; s.dur = Math.min(420, Math.max(190, PJ.dist(mz.x, mz.y, t.x, t.y) / 1700 * 1000));
    for (let i = 0; i < n; i++) shots.push({ ...s, i, start: now + PJ.RELEASE_MS + i * 110 });
    return;
  } else if (kind === 'punch') {                                                     // 황금 장갑: 몸째 돌진해서 크게 휘두름
    const dir = Math.sign(b.x - a.x) || 1, gap = Math.abs(b.x - a.x) - ((a.bw || 40) + (b.bw || 40)) / 2, sc = a.sc || 1;
    a.dir = dir; a.heldItem = T.id; a.gunUntil = now + 1500; a.aimTarget = b; a.aimUntil = now + 600; a.throwAt = now + 140;
    a.punch = { start: now, dir, dist: Math.max(0, Math.min(150, gap - 18 * sc)), slash: false };
    s.start = now + PUNCH_HIT_MS; s.dur = 10; s.x0 = a.x; s.y0 = c.y;
  } else if (kind === 'staff') {                                                     // 마왕의 스태프: 제자리에 멈춰 스태프를 곧게 세우고, 불·번개·물 미사일 3발을 0.4초 간격으로
    const dir = Math.sign(t.x - c.x) || 1, n = T.missiles || 3, gap = T.gapMs || 400, sc = a.sc || 1, info = itemInfo('staff'), pv = gunPivot(a), hs = (T.hs || 1) * sc;
    a.dir = dir; a.heldItem = T.id; a.gunUntil = now + 2800; a.castAt = now; a.castUntil = now + 300 + (n - 1) * gap + 450; a.aimTarget = b; a.aimUntil = a.castUntil;
    const mx = pv.x + (info.muzzle[0] - info.pivot[0]) * hs, my = pv.y + (info.muzzle[1] - info.pivot[1]) * hs, amp = PJ.curveAmp(mx, my, t.x, t.y);
    for (let i = 0; i < n; i++) { const cc = PJ.curveControl(mx, my, t.x, t.y, amp * [1.1, 0.3, 0.75][i % 3], [-0.15, 0.1, 0.2][i % 3]); shots.push({ ...s, i, elem: i % 3, x0: mx, y0: my, cx: cc.cx, cy: cc.cy, dur: 620, start: now + 300 + i * gap }); }
    return;
  } else if (kind === 'missile') {
    s.dur = PJ.FLIGHT.missile; const amp = PJ.curveAmp(c.x, c.y, t.x, t.y) * rnd(0.85, 1.15), cc = PJ.curveControl(c.x, c.y, t.x, t.y, amp, rnd(-0.2, 0.2)); s.cx = cc.cx; s.cy = cc.cy;
  } else s.dur = PJ.FLIGHT[kind] || PJ.FLIGHT.arc;
  shots.push(s);
}
function parts(x, y, n, colors, o = {}) {                                        // 사방으로 튀는 네모 파편들
  for (let i = 0; i < n; i++) { const an = o.angle !== undefined ? o.angle + rnd(-(o.spread || 0.6), o.spread || 0.6) : rnd(0, Math.PI * 2), sp = rnd(o.min || 60, o.max || 220);
    fx.push({ type: 'dot', x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - (o.up || 0), gy: o.gy === undefined ? 420 : o.gy, size: o.size || (Math.random() < 0.5 ? 4 : 6), color: colors[(Math.random() * colors.length) | 0], start: performance.now(), dur: rnd(o.dmin || 300, o.dmax || 560) }); }
}
function impact(s, t, now) { impact0(s, t, now); if (s.to.isObj) smashResolve(s, t, now); }
function impact0(s, t, now) {
  const onHit = s.to.isObj ? (_p, _nw, snd) => { if (!quiet) (SND[snd] || boop)(); } : s.to.isBoss ? (_p, nw, snd, _d, _pw) => bossStrike(s, snd, nw) : globalOnHit;                  // 보스가 맞았을 땐 사람 맞음(기절 등) 대신 보스 피해 처리
  const dir = Math.sign(t.x - s.x0) || 1;                                       // 공격이 날아온 방향 (+1: 왼쪽에서 오른쪽으로)
  if (IA.isGuarded(s.to, now)) { blockFx(t, now); return; }                     // 기절 중이거나 막 풀린 상대는 맞지 않음 (폭탄도 안 터짐)
  if (s.kind === 'bomb') { onHit(s.to, now, 'boom', dir); fx.push({ type: 'boom', x: t.x, y: t.y, start: now, dur: 620, seed: Math.random() * 6 }); parts(t.x, t.y, 14, ['#3a3a40', '#ff9f1c', '#ffd23f', '#8d99ae'], { min: 90, max: 300, up: 90, dmin: 450, dmax: 800 }); shakeUntil = now + 320; }
  else if (s.kind === 'staff') { const col = ELEM[s.elem]; onHit(s.to, now, 'zap', dir, s.power); parts(t.x, t.y, 20, col, { min: 90, max: 300, up: s.elem === 0 ? 80 : 0, gy: s.elem === 0 ? -60 : 120, dmin: 350, dmax: 650 }); fx.push({ type: 'ring', x: t.x, y: t.y, start: now, dur: 420, color: col[0], r: 80 }); if (s.elem === 1) { fx.push({ type: 'slashfx', x: t.x, y: t.y, start: now, dur: 300, dir }); } }
  else if (s.kind === 'missile') { onHit(s.to, now, 'zap', dir); parts(t.x, t.y, 18, ['#9b8cff', '#d7bfff', '#ffffff', '#7a6bff'], { min: 80, max: 260, gy: 0, dmin: 350, dmax: 600 }); fx.push({ type: 'ring', x: t.x, y: t.y, start: now, dur: 380, color: '#b9a9ff' }); }
  else if (s.kind === 'cannon') {
    onHit(s.to, now, 'boom', dir, s.power); fx.push({ type: 'screenflash', start: now, dur: 160 });
    fx.push({ type: 'boom', x: t.x, y: t.y, start: now, dur: 800, seed: Math.random() * 6, sc: 2.3 }); fx.push({ type: 'ring', x: t.x, y: t.y, start: now, dur: 520, color: '#fff3b0', r: 150 }); fx.push({ type: 'ring', x: t.x, y: t.y, start: now + 80, dur: 620, color: '#ff9f1c', r: 200 });
    parts(t.x, t.y, 34, ['#3a3a40', '#ff9f1c', '#ffd23f', '#8d99ae', '#cb473a'], { min: 150, max: 520, up: 140, dmin: 600, dmax: 1100 }); parts(t.x, t.y, 14, ['#6b6f7a', '#8d99ae', '#555a66'], { min: 20, max: 140, gy: -40, size: 10, dmin: 900, dmax: 1500 }); shakeUntil = now + 700;
  }
  else if (s.kind === 'axe') { onHit(s.to, now, 'thud', dir, s.power); parts(t.x, t.y, 10, ['#b8bfca', '#8b8e96', '#c17a43', '#ffffff'], { min: 60, max: 220, up: 60, dmin: 300, dmax: 520 }); fx.push({ type: 'ring', x: t.x, y: t.y, start: now, dur: 260, color: '#cfd4e4' }); }
  else if (s.kind === 'bow') { onHit(s.to, now, 'tick', dir, s.power); parts(t.x, t.y, 7, ['#d9a066', '#ffffff', '#b8bfca'], { min: 60, max: 200, gy: 200, dmin: 200, dmax: 380, size: 4 }); }
  else if (s.kind === 'flame') { onHit(s.to, now, 'burn', dir, s.power); if (!s.to.isBoss && !s.to.isObj) startBurn(s, now); parts(t.x, t.y, 12, ['#fff3b0', '#ffd23f', '#ff7b1c'], { min: 40, max: 180, up: 120, gy: -140, size: 6, dmin: 400, dmax: 700 }); }
  else if (false) { fx.push({ type: 'boom', x: t.x, y: t.y, start: now, dur: 650, seed: Math.random() * 6, sc: 1.0 }); fx.push({ type: 'ring', x: t.x, y: t.y, start: now, dur: 420, color: '#ff9f1c', r: 80 }); parts(t.x, t.y, 22, ['#fff3b0', '#ffd23f', '#ff9f1c', '#ff5a36'], { min: 60, max: 260, up: 160, gy: -120, size: 6, dmin: 500, dmax: 900 }); }
  else if (s.kind === 'wave') { if (s.i && !s.to.isBoss && !s.to.isObj) SND.slash(); else onHit(s.to, now, 'slash', dir, s.power); fx.push({ type: 'slashfx', x: t.x, y: t.y, start: now, dur: 420, dir }); fx.push({ type: 'ring', x: t.x, y: t.y, start: now, dur: 300, color: '#bfe6ff', r: 70 }); parts(t.x, t.y, 14, ['#ffffff', '#bfe6ff', '#8ecbff'], { angle: dir > 0 ? -0.6 : Math.PI + 0.6, spread: 0.9, min: 120, max: 380, gy: 200, size: 4, dmin: 250, dmax: 500 }); }
  else if (s.kind === 'punch') { onHit(s.to, now, 'punch', dir, s.power); fx.push({ type: 'burst', x: t.x, y: t.y, start: now, dur: 520, seed: Math.random() * 6 }); fx.push({ type: 'ring', x: t.x, y: t.y, start: now, dur: 520, color: '#ffe27a' }); parts(t.x, t.y, 26, ['#ffe27a', '#e8b730', '#ffffff', '#ff5fa2', '#3fd0c9'], { min: 160, max: 460, gy: 120, dmin: 450, dmax: 800 }); shakeUntil = now + 520; }
  else if (s.kind === 'gun') { onHit(s.to, now, 'tick', dir); parts(t.x, t.y, 8, ['#fff6b0', '#ffd23f', '#ffffff'], { min: 80, max: 240, gy: 200, dmin: 160, dmax: 300, size: 4 }); }
  else if (s.sprite === 'poop') { onHit(s.to, now, 'splat', dir); parts(t.x, t.y, 12, ['#b47449', '#9e643c', '#915a35'], { min: 60, max: 200, up: 70, dmin: 350, dmax: 600 }); }
  else onHit(s.to, now, 'boop', dir);
}
// ---------- 레벨 후광: Lv2/4/6/8/10 마다 무기 둘레에 빛무리 (단계가 높을수록 크고 진하고 화려함) ----------
const ELEM = [['#ff4d2e', '#ff9f1c', '#fff3b0'], ['#ffe14d', '#fff6b0', '#ffffff'], ['#2a7bff', '#4db8ff', '#c9efff']];      // 마왕의 스태프 미사일 색: 불 / 번개 / 물
const AURA = [null, ['#8ecbff', '#d9efff'], ['#6bf0a8', '#e0ffee'], ['#ffd23f', '#fff3b0'], ['#ff7ad9', '#ffd0f2'], null];   // 5단계는 무지개
const withAlpha = (c, a) => (c[0] === '#' ? `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${a})` : c.replace('hsl(', 'hsla(').replace(')', `,${a})`));
function drawAura(x, y, r, tier, now) {
  const t = Math.min(5, tier), rr = r * (0.8 + 0.12 * t), pulse = 1 + 0.08 * Math.sin(now / (160 - t * 15) + x * 0.01);
  const c1 = t === 5 ? `hsl(${(now / 6) % 360},100%,60%)` : AURA[t][0], c2 = t === 5 ? `hsl(${(now / 6 + 120) % 360},100%,75%)` : AURA[t][1];
  g.save(); g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y, 0, x, y, rr * pulse); gr.addColorStop(0, c2); gr.addColorStop(0.4, c1); gr.addColorStop(1, withAlpha(c1, 0));
  g.globalAlpha = 0.22 + 0.1 * t; g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr * pulse, 0, 7); g.fill();
  if (t >= 2) { g.globalAlpha = 0.35 + 0.08 * t; g.strokeStyle = c1; g.lineWidth = 1.5 + t * 0.4; g.beginPath(); g.arc(x, y, rr * 0.62 * pulse, 0, 7); g.stroke(); }
  if (t >= 3) for (let i = 0; i < t + 1; i++) { const a = now / (700 - t * 60) + i * (7 / (t + 1)), d = rr * (0.55 + 0.2 * Math.sin(now / 300 + i)); g.globalAlpha = 0.9; g.fillStyle = i % 2 ? c2 : c1; const sz = 2 + (t >= 4 ? 1.5 : 0); g.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), sz, sz); }
  if (t >= 4) { g.globalAlpha = 0.5; g.strokeStyle = c2; g.lineWidth = 2; for (let i = 0; i < 4; i++) { const a = now / 900 + i * Math.PI / 2, L = rr * (t === 5 ? 1.25 : 1.05); g.beginPath(); g.moveTo(x + Math.cos(a) * rr * 0.4, y + Math.sin(a) * rr * 0.4); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); } }
  if (t === 5) { g.globalAlpha = 0.45; g.strokeStyle = `hsl(${(now / 6 + 240) % 360},100%,70%)`; g.lineWidth = 3; g.beginPath(); g.arc(x, y, rr * 1.0 * pulse, 0, 7); g.stroke(); }
  g.restore();
}
function drawGlow(x, y, r, tier, now) {                                              // 투사체에만 붙는 은은한 광휘 (레벨 단계에 따라 색만 조금 달라짐, 작고 옅게)
  const t = Math.min(5, tier), rr = r * (0.85 + 0.06 * t), c1 = t === 5 ? `hsl(${(now / 8) % 360},100%,65%)` : AURA[t][0], c2 = t === 5 ? `hsl(${(now / 8 + 120) % 360},100%,80%)` : AURA[t][1];
  g.save(); g.globalCompositeOperation = 'lighter'; const gr = g.createRadialGradient(x, y, 0, x, y, rr);
  gr.addColorStop(0, withAlpha(c2, 0.55)); gr.addColorStop(0.5, withAlpha(c1, 0.28)); gr.addColorStop(1, withAlpha(c1, 0));
  g.globalAlpha = 0.5 + 0.06 * t; g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); g.restore();
}
function shotPos(s, tc, t) {                                                          // 날아가는 중인 아이템의 현재 위치 (후광을 따라 붙이려고)
  if (s.kind === 'gun' || s.kind === 'wave') return PJ.linePos(s.x0, s.y0, tc.x, tc.y, t);
  if (s.kind === 'cannon') return PJ.arcPos(s.x0, s.y0, tc.x, tc.y, t, 26 * SIZE);
  if (s.kind === 'axe') return PJ.arcPos(s.x0, s.y0, tc.x, tc.y, t, 85 * SIZE);
  if (s.kind === 'bow') return PJ.arcPos(s.x0, s.y0, tc.x, tc.y, t, 30 * SIZE);
  if (s.kind === 'staff') return PJ.bezier(s.x0, s.y0, s.cx, s.cy, tc.x, tc.y, Math.pow(t, 1.15));
  if (s.kind === 'missile') return PJ.bezier(s.x0, s.y0, s.cx, s.cy, tc.x, tc.y, Math.pow(t, 1.25));
  return PJ.arcPos(s.x0, s.y0, tc.x, tc.y, t, (s.kind === 'bomb' ? 95 : 70) * SIZE);
}

// ---------- 보스 몬스터 ----------
const bossCv = {};
function bossCanvas(type, name) {                                                    // 도트 그림(글자 표 + 색 팔레트)을 작은 캔버스로 한 번만 만들어 둠
  const k = type + name; if (bossCv[k]) return bossCv[k]; const S = BossSprites[type], rows = S[name], c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
  const x = c.getContext('2d'); rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) { const col = S.palette[r[i]]; if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); } } }); return (bossCv[k] = c);
}
const bossScale = () => (H < 700 ? 2 : 3);
const banner = (text, color, now, dur) => pushMega('', text, now, { plain: true, color, dur });
const ga = (n) => { const c = String(n).charCodeAt(String(n).length - 1) - 0xAC00; return c >= 0 && c % 28 ? '이' : '가'; };      // 이름 뒤에 붙는 이/가
function lordDims() { const h = Math.round(Math.min(300, Math.max(170, H * 0.34))); return { bw: Math.round(h * 1.116), bh: h }; }
function setBoss(b, announce, now) {
  const info = Bz.BOSSES[b.type]; if (!info || (b.type !== 'lord' && (!window.BossSprites || !BossSprites[b.type]))) return;
  boss = { judge: b.judge || null, id: b.id, type: b.type, seed: b.seed, t0: b.t0, until: b.until, hp: b.hp, max: b.max || Bz.HP, spawnAt: now, hitAt: 0, lastPh: null, dead: false, pose: null };
  bossProxy.guardUntil = 0;
  if (announce) { const min = Math.max(1, Math.round((b.until - serverNow()) / 60000)); banner(`⚠️ ${info.emoji} ${info.name}${ga(info.name)} 나타났다! (${min}분 동안)`, '#ff8a8a', now, 6500); if (!quiet) SND.zap(); if (b.type === 'lord') { shakeUntil = Math.max(shakeUntil, now + 500); fx.push({ type: 'screenflash', start: now, dur: 260 }); } }
}
function applyXp(uid, name, xp, now) {
  const before = Bz.levelInfo(xps[uid] || 0).lv, after = Bz.levelInfo(xp).lv; xps[uid] = xp;
  if (after > before) { banner(`🎉 ${name} 님이 Lv.${after} 달성!`, '#8dffb0', now + 400, 6000); if (uid === cfg.uid && !quiet) { SND.mega(); }
    if (uid === cfg.uid) for (const T of THROWABLES) if (T.unlock && before < T.unlock && after >= T.unlock) banner(`🔓 ${T.name} 해금! (설정 → 던지기 장난감에서 고르세요)`, '#ffd23f', now + 900, 7500); }
}
function endBoss(m, now) {
  if (!boss || boss.id !== m.id) return;
  const info = Bz.BOSSES[boss.type], P = bossProxy; releaseJudge(now); if (quiz && quiz.boss) quiz = quizSaved; quizSaved = null;
  if (m.reason === 'dead') {
    boss.dead = true; boss.deadAt = now; boss.deadSrv = serverNow(); boss.hp = 0; SND.boom();
    fx.push({ type: 'screenflash', start: now, dur: 200 }); for (let i = 0; i < 4; i++) fx.push({ type: 'boom', x: P.x + rnd(-P.bw / 3, P.bw / 3), y: P.cy + rnd(-P.bh / 3, P.bh / 3), start: now + i * 140, dur: 700, seed: Math.random() * 6, sc: 1.6 });
    parts(P.x, P.cy, 40, ['#ffd23f', '#ff9f1c', '#ffffff', '#cb473a'], { min: 120, max: 460, up: 160, dmin: 700, dmax: 1300 }); shakeUntil = now + 600;
    const rw = Array.isArray(m.rewards) ? m.rewards : []; for (const r of rw) { applyXp(r.uid, r.name, r.xp, now); if (r.kills !== undefined) lks[r.uid] = r.kills; }
    const mine = rw.find((r) => r.uid === cfg.uid); if (mine && mine.kills !== undefined) { if (window.api.saveLordKills) window.api.saveLordKills(cfg.activeCode, mine.kills); const left = 5 - mine.kills; setTimeout(() => banner(left > 0 ? `👿 차원 마왕 처치 ${mine.kills}/5 — 스태프 해금까지 ${left}번!` : (mine.kills === 5 ? '🔓 마왕의 스태프 해금!! (설정 → 던지기 장난감에서 고르세요)' : `👿 차원 마왕 누적 처치 ${mine.kills}회`), '#c9b8ff', performance.now(), 7000), 1200); }
    if (mine) { window.api.saveXp(cfg.activeCode, mine.xp); setTimeout(() => fx.push({ type: 'text', x: (peers.get(myId) || P).x, y: GROUND() - 90, text: `EXP +${mine.gain}`, start: performance.now(), dur: 1800, color: '#8dffb0', size: 20 }), 300); }
    banner(`🏆 ${info.name} 처치! ` + (rw.length ? rw.slice(0, 3).map((r) => `${r.name} +${r.gain}`).join(' · ') : ''), '#ffd23f', now, 7000);
  } else {
    parts(P.x, P.cy, 16, ['#ffffff', '#cfd4e4'], { min: 40, max: 200, gy: -30, size: 8, dmin: 500, dmax: 900 });
    if (m.reason === 'time') banner(`💨 ${info.name}${ga(info.name)} 도망갔어요…`, '#cfd4e4', now, 4500);
    if (m.reason === 'flee') { const po = boss.pose; fleeFx = { start: now, x: P.x, y: P.cy, sx: po ? po.sx : 1, sy: po ? po.sy : 1, rot: po ? po.rot : 0, w: boss.w0, h: boss.h0 }; if (!quiet) SND.zap(); banner(`🌀 ${info.name}${ga(info.name)} 차원의 문으로 도망쳤어요… 다음 기회에!`, '#c9b8ff', now, 5500); }
    boss = null;
  }
}
function bossStrike(s, snd, now) {                                                   // 내가 던진 것이 보스에 맞음 -> 규칙대로 피해를 서버에 알림 (남들 것은 서버가 알려 줌)
  (SND[snd] || SND.boop)(); if (!boss || boss.dead || boss.judge) return; boss.hitAt = now;
  if (s.kind === 'flame') { startBurn(s, now); return; }                              // 화염방사기: 한 방이 아니라 1초 동안 화상 피해가 나눠서 들어감
  if (!s.fromMe) return;
  const r = Bz.damageOf(boss, s.T, boss.pose);
  if (r.dmg > 0) queueBhit(r.dmg + Bz.dmgBonus(Bz.levelInfo(xps[cfg.uid] || 0).lv));   // 레벨이 오를수록 무기 데미지 보너스
  else { blockFx(center(bossProxy), now); fx.push({ type: 'text', x: bossProxy.x, y: bossProxy.cy - bossProxy.bh / 2 - 26, text: r.why, start: now, dur: 1600, color: '#ffd23f', size: 14 }); }
}
const burns = []; let pendDmg = 0, lastBhit = 0;
const queueBhit = (d) => { pendDmg += d; };                                           // 서버는 피해 신호를 0.12초에 한 번만 받으니, 모아서 한꺼번에 보냄
const BURN_MS = 1000, BURN_TICKS = 4;
function startBurn(s, now) {                                                          // 화상: 대상이 빨갛게 달아오르고, 1초 동안 0.25초마다 틱 피해
  const to = s.to; let tot = 0;
  if (to.isBoss) {
    if (!boss || boss.dead) return; const r = Bz.damageOf(boss, s.T, boss.pose);
    if (r.dmg <= 0) { if (s.fromMe) { blockFx(center(bossProxy), now); fx.push({ type: 'text', x: bossProxy.x, y: bossProxy.cy - bossProxy.bh / 2 - 26, text: r.why, start: now, dur: 1600, color: '#ffd23f', size: 14 }); } return; }
    if (s.fromMe) tot = r.dmg + Bz.dmgBonus(Bz.levelInfo(xps[cfg.uid] || 0).lv);
  }
  to.burnUntil = now + BURN_MS; fx.push({ type: 'burnfx', to, start: now, dur: BURN_MS }); burns.push({ to, t0: now, i: 0, tot });
}
function pumpBurns(now) {
  for (let k = burns.length - 1; k >= 0; k--) {
    const b = burns[k]; if (b.to.isBoss ? (!boss || boss.dead) : !peers.has(b.to.id)) { burns.splice(k, 1); continue; }
    while (b.i < BURN_TICKS && now >= b.t0 + b.i * (BURN_MS / BURN_TICKS)) {
      const c = center(b.to); parts(c.x, c.y, 5, ['#ffd23f', '#ff9f1c', '#ff5a36'], { min: 30, max: 120, up: 100, gy: -120, size: 6, dmin: 300, dmax: 550 });
      if (b.to.isBoss) boss.hitAt = now;
      const d = Math.floor((b.i + 1) * b.tot / BURN_TICKS) - Math.floor(b.i * b.tot / BURN_TICKS); if (d > 0) queueBhit(d);
      b.i++;
    }
    if (b.i >= BURN_TICKS) burns.splice(k, 1);
  }
  if (!boss || boss.dead) pendDmg = 0;
  else if (pendDmg > 0 && now - lastBhit >= 135) { send({ t: 'bhit', id: boss.id, dmg: Math.min(20, pendDmg) }); pendDmg = Math.max(0, pendDmg - 20); lastBhit = now; }
}
function updateBoss(now) {
  if (!boss) return;
  if (boss.dead) { if (now - boss.deadAt > 1500) { boss = null; return; } } else if (serverNow() > boss.until + 3000 && !boss.judge) { boss = null; return; }
  const lord = boss.type === 'lord', S = bossScale(), spr = lord ? null : BossSprites[boss.type], ld = lord ? lordDims() : null, v = lord ? { W, H, bw: ld.bw, bh: ld.bh } : { W, H, bw: spr.idle[0].length * S, bh: spr.idle.length * S };
  const po = Bz.pose(boss, boss.dead ? boss.deadSrv : serverNow(), v), rows = lord ? null : (spr[po.sprite] || spr.idle), w0 = lord ? v.bw : rows[0].length * S, h0 = lord ? v.bh : rows.length * S;
  boss.pose = po; boss.v = v; boss.w0 = w0; boss.h0 = h0;
  const oy = po.anchor === 'bottom' ? (v.bh / 2 - h0 / 2) * po.sy : 0, sn = Math.sin(po.rot), cs = Math.cos(po.rot);   // 그림 가운데의 실제 화면 위치
  const P = bossProxy; P.x = po.cx - oy * sn; P.cy = po.cy + oy * cs;
  const sw = Math.abs(sn) > 0.7; P.bw = (sw ? h0 * po.sy : w0 * po.sx); P.bh = (sw ? w0 * po.sx : h0 * po.sy);
  if (!boss.dead) bossFx(po, now);
  if (lord && !boss.dead) lordTick(po, now);
}
function bossFx(po, now) {                                                           // 단계가 바뀔 때 / 계속 나오는 효과 (모든 화면에서 각자 같은 시각에 보임)
  if (boss.type === 'lord') return lordFx(po, now);
  const P = bossProxy, ph = po.phase.split(':')[0], full = po.phase, t = boss.type, mouth = { x: P.x + (po.flip ? 1 : -1) * (t === 'liz' ? -1 : 1) * 0, y: P.cy };
  if (full !== boss.lastPh) {
    boss.lastPh = full;
    if (ph === 'emerge') { fx.push({ type: 'ring', x: P.x, y: GROUND() - 4, start: now, dur: 420, color: '#b0824f', r: 70 }); parts(P.x, GROUND() - 6, 16, ['#6b4a2b', '#8a6038', '#b0824f'], { angle: -Math.PI / 2, spread: 1.0, min: 80, max: 260, gy: 500, dmin: 400, dmax: 800 }); if (!quiet) SND.thud(); }
    else if (ph === 'sink') parts(P.x, GROUND() - 6, 10, ['#6b4a2b', '#8a6038'], { angle: -Math.PI / 2, spread: 1.0, min: 50, max: 160, gy: 500, dmin: 300, dmax: 600 });
    else if (ph === 'land') { fx.push({ type: 'ring', x: P.x, y: GROUND() - 4, start: now, dur: 360, color: '#9bd36a', r: 56 }); parts(P.x, GROUND() - 4, 10, ['#cfe8a8', '#9bd36a', '#ffffff'], { angle: -Math.PI / 2, spread: 1.3, min: 40, max: 180, gy: 400, size: 4, dmin: 250, dmax: 450 }); shakeUntil = Math.max(shakeUntil, now + 90); }
    else if (ph === 'windup') fx.push({ type: 'text', x: P.x, y: P.cy - P.bh / 2 - 22, text: '❗', start: now, dur: 900, color: '#ff6b4a', size: 22 });
    else if (ph === 'dive') { fx.push({ type: 'ring', x: P.x, y: P.cy, start: now, dur: 300, color: '#c8a2ff', r: 50 }); if (!quiet) SND.whoosh(); }
    else if (ph === 'rock') fx.push({ type: 'ring', x: P.x, y: P.cy, start: now, dur: 420, color: '#c9ced9', r: 70 });
  }
  const r = Math.random();
  if (ph === 'breath' && r < 0.7) { const a = (po.rot || 0) + (po.flip ? 0 : Math.PI), dx = Math.cos(a), dy = Math.sin(a); parts(P.x + dx * P.bw * 0.45, P.cy + dy * P.bh * 0.2, 2, ['#ffd23f', '#ff9f1c', '#ff5a36'], { angle: Math.atan2(dy, dx), spread: 0.25, min: 120, max: 320, gy: -20, size: 6, dmin: 300, dmax: 600 }); }
  else if (ph === 'charge' && r < 0.8) parts(P.x - (po.flip ? 1 : -1) * P.bw * 0.3, P.cy + P.bh * 0.2, 2, ['#ff5a36', '#ffd23f', '#6b6f7a'], { angle: po.flip ? Math.PI : 0, spread: 0.5, min: 30, max: 160, gy: -60, size: 6, dmin: 300, dmax: 600 });
  else if (ph === 'orb' && r < 0.4) parts(P.x, P.cy + P.bh * 0.3, 1, ['#c8a2ff', '#7a6bff', '#ffffff'], { min: 10, max: 60, gy: 40, size: 4, dmin: 300, dmax: 600 });
  else if (ph === 'dig' && r < 0.35) parts(P.x, GROUND() - 6, 1, ['#6b4a2b', '#8a6038', '#b0824f'], { angle: -Math.PI / 2, spread: 0.9, min: 40, max: 130, gy: 500, size: 4, dmin: 300, dmax: 500 });
}

// ---------- 차원 마왕 (Lv6 이상 3명 이상일 때 나오는 특별 보스) ----------
// 움직임은 서버가 준 seed/시각으로 모두가 똑같이 계산 (shared/bosses.js lord). 주먹은 "맞은 사람의 앱"이 판정해서 알리면 모두 화면에 날아가는 모습이 보임.
const LORD_PUNCH_HITS = false;      // 주먹이 사람을 날리고 기절시킬지 (지금은 꺼 둠: 캐릭터가 못 움직여서 피할 수 없으니, 대신 마왕이 공격이 성공할 때마다 체력을 회복)
const lordZone = (po) => { const P = bossProxy, d = po.dir || 1, a = P.x + d * P.bw * 0.2, b = P.x + d * (P.bw * 0.5 + 150); return { x0: Math.min(a, b), x1: Math.max(a, b) }; };   // 주먹이 닿는 바닥 구간
const judgeAnswerer = () => !!(boss && boss.judge && boss.judge.wid === myId);
function releaseJudge(now) { for (const p of peers.values()) if (p.judgeStun) { p.judgeStun = false; p.stunUntil = 0; p.guardUntil = now + 1200; } }       // 심판이 끝나면 기절 풀림 (잠깐 무적)
function lordTick(po, now) {
  if (boss.judge) { for (const p of peers.values()) if (p.id !== boss.judge.wid && p.state === 'online') { p.judgeStun = true; p.stunUntil = Math.max(p.stunUntil, now + 1500); } holdAtk = null; return; }   // 심판 중: 답하는 한 명만 빼고 전원 기절
  if (!LORD_PUNCH_HITS || po.fist <= 0.35) return;
  const me = peers.get(myId); if (!me || me.state !== 'online' || boss.punched === po.phase) return;
  const z = lordZone(po), hw = (me.bw || 40) / 2; if (me.x < z.x0 - hw || me.x > z.x1 + hw) return;
  boss.punched = po.phase;
  if (!globalOnHit(me, now, 'punch', po.dir, 10)) { blockFx(center(me), now); return; }                            // 맞음: 크게 날아가고 기절
  send({ t: 'lhit', id: boss.id, dir: po.dir }); lordHitFx(me, po.dir, now, true);
}
function lordHitFx(p, dir, now, mine) {
  if (!mine) globalOnHit(p, now, 'punch', dir, 10);
  const c = center(p); fx.push({ type: 'burst', x: c.x, y: c.y, start: now, dur: 520, seed: Math.random() * 6 }); fx.push({ type: 'ring', x: c.x, y: c.y, start: now, dur: 520, color: '#c8a2ff', r: 110 });
  parts(c.x, c.y, 24, ['#c8a2ff', '#ffe27a', '#ffffff', '#ff5a36'], { angle: dir > 0 ? 0 : Math.PI, spread: 0.9, min: 160, max: 460, gy: 120, dmin: 450, dmax: 800 }); shakeUntil = Math.max(shakeUntil, now + 420);
}
function lordFx(po, now) {
  const P = bossProxy, ph = po.phase.split(':')[0], full = po.phase;
  if (full !== boss.lastPh) {
    boss.lastPh = full;
    if (ph === 'windup' || ph === 'windup2') { fx.push({ type: 'text', x: P.x, y: P.cy - P.bh / 2 - 22, text: '❗', start: now, dur: 900, color: '#ff6b4a', size: 24 }); if (!quiet) SND.zap(); }
    else if (ph === 'punch' || ph === 'punch2') { if (!quiet) SND.whoosh(); const z = lordZone(po); fx.push({ type: 'ring', x: (z.x0 + z.x1) / 2, y: GROUND() - 20, start: now, dur: 380, color: '#c8a2ff', r: 90 }); }
    else if (ph === 'dash') { fx.push({ type: 'ring', x: P.x, y: P.cy, start: now, dur: 300, color: '#c8a2ff', r: 90 }); if (!quiet) SND.whoosh(); }
    else if (ph === 'land') { fx.push({ type: 'ring', x: P.x, y: GROUND() - 4, start: now, dur: 420, color: '#b9a9ff', r: 120 }); parts(P.x, GROUND() - 4, 16, ['#6b4a7a', '#b9a9ff', '#ffffff'], { angle: -Math.PI / 2, spread: 1.4, min: 60, max: 260, gy: 400, size: 5, dmin: 300, dmax: 600 }); shakeUntil = Math.max(shakeUntil, now + 260); if (!quiet) SND.thud(); }
  }
  const r = Math.random();
  if (ph === 'fly' && r < 0.45) parts(P.x + rnd(-P.bw / 2, P.bw / 2), P.cy + rnd(-P.bh / 3, P.bh / 3), 1, ['#c8a2ff', '#7a6bff', '#ff5a36'], { min: 10, max: 60, gy: 60, size: 4, dmin: 400, dmax: 800 });
  else if (ph === 'dash' && r < 0.9) parts(P.x - (po.dir || 1) * P.bw * 0.4, P.cy + rnd(-P.bh / 3, P.bh / 3), 2, ['#c8a2ff', '#ffffff', '#7a6bff'], { angle: po.dir > 0 ? Math.PI : 0, spread: 0.4, min: 80, max: 260, gy: 0, size: 6, dmin: 250, dmax: 500 });
  else if (ph === 'windup' || ph === 'windup2') { if (r < 0.5) parts(P.x + (po.dir || 1) * P.bw * 0.35, P.cy + P.bh * 0.2, 1, ['#ff5a36', '#ffd23f'], { min: 10, max: 70, gy: -80, size: 4, dmin: 250, dmax: 500 }); }
}
function drawPortal(x, y, r, a, now) {                                                  // 차원의 문: 세로로 긴 보랏빛 소용돌이
  if (a <= 0.01) return; g.save(); g.translate(x, y); g.scale(0.55, 1); g.globalAlpha = Math.min(1, a);
  g.fillStyle = 'rgba(14,0,28,.92)'; g.beginPath(); g.arc(0, 0, r * 0.82, 0, 7); g.fill();
  g.globalCompositeOperation = 'lighter'; const gr = g.createRadialGradient(0, 0, r * 0.25, 0, 0, r); gr.addColorStop(0, 'rgba(120,60,255,0)'); gr.addColorStop(0.6, 'rgba(150,90,255,.75)'); gr.addColorStop(0.85, 'rgba(220,160,255,.55)'); gr.addColorStop(1, 'rgba(160,80,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.lineWidth = 4;
  for (let i = 0; i < 3; i++) { const sp = (i % 2 ? -1 : 1) * now / 300 + i * 2.1; g.strokeStyle = i % 2 ? '#e8d4ff' : '#a47bff'; g.beginPath(); g.arc(0, 0, r * (0.45 + 0.17 * i), sp, sp + 2.2); g.stroke(); }
  g.restore();
}
function lordPre(now, age) {                                                            // 마왕 몸 뒤에 그리는 것: 문 / 주먹 경고 구역 / 질주 잔상 / 심판 기운
  const po = boss.pose, P = bossProxy, ph = po.phase.split(':')[0];
  if (age < 1300 && !boss.dead) drawPortal(P.x, P.cy, P.bh * 0.7, Math.sin(Math.PI * Math.min(1, age / 1300)) * 1.2, now);
  if (LORD_PUNCH_HITS && (ph === 'windup' || ph === 'windup2' || ph === 'punch' || ph === 'punch2') && !boss.dead && !boss.judge) {
    const z = lordZone(po), hot = ph.startsWith('punch'), pulse = 0.5 + 0.5 * Math.sin(now / 70);
    g.save(); g.fillStyle = hot ? 'rgba(255,60,40,.5)' : `rgba(255,70,50,${0.14 + 0.16 * pulse})`; g.fillRect(z.x0, GROUND() - 74, z.x1 - z.x0, 78);
    g.setLineDash([8, 6]); g.strokeStyle = hot ? '#fff' : '#ff6b4a'; g.lineWidth = 2; g.strokeRect(z.x0, GROUND() - 74, z.x1 - z.x0, 78); g.setLineDash([]);
    g.font = '700 13px system-ui, "Malgun Gothic", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 3; g.strokeText('⚠ 피해요!', (z.x0 + z.x1) / 2, GROUND() - 82); g.fillText('⚠ 피해요!', (z.x0 + z.x1) / 2, GROUND() - 82); g.restore();
  }
  if (ph === 'dash' && !boss.dead) for (let k = 3; k >= 1; k--) { const q = Bz.pose(boss, serverNow() - k * 55, boss.v); g.save(); g.globalAlpha = 0.28 / k; g.translate(q.cx, q.cy); g.rotate(q.rot); g.scale(q.sx, q.sy); g.filter = 'hue-rotate(40deg) brightness(1.4)'; g.drawImage(lordImg, -boss.w0 / 2, -boss.h0 / 2, boss.w0, boss.h0); g.restore(); }
  if (boss.judge && !boss.dead) { const R = P.bw * 0.75 * (1 + 0.06 * Math.sin(now / 120)); g.save(); g.globalCompositeOperation = 'lighter'; const gr = g.createRadialGradient(P.x, P.cy, R * 0.2, P.x, P.cy, R); gr.addColorStop(0, 'rgba(255,60,90,.45)'); gr.addColorStop(0.6, 'rgba(160,80,255,.3)'); gr.addColorStop(1, 'rgba(160,80,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(P.x, P.cy, R, 0, 7); g.fill(); g.restore(); }
}
function lordPost(now) {                                                                // 마왕 몸 앞에 그리는 것: 뻗는 주먹 / 심판 안내띠
  const po = boss.pose, P = bossProxy;
  if (po.fist > 0.02 && fistImg.complete && !boss.dead) {
    const d = po.dir || 1, fh = P.bh * 0.5, fw = fh * fistImg.naturalWidth / fistImg.naturalHeight, ext = (u) => P.x + d * (P.bw * 0.22 + u * (P.bw * 0.28 + 150)), fy = GROUND() - fh * 0.42;
    for (let k = 3; k >= 0; k--) { const u = Math.max(0, po.fist - k * 0.14); g.save(); g.globalAlpha = k ? 0.22 : 1; g.translate(ext(u), fy); g.rotate(d > 0 ? -Math.PI / 2 : Math.PI / 2); g.drawImage(fistImg, -fw / 2, -fh / 2, fw, fh); g.restore(); }
  }
  if (boss.judge && !judgeAnswerer() && !boss.dead && !(quiz && quiz.boss)) {                                  // 구경하는 사람(기절 중)에게 보이는 안내
    const j = boss.judge, left = Math.max(0, Math.ceil((j.until - serverNow()) / 1000)), w = Math.min(520, W - 24), x = (W - w) / 2, y = 52;
    g.save(); g.fillStyle = 'rgba(30,10,50,.88)'; g.beginPath(); g.roundRect(x, y, w, 58, 14); g.fill(); g.strokeStyle = '#c9b8ff'; g.lineWidth = 2.5; g.stroke();
    g.textAlign = 'center'; g.font = '800 15px system-ui, "Malgun Gothic", sans-serif'; g.fillStyle = '#ffd23f'; g.fillText(`⚖️ 마왕의 심판 · ${j.name || '한 명'}님이 문제를 푸는 중! (${left}초)`, x + w / 2, y + 24);
    g.font = '600 12px system-ui, "Malgun Gothic", sans-serif'; g.fillStyle = '#e5dcff'; g.fillText('나머지는 기절! 맞히면 다시 싸우고, 못 맞히면 마왕이 도망가요', x + w / 2, y + 45); g.restore();
  }
}
function drawFlee(now) {                                                                // 차원의 문으로 빨려 들어가며 사라지는 마왕
  if (!fleeFx || !lordImg.complete) return; const f = fleeFx, t = (now - f.start) / 1600; if (t >= 1) { fleeFx = null; return; }
  const sh = t < 0.7 ? 1 - Math.pow(t / 0.7, 2) : 0; drawPortal(f.x, f.y, f.h * 0.75, Math.min(1, t * 4) * (t > 0.85 ? (1 - t) / 0.15 : 1) * 1.2, now);
  if (sh > 0.01) { g.save(); g.translate(f.x, f.y); g.rotate(f.rot + t * 7); g.scale(f.sx * sh, f.sy * sh); g.globalAlpha = Math.min(1, sh * 1.5); g.drawImage(lordImg, -f.w / 2, -f.h / 2, f.w, f.h); g.restore(); }
  if (Math.random() < 0.6) parts(f.x, f.y, 2, ['#c8a2ff', '#ffffff', '#7a6bff'], { min: 30, max: 140, gy: 0, size: 4, dmin: 300, dmax: 600 });
}
function lordJudge(m, now) {                                                            // 체력이 400/200 이 됨 -> 심판: 한 명만 문제를 풀고 나머지는 기절
  if (!boss || boss.id !== m.id) return; syncClock(m.now); boss.hp = m.hp; boss.judge = { wid: m.wid, uid: m.uid, name: m.name, until: m.until }; pendDmg = 0; holdAtk = null;
  const me = m.wid === myId; if (m.q) { if (!(quiz && quiz.boss)) quizSaved = quiz; quiz = { boss: true, spec: !me, who: m.name, phase: 'ask', id: m.id, i: 0, n: 1, topicName: m.q.topicName, text: m.q.text, choices: m.q.choices, until: m.until, myAns: null, answered: 0, atotal: 1, right: null }; if (!quiet && me) SND.quiz(); }
  if (!quiet) SND.zap(); shakeUntil = Math.max(shakeUntil, now + 600); fx.push({ type: 'screenflash', start: now, dur: 300 });
  banner(me ? '👿 마왕이 당신에게 문제를 냈다! 맞히면 모두의 기절이 풀려요 (공격은 못 해요)' : `👿 마왕의 심판! ${m.name}님만 문제를 풀 수 있어요 — 나머지는 기절! (문제는 같이 볼 수 있어요)`, '#c9b8ff', now, 6500);
}
function lordQ(m, now) {                                                                // (심판받는 사람만) 문제 카드
  if (!boss || boss.id !== m.id) return; syncClock(m.now); if (!(quiz && quiz.boss)) quizSaved = quiz;
  quiz = { boss: true, phase: 'ask', id: m.id, i: 0, n: 1, topicName: m.topicName, text: m.text, choices: m.choices, until: m.until, myAns: null, answered: 0, atotal: 1, right: null }; if (!quiet) SND.quiz();
}
function lordRes(m, now) {
  if (!boss || boss.id !== m.id) return; boss.judge = null; releaseJudge(now);
  if (quiz && quiz.boss) Object.assign(quiz, { myAns: quiz.spec ? (m.picked === undefined ? null : m.picked) : quiz.myAns, phase: 'reveal', correct: m.correct, counts: [0, 0, 0, 0], right: m.ok ? [{ uid: cfg.uid }] : [], revealAt: now, endAt: now + 3000, bossOk: !!m.ok });
  if (m.ok) { if (m.until) boss.until = m.until; SND.ok(); banner('⭕ 정답! 기절이 풀렸어요 — 마왕을 다시 공격하세요!', '#8dffb0', now, 5500); fx.push({ type: 'ring', x: bossProxy.x, y: bossProxy.cy, start: now, dur: 600, color: '#8dffb0', r: 160 }); }
  else { SND.no(); banner(m.why === 'left' ? '🌀 문제를 풀던 사람이 나가서 마왕이 도망가요…' : m.why === 'timeout' ? '⏰ 시간 초과! 마왕이 도망가요…' : '❌ 오답! 마왕이 도망가요…', '#ff9a9a', now, 5500); }
}
function drawBoss(now) {
  if (!boss || !boss.pose) return; const lord = boss.type === 'lord', po = boss.pose, v = boss.v, P = bossProxy, spr = lord ? null : BossSprites[boss.type], cv0 = lord ? lordImg : bossCanvas(boss.type, po.sprite in spr ? po.sprite : 'idle');
  if (lord && !lordImg.complete) return;
  const age = now - boss.spawnAt, pop = age < 450 ? 1 + 0.5 * Math.pow(1 - age / 450, 2) * (1 - age / 450) * 2 - 0.5 * (1 - age / 450) : 1, el = boss.dead ? now - boss.deadAt : 0;
  const under = boss.type === 'mole' && !po.vulnerable && po.phase.startsWith('dig');
  if (po.rot === 0 || Math.abs(po.rot) < 0.2) { const hgt = Math.max(0, GROUND() - (P.cy + P.bh / 2)); g.globalAlpha = Math.max(0.1, 0.32 - hgt / 700); g.fillStyle = '#000'; g.beginPath(); g.ellipse(P.x, GROUND() + 1, (P.bw / 2) * Math.max(0.5, 1 - hgt / 600), 5, 0, 0, 7); g.fill(); g.globalAlpha = 1; }   // 바닥 그림자 (높이 뜨면 작고 옅게)
  if (lord) lordPre(now, age);
  g.save(); g.translate(po.cx, po.cy); g.rotate(po.rot); g.scale((po.flip ? -1 : 1) * po.sx * pop * (boss.dead ? 1 - el / 2600 : 1), po.sy * pop * (boss.dead ? 1 - el / 2600 : 1));
  const w0 = boss.w0, h0 = boss.h0, y0 = po.anchor === 'bottom' ? v.bh / 2 - h0 : -h0 / 2;
  g.globalAlpha = boss.dead ? Math.max(0, 1 - el / 1500) * (Math.floor(el / 90) % 2 ? 0.5 : 1) : under ? 0.35 : lord ? Math.max(0, Math.min(1, (age - 250) / 350)) : Math.min(1, age / 200);
  g.drawImage(cv0, -w0 / 2, y0, w0, h0);
  if (!boss.dead && bossProxy.burnUntil > now) { g.filter = 'sepia(1) saturate(8) hue-rotate(-38deg)'; g.globalAlpha = 0.45 + 0.15 * Math.sin(now / 80); g.drawImage(cv0, -w0 / 2, y0, w0, h0); g.filter = 'none'; }
  if (!boss.dead && now - boss.hitAt < 140) { g.globalAlpha = 0.65 * (1 - (now - boss.hitAt) / 140); g.globalCompositeOperation = 'lighter'; g.drawImage(cv0, -w0 / 2, y0, w0, h0); g.globalCompositeOperation = 'source-over'; }   // 맞으면 번쩍
  g.restore(); g.globalAlpha = 1;
  if (lord) lordPost(now);
  if (boss.dead) return;
  // 이름 + 체력 막대 + 남은 시간 (보스 머리 쪽 위에 똑바로 서 있게 그림)
  const info = Bz.BOSSES[boss.type], up = { x: Math.sin(po.rot), y: -Math.cos(po.rot) }, topD = (po.anchor === 'bottom' ? h0 * po.sy - v.bh * po.sy / 2 : h0 * po.sy / 2) + 18;
  const lx = Math.min(W - 70, Math.max(70, po.cx + up.x * topD)), ly = Math.max(46, Math.min(H - 20, po.cy + up.y * topD)), bw = 112, hp = Math.max(0, boss.hp / boss.max);
  g.textAlign = 'center'; g.font = '700 12px system-ui, "Malgun Gothic", sans-serif'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.7)';
  const left = Math.max(0, Math.ceil((boss.until - serverNow()) / 1000)), tm = left >= 60 ? `${Math.floor(left / 60)}분 ${left % 60}초` : `${left}초`, title = `${info.emoji} ${info.name}  ·  ${tm}`;
  g.strokeText(title, lx, ly - 16); g.fillStyle = '#fff'; g.fillText(title, lx, ly - 16);
  g.fillStyle = 'rgba(20,20,30,.85)'; g.beginPath(); g.roundRect(lx - bw / 2 - 2, ly - 11, bw + 4, 14, 7); g.fill();
  g.fillStyle = hp > 0.5 ? '#4cd964' : hp > 0.25 ? '#ffcc00' : '#ff453a'; g.beginPath(); g.roundRect(lx - bw / 2, ly - 9, Math.max(6, bw * hp), 10, 5); g.fill();
  g.fillStyle = '#fff'; g.font = '700 10px system-ui, sans-serif'; g.fillText(`${boss.hp} / ${boss.max}`, lx, ly);
  if (boss.type === 'pig') { g.fillStyle = '#9fe0ff'; g.font = '700 11px system-ui, "Malgun Gothic", sans-serif'; g.strokeText('❄️ 눈송이만 통해요', lx, ly + 14); g.fillText('❄️ 눈송이만 통해요', lx, ly + 14); }
  if (boss.type === 'mole' && po.vulnerable === false) { g.fillStyle = '#e8c9a0'; g.font = '700 11px system-ui, "Malgun Gothic", sans-serif'; g.strokeText('땅속… 올라올 때 공격!', lx, ly + 14); g.fillText('땅속… 올라올 때 공격!', lx, ly + 14); }
}
function infoCard(p, top, now) {                                                     // 오른쪽 클릭: 레벨 / 경험치 카드
  const li = Bz.levelInfo(xps[p.uid] || 0), left = p.infoUntil - now, a = Math.min(1, left / 300) * Math.min(1, (4000 - left) / 120 + 0.2), w = 150, h = 70;
  let bottom = top - 32; if (p.bb) bottom -= (p.bb.bot - p.bb.top) + 8;
  const x = Math.min(W - w - 4, Math.max(4, p.x - w / 2)), y = Math.max(4, bottom - h);
  g.globalAlpha = a; g.fillStyle = 'rgba(30,32,48,.95)'; g.strokeStyle = '#ffd23f'; g.lineWidth = 2; g.beginPath(); g.roundRect(x, y, w, h, 10); g.fill(); g.stroke();
  g.textAlign = 'left'; g.font = '800 15px system-ui, "Malgun Gothic", sans-serif'; g.fillStyle = '#ffd23f'; g.fillText(`Lv.${li.lv}`, x + 10, y + 21);
  g.font = '600 11px system-ui, "Malgun Gothic", sans-serif'; g.fillStyle = '#cfd4e4'; g.textAlign = 'right'; g.fillText(li.max ? `EXP ${li.xp} · MAX` : `EXP ${li.xp} / ${li.next}`, x + w - 10, y + 21);
  g.fillStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.roundRect(x + 10, y + 32, w - 20, 10, 5); g.fill();
  g.fillStyle = '#4cd964'; g.beginPath(); g.roundRect(x + 10, y + 32, Math.max(6, (w - 20) * (li.max ? 1 : li.into / li.need)), 10, 5); g.fill();
  g.textAlign = 'left'; g.fillStyle = '#ff9f9f'; g.font = '700 11px system-ui, "Malgun Gothic", sans-serif'; g.fillText(`⚔️ 공격력 +${Bz.dmgBonus(li.lv)}` + (Bz.auraTier(li.lv) ? `  ✨ 후광 ${Bz.auraTier(li.lv)}단계` : ''), x + 10, y + 61); g.globalAlpha = 1;
}

// ---------- 랜덤퀴즈 (서버가 문제를 내고 채점함. 화면에는 카드가 뜨고 마우스로 고름) ----------
let quiz = null; let quizRects = [], quizBounds = null;
const QFONT = 'system-ui, "Malgun Gothic", sans-serif', CIRC = ['①', '②', '③', '④'];
function wrapLines(text, maxW, font) { g.font = font; const out = []; let cur = ''; for (const ch of String(text)) { if (g.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ch.trim() ? ch : ''; } else cur += ch; } if (cur) out.push(cur); return out; }
function quizBanner(text, color, now) { banner(text, color || '#8ecbff', now, 6000); }
function quizMsg(m, now) {
  if (m.t === 'quiz') { syncClock(m.now); quiz = { phase: 'invite', id: m.id, topics: m.topics || [], n: m.n, until: m.until, yes: 0, no: 0, total: 0, mine: null, vote: null, tally: {} }; quizBanner(`🧠 랜덤퀴즈가 시작돼요! 주제에 투표하고 수락해 주세요 (1분)`, '#c9b8ff', now); if (!quiet) SND.quiz(); return; }
  if (!quiz || quiz.id !== m.id) { if (m.t === 'qend') quiz = null; return; }
  if (m.t === 'qprog') { quiz.yes = m.yes; quiz.no = m.no; quiz.total = m.total; quiz.tally = m.tally || {}; }
  else if (m.t === 'qstart') {
    quiz.joined = m.players.some((p) => p.uid === cfg.uid); quiz.players = m.players;
    const pc = m.pct && m.pct[m.topic] ? ` (${m.pct[m.topic]}%)` : '';
    quizBanner(`🧠 투표로 주제가 정해졌어요: ${m.topicName}${pc} · 참가자: ${m.players.map((p) => p.name).join(', ')}`, '#c9b8ff', now);
    quiz.topicName = m.topicName;
    if (!quiz.joined) quiz = null; else quiz.phase = 'wait';
  } else if (m.t === 'qq') { syncClock(m.now); Object.assign(quiz, { phase: 'ask', i: m.i, n: m.n, text: m.text, choices: m.choices, until: m.until, myAns: null, answered: 0, atotal: quiz.players ? quiz.players.length : 0, right: null }); if (!quiet) SND.quiz(); }
  else if (m.t === 'qa') { quiz.answered = m.answered; quiz.atotal = m.total; }
  else if (m.t === 'qres') {
    Object.assign(quiz, { phase: 'reveal', correct: m.correct, right: m.right, counts: m.counts, revealAt: now });
    for (const r of m.right) applyXp(r.uid, r.name, r.xp, now);
    const mine = m.right.find((r) => r.uid === cfg.uid); if (mine) window.api.saveXp(cfg.activeCode, mine.xp);
    (mine ? SND.ok : SND.no)();
    if (mine) fx.push({ type: 'text', x: (peers.get(myId) || { x: W / 2 }).x, y: GROUND() - 90, text: `정답! EXP +${mine.gain}`, start: now, dur: 1800, color: '#8dffb0', size: 18 });
  } else if (m.t === 'qend') {
    const joined = quiz.joined && m.board.length;
    const mine = m.board.find((b) => b.uid === cfg.uid); if (mine) window.api.saveXp(cfg.activeCode, mine.xp);
    if (m.reason === 'noone') { quizBanner('🧠 참여자가 없어서 퀴즈가 취소됐어요', '#cfd4e4', now); quiz = null; }
    else if (m.reason === 'off' || m.reason === 'gone') { quizBanner('🧠 퀴즈가 중단됐어요', '#cfd4e4', now); quiz = null; }
    else if (joined) { quiz.phase = 'board'; quiz.board = m.board; quiz.boardUntil = now + 9000; }
    else { const top = m.board[0]; quizBanner(top ? `🧠 퀴즈 종료! 1등 ${top.name} (${top.right}/${m.n}문제 정답)` : '🧠 퀴즈 종료', '#c9b8ff', now); quiz = null; }
  }
}
function quizBtn(x, y, w, h, label, o, now) {                                   // 카드 안 버튼: 그리기 + 클릭 영역 등록
  const hov = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h && !o.off;
  g.fillStyle = o.fill || (hov ? '#3b3f6e' : '#2b2e55'); g.strokeStyle = o.border || (hov ? '#ffd23f' : '#6b70b0'); g.lineWidth = o.sel ? 3 : 2;
  g.beginPath(); g.roundRect(x, y, w, h, 10); g.fill(); g.stroke();
  if (o.lines) { g.font = `600 ${o.size || 15}px ${QFONT}`; g.textAlign = 'left'; g.fillStyle = o.color || '#fff'; const lh = (o.size || 15) + 6; o.lines.forEach((l, k) => g.fillText(l, x + 12, y + 10 + (o.size || 15) + k * lh - 2)); if (o.right) { g.textAlign = 'right'; g.fillStyle = '#cfd4e4'; g.font = `600 12px ${QFONT}`; g.fillText(o.right, x + w - 10, y + h / 2 + 4); } }
  else { g.font = `700 16px ${QFONT}`; g.textAlign = 'center'; g.fillStyle = o.color || '#fff'; g.fillText(label, x + w / 2, y + h / 2 + 6); }
  if (o.act && !o.off) quizRects.push({ x, y, w, h, act: o.act, arg: o.arg });
}
function quizCard(x, y, w, h, color) {
  g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 18; g.fillStyle = 'rgba(24,22,52,.97)'; g.beginPath(); g.roundRect(x, y, w, h, 16); g.fill(); g.restore();
  g.strokeStyle = color || '#b9a9ff'; g.lineWidth = 3; g.beginPath(); g.roundRect(x, y, w, h, 16); g.stroke(); quizBounds = { x, y, w, h };
  quizRects.push(closeX(x + w - 20, y + 20, 'hide'));                                           // 오른쪽 위 X: 이 카드 끄기 (나한테만 안 보이게)
}
function closeX(cx, cy, act) {
  const hov = Math.hypot(mouse.x - cx, mouse.y - cy) < 13; g.save(); g.fillStyle = hov ? 'rgba(200,70,70,.9)' : 'rgba(255,255,255,.16)'; g.beginPath(); g.arc(cx, cy, 11, 0, 7); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - 4, cy - 4); g.lineTo(cx + 4, cy + 4); g.moveTo(cx + 4, cy - 4); g.lineTo(cx - 4, cy + 4); g.stroke(); g.restore();
  return { x: cx - 14, y: cy - 14, w: 28, h: 28, act };
}
function drawQuiz(now) {
  quizRects = []; quizBounds = null; if (quiz && quiz.boss && quiz.endAt && now > quiz.endAt) { quiz = quizSaved; quizSaved = null; } if (!quiz) return;
  const sNow = serverNow();
  if (quiz.phase === 'invite' && sNow > quiz.until + 6000) { quiz = null; return; }
  if (quiz.hidden && quiz.phase !== 'board') return;
  if (quiz.phase === 'board' && now > quiz.boardUntil) { quiz = null; return; }
  const left = (u) => Math.max(0, Math.ceil((u - sNow) / 1000));
  if (quiz.phase === 'invite') {
    const w = Math.min(460, W - 24), x = (W - w) / 2, y = 56, tp = quiz.topics, rows = Math.ceil(tp.length / 3), h = 184 + rows * 40; quizCard(x, y, w, h, '#c9b8ff');
    g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = `800 21px ${QFONT}`; g.fillText('🧠 랜덤퀴즈 도전!', x + w / 2, y + 34);
    g.font = `600 13px ${QFONT}`; g.fillStyle = '#cfd4e4'; g.fillText(`${quiz.n}문제  ·  정답이면 EXP +10  ·  투표가 많은 주제가 더 잘 뽑혀요`, x + w / 2, y + 56);
    const cw = (w - 40 - 16) / 3, tot = Object.values(quiz.tally).reduce((a2, b2) => a2 + b2, 0);
    tp.forEach((t, k) => {
      const cx = x + 20 + (k % 3) * (cw + 8), cy = y + 70 + Math.floor(k / 3) * 40, n = quiz.tally[t.id] || 0, mine = quiz.vote === t.id;
      quizBtn(cx, cy, cw, 34, `${t.emoji} ${t.name}${n ? ` ${n}` : ''}`, { act: 'vote', arg: t.id, sel: mine, fill: mine ? '#4a4380' : undefined, border: mine ? '#ffd23f' : undefined, size: 13 }, now);
    });
    const by = y + 74 + rows * 40;
    g.font = `700 13px ${QFONT}`; g.textAlign = 'center'; g.fillStyle = '#ffd23f'; g.fillText(`남은 시간 ${left(quiz.until)}초  ·  수락 ${quiz.yes} / 거절 ${quiz.no}${quiz.total ? ` (접속 ${quiz.total}명)` : ''}`, x + w / 2, by + 6);
    const bw = (w - 60) / 2;
    quizBtn(x + 20, by + 18, bw, 42, '⭕ 수락', { act: 'yes', fill: quiz.mine === true ? '#2e7d4f' : '#24402f', border: quiz.mine === true ? '#8dffb0' : '#4cd964', sel: quiz.mine === true }, now);
    quizBtn(x + 40 + bw, by + 18, bw, 42, '❌ 거절', { act: 'no', fill: quiz.mine === false ? '#8a3a3a' : '#432626', border: quiz.mine === false ? '#ff9a9a' : '#ff6b6b', sel: quiz.mine === false }, now);
    g.font = `500 12px ${QFONT}`; g.fillStyle = '#9ea3c8'; g.fillText(quiz.mine === null ? '주제를 누르면 투표 + 수락돼요 · 안 고르면 불참' : quiz.mine ? (quiz.vote ? '✅ 투표하고 수락했어요 · 바꿀 수 있어요' : '✅ 수락했어요 (주제는 아무거나) · 주제를 눌러 투표해요') : '거절했어요 · 바꿀 수 있어요', x + w / 2, by + 78);
    return;
  }
  if (quiz.phase === 'wait') { const w = 300, h = 54, x = (W - w) / 2, y = 56; quizCard(x, y, w, h); g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = `700 16px ${QFONT}`; g.fillText('🧠 첫 문제를 준비하고 있어요…', x + w / 2, y + 33); return; }
  if (quiz.phase === 'board') {
    const rows = quiz.board.slice(0, 8), w = Math.min(420, W - 24), h = 110 + rows.length * 30, x = (W - w) / 2, y = 56; quizCard(x, y, w, h, '#ffd23f');
    g.textAlign = 'center'; g.fillStyle = '#ffd23f'; g.font = `800 20px ${QFONT}`; g.fillText(`🏆 퀴즈 결과 · ${quiz.topicName || ''}`, x + w / 2, y + 36);
    rows.forEach((b, k) => { const ry = y + 70 + k * 30; g.textAlign = 'left'; g.font = `700 15px ${QFONT}`; g.fillStyle = b.uid === cfg.uid ? '#8dffb0' : '#fff'; g.fillText(`${k + 1}. ${b.name}`, x + 24, ry); g.textAlign = 'right'; g.fillStyle = '#cfd4e4'; g.fillText(`${b.right}/${quiz.n} 정답  ·  EXP +${b.gain}`, x + w - 24, ry); });
    quizBtn(x + w / 2 - 50, y + h - 40, 100, 30, '닫기', { act: 'close' }, now); return;
  }
  // 문제 카드 (ask / reveal)
  const w = Math.min(780, W - 24), x = (W - w) / 2, y = 44, inner = w - 36, reveal = quiz.phase === 'reveal';
  const ql = wrapLines(quiz.text, inner, `800 18px ${QFONT}`), cl = quiz.choices.map((c) => wrapLines(`${CIRC[quiz.choices.indexOf(c)]} ${c}`, inner - 70, `600 15px ${QFONT}`));
  const chH = cl.map((l) => 20 + l.length * 21), h = 56 + ql.length * 26 + 14 + chH.reduce((a, b) => a + b + 8, 0) + 44;
  quizCard(x, y, w, h, reveal ? (quiz.boss && !quiz.bossOk ? '#ff8a8a' : '#8dffb0') : quiz.boss ? '#c9a2ff' : '#b9a9ff');
  g.textAlign = 'left'; g.fillStyle = '#b9a9ff'; g.font = `700 13px ${QFONT}`; g.fillText((quiz.boss ? (quiz.spec ? `👀 ${quiz.who || '친구'}님이 마왕의 문제를 푸는 중 · ${quiz.topicName}` : `👿 차원 마왕의 문제 · ${quiz.topicName}`) : quiz.n > 1 ? `🧠 ${quiz.topicName} 퀴즈 ${quiz.i + 1} / ${quiz.n}` : `🧠 ${quiz.topicName} 퀴즈`), x + 18, y + 26);
  g.textAlign = 'right'; g.fillStyle = '#ffd23f'; g.fillText(reveal ? (quiz.boss ? '' : `다음 문제까지 ${Math.max(0, Math.ceil((5000 - (now - quiz.revealAt)) / 1000))}초`) : (left(quiz.until) > 0 ? `${left(quiz.until)}초` : '채점 중…'), x + w - 46, y + 26);
  if (!reveal) { const frac = Math.max(0, Math.min(1, (quiz.until - sNow) / 20000)); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + 18, y + 34, inner, 5); g.fillStyle = frac > 0.3 ? '#8ecbff' : '#ff6b6b'; g.fillRect(x + 18, y + 34, inner * frac, 5); }
  g.textAlign = 'left'; g.font = `800 18px ${QFONT}`; g.fillStyle = '#fff'; ql.forEach((l, k) => g.fillText(l, x + 18, y + 66 + k * 26));
  let cy = y + 56 + ql.length * 26 + 14;
  quiz.choices.forEach((c, k) => {
    const sel = quiz.myAns === k, ok = reveal && k === quiz.correct, bad = reveal && sel && k !== quiz.correct;
    quizBtn(x + 18, cy, inner, chH[k], '', { lines: cl[k], size: 15, act: 'ans', arg: k, off: reveal || quiz.spec || quiz.myAns !== null || left(quiz.until) <= 0, sel: sel || ok,
      fill: ok ? '#245c3a' : bad ? '#6b2c2c' : sel ? '#4a4380' : undefined, border: ok ? '#8dffb0' : bad ? '#ff8a8a' : sel ? '#ffd23f' : undefined, right: reveal && !quiz.boss ? `${quiz.counts[k]}명` : '' }, now);
    cy += chH[k] + 8;
  });
  g.textAlign = 'center'; g.font = `600 13px ${QFONT}`;
  if (reveal && quiz.boss) { g.fillStyle = quiz.bossOk ? '#8dffb0' : '#ff9a9a'; g.fillText(quiz.bossOk ? '🎉 정답! 모두의 기절이 풀려요' : (quiz.myAns === null ? '⏰ 시간 초과… 마왕이 도망가요' : '😢 오답… 마왕이 도망가요'), x + w / 2, y + h - 16); }
  else if (reveal) { g.fillStyle = quiz.right.some((r) => r.uid === cfg.uid) ? '#8dffb0' : '#ff9a9a'; const names = quiz.right.map((r) => r.name).join(', '); g.fillText(quiz.right.some((r) => r.uid === cfg.uid) ? `🎉 정답! EXP +10   (정답자: ${names})` : (quiz.myAns === null ? '⏰ 시간 초과' : '😢 오답') + (quiz.right.length ? `   (정답자: ${names})` : '   (아무도 못 맞혔어요)'), x + w / 2, y + h - 16); }
  else { g.fillStyle = quiz.myAns === null || quiz.spec ? '#cfd4e4' : '#8dffb0'; g.fillText(quiz.spec ? '👀 구경 중 — 다른 친구가 푸는 문제예요' : quiz.myAns === null ? '보기를 클릭해서 답하세요' : (quiz.boss ? (quiz.spec ? '👀 구경 중 — 다른 친구가 푸는 문제예요' : '✅ 제출했어요! 결과를 기다리는 중…') : `✅ 제출했어요 (${quiz.answered}/${quiz.atotal}명 답함)`), x + w / 2, y + h - 16); }
}
function quizClick(x, y, now) {                                                                // 카드 위 클릭이면 처리하고 true (캐릭터/보스 클릭으로 넘어가지 않게)
  if (!quiz || !quizBounds) return false;
  for (const r of quizRects) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
    if (r.act === 'vote') { quiz.vote = r.arg; quiz.mine = true; send({ t: 'qjoin', id: quiz.id, yes: true, topic: r.arg }); }
    else if (r.act === 'yes' || r.act === 'no') { quiz.mine = r.act === 'yes'; if (!quiz.mine) quiz.vote = null; send({ t: 'qjoin', id: quiz.id, yes: quiz.mine, topic: quiz.mine ? quiz.vote || undefined : undefined }); }
    else if (r.act === 'ans' && quiz.myAns === null) { quiz.myAns = r.arg; send(quiz.boss ? { t: 'lans', id: quiz.id, c: r.arg } : { t: 'qans', id: quiz.id, i: quiz.i, c: r.arg }); }
    else if (r.act === 'close') quiz = null;
    else if (r.act === 'hide') { if (quiz.phase === 'invite' && quiz.mine === null) send({ t: 'qjoin', id: quiz.id, yes: false }); if (quiz.phase === 'invite') quiz.mine = false; if (quiz.phase === 'board') quiz = null; else quiz.hidden = true; }
    return true;
  }
  const b = quizBounds; return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

// ---------- 확성기: 화면 가운데에 크게 뜨는 안내 (이름 : 내용) ----------
const megas = []; let megaRects = [];
function pushMega(name, text, now, o = {}) {
  megas.push({ name: String(name || '누군가').slice(0, 12), text: String(text).slice(0, 200), start: now, plain: !!o.plain, color: o.color || '#ffd23f', dur: o.dur || Math.min(9000, Math.max(5000, 3500 + String(text).length * 90)) });
  while (megas.length > 3) megas.shift(); if (!quiet) SND.mega();
}
function megaClick(x, y) { for (const r of megaRects) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { r.m.start = -1e9; return true; } return false; }       // 안내 창의 X: 끄기
function megaLayout(m) {                                                        // 줄바꿈 계산 (한 번만)
  const maxW = Math.min(W * 0.72, 780); g.font = '700 22px system-ui, "Malgun Gothic", sans-serif';
  const prefix = m.plain ? '' : `📢 ${m.name} : `, full = prefix + m.text, lines = []; let cur = '';
  for (const ch of full) { if (g.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch; }
  lines.push(cur); m.lines = lines; m.prefix = prefix; m.w = Math.max(...lines.map((l) => g.measureText(l).width)) + 84; m.h = lines.length * 30 + 30;
}
function drawMegas(now) {
  megaRects = [];
  for (let i = megas.length - 1; i >= 0; i--) if (now - megas[i].start > megas[i].dur) megas.splice(i, 1);
  if (quiet || !megas.length) return;
  const down = !!quizBounds; let y = H * 0.42, cursor = down ? quizBounds.y + quizBounds.h + 14 : 0;           // 퀴즈 카드가 떠 있으면 카드 아래로 차례로 쌓음
  for (let i = megas.length - 1; i >= 0; i--) {                                 // 최신이 가운데, 이전 것은 그 위로
    const m = megas[i]; if (!m.lines) megaLayout(m); const el = now - m.start, left = m.dur - el;
    if (down) { y = cursor + m.h / 2; cursor += m.h + 10; if (y + m.h / 2 > H) continue; }
    const pop = el < 260 ? 1 + 2.2 * Math.pow(el / 260 - 1, 3) + 1.2 * Math.pow(el / 260 - 1, 2) : 1, sc = el < 260 ? Math.max(0.3, pop) : 1;     // 튀어나오듯 커졌다가 자리잡음
    const a = Math.min(1, el / 120) * Math.min(1, left / 450), cx = W / 2, top = y - m.h / 2;
    g.save(); g.globalAlpha = a * (i === megas.length - 1 ? 1 : 0.85); g.translate(cx, y); g.scale(sc, sc); g.translate(-cx, -y);
    g.shadowColor = 'rgba(255,200,60,.55)'; g.shadowBlur = 22; g.fillStyle = 'rgba(28,26,58,.95)'; g.beginPath(); g.roundRect(cx - m.w / 2, top, m.w, m.h, 18); g.fill(); g.shadowBlur = 0;
    g.strokeStyle = m.plain ? m.color : '#ffd23f'; g.lineWidth = 3; g.stroke(); g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1; g.beginPath(); g.roundRect(cx - m.w / 2 + 5, top + 5, m.w - 10, m.h - 10, 14); g.stroke();
    g.font = '700 22px system-ui, "Malgun Gothic", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    m.lines.forEach((l, k) => { const x = cx - m.w / 2 + 28, ty = top + 15 + 23 + k * 30;
      if (m.plain) { g.fillStyle = m.color; g.fillText(l, x, ty); }
      else if (k === 0 && l.startsWith(m.prefix)) { g.fillStyle = '#ffd23f'; g.fillText(m.prefix, x, ty); g.fillStyle = '#fff'; g.fillText(l.slice(m.prefix.length), x + g.measureText(m.prefix).width, ty); }
      else if (k === 0) { g.fillStyle = '#ffd23f'; g.fillText(l, x, ty); } else { g.fillStyle = '#fff'; g.fillText(l, x, ty); } });
    if (sc === 1) { const r = closeX(cx + m.w / 2 - 22, top + 22, 'mega'); r.m = m; megaRects.push(r); }
    g.restore(); if (!down) y -= m.h + 12;
  }
}
function drawFx(f, now) {                                                          // false 를 돌려주면 끝난 효과
  const t = (now - f.start) / f.dur; if (t >= 1) return false; if (t < 0) return true; const q = (v) => Math.round(v / 4) * 4;                // 도트 느낌으로 4px 격자에 맞춤
  if (f.type === 'dot') { const el = (now - f.start) / 1000; g.globalAlpha = 1 - t; g.fillStyle = f.color; g.fillRect(q(f.x + f.vx * el), q(f.y + f.vy * el + 0.5 * f.gy * el * el), f.size, f.size); g.globalAlpha = 1; }
  else if (f.type === 'boom') {                                                    // 도트 폭발: 노랑->주황->빨강->연기, 안쪽부터 사라지는 별 모양
    const R = (16 + 74 * Math.sqrt(t)) * SIZE * (f.sc || 1), cell = 4; g.globalAlpha = 1 - Math.max(0, (t - 0.55) / 0.45);
    for (let gx = -R; gx <= R; gx += cell) for (let gy = -R; gy <= R; gy += cell) {
      const d = Math.hypot(gx, gy), an = Math.atan2(gy, gx), rr = R * (0.8 + 0.25 * Math.sin(5 * an + f.seed)); if (d > rr) continue; if (t > 0.5 && d < rr * (t - 0.5) * 1.4) continue;
      const k = d / rr; g.fillStyle = k < 0.3 ? '#fff3b0' : k < 0.55 ? '#ffb703' : k < 0.8 ? '#fb5607' : '#5c3a2e'; g.fillRect(q(f.x + gx), q(f.y + gy), cell, cell);
    } g.globalAlpha = 1;
  } else if (f.type === 'screenflash') { g.globalAlpha = 0.55 * (1 - t); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
  } else if (f.type === 'ring') { g.globalAlpha = 1 - t; g.strokeStyle = f.color; g.lineWidth = 4; g.beginPath(); g.arc(f.x, f.y, 10 + (f.r || 60) * t, 0, 7); g.stroke(); g.globalAlpha = 1; }
  else if (f.type === 'text') { g.globalAlpha = 1 - Math.max(0, (t - 0.6) / 0.4); g.font = `700 ${f.size || 13}px system-ui, sans-serif`; g.textAlign = 'center'; const y = f.y - t * 18; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(f.text, f.x, y); g.fillStyle = f.color || '#fff'; g.fillText(f.text, f.x, y); g.globalAlpha = 1; }
  else if (f.type === 'fpuff') {                                                    // 불길 덩어리: 노랑 -> 주황 -> 빨강으로 변하며 커지고 사라짐
    const el = (now - f.start) / 1000, px = f.x + f.vx * el, py = f.y + f.vy * el, r = f.r0 + (f.r1 - f.r0) * t, col = t < 0.25 ? '255,246,190' : t < 0.55 ? '255,196,60' : t < 0.8 ? '255,106,28' : '194,51,31';
    g.save(); g.globalCompositeOperation = 'lighter'; const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, `rgba(${col},${0.85 * (1 - t)})`); gr.addColorStop(0.6, `rgba(${col},${0.45 * (1 - t)})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.beginPath(); g.arc(px, py, r, 0, 7); g.fill(); g.restore();
  } else if (f.type === 'burnfx') {                                               // 화상: 대상 몸에서 작은 불꽃이 일렁임
    const c = center(f.to), bw = f.to.bw || 40, bh = f.to.bh || 50, fade = 1 - Math.max(0, (t - 0.6) / 0.4);
    for (let i = 0; i < 7; i++) { const x = c.x + (i - 3) * bw / 7.5, hh = (0.3 + 0.22 * Math.sin(now / 85 + i * 1.9)) * bh, by = c.y + bh * 0.42; for (let k = 0; k < 3; k++) { g.globalAlpha = 0.9 * fade * (1 - k * 0.2); g.fillStyle = ['#ffd23f', '#ff9f1c', '#ff5a36'][k]; const hk = hh * (1 - k * 0.28); g.fillRect(Math.round(x / 4) * 4, Math.round((by - hk - k * 3) / 4) * 4, 6 - k, Math.max(4, hk)); } }
    g.globalAlpha = 1;
  } else if (f.type === 'slashfx') {                                                  // 베기: 대각선 두 줄기(하나는 엇갈려서) 번쩍
    const L = 66 * SIZE; g.lineCap = 'round';
    for (const [k, off, dl] of [[1, 0, 0], [-1, 6, 0.28]]) { const u = Math.min(1, Math.max(0, (t - dl) / (0.55 - dl * 0.5))); if (u <= 0) continue; const a0 = { x: f.x - f.dir * L * 0.75, y: f.y - k * L * 0.55 + off }, a1 = { x: f.x + f.dir * L * 0.75, y: f.y + k * L * 0.55 + off }, ex = a0.x + (a1.x - a0.x) * u, ey = a0.y + (a1.y - a0.y) * u, sx = a0.x + (a1.x - a0.x) * Math.max(0, u - 0.55), sy = a0.y + (a1.y - a0.y) * Math.max(0, u - 0.55);
      g.globalAlpha = 1 - Math.max(0, (t - 0.45) / 0.55); for (const [w, col] of [[16, 'rgba(120,200,255,.5)'], [7, '#ffffff']]) { g.strokeStyle = col; g.lineWidth = w * SIZE * (1 - Math.max(0, u - 0.7)); g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke(); } }
    g.globalAlpha = 1;
  } else if (f.type === 'burst') { g.globalAlpha = 1 - t; g.fillStyle = Math.floor(t * 12) % 2 ? '#fff6b0' : '#ffe27a'; const R = (22 + 80 * Math.sqrt(t)) * SIZE; for (let i = 0; i < 12; i++) { g.save(); g.translate(f.x, f.y); g.rotate(i * Math.PI / 6 + f.seed); g.fillRect(10, -3, (i % 2 ? R * 0.55 : R) - 10, 6); g.restore(); } g.globalAlpha = 1; }
  else if (f.type === 'flash') { g.globalAlpha = 1 - t; g.fillStyle = '#fff6b0'; const r = 6 + 10 * (1 - t); g.save(); g.translate(f.x, f.y); g.rotate(f.angle); g.fillRect(0, -3, r * 2, 6); g.fillRect(0, -r / 2, r, r); g.fillStyle = '#ff9f1c'; g.fillRect(4, -2, r * 1.4, 4); g.restore(); g.globalAlpha = 1; }
  return true;
}

// ---------- 조작 (SIDEY와 같은 규칙) ----------
const pulseCd = new IA.Cooldown(IA.PULSE.cooldownMs), myCd = myT.cooldownMs !== undefined ? myT.cooldownMs : IA.THROW.cooldownMs, useCd = new IA.Cooldown(myCd);   // 던지기 쿨다운: 기본 0.5초, 무기마다 다를 수 있음(대포 2초, 장갑 5초)
function acceptPulse(p, now) { if (p.state === 'offline' || !pulseCd.accept(p.id, now)) return false; p.pulseAt = now; return true; }   // 크기 효과 (1초 쿨다운)
function selfPulse(now) { const me = peers.get(myId); if (me && acceptPulse(me, now)) send({ t: 'pulse' }); }

let composerOpen = false, armedUntil = 0;
window.api.onComposerVisibility((v) => (composerOpen = v));
const selfClick = new IA.SelfClick({ doubleMs: DOUBLE_MS, getVisible: () => composerOpen, setVisible: (v) => window.api.setComposer(v), onDouble: () => selfPulse(performance.now()) });
const rightClick = new IA.RightClick(DOUBLE_MS);
const selfStunned = (now) => { const me = peers.get(myId); return (!!me && me.stunUntil > now) || judgeAnswerer(); };      // 마왕에게 문제를 받은 사람도 공격 못 함
const throwOn = (now) => IA.throwEnabled({ connected: !!myId, stunned: selfStunned(now), guard: !!cfg.throwGuard, armedUntil, now });

const hitTest = (x, y, now, button = 0) => {
  if (boss && !boss.dead && !boss.judge && myId && button === 0 && throwOn(now) && Math.abs(x - bossProxy.x) < bossProxy.bw / 2 + 4 && Math.abs(y - bossProxy.cy) < bossProxy.bh / 2 + 4) return bossProxy;      // 보스 클릭 = 공격
  for (const p of peers.values()) {
    if (p.state === 'offline') continue;                                                    // (친구도 오른쪽 클릭으로 레벨을 볼 수 있어야 해서 항상 클릭 대상)
    if (Math.abs(x - p.x) < (p.bw || width(p.look) * SIZE) / 2 + 4 && y > GROUND() - (p.bh || height(p.look) * SIZE) && y < GROUND()) return p;
  }
  return null;
};
cv.addEventListener('contextmenu', (e) => e.preventDefault());
const heat = { n: 0, last: 0, until: 0 };                                                  // 게틀링건 과열 상태
let autoFire = false, lastSay = 0;
const sayFx = (o) => { const n = performance.now(); if (autoFire && n - lastSay < 1000) return; lastSay = n; fx.push(o); };       // 꾹 눌러 자동 공격할 때는 안내 문구가 초당 수십 개 쌓이지 않게 1초에 한 번만
const myKills = () => lks[cfg.uid] || 0, lockedT = (T) => !!((T.unlock && Bz.levelInfo(xps[cfg.uid] || 0).lv < T.unlock) || (T.unlockKills && myKills() < T.unlockKills));
function attack(p, now) {                                                                  // 친구 또는 보스에게 던지기/공격
  const me = peers.get(myId), myLv = Bz.levelInfo(xps[cfg.uid] || 0).lv;
  if (myT.unlockKills && myKills() < myT.unlockKills) { if (me) sayFx({ type: 'text', x: me.x, y: GROUND() - (me.bh || 50) - 44, text: `🔒 ${myT.name}은(는) 차원 마왕을 ${myT.unlockKills}번 처치하면 쓸 수 있어요 (${myKills()}/${myT.unlockKills})`, start: now, dur: 2200, color: '#c9b8ff' }); return; }
  if (myT.unlock && myLv < myT.unlock) { if (me) sayFx({ type: 'text', x: me.x, y: GROUND() - (me.bh || 50) - 44, text: `🔒 ${myT.name}은(는) Lv.${myT.unlock} 부터 쓸 수 있어요`, start: now, dur: 1800, color: '#ffd23f' }); return; }
  if (myT.burst) {                                                                           // 게틀링건: 연속 사격, 8발 쏘면 과열 -> 2초 쉼
    if (now < heat.until) { if (me && now - (heat.warn || 0) > 700) { heat.warn = now; sayFx({ type: 'text', x: me.x, y: GROUND() - (me.bh || 50) - 44, text: `🔥 과열! ${((heat.until - now) / 1000).toFixed(1)}초 식히는 중`, start: now, dur: 900, color: '#ff8a5c' }); } return; }
    if (now - heat.last > 1200) heat.n = 0;
  }
  if (myT.range !== undefined && me) {                                                      // 근접 무기(황금 장갑): 가까이 있을 때만 쓸 수 있음 (멀면 쿨타임을 쓰지 않고 안내만)
    const gx = Math.max(0, Math.abs(me.x - p.x) - ((me.bw || 40) + (p.bw || 40)) / 2), gy = p.isBoss || p.isObj ? Math.max(0, (GROUND() - (me.bh || 50)) - (p.cy + p.bh / 2)) : 0;
    if (Math.hypot(gx, gy) > myT.range * SIZE) { sayFx({ type: 'text', x: me.x, y: GROUND() - (me.bh || 50) - 44, text: (p.isBoss || p.isObj) && gy > 0 ? '너무 높이 있어요!' : '너무 멀어요! 가까이 가서 눌러요', start: now, dur: 1400, color: '#ffd23f' }); return; }
  }
  if (useCd.accept('throw', now)) {
    if (myT.burst) { heat.n++; heat.last = now; if (heat.n >= myT.burst) { heat.until = now + myT.overheatMs; heat.n = 0; if (me) { sayFx({ type: 'text', x: me.x, y: GROUND() - (me.bh || 50) - 44, text: '🔥 과열!!', start: now, dur: 1200, color: '#ff6b4a', size: 16 }); SND.block(); } } }
    AC.resume(); armedUntil = 0;
    if (p.isObj) { if (me) { me.throwAt = now; me.dir = Math.sign(p.x - me.x) || me.dir; spawnShot(myT, myThrow, me, p, now); send(p.isDoll ? { t: 'sthrow', d: p.o.id, item: myThrow } : { t: 'sthrow', k: p.o.k, item: myThrow }); } }       // 뿌셔뿌셔 물건: 내 화면에서 바로 쏘고, 친구들에겐 같이 보이게 알림
    else send(p.isBoss ? { t: 'bthrow', item: myThrow } : { t: 'throw', to: p.id, item: myThrow }); }
  else if (me && myCd >= 1000) sayFx({ type: 'text', x: me.x, y: GROUND() - (me.bh || 50) - 44, text: `쿨타임 ${((myCd - (now - useCd.last.get('throw'))) / 1000).toFixed(1)}초`, start: now, dur: 900, color: '#8ecbff' });
}
let holdAtk = null; const mouse = { x: -1e4, y: -1e4 };
addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
addEventListener('mouseup', () => { holdAtk = null; }); addEventListener('blur', () => { holdAtk = null; });
const setHold = (p, now) => { if (!lockedT(myT)) holdAtk = { p, start: now }; };       // 어떤 무기든 꾹 누르고 있으면 자동으로 계속 공격 (쿨타임/과열은 그대로 적용)
cv.addEventListener('mousedown', (e) => {
  const now = performance.now(); if (e.button === 0 && (megaClick(e.offsetX, e.offsetY) || quizClick(e.offsetX, e.offsetY, now))) return;
  const p = hitTest(e.offsetX, e.offsetY, now, e.button); if (!p) { if (e.button === 0 && fxc.smash && smashAt(e.offsetX, e.offsetY, now)) smashHeld = true; return; }
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (p.isBoss) { attack(p, now); setHold(p, now); return; }
  if (e.button === 2) p.infoUntil = now + 4000;                                              // 오른쪽 클릭: 레벨/경험치 카드
  if (p.id === myId) {
    if (e.button === 0) { window.api.selfClick(); selfClick.click(now); }                                                  // 한 번: 입력창 / 두 번: 크기 효과
    else if (e.button === 2 && cfg.throwGuard && rightClick.press(now)) armedUntil = now + IA.THROW.armMs;   // 오른쪽 두 번: 10초 동안 던지기 대기
  } else if (e.button === 0 && throwOn(now)) {
    if (IA.isGuarded(p, now)) { blockFx(center(p), now); return; }                          // 기절 중이거나 막 풀린(무적) 친구에게는 던질 수 없음
    attack(p, now); setHold(p, now);
  }
});

// 입력창(별도 창)과의 연결: 메시지 보내기 / 입력 중 표시
let typingOn = false, typingTimer = 0;
function setTyping(on) {
  clearTimeout(typingTimer); if (on) typingTimer = setTimeout(() => setTyping(false), 4000);
  if (on !== typingOn) { typingOn = on; send({ t: 'typing', on }); const me = peers.get(myId); if (me) me.typing = on ? performance.now() + 4000 : 0; }
}
window.api.onComposerTyping(setTyping);
window.api.onChatSend((text, mega) => { const ok = !!myId && ws && ws.readyState === 1; if (ok) { send({ t: 'chat', text, bubble: mega ? 'mega' : cfg.bubble }); setTyping(false); } window.api.chatResult(ok); });
window.api.onPresence((s) => { myState = s; send({ t: 'presence', state: s }); const me = peers.get(myId); if (me) me.state = s; });

// ---------- 그리기 ----------
const DOT = { online: '#34c759', away: '#ff9f0a', offline: '#ff453a' };   // 초록=온라인, 주황=자리 비움, 빨강=오프라인
function nameplate(p, top) {                         // SIDEY처럼: [●] (이름 · 나) 알약
  const label = p.name + (p.id === myId ? ' · 나' : '');
  g.font = '600 12px system-ui, sans-serif';
  const pw = Math.ceil(g.measureText(label).width) + 18, h = 20, gap = 5, dotR = 4, total = dotR * 2 + gap + pw; p.nameW = total;
  const x0 = Math.min(W - total - 4, Math.max(4, p.x - total / 2)), y = top - 6 - h;
  g.fillStyle = 'rgba(36,40,48,0.9)'; g.beginPath(); g.roundRect(x0 + dotR * 2 + gap, y, pw, h, 8); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(label, x0 + dotR * 2 + gap + pw / 2, y + 14.5);
  g.fillStyle = DOT[p.state] || DOT.online; g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(x0 + dotR, y + h / 2, dotR, 0, 7); g.fill(); g.stroke();
}
let lastBubW = 0, bubOff = 0;
function spiky(x, y, w, h, pad, sp) {                                      // 삐죽삐죽한 폭발 말풍선 모양
  const x0 = x - pad, y0 = y - pad, x1 = x + w + pad, y1 = y + h + pad, nx = Math.max(3, Math.round((x1 - x0) / 13)), ny = Math.max(2, Math.round((y1 - y0) / 13)), pts = []; let i = 0;
  const add = (px, py, ox, oy) => { const o = i++ % 2 ? sp + Math.random() * 2 : 0; pts.push([px + ox * o, py + oy * o]); };
  for (let k = 0; k < nx; k++) add(x0 + (x1 - x0) * k / nx, y0, 0, -1);
  for (let k = 0; k < ny; k++) add(x1, y0 + (y1 - y0) * k / ny, 1, 0);
  for (let k = 0; k < nx; k++) add(x1 - (x1 - x0) * k / nx, y1, 0, 1);
  for (let k = 0; k < ny; k++) add(x0, y1 - (y1 - y0) * k / ny, -1, 0);
  g.beginPath(); pts.forEach(([a, b], j) => (j ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath();
}
function bubble(text, cx, bottom, st, tail = true, shout = false) {                       // 말풍선 하나 그리기 -> 위쪽 y 를 돌려줌(위에 다음 말풍선을 쌓기 위해)
  g.font = '13px system-ui, sans-serif';
  const lines = []; let line = '';
  for (const w of text.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > 170 && line) { lines.push(line); line = w; } else line = t;
  }
  lines.push(line);
  const w = Math.max(...lines.map((l) => g.measureText(l).width)) + (shout ? 26 : 16), h = lines.length * 16 + (shout ? 16 : 10);
  lastBubW = w; const x = Math.min(W - w - 4, Math.max(4, cx + bubOff - w / 2)), y = bottom - h - (shout ? 14 : 8);
  if (shout) { g.save(); g.translate(Math.random() * 5 - 2.5, Math.random() * 4 - 2); g.fillStyle = '#fff7c2'; g.strokeStyle = '#e5242b'; g.lineWidth = 2.5; spiky(x, y, w, h, 3, 7); g.fill(); g.stroke(); g.fillStyle = '#c1121f'; g.textAlign = 'left'; g.font = '800 13px system-ui, sans-serif'; lines.forEach((l, i) => g.fillText(l, x + 13, y + 22 + i * 16)); g.restore(); return y - 8; }
  g.fillStyle = st.bg; g.strokeStyle = st.border; g.lineWidth = 2;
  g.beginPath(); g.roundRect(x, y, w, h, 8); g.fill(); g.stroke();
  if (tail) { g.beginPath(); { const tx = Math.min(x + w - 12, Math.max(x + 12, cx)); g.moveTo(tx - 5, y + h); g.lineTo(tx, y + h + 7); g.lineTo(tx + 5, y + h); } g.fill(); }
  g.fillStyle = st.text; g.textAlign = 'left';
  lines.forEach((l, i) => g.fillText(l, x + 8, y + 18 + i * 16));
  return y;
}
function bubbles(list, cx, bottom, off = 0) {
  bubOff = off;                                       // 최신 말풍선이 캐릭터 가장 가까이, 이전 것은 그 위로 쌓음 (꼬리는 최신 것만)
  let b = bottom, mw = 0;
  for (let i = list.length - 1; i >= 0; i--) { const it = list[i], newest = i === list.length - 1; g.globalAlpha = it.alpha * (newest ? 1 : 0.9); b = bubble(it.text, cx, b, it.style, newest, !!it.shout) + 4; mw = Math.max(mw, lastBubW); }
  g.globalAlpha = 1; bubOff = 0; return { w: mw, top: b, bottom };
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
  if (p.throwAt && now >= p.throwAt && now - p.throwAt < 390) return ['throw', now - p.throwAt];
  if (p.state === 'away') return ['doze', now];
  return [p.walking ? 'walk' : 'idle', now];
}
const visW = (p) => Math.min(190, Math.max(p.bw || 40, p.nameW || 0, p.bubW || 0));   // 겹침 판단 폭: 몸/이름표/말풍선 중 가장 넓은 것
const frozen = (p, now) => p.state !== 'online' || p.stunUntil > now || p.castUntil > now || now - p.hitAt < IA.HIT_MS || now - p.throwAt < 390;

if (cfg.testMode) window.__t = { peers, shots, fx, get myId() { return myId; }, get boss() { return boss; }, bossProxy, get xps() { return xps; }, get lks() { return lks; }, set lks(v) { lks = v; }, get fleeFx() { return fleeFx; }, get quizSaved() { return quizSaved; }, get quiz() { return quiz; }, get smash() { return { objs: sobjs, fxc, broken: [...sBroken], dolls }; } };         // (시험 전용) 환경변수 PIXELPALS_TEST_CURSOR 를 줬을 때만 상태를 들여다볼 수 있게 함
let last = performance.now(), lastPos = 0, sentWalk = false, lastRegions = 0, lastRegionKey = '', lastRegionSend = 0;
// ---- 뿌셔뿌셔 존 (방장이 켜면 물건이 떨어져 쌓이고, 클릭/드래그하면 재질에 맞게 부서짐) + 외침 단어 ----
let fxc = { smash: false, rate: Smash.RATE_DEFAULT, t0: 0, words: [] }; const sobjs = [], sBroken = new Set(); let sNextK = null, combo = { n: 0, at: 0 }, smashHeld = false;
const isShout = (text) => { const t = String(text || '').toLowerCase(); return fxc.words.some((w) => w && t.includes(String(w).toLowerCase())); };
function setFx(m, live, now) {
  const was = fxc.smash, t0 = fxc.t0; fxc = { smash: !!(m && m.smash), rate: m && Number.isFinite(Number(m.rate)) ? Number(m.rate) : Smash.RATE_DEFAULT, t0: (m && m.t0) || 0, words: Array.isArray(m && m.words) ? m.words : [] };
  if (fxc.t0 !== t0 || !fxc.smash) { sNextK = null; sBroken.clear(); }
  syncDolls(m && fxc.smash ? m.dolls : [], live, now);
  if (!fxc.smash) { if (sobjs.length) { for (const o of sobjs) parts(o.x, o.y, 4, ['#ffffff', '#cfd4e4'], { min: 20, max: 90, gy: 100, size: 3 }); sobjs.length = 0; } }
  if (live && fxc.smash && !was) banner(`💥 뿌셔뿌셔 존이 열렸어요! 무기로 쏴서 부숴 보세요 (대포·폭탄은 주변까지!)${dolls.length ? ' · 상사 인형도 나타났어요 😈' : ''}`, '#ffd23f', now, 6000);
  if (live && !fxc.smash && was) banner('뿌셔뿌셔 존이 닫혔어요', '#cfd4e4', now, 3500);
}
function updateSmash(now, dt) {
  if (!fxc.smash || !myId) return;
  const sNow = serverNow(), kNow = Smash.indexAt(sNow, fxc.t0, fxc.rate); if (sNextK == null) sNextK = Math.max(0, kNow);
  for (let n = 0; sNextK <= kNow && n < 4; n++, sNextK++) if (!sBroken.has(sNextK)) sobjs.push(Smash.make(sNextK, fxc.t0, W, now));
  Smash.step(sobjs, dt, W, GROUND()); Smash.trim(sobjs, now);
}
function drawSmash(now) { for (const o of sobjs) { const a = Smash.alphaOf(o, now); if (a < 1) g.globalAlpha = a; Smash.draw(g, o, o === smashHover); g.globalAlpha = 1; } }
let smashHover = null;

// ---- 상사 봉제인형 (남자상사/여자상사): 체력 50, 서버가 체력을 관리, 1초마다 다른 대사 ----
const dolls = [], dollImgs = {}; for (const id of ['m', 'f']) { const im = new Image(); im.src = '../shared/' + Dolls.META[id].img; dollImgs[id] = im; }
function syncDolls(list, live, now) {
  const old = new Map(dolls.map((d) => [d.id, d])); dolls.length = 0;
  for (const x of list || []) {
    if (x.hp <= 0) continue; const M = Dolls.META[x.id], im = dollImgs[x.id]; if (!M) continue;
    const o = old.get(x.id) || { id: x.id, hitAt: -1e9, landed: !live, born: fxc.t0, x: 0, y: 0, h: M.h, w: 0 }; o.hp = x.hp; o.xf = x.x; dolls.push(o);
  }
}
const dollTgt = (d) => d.tgt || (d.tgt = { isObj: true, isDoll: true, o: d, id: 'doll' + d.id, state: 'online', look: 0, get x() { return d.x; }, get cy() { return d.y; }, get bw() { return d.w; }, get bh() { return d.h; } });
function updateDolls(now) {
  const sNow = serverNow();
  for (const d of dolls) {
    const im = dollImgs[d.id]; d.w = im.naturalWidth ? d.h * im.naturalWidth / im.naturalHeight : d.h * 0.6;
    d.x = Math.min(W - d.w / 2 - 4, Math.max(d.w / 2 + 4, d.xf * W)); const td = (sNow - d.born) / 1000;
    d.drop = td < 0.8 ? -(H + 40) * Math.pow(1 - Math.max(0, td) / 0.8, 2) : 0;                 // 켜지면 하늘에서 쿵 떨어짐
    d.y = GROUND() - d.h / 2 + 6 + d.drop;
    if (!d.landed && td >= 0.8) { d.landed = true; fx.push({ type: 'ring', x: d.x, y: GROUND() - 4, start: now, dur: 380, color: '#cfd4e4', r: 80 }); parts(d.x, GROUND() - 6, 12, ['#ffffff', '#cfd4e4'], { angle: -Math.PI / 2, spread: 1.4, min: 50, max: 180, gy: 200, size: 4 }); shakeUntil = Math.max(shakeUntil, now + 200); if (!quiet) SND.sm_plush(); }
  }
}
function drawDolls(now) {
  const sNow = serverNow(), sec = Math.floor(sNow / 1000);
  for (const d of dolls) {
    const im = dollImgs[d.id], M = Dolls.META[d.id]; if (!im.complete || !im.naturalWidth) continue;
    const hit = Math.max(0, 1 - (now - d.hitAt) / 420), ang = Math.sin((now - d.hitAt) / 38) * 0.16 * hit * hit * (d.hitDir || 1), sq = 1 - 0.07 * hit;
    g.save(); g.translate(d.x, d.y + d.h / 2); g.rotate(ang); g.scale(1 + 0.05 * hit, sq); if (hit > 0.6) g.filter = 'brightness(1.8)';
    g.drawImage(im, -d.w / 2, -d.h, d.w, d.h); g.restore(); g.filter = 'none';
    if (d.drop < -20) continue;
    const top = d.y - d.h / 2 - 8 + (d.drop || 0) * 0;                                           // 머리 위: 체력바 + 이름, 그 위에 말풍선
    const bw = 74, bx = d.x - bw / 2, by = top - 14;
    g.fillStyle = 'rgba(20,20,40,.75)'; g.beginPath(); g.roundRect(bx - 2, by - 2, bw + 4, 12, 5); g.fill();
    g.fillStyle = d.hp > 25 ? '#4cd964' : d.hp > 12 ? '#ffd23f' : '#ff5d5d'; g.beginPath(); g.roundRect(bx, by, bw * d.hp / Dolls.HP, 8, 4); g.fill();
    g.font = '700 10px system-ui, sans-serif'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(20,20,40,.9)'; g.strokeText(`${M.name} ${d.hp}/${Dolls.HP}`, d.x, by - 5); g.fillStyle = '#fff'; g.fillText(`${M.name} ${d.hp}/${Dolls.HP}`, d.x, by - 5);
    if (!quiet) bubble(Dolls.lineAt(d.id, fxc.t0, sec), d.x, by - 16, M.style, true);
  }
}
function dollHp(m, now) {                                                             // 서버가 알려 준 체력 (내가 때린 것, 친구가 때린 것 모두)
  const d = dolls.find((q) => q.id === m.d); if (!d) return; const M = Dolls.META[d.id];
  d.hp = m.hp; d.hitAt = now; d.hitDir = Math.random() < 0.5 ? -1 : 1;
  fx.push({ type: 'text', x: d.x + rnd(-14, 14), y: d.y - d.h / 2 - 34, text: `-${m.dmg}`, start: now, dur: 800, color: '#ffd23f', size: 16 });
  parts(d.x + rnd(-14, 14), d.y - d.h * 0.1, 7, M.cotton, { min: 60, max: 200, up: 90, gy: 420, size: 5, dmin: 350, dmax: 700 });                // 솜이 뽀송 튀어나옴
  if (!quiet && !m.mute) SND.sm_plush();
  if (m.hp <= 0) {
    parts(d.x, d.y, 46, M.cotton, { min: 90, max: 420, up: 160, gy: 500, size: 7, dmin: 600, dmax: 1300 });
    fx.push({ type: 'ring', x: d.x, y: d.y, start: now, dur: 520, color: '#fff6e0', r: 130 }); shakeUntil = Math.max(shakeUntil, now + 350);
    const by = peers.get(m.by); banner(`🧸 ${M.name} 인형이 해체됐어요!${by ? ` (마지막 한 방: ${by.name})` : ''}`, '#ffd23f', now, 5000);
    dolls.splice(dolls.indexOf(d), 1);
  }
}
function dollHits(s, t, R, skip) {                                                    // 맞은 자리(t) 반경 R 안의 상사 인형들에게 줄 피해 (쏜 사람 화면에서만 정해서 서버에 알림)
  const base = ((s.T && s.T.dmg) || 1) + Bz.dmgBonus(Bz.levelInfo(xps[cfg.uid] || 0).lv), hits = [];
  for (const d of dolls) if (d !== skip && d.hp > 0 && Math.hypot(d.x - t.x, d.y - t.y) <= R + d.h / 2) hits.push({ d: d.id, dmg: base });
  return hits;
}
function dollResolve(s, t, now) {
  const d0 = s.to.o; if (!s.fromMe) return; const R = SPLASH[s.kind] || 0, hits = [];
  if (d0.hp > 0) hits.push({ d: d0.id, dmg: ((s.T && s.T.dmg) || 1) + Bz.dmgBonus(Bz.levelInfo(xps[cfg.uid] || 0).lv) });
  if (R) hits.push(...dollHits(s, t, R, d0));
  if (hits.length) send({ t: 'dhit', hits: hits.slice(0, 2) });
  if (R) splashObjects(s, t, now, R, null);                                      // 터지는 무기는 인형 옆 물건도 같이 부숨
}
const objTgt = (o) => o.tgt || (o.tgt = { isObj: true, o, id: 'obj' + o.k, state: 'online', look: 0, get x() { return o.x; }, get cy() { return o.y; }, get bw() { return 2 * o.r; }, get bh() { return 2 * o.r; } });
const SPLASH = { bomb: 130, cannon: 210, missile: 90, punch: 90, wave: 55 };      // 터지는 무기는 주변 물건도 같이 부숨 (반경 px)
function splashObjects(s, t, now, R, o0) {                                         // 터진 자리 주변 물건들 (o0 은 직접 맞은 물건)
  const hit = []; if (o0 && sobjs.includes(o0)) hit.push(o0);
  if (R) for (const o of sobjs) if (o !== o0 && Math.hypot(o.x - t.x, o.y - t.y) <= R + o.r) hit.push(o);
  if (!hit.length) return;
  send({ t: 'smash', k: hit.map((o) => o.k).slice(0, 40) });
  hit.forEach((o) => { sBroken.add(o.k); const d = o === o0 ? 0 : Math.hypot(o.x - t.x, o.y - t.y) * 1.1; if (d) setTimeout(() => { if (sobjs.includes(o)) breakObj(o, performance.now(), true); }, d); else breakObj(o, now, true); });   // 폭발이 퍼지듯 먼 것일수록 조금 늦게 터짐
}
function smashResolve(s, t, now) {                                                  // 무기가 물건/인형에 맞은 순간 (쏜 사람 화면에서만 부술 것을 정하고, 친구들에게 알림)
  if (!s.fromMe) return; if (s.to.isDoll) return dollResolve(s, t, now);
  const R = SPLASH[s.kind] || 0; splashObjects(s, t, now, R, s.to.o);
  if (R) { const hits = dollHits(s, t, R, null); if (hits.length) send({ t: 'dhit', hits: hits.slice(0, 2) }); }      // 폭발 근처의 상사 인형도 같이 맞음
}
function breakObj(o, now, mine) {
  const i = sobjs.indexOf(o); if (i >= 0) sobjs.splice(i, 1); const M = Smash.MATS[o.mat];
  const cols = o.mat === 'balloon' ? [o.hue, '#ffffff'] : M.colors, big = o.mat === 'melon' || o.mat === 'wood';
  parts(o.x, o.y, o.mat === 'balloon' ? 8 : 16, cols, { min: 70, max: o.mat === 'balloon' ? 160 : 300, up: 120, gy: 700, size: o.mat === 'melon' ? 7 : 5, dmin: 350, dmax: 750 });
  fx.push({ type: 'ring', x: o.x, y: o.y, start: now, dur: 260, color: o.mat === 'balloon' ? o.hue : '#ffffff', r: o.r * 2.2 });
  if (big) shakeUntil = Math.max(shakeUntil, now + 90);
  if (!quiet) SND['sm_' + o.mat]();
  if (mine) {
    combo = now - combo.at < 1400 ? { n: combo.n + 1, at: now } : { n: 1, at: now };
    if (combo.n >= 3) fx.push({ type: 'text', x: o.x, y: o.y - o.r - 12, text: `💥 ${combo.n} COMBO!`, start: now, dur: 800, color: combo.n >= 10 ? '#ff6b4a' : '#ffd23f', size: Math.min(26, 14 + combo.n) });
  }
}
const dollAt = (x, y) => dolls.find((d) => d.hp > 0 && d.drop > -20 && Math.abs(x - d.x) < d.w / 2 && Math.abs(y - d.y) < d.h / 2);
function smashAt(x, y, now) { const o = Smash.hit(sobjs, x, y), d = o ? null : dollAt(x, y); if (!o && !d) return false; if (throwOn(now)) { const tg = d ? dollTgt(d) : objTgt(o); attack(tg, now); setHold(tg, now); } return true; }       // 클릭 = 지금 고른 무기로 그 물건을 쏨
cv.addEventListener('mousemove', (e) => { if (!fxc.smash) { smashHover = null; return; } smashHover = Smash.hit(sobjs, e.offsetX, e.offsetY); const dh = smashHover ? null : dollAt(e.offsetX, e.offsetY); if (smashHeld && (smashHover || dh) && throwOn(performance.now())) attack(dh ? dollTgt(dh) : objTgt(smashHover), performance.now()); });
addEventListener('mouseup', () => { smashHeld = false; });

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  g.clearRect(0, 0, W, H); g.save();
  if (now < shakeUntil) g.translate(rnd(-4, 4), rnd(-3, 3));                  // 폭발할 때 화면이 살짝 흔들림
  updateSmash(now, dt); updateDolls(now); drawDolls(now); drawSmash(now);                                      // 뿌셔뿌셔 존 물건은 캐릭터 뒤에 그림

  for (const p of peers.values()) {
    if (p.state === 'offline') continue;
    if (p.kb) {                                    // 맞고 날아가는 중: 내 캐릭터든 친구든 모든 화면이 같은 계산으로 날려 보냄 (서버 위치 신호는 끝난 뒤에 맞춤)
      const k = p.kb, r = IA.stepKnock(p, dt, W);
      if (r.bounced) wallFx(p, r.impact, now);
      k.spin += Math.sign(k.v) * Math.min(16, Math.abs(k.v) / 150) * dt;                                    // 빠를수록 빙글빙글
      if (Math.abs(k.v) < 300) k.spin += (Math.round(k.spin / (2 * Math.PI)) * 2 * Math.PI - k.spin) * Math.min(1, dt * 10);   // 느려지면 똑바로 서도록 부드럽게
      if (Math.abs(k.v) > 500 && Math.random() < dt * 40) parts(p.x, GROUND() - 16, 1, ['#ffffff', '#cfd4e4'], { min: 10, max: 60, gy: 80, size: 4, dmin: 200, dmax: 350 });    // 지나간 자리에 먼지
    }
    if (p.id === myId) {                           // 내 캐릭터: 혼자 어슬렁어슬렁 (졸거나 맞는 중엔 멈춤)
      if (frozen(p, now)) { p.walking = false; p.passing = false; p.boost = 1; }
      else {
        // 다른 캐릭터와 겹쳐서 말풍선/이름표가 가려질 땐, 가던 방향 그대로 겹친 동안만 속도를 부드럽게 3배로 올려서 서로 빠르게 지나감 (밀어내거나 피하지 않음)
        const others = []; for (const o of peers.values()) if (o.id !== myId && o.state !== 'offline') others.push({ id: o.id, x: o.x, w: visW(o), dir: o.dir, walking: !!o.walking, canWalk: o.state === 'online' && !frozen(o, now) && !o.kb });
        const pl = IA.passPlan({ x: p.x, w: visW(p), dir: p.dir, walking: !!p.walking, others, myId, active: !!p.passing });
        p.passing = pl.overlapping;
        if (pl.stay) { p.walking = false; p.tx = null; p.wait = Math.max(p.wait || 0, 0.35); }                       // 상대가 지나가는 동안 나는 가만히 서 있음
        if (pl.startWalking && p.wait > 0) { p.wait = 0; p.tx = null; }                                              // 둘 다 서 있으면(또는 상대가 졸고 있으면) 기다리던 걸 멈추고 걷기 시작
        const want = pl.mul; p.boost = (p.boost || 1) + (want - (p.boost || 1)) * Math.min(1, dt * IA.PASS.easePerSec);   // 순간 확 바뀌지 않고 부드럽게 빨라졌다 느려짐
        if (p.wait > 0) { p.wait -= dt; p.walking = false; }
        else {
          if (pl.overlapping && pl.near && p.walking) { const nt = IA.passTarget({ near: pl.near, x: p.x, W, preferDir: p.dir }); if (p.tx == null || Math.sign(p.tx - p.x) !== p.dir || Math.abs(p.tx - pl.near.x) < pl.near.clear) p.tx = nt; }
          if (p.tx == null) { if (pl.startWalking && pl.near) p.tx = IA.passTarget({ near: pl.near, x: p.x, W, preferDir: Math.random() < 0.5 ? -1 : 1 }); else p.tx = IA.wanderTarget({ x: p.x, w: visW(p), others, W }); }
          const d = p.tx - p.x;
          if (Math.abs(d) < 2) { p.tx = null; p.wait = 1 + Math.random() * 4; p.walking = false; }
          else { p.dir = Math.sign(d); p.x += p.dir * SPEED * p.boost * dt; p.walking = true; }
        }
      }
    } else {                                       // 친구 캐릭터: 받은 위치로 부드럽게
      const d = p.rx * W - p.x;
      p.walking = IA.remoteWalking(now, p.lastMoveAt, d, p.syncWalk) && !frozen(p, now);          // 보내는 쪽이 알려 준 상태를 따름 (신호가 늦어도 안 흔들림)
      if (!p.kb) p.x += d * Math.min(1, dt * 8);                                            // 날아가는 동안은 직접 계산한 위치를 씀
    }
  }
  const me = peers.get(myId);
  if (me && (now - lastPos > 200 || !!me.walking !== sentWalk)) { lastPos = now; sentWalk = !!me.walking; send({ t: 'pos', x: me.x / W, w: sentWalk ? 1 : 0, d: me.dir < 0 ? -1 : 1, e: myT.id }); }   // 걷는 중 여부(w)와 방향(d)을 같이 알림

  {                                                // 말풍선끼리 겹치면 그 동안만 서로 반대쪽으로 살짝 비켜 줌 (떨어지면 부드럽게 제자리로)
    const tg = new Map(), bl = []; for (const p of peers.values()) { tg.set(p, 0); if (p.bb && p.state !== 'offline' && !quiet) bl.push(p); }
    for (let i = 0; i < bl.length; i++) for (let j = i + 1; j < bl.length; j++) {
      const a = bl[i], b = bl[j]; if (a.bb.top > b.bb.bot + 2 || b.bb.top > a.bb.bot + 2) continue;          // 세로로 안 겹치면 무시
      const need = (a.bb.w + b.bb.w) / 2 + 8 - Math.abs(a.x - b.x); if (need <= 0) continue;
      const sg = a.x === b.x ? (IA.idLess(a.id, b.id) ? -1 : 1) : Math.sign(a.x - b.x);                     // a 가 오른쪽이면 +
      tg.set(a, tg.get(a) + sg * need / 2); tg.set(b, tg.get(b) - sg * need / 2);
    }
    for (const p of peers.values()) { const t = Math.max(-120, Math.min(120, tg.get(p))); p.bOff = (p.bOff || 0) + (t - (p.bOff || 0)) * Math.min(1, dt * 10); if (Math.abs(p.bOff) < 0.3 && !t) p.bOff = 0; }
  }
  updateBoss(now); pumpBurns(now); drawBoss(now); drawFlee(now);
  if (holdAtk) {                                                                // 꾹 누르고 있으면 계속 공격 (대상 위에서 마우스를 떼거나 벗어나면 멈춤)
    const hp = holdAtk.p, big = hp.isBoss || hp.isObj;
    const alive = hp.isDoll ? hp.o.hp > 0 && dolls.includes(hp.o) : hp.isObj ? sobjs.includes(hp.o) : hp.isBoss ? (boss && !boss.dead) : (peers.has(hp.id) && hp.state !== 'offline');
    const hh = big ? hp.bh : (hp.bh || 50), hcy = big ? hp.cy : GROUND() - hh / 2;
    if (!alive || !myId || selfStunned(now) || Math.abs(mouse.x - hp.x) > (hp.bw || 40) / 2 + 40 || Math.abs(mouse.y - hcy) > hh / 2 + 40) holdAtk = null;
    else if (hp.isBoss || hp.isObj || !IA.isGuarded(hp, now)) { autoFire = true; attack(hp, now); autoFire = false; }
  }
  for (const p of peers.values()) {
    p.lx = lungeX(p, now);
    const [state, t] = motionOf(p, now), b0 = bounds(p.look, state, t), base = { w: b0.w * SIZE, h: b0.h * SIZE };
    let scale = 1;                                  // 크기 효과: 1배 -> 7배 -> 1배 (오프라인은 제외)
    if (p.state !== 'offline' && p.pulseAt) { const el = (now - p.pulseAt) / 1000; if (el > IA.PULSE.up + IA.PULSE.down) p.pulseAt = 0; else scale = IA.pulseScale(el); }
    scale = Math.min(scale, Math.max(1, (H - 34) / Math.max(1, base.h)));      // 화면 위로 잘리지 않게
    p.bw = base.w * scale; p.bh = base.h * scale; p.sc = scale * SIZE;
    g.globalAlpha = p.state === 'offline' ? 0.75 : (p.stunUntil <= now && IA.isGuarded(p, now) && Math.floor(now / 100) % 2 ? 0.4 : 1);       // 기절이 풀린 뒤 무적인 동안 깜빡임
    let top;
    if (p.kb) {                                    // 날아가는 중: 속도에 비례해 떠오르고 빙글빙글 돎
      const lift = Math.min(46, Math.abs(p.kb.v) * 0.025), bh = p.bh || 50, cy = GROUND() - lift - bh / 2;
      g.save(); g.translate(p.x, cy); g.rotate(p.kb.spin); draw(g, p.look, 0, bh / 2, { state, t, flip: p.dir < 0, scale: scale * SIZE }); g.restore(); top = GROUND() - lift - bh;
    } else {
      top = draw(g, p.look, p.x + (p.lx || 0), GROUND(), { state, t, flip: p.dir < 0, scale: scale * SIZE });
      if (p.burnUntil > now) { g.save(); g.filter = 'sepia(1) saturate(8) hue-rotate(-38deg)'; g.globalAlpha = 0.5 + 0.15 * Math.sin(now / 80); draw(g, p.look, p.x + (p.lx || 0), GROUND(), { state, t, flip: p.dir < 0, scale: scale * SIZE }); g.restore(); }      // 화상: 살짝 빨개짐
    }
    { const HT = !p.kb && p.state !== 'offline' ? heldOf(p, now) : null; if (HT && !(HT.kind === 'punch' && drawPunch(p, now))) drawHeld(p, now, HT); }        // 저격총을 고른 캐릭터는 총을 들고 있음 (쏠 땐 대상을 겨눔)
    g.globalAlpha = 1;
    nameplate(p, top); p.bubW = 0;
    p.top = top;
    if (!quiet) {
      const vb = IA.visibleBubbles(p.bubbles, now);
      if (vb.length) { const r = bubbles(vb, p.x, top - 32, p.bOff || 0); p.bubW = r.w; p.bb = { w: r.w, top: r.top, bot: top - 32 }; } else { p.bb = null; if (p.typing > now) typingDots(p.x, top - 32, now); }
    }
    if (p.infoUntil > now) infoCard(p, top, now);
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
      if (p.state === 'offline') continue;
      const w = (p.bw || width(p.look) * SIZE) + 8, h = (p.bh || height(p.look) * SIZE) + 4; rects.push({ x: Math.round(p.x - w / 2), y: Math.round(GROUND() - h + 2), w: Math.round(w), h: Math.round(h) });
    }
    if (boss && !boss.dead && !boss.judge && myId && throwOn(now)) rects.push({ x: Math.round(bossProxy.x - bossProxy.bw / 2 - 4), y: Math.round(bossProxy.cy - bossProxy.bh / 2 - 4), w: Math.round(bossProxy.bw + 8), h: Math.round(bossProxy.bh + 8) });   // 보스도 클릭 가능 영역
    if (fxc.smash) for (const o of sobjs) if (o.y > -o.r) rects.push({ x: Math.round(o.x - o.r - 4), y: Math.round(o.y - o.r - 4), w: Math.round(2 * o.r + 8), h: Math.round(2 * o.r + 8) });   // 부술 수 있는 물건도 클릭 가능 영역
    if (fxc.smash) for (const d of dolls) if (d.hp > 0 && d.drop > -20) rects.push({ x: Math.round(d.x - d.w / 2), y: Math.round(d.y - d.h / 2), w: Math.round(d.w), h: Math.round(d.h) });
    for (const r of megaRects) rects.push({ x: Math.round(r.x), y: Math.round(r.y), w: r.w, h: r.h });   // 안내 창 X 버튼도 클릭 가능 영역
    if (quizBounds) rects.push({ x: Math.round(quizBounds.x), y: Math.round(quizBounds.y), w: Math.round(quizBounds.w), h: Math.round(quizBounds.h) });   // 퀴즈 카드도 클릭 가능 영역
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
      if (s.kind === 'gun') { (s.T && s.T.id === 'gat' ? SND.gat : SND.shot)(); fx.push({ type: 'flash', x: s.x0, y: s.y0, start: now, dur: 110, angle: Math.atan2(tc.y - s.y0, tc.x - s.x0) }); }
      else if (s.kind === 'missile') SND.whoosh();
      else if (s.kind === 'staff') { SND.whoosh(); const col = ELEM[s.elem]; fx.push({ type: 'ring', x: s.x0, y: s.y0, start: now, dur: 360, color: col[0], r: 46 }); parts(s.x0, s.y0, 10, col, { min: 60, max: 220, gy: 0, dmin: 250, dmax: 450, size: 4 }); }
      else if (s.kind === 'cannon') { SND.cannon(); const ang = Math.atan2(tc.y - s.y0, tc.x - s.x0); fx.push({ type: 'boom', x: s.x0 + Math.cos(ang) * 16, y: s.y0 + Math.sin(ang) * 16, start: now, dur: 380, seed: Math.random() * 6, sc: 0.6 }); fx.push({ type: 'flash', x: s.x0, y: s.y0, start: now, dur: 220, angle: ang });
        parts(s.x0, s.y0, 16, ['#ffffff', '#cfd4e4', '#8d99ae', '#ffd23f', '#ff9f1c'], { angle: ang, spread: 0.45, min: 80, max: 380, gy: -30, size: 8, dmin: 500, dmax: 1000 }); fx.push({ type: 'ring', x: s.x0 + Math.cos(ang) * 22, y: s.y0 + Math.sin(ang) * 22, start: now, dur: 320, color: '#ffe9a8', r: 46 }); shakeUntil = Math.max(shakeUntil, now + 220); }
      else if (s.kind === 'bow') SND.twang();
      else if (s.kind === 'flame') SND.flame();
      else if (s.kind === 'wave') SND.slash();
      else if (s.kind === 'axe' || s.kind === 'punch') SND.whoosh();
    }
    if (t >= 1) { impact(s, tc, now); shots.splice(i, 1); continue; }
    if (s.tier >= 1 && s.kind !== 'punch' && s.kind !== 'flame') { const ap = shotPos(s, tc, t); if (ap) drawGlow(ap.x, ap.y, (s.kind === 'gun' ? 13 : s.kind === 'cannon' ? 20 : 16) * SIZE, s.tier, now); }
    if (s.kind === 'flame') {                                                      // 불길: 총구에서 대상 쪽으로 쉴 새 없이 뿜어져 나옴
      const mz = gunMuzzle(s.from, now, 'flamer', s.T.hs), dx = tc.x - mz.x, dy = tc.y - mz.y, dist = Math.max(60, Math.hypot(dx, dy)), ang = Math.atan2(dy, dx), n = Math.ceil(dt * 110);
      for (let q = 0; q < n; q++) {                                                // 말랑한 불길 덩어리들이 앞으로 퍼지며 날아감 (대포처럼 한 방에 터지지 않고 계속 뿜어져 나옴)
        const sp = dist / 0.42 * rnd(0.8, 1.12), a2 = ang + rnd(-0.07, 0.07), pj = rnd(-3, 3);
        fx.push({ type: 'fpuff', x: mz.x - Math.sin(ang) * pj, y: mz.y + Math.cos(ang) * pj, vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp - 30, r0: 5 * SIZE, r1: rnd(20, 32) * SIZE, start: now, dur: rnd(330, 460) });
        if (Math.random() < 0.35) parts(mz.x, mz.y, 1, ['#fff3b0', '#ffb703', '#ff7b1c'], { angle: ang, spread: 0.22, min: dist * 2.2, max: dist * 3.0, gy: -90, size: 6, dmin: 250, dmax: 400 });
      }
    } else if (s.kind === 'gun') {                                                        // 총알: 일직선, 아주 빠름
      const p = PJ.linePos(s.x0, s.y0, tc.x, tc.y, t), ang = Math.atan2(tc.y - s.y0, tc.x - s.x0);
      g.save(); g.translate(p.x, p.y); g.rotate(ang); g.fillStyle = 'rgba(255,214,102,0.45)'; g.fillRect(-46, -1, 40, 2); g.fillStyle = '#ffd23f'; g.fillRect(-14, -2, 10, 4); g.fillStyle = '#fff8d0'; g.fillRect(-4, -3, 14, 6); g.restore();
    } else if (s.kind === 'cannon') {                                              // 대포알: 빠르게 살짝 포물선 + 연기 꼬리
      const p = PJ.arcPos(s.x0, s.y0, tc.x, tc.y, t, 26 * SIZE), q = PJ.arcPos(s.x0, s.y0, tc.x, tc.y, Math.max(0, t - 0.03), 26 * SIZE), ang = Math.atan2(p.y - q.y, p.x - q.x);
      g.save(); g.translate(p.x, p.y); g.rotate(ang);
      for (let k = 0; k < 4; k++) { g.globalAlpha = 0.85 - k * 0.2; g.fillStyle = k < 2 ? '#ffd23f' : '#ff7b1c'; g.fillRect(-14 - k * 9, -5 + k, 10, 10 - 2 * k); } g.globalAlpha = 1;      // 불꽃 꼬리
      g.fillStyle = '#262626'; g.beginPath(); g.arc(0, 0, 10 * SIZE, 0, 7); g.fill(); g.fillStyle = '#55585f'; g.beginPath(); g.arc(-1, -1, 7.5 * SIZE, 0, 7); g.fill(); g.fillStyle = '#a7acb8'; g.fillRect(-5 * SIZE, -6 * SIZE, 4 * SIZE, 3 * SIZE); g.restore();
      parts(p.x - Math.cos(ang) * 16, p.y - Math.sin(ang) * 16, 1, ['#ffffff', '#cfd4e4', '#8d99ae'], { min: 5, max: 40, gy: -25, size: 8, dmin: 400, dmax: 750 });
    } else if (s.kind === 'axe') {                                                 // 도끼: 빙글빙글 4바퀴 돌며 포물선
      const p = PJ.arcPos(s.x0, s.y0, tc.x, tc.y, t, 85 * SIZE); drawItem(g, 'axe', p.x, p.y, { s: 2.4 * SIZE, angle: t * Math.PI * 8 * s.sign });
    } else if (s.kind === 'bow') {                                                 // 화살: 낮은 포물선, 날아가는 방향으로 기울어짐
      const p = PJ.arcPos(s.x0, s.y0, tc.x, tc.y, t, 30 * SIZE), q = PJ.arcPos(s.x0, s.y0, tc.x, tc.y, Math.min(1, t + 0.02), 30 * SIZE); drawArrow(p.x, p.y, Math.atan2(q.y - p.y, q.x - p.x), SIZE);
    } else if (s.kind === 'wave') {                                                // 참격: 초승달 모양 칼빛이 날아가며 꼬리를 남김 (3개는 각자 기울기가 달라 엇갈려 베는 느낌)
      const p = PJ.linePos(s.x0, s.y0, tc.x, tc.y, t), ang = Math.atan2(tc.y - s.y0, tc.x - s.x0), tilt = [0.55, -0.55, 0][s.i % 3], R = 24 * SIZE;
      for (let k = 3; k >= 0; k--) { const pp = PJ.linePos(s.x0, s.y0, tc.x, tc.y, Math.max(0, t - k * 0.07)); g.save(); g.globalAlpha = k ? 0.2 / k + 0.05 : 1; g.translate(pp.x, pp.y); g.rotate(ang + tilt); g.scale(1 - k * 0.1, 1 - k * 0.1);
        g.beginPath(); g.arc(0, 0, R, -1.15, 1.15); g.arc(-R * 0.55, 0, R * 1.324, 0.7615, -0.7615, true); g.closePath();
        g.fillStyle = k ? 'rgba(150,215,255,.8)' : '#ffffff'; g.fill(); if (!k) { g.strokeStyle = 'rgba(110,200,255,.95)'; g.lineWidth = 3; g.stroke(); } g.restore(); }
      g.globalAlpha = 1; void p;
    } else if (s.kind === 'punch') {                                               // (몸과 주먹은 캐릭터에서 그림)
    } else if (false) {                                               // 주먹: 번쩍 날아가는 황금 장갑 + 잔상
      const flip = Math.cos(s.aim) < 0, ang = flip ? Math.PI - s.aim : s.aim, e = 1 - Math.pow(1 - t, 2);
      for (let k = 3; k >= 0; k--) { const tt = Math.max(0, e - k * 0.12), px = s.x0 + (tc.x - s.x0) * tt, py = s.y0 + (tc.y - s.y0) * tt; g.globalAlpha = k ? 0.22 : 1; drawItem(g, 'glove', px, py, { s: 2.4 * SIZE, flip, angle: ang, ax: itemInfo('glove').pivot[0], ay: itemInfo('glove').pivot[1] }); }
      g.globalAlpha = 1;
    } else if (s.kind === 'staff') {                                               // 스태프 미사일: 불꽃 / 번개 화살 / 물덩이 그림이 곡선을 그리며 날아감
      const tt = Math.pow(t, 1.15), p = PJ.bezier(s.x0, s.y0, s.cx, s.cy, tc.x, tc.y, tt), ang = PJ.bezierAngle(s.x0, s.y0, s.cx, s.cy, tc.x, tc.y, tt), nm = ['fire', 'bolt', 'water'][s.elem], im = mImgs[nm], col = ELEM[s.elem];
      if (im.complete && im.naturalWidth) { const w = 50 * SIZE, h = w * im.naturalHeight / im.naturalWidth; g.save(); g.translate(p.x, p.y); g.rotate(ang - [0.45, 0, 0.12][s.elem]); g.drawImage(im, -w * 0.62, -h / 2, w, h); g.restore(); }
      parts(p.x - Math.cos(ang) * 14, p.y - Math.sin(ang) * 14, 2, col, { min: 5, max: 50, gy: s.elem === 0 ? -50 : 20, size: 4, dmin: 280, dmax: 460 });
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
  if (myT.burst && me) {                                                         // 게틀링건 열 게이지 + 과열 연기
    const over = heat.until > now, lvl = over ? 1 : (now - heat.last > 1200 ? 0 : heat.n / myT.burst);
    if (lvl > 0) { const gx = me.x + (me.bw || 40) / 2 + 10, gh = 34, gy = GROUND() - gh - 4; g.fillStyle = 'rgba(20,20,30,.8)'; g.fillRect(gx - 1, gy - 1, 8, gh + 2); g.fillStyle = over ? (Math.floor(now / 120) % 2 ? '#ff453a' : '#ffd23f') : lvl > 0.6 ? '#ff9f0a' : '#ffd23f'; g.fillRect(gx, gy + gh * (1 - lvl), 6, gh * lvl); }
    if (over && Math.random() < 0.5) { const mz = gunMuzzle(me, now, 'gatling', myT.hs); parts(mz.x, mz.y, 1, ['#8d99ae', '#cfd4e4', '#ffffff'], { min: 10, max: 40, gy: -70, size: 8, dmin: 500, dmax: 900 }); }
  }
  drawQuiz(now);
  drawMegas(now);
  if (status) {                                    // 연결 상태 안내: 연결 중 = 주황, 그 외 = 빨강
    g.fillStyle = status.startsWith('연결 중') ? DOT.away : DOT.offline; g.beginPath(); g.arc(14, H - 12, 4, 0, 7); g.fill();
    g.font = '12px system-ui, sans-serif'; g.textAlign = 'left'; g.fillStyle = '#2b2d42'; g.fillText(status, 24, H - 8);
  }
  g.restore(); requestAnimationFrame(frame);
}
connect(); requestAnimationFrame(frame);
