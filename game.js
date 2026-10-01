'use strict';

// 동물 퐁퐁: 화면·입력·흐름. 판 규칙은 logic.js (LOGIC) 에 있다.
(() => {
const L = LOGIC;
const { ROWS, COLS } = L;

// ---------- 모양 ----------
const W = 400, H = 480;
const CELL = 52;
const BX = (W - COLS * CELL) / 2, BY = 100;          // 판 왼쪽 위
const INK = '#2b1d52';
const FONT = '"Jua", "Apple SD Gothic Neo", sans-serif';
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const ANIMALS = [
  { e: '🐱', bg: '#ffd23f' },
  { e: '🐶', bg: '#ffa94d' },
  { e: '🐰', bg: '#ff9ecb' },
  { e: '🐸', bg: '#7ee39a' },
  { e: '🐼', bg: '#c9d2ec' },
  { e: '🐧', bg: '#8fd3ff' },
];

const TIME = 60;
const COMBO_WINDOW = 3;       // 이 시간(초) 안에 다시 맞추면 콤보가 이어진다
const FEVER_TIME = 7;
const HINT_AFTER = 5;
const SWAP_T = 0.13, POP_T = 0.22;

// ---------- 캔버스 ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
let DPR = 1;

function fit() {
  const hudH = 62;
  const scale = Math.min((innerWidth - 24) / W, (innerHeight - 28 - hudH) / H);
  const cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * DPR);
  canvas.height = Math.round(cssH * DPR);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  $('col').style.width = Math.max(cssW, Math.min(innerWidth - 20, 340)) + 'px';
  $('wrap').style.width = cssW + 'px';
  $('wrap').style.margin = '0 auto';
  buildSprites(canvas.width / W);
}
addEventListener('resize', fit);

// 타일 그림은 미리 한 번 그려 두고 찍는다 (매 프레임 이모지 49개를 그리면 폰에서 느리다)
let sprites = [], rainbowSprite = null;
function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function tileCanvas(scale, draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.ceil(CELL * scale);
  const c = cv.getContext('2d');
  c.scale(scale, scale);
  const pad = 3, s = CELL - pad * 2;
  c.fillStyle = INK; roundRect(c, pad, pad + 2.5, s, s - 1, 14); c.fill();
  draw(c, pad, s);
  c.lineWidth = 2.5; c.strokeStyle = INK; roundRect(c, pad, pad, s, s - 2, 14); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.55)'; roundRect(c, pad + 7, pad + 5, s - 26, 5, 3); c.fill();
  return cv;
}
function buildSprites(scale) {
  sprites = ANIMALS.map((a) => tileCanvas(scale, (c, pad, s) => {
    const g = c.createLinearGradient(0, pad, 0, pad + s);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.08, a.bg); g.addColorStop(1, shade(a.bg, -30));
    c.fillStyle = g; roundRect(c, pad, pad, s, s - 2, 14); c.fill();
    c.font = `30px ${EMOJI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#000';
    c.fillText(a.e, CELL / 2, CELL / 2 + 2);
  }));
  rainbowSprite = tileCanvas(scale, (c, pad, s) => {
    const g = c.createLinearGradient(pad, pad, pad + s, pad + s);
    ['#ff5a6e', '#ffd23f', '#5fd36e', '#3fa9ff', '#b56cff'].forEach((col, i) => g.addColorStop(i / 4, col));
    c.fillStyle = g; roundRect(c, pad, pad, s, s - 2, 14); c.fill();
    c.font = `28px ${EMOJI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#000';
    c.fillText('⭐', CELL / 2, CELL / 2 + 2);
  });
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16), cl = (v) => Math.max(0, Math.min(255, v));
  return `rgb(${cl((n >> 16) + amt)},${cl(((n >> 8) & 255) + amt)},${cl((n & 255) + amt)})`;
}

// ---------- 저장·소리 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
let muted = store.get('pongpongMuted') === '1';
let audio = null;
function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur);
  } catch (_) {}
}
const sfx = {
  swap: () => tone(420, 0.06, 'triangle', 0.08, 120),
  nope: () => tone(180, 0.12, 'square', 0.05, -40),
  pop: (n) => tone(520 + Math.min(n, 12) * 55, 0.09, 'sine', 0.12, 260),
  special: () => [0, 1, 2].forEach((k) => setTimeout(() => tone(700 + k * 180, 0.08, 'square', 0.06), k * 50)),
  boom: () => tone(120, 0.35, 'sawtooth', 0.1, -60),
  fever: () => [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'square', 0.06), i * 70)),
  tick: () => tone(1000, 0.05, 'square', 0.05),
  end: () => [784, 659, 523, 392].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.1), i * 140)),
};

// ---------- 상태 ----------
let state = 'title';          // title | play | paused | over
let phase = 'idle';           // idle | swap | back | pop | fall
let grid = L.makeBoard();
const pos = new Map();        // 타일 id → { x, y (칸 단위), vy, scale, alpha }
let score = 0, best = Number(store.get('pongpongBest')) || 0;
let time = TIME, combo = 0, maxCombo = 0, lastClear = -99, cascade = 0, popped = 0;
let gauge = 0, fever = 0;
let pending = null;           // 이번 pop 단계에서 지울 계획
let swapPair = null, phaseT = 0;
let picked = null;            // 눌러서 고른 칸
let drag = null;              // 끌고 있는 칸
let idle = 0, hint = null;
let particles = [], texts = [], banner = null;
let clock = 0;

function place(snap) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = grid[r][c];
    if (!t) continue;
    let p = pos.get(t.id);
    if (!p) { p = { x: c, y: r, vy: 0, scale: 1, alpha: 1 }; pos.set(t.id, p); }
    if (snap) { p.x = c; p.y = r; }
  }
}

function startGame() {
  grid = L.makeBoard();
  pos.clear();
  place(true);
  score = 0; time = TIME; combo = 0; maxCombo = 0; lastClear = -99; cascade = 0; popped = 0;
  gauge = 0; fever = 0; phase = 'idle'; pending = null; swapPair = null; picked = null; drag = null;
  idle = 0; hint = null; particles = []; texts = []; banner = { text: '시작!', t: 0 };
  state = 'play';
  hideOverlay();
  updateHud();
}

// ---------- 흐름 ----------
function trySwap(a, b) {
  if (phase !== 'idle' || state !== 'play' || time <= 0) return;
  if (!L.inside(...b) || Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) return;
  picked = null; hint = null; idle = 0;
  swapPair = [a, b];
  L.swap(grid, a, b);
  phase = 'swap'; phaseT = 0;
  sfx.swap();
}

function startPop(plan) {
  L.expand(grid, plan.clear);
  pending = plan;
  phase = 'pop'; phaseT = 0;
  const n = plan.clear.size;
  popped += n;
  // 점수: 지운 수 × 10 × (연쇄 보너스) × (콤보 보너스) × (피버 2배)
  const gain = Math.round(n * 10 * (1 + cascade * 0.5) * (1 + Math.max(0, combo - 1) * 0.1) * (fever > 0 ? 2 : 1))
    + plan.create.size * 50;
  score += gain;
  if (score > best) { best = score; store.set('pongpongBest', String(best)); }
  // 가운데쯤에 점수 글자
  let sx = 0, sy = 0;
  for (const k of plan.clear) { sx += k % COLS; sy += (k / COLS) | 0; }
  texts.push({ text: `+${gain}`, x: BX + (sx / n + 0.5) * CELL, y: BY + (sy / n + 0.5) * CELL, t: 0, big: n >= 6 || cascade >= 2 });
  // 터지는 조각
  for (const k of plan.clear) {
    const r = (k / COLS) | 0, c = k % COLS, t = grid[r][c];
    const col = t && t.t >= 0 ? ANIMALS[t.t].bg : '#ffd23f';
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 120;
      particles.push({ x: BX + (c + 0.5) * CELL, y: BY + (r + 0.5) * CELL, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.5, col });
    }
  }
  if (fever <= 0) {
    gauge += n * 0.012 * (1 + combo * 0.1);
    if (gauge >= 1) { gauge = 0; fever = FEVER_TIME; banner = { text: 'FEVER!', t: 0 }; sfx.fever(); }
  }
  const hasSpecial = [...plan.clear].some((k) => { const t = grid[(k / COLS) | 0][k % COLS]; return t && t.sp; });
  if (hasSpecial) sfx.boom(); else sfx.pop(combo + cascade);
  if (plan.create.size) sfx.special();
  updateHud();
}

function afterMove() {
  // 콤보: 이전에 맞춘 뒤 3초 안에 또 맞추면 이어진다
  combo = clock - lastClear <= COMBO_WINDOW ? combo + 1 : 1;
  lastClear = clock;
  maxCombo = Math.max(maxCombo, combo);
  if (combo >= 2) banner = { text: `${combo} 콤보!`, t: 0, small: true };
}

function update(dt) {
  clock += dt;
  for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; }
  particles = particles.filter((p) => p.life > 0);
  for (const t of texts) { t.t += dt; t.y -= 30 * dt; }
  texts = texts.filter((t) => t.t < 0.9);
  if (banner) { banner.t += dt; if (banner.t > 1.1) banner = null; }
  if (state !== 'play') return;

  const prev = Math.ceil(time);
  time = Math.max(0, time - dt);
  if (time < 10 && Math.ceil(time) < prev && time > 0) sfx.tick();
  fever = Math.max(0, fever - dt);
  if (clock - lastClear > COMBO_WINDOW) combo = 0;

  // 타일 위치: 스왑은 부드럽게, 떨어지는 건 가속
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = grid[r][c];
    if (!t) continue;
    const p = pos.get(t.id);
    if (phase === 'swap' || phase === 'back') {
      p.x += (c - p.x) * Math.min(1, dt / SWAP_T * 2.2);
      p.y += (r - p.y) * Math.min(1, dt / SWAP_T * 2.2);
    } else {
      p.x += (c - p.x) * Math.min(1, dt * 20);
      if (p.y < r) { p.vy += 40 * dt; p.y = Math.min(r, p.y + p.vy * dt); }
      else { p.y = r; p.vy = 0; }
    }
  }

  phaseT += dt;
  if (phase === 'swap' && phaseT >= SWAP_T) {
    const [a, b] = swapPair;
    if (L.specialSwap(grid, a, b)) {
      cascade = 0; afterMove(); startPop(L.planSpecialSwap(grid, a, b));
    } else {
      const runs = L.findRuns(grid);
      if (runs.length) { cascade = 0; afterMove(); startPop(L.planRuns(grid, runs, [a, b])); }
      else { L.swap(grid, a, b); phase = 'back'; phaseT = 0; sfx.nope(); }
    }
  } else if (phase === 'back' && phaseT >= SWAP_T) {
    phase = 'idle';
  } else if (phase === 'pop' && phaseT >= POP_T) {
    const { removed, spawned } = L.applyClear(grid, pending);
    pending = null;
    for (const x of removed) pos.delete(x.tile.id);
    place(false);
    // 새로 생긴 타일은 판 위에서 떨어진다
    for (const s of spawned) { const p = pos.get(grid[s.r][s.c].id); p.x = s.c; p.y = -s.above - 0.2; p.vy = 0; }
    phase = 'fall'; phaseT = 0;
  } else if (phase === 'fall') {
    let settled = true;
    for (let r = 0; r < ROWS && settled; r++) for (let c = 0; c < COLS; c++) {
      const p = pos.get(grid[r][c].id);
      if (Math.abs(p.y - r) > 0.001) { settled = false; break; }
    }
    if (settled) {
      const runs = L.findRuns(grid);
      if (runs.length) { cascade++; startPop(L.planRuns(grid, runs)); if (cascade >= 2) banner = { text: `${cascade + 1}연쇄!`, t: 0, small: true }; }
      else {
        phase = 'idle'; cascade = 0;
        if (!L.findMove(grid)) { L.shuffle(grid); pos.clear(); place(true); banner = { text: '섞는 중…', t: 0, small: true }; }
      }
    }
  }
  // 정리 중에는 끝내지 않고, 판이 멈춘 뒤 끝낸다
  if (phase === 'idle') {
    if (time <= 0) return gameOver();
    idle += dt;
    if (idle > HINT_AFTER && !hint) hint = L.findMove(grid);
  }
  updateHud();
}

function gameOver() {
  state = 'over';
  sfx.end();
  const isBest = score >= best && score > 0;
  setTimeout(() => showOverlay(`
    <h2 class="inked">끝!</h2>
    <div class="big inked">${score.toLocaleString()}</div>
    <span class="tag">${isBest ? '🏆 최고 기록!' : `최고 기록 ${best.toLocaleString()}`}</span>
    <div class="card"><dl class="stats">
      <dt>터뜨린 동물</dt><dd>${popped}마리</dd>
      <dt>최대 콤보</dt><dd>${maxCombo}</dd>
    </dl></div>
    <button id="startBtn">한 번 더</button>`), 600);
}

// ---------- 그리기 ----------
function label(text, x, y, size, fill = '#fff') {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.22); ctx.strokeStyle = INK; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function panel(x, y, w, h, r, fill, lift = 4) {
  ctx.fillStyle = INK; roundRect(ctx, x, y + lift, w, h, r); ctx.fill();
  ctx.fillStyle = fill; roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; roundRect(ctx, x, y, w, h, r); ctx.stroke();
}

function drawTile(t, px, py, scale = 1, alpha = 1) {
  const img = t.sp === 'rainbow' ? rainbowSprite : sprites[t.t];
  if (!img) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(px + CELL / 2, py + CELL / 2);
  ctx.scale(scale, scale);
  ctx.drawImage(img, -CELL / 2, -CELL / 2, CELL, CELL);
  // 특수 타일 표시
  if (t.sp === 'row' || t.sp === 'col') {
    ctx.save();
    if (t.sp === 'col') ctx.rotate(Math.PI / 2);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    // 타일 위아래 가장자리에 줄무늬, 양옆에 화살표 (동물 얼굴은 가리지 않게)
    for (const oy of [-17, 17]) { roundRect(ctx, -14, oy - 2.5, 28, 5, 2.5); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#fff';
    const push = Math.sin(clock * 6) * 1.5;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * (26 + push), 0); ctx.lineTo(s * (19 + push), -6); ctx.lineTo(s * (19 + push), 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  } else if (t.sp === 'bomb') {
    const k = 1 + Math.sin(clock * 8) * 0.06;
    ctx.lineWidth = 4; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.arc(0, 0, 20 * k, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#ff5a6e'; ctx.stroke();
    ctx.font = `15px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000';
    ctx.fillText('💣', 13, -13);
  }
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  const feverOn = fever > 0;

  // 시간 막대
  panel(12, 10, W - 24, 26, 13, '#ffffff', 4);
  const tr = time / TIME, low = time < 10;
  const g = ctx.createLinearGradient(0, 13, 0, 33);
  g.addColorStop(0, low ? '#ff8a8a' : '#7dffb0'); g.addColorStop(1, low ? '#ff3b5c' : '#1fc46b');
  ctx.fillStyle = g; roundRect(ctx, 15, 13, Math.max(16, (W - 30) * tr), 20, 10); ctx.fill();
  ctx.font = `18px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText('⏰', 28, 23);
  label(`${Math.ceil(time)}`, W - 30, 23, 17, low && Math.sin(clock * 12) > 0 ? '#ff3b5c' : '#fff');

  // 피버 게이지
  panel(12, 46, W - 24, 16, 8, '#ffffff', 3);
  const fr = feverOn ? fever / FEVER_TIME : gauge;
  const fg = ctx.createLinearGradient(15, 0, W - 15, 0);
  if (feverOn) { const h = (clock * 200) % 360; fg.addColorStop(0, `hsl(${h},95%,65%)`); fg.addColorStop(1, `hsl(${(h + 90) % 360},95%,60%)`); }
  else { fg.addColorStop(0, '#ff9ecb'); fg.addColorStop(1, '#ff5fa2'); }
  ctx.fillStyle = fg; roundRect(ctx, 15, 49, Math.max(10, (W - 30) * fr), 10, 5); ctx.fill();
  label(feverOn ? '🔥 FEVER ×2' : 'FEVER', 52, 54, 11, '#fff');
  if (combo >= 2) label(`${combo} 콤보`, W - 50, 80, 18, '#ffd23f');

  // 판: 흰 판에 체크무늬 칸, 피버 땐 테두리 반짝
  const bw = COLS * CELL, bh = ROWS * CELL;
  ctx.fillStyle = INK; roundRect(ctx, BX - 8, BY - 8 + 7, bw + 16, bh + 16, 22); ctx.fill();
  ctx.fillStyle = feverOn ? `hsl(${(clock * 120) % 360},90%,92%)` : '#fff8ec';
  roundRect(ctx, BX - 8, BY - 8, bw + 16, bh + 16, 22); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if ((r + c) % 2) { ctx.fillStyle = 'rgba(255,190,110,.18)'; ctx.fillRect(BX + c * CELL, BY + r * CELL, CELL, CELL); }
  }

  // 타일 (판 위로 넘친 새 타일은 가린다)
  ctx.save();
  roundRect(ctx, BX - 4, BY - 4, bw + 8, bh + 8, 18); ctx.clip();
  const clearing = phase === 'pop' && pending ? pending.clear : null;
  const k = phase === 'pop' ? Math.min(1, phaseT / POP_T) : 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = grid[r][c];
    if (!t) continue;
    const p = pos.get(t.id);
    let scale = 1, alpha = 1;
    if (clearing && clearing.has(L.key(r, c))) { scale = 1 + k * 0.35; alpha = 1 - k; }
    if (hint && ((hint[0][0] === r && hint[0][1] === c) || (hint[1][0] === r && hint[1][1] === c))) scale *= 1 + Math.sin(clock * 9) * 0.07;
    drawTile(t, BX + p.x * CELL, BY + p.y * CELL, scale, alpha);
    if (picked && picked[0] === r && picked[1] === c) {
      ctx.lineWidth = 4; ctx.strokeStyle = '#ffd23f';
      roundRect(ctx, BX + p.x * CELL + 1, BY + p.y * CELL + 1, CELL - 2, CELL - 2, 15); ctx.stroke();
    }
  }
  ctx.restore();

  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life * 3);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(p.x, p.y + 1, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const t of texts) {
    ctx.globalAlpha = Math.min(1, (0.9 - t.t) * 3);
    label(t.text, t.x, t.y, t.big ? 26 : 19, t.big ? '#ffd23f' : '#fff');
  }
  ctx.globalAlpha = 1;
  if (banner && state === 'play') {
    const s = 1 + Math.max(0, 0.25 - banner.t) * 1.6;
    ctx.save(); ctx.globalAlpha = Math.min(1, (1.1 - banner.t) * 3);
    ctx.translate(W / 2, BY + (banner.small ? 40 : ROWS * CELL / 2)); ctx.scale(s, s);
    label(banner.text, 0, 0, banner.small ? 30 : 46, banner.text.includes('FEVER') ? '#ff5fa2' : '#ffd23f');
    ctx.restore();
  }
}

function updateHud() {
  $('score').textContent = score.toLocaleString();
  $('best').textContent = best.toLocaleString();
}

// ---------- 루프 ----------
let last = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (state !== 'paused') update(dt);
  draw();
  requestAnimationFrame(frame);
}

// ---------- 오버레이 ----------
function showOverlay(html) {
  const o = $('overlay'); o.innerHTML = html; o.classList.remove('hidden');
  const b = $('startBtn'); if (b) b.onclick = onOverlayButton;
}
function hideOverlay() { $('overlay').classList.add('hidden'); }
function onOverlayButton() { state === 'paused' ? resume() : startGame(); }
function pause() {
  if (state !== 'play') return;
  state = 'paused';
  drag = null;
  showOverlay(`<h2 class="inked">일시정지</h2><button id="startBtn">계속하기</button>`);
}
function resume() { if (state !== 'paused') return; state = 'play'; hideOverlay(); }

// ---------- 입력 ----------
// 칸을 누른 채 옆으로 밀면 바꾸기, 또는 두 칸을 차례로 눌러 바꾸기
function cellAt(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (W / rect.width), y = (e.clientY - rect.top) * (H / rect.height);
  const c = Math.floor((x - BX) / CELL), r = Math.floor((y - BY) / CELL);
  return { r, c, x, y, ok: L.inside(r, c) };
}
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'play') return;
  const h = cellAt(e);
  if (!h.ok) return;
  if (picked && Math.abs(picked[0] - h.r) + Math.abs(picked[1] - h.c) === 1) { trySwap(picked, [h.r, h.c]); return; }
  drag = { r: h.r, c: h.c, x: h.x, y: h.y, id: e.pointerId, moved: false };
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const h = cellAt(e), dx = h.x - drag.x, dy = h.y - drag.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < CELL * 0.35) return;
  const to = Math.abs(dx) > Math.abs(dy) ? [drag.r, drag.c + Math.sign(dx)] : [drag.r + Math.sign(dy), drag.c];
  drag.moved = true;
  trySwap([drag.r, drag.c], to);
  drag = null;
});
// 손을 뗐는데 밀지 않았으면 '고르기'. 브라우저가 터치를 취소해도 똑같이 처리한다
function release(e) {
  if (!drag || (e && e.pointerId !== undefined && e.pointerId !== drag.id)) return;
  if (!drag.moved) picked = picked && picked[0] === drag.r && picked[1] === drag.c ? null : [drag.r, drag.c];
  drag = null;
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Escape') state === 'paused' ? resume() : pause();
  if (e.code === 'KeyM') toggleMute();
  if ((e.code === 'Enter' || e.code === 'Space') && !$('overlay').classList.contains('hidden')) { e.preventDefault(); onOverlayButton(); }
});
addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function toggleMute() {
  muted = !muted;
  store.set('pongpongMuted', muted ? '1' : '0');
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
}
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('pauseBtn').onclick = (e) => { e.currentTarget.blur(); state === 'paused' ? resume() : pause(); };
$('startBtn').onclick = onOverlayButton;
$('muteBtn').textContent = muted ? '🔇' : '🔊';

place(true);
updateHud();
fit();
if (document.fonts) document.fonts.load(`20px ${FONT}`).then(() => {}).catch(() => {});
requestAnimationFrame(frame);

/* @test-hooks:start */
// 테스트용: 판 상태를 밖에서 볼 수 있게
window.__pong = { get grid() { return grid; }, get phase() { return phase; }, get state() { return state; }, get score() { return score; }, trySwap, update, draw, startGame };
/* @test-hooks:end */
})();
