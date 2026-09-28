'use strict';

// 동물 퐁퐁: 판 규칙만 모아 둔 파일 (그리기·입력 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// 판은 rows × cols 칸, 칸마다 { id, t, sp } 타일.
//   t  : 동물 종류 0..TYPES-1 (무지개 타일은 -1)
//   sp : null | 'row'(가로 한 줄) | 'col'(세로 한 줄) | 'bomb'(3×3) | 'rainbow'(같은 동물 전부)
const ROWS = 7, COLS = 7, TYPES = 6;

let nextId = 1;
const tile = (t, sp = null) => ({ id: nextId++, t, sp });
const key = (r, c) => r * COLS + c;
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

// 처음 판: 이미 3개가 이어진 곳이 없고, 둘 수 있는 수가 하나 이상
function makeBoard(rng = Math.random) {
  for (;;) {
    const g = [];
    for (let r = 0; r < ROWS; r++) {
      g.push([]);
      for (let c = 0; c < COLS; c++) {
        let t;
        do t = Math.floor(rng() * TYPES);
        while ((c >= 2 && g[r][c - 1].t === t && g[r][c - 2].t === t) ||
               (r >= 2 && g[r - 1][c].t === t && g[r - 2][c].t === t));
        g[r].push(tile(t));
      }
    }
    if (findMove(g)) return g;
  }
}

// 같은 동물이 3개 이상 이어진 줄들. 무지개(t=-1)는 줄을 만들지 않는다.
function findRuns(g) {
  const runs = [];
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      const t = g[r][c] ? g[r][c].t : -2;
      let e = c + 1;
      while (e < COLS && g[r][e] && t >= 0 && g[r][e].t === t) e++;
      if (t >= 0 && e - c >= 3) runs.push({ dir: 'h', cells: Array.from({ length: e - c }, (_, k) => [r, c + k]) });
      c = e;
    }
  }
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < ROWS) {
      const t = g[r][c] ? g[r][c].t : -2;
      let e = r + 1;
      while (e < ROWS && g[e][c] && t >= 0 && g[e][c].t === t) e++;
      if (t >= 0 && e - r >= 3) runs.push({ dir: 'v', cells: Array.from({ length: e - r }, (_, k) => [r + k, c]) });
      r = e;
    }
  }
  return runs;
}

function swap(g, a, b) {
  const t = g[a[0]][a[1]];
  g[a[0]][a[1]] = g[b[0]][b[1]];
  g[b[0]][b[1]] = t;
}

// 특수 타일끼리 바꾸거나, 무지개를 아무것과 바꾸면 줄이 안 맞아도 터진다
const isSpecial = (x) => !!(x && x.sp);
function specialSwap(g, a, b) {
  const x = g[a[0]][a[1]], y = g[b[0]][b[1]];
  return x.sp === 'rainbow' || y.sp === 'rainbow' || (isSpecial(x) && isSpecial(y));
}

// 둘 수 있는 수 하나 (힌트용). 없으면 null
function findMove(g) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const a = [r, c], b = [r + dr, c + dc];
        if (!inside(b[0], b[1])) continue;
        if (specialSwap(g, a, b)) return [a, b];
        swap(g, a, b);
        const ok = findRuns(g).length > 0;
        swap(g, a, b);
        if (ok) return [a, b];
      }
    }
  }
  return null;
}

// 줄들을 보고 무엇을 지우고 어떤 특수 타일을 만들지 정한다.
// focus: 방금 옮긴 칸(있으면 특수 타일을 그 자리에 만든다)
function planRuns(g, runs, focus = []) {
  const clear = new Set();
  const create = new Map();   // key → { r, c, t, sp }
  const where = new Map();    // key → 그 칸이 속한 줄들
  runs.forEach((run) => run.cells.forEach(([r, c]) => {
    clear.add(key(r, c));
    if (!where.has(key(r, c))) where.set(key(r, c), []);
    where.get(key(r, c)).push(run);
  }));
  const pick = (run) => {
    const f = focus.find(([r, c]) => run.cells.some(([rr, cc]) => rr === r && cc === c));
    return f || run.cells[Math.floor(run.cells.length / 2)];
  };
  const used = new Set();
  // 5개 이상 → 무지개
  for (const run of runs) {
    if (run.cells.length < 5) continue;
    const [r, c] = pick(run);
    create.set(key(r, c), { r, c, t: -1, sp: 'rainbow' });
    run.cells.forEach(([rr, cc]) => used.add(key(rr, cc)));
  }
  // 가로·세로 줄이 겹친 칸(ㄱ·ㅗ 모양) → 폭탄
  for (const [k, list] of where) {
    if (used.has(k) || list.length < 2 || !list.some((x) => x.dir === 'h') || !list.some((x) => x.dir === 'v')) continue;
    const r = (k / COLS) | 0, c = k % COLS;
    create.set(k, { r, c, t: g[r][c].t, sp: 'bomb' });
    list.forEach((run) => run.cells.forEach(([rr, cc]) => used.add(key(rr, cc))));
  }
  // 4개 → 한 줄 지우개 (가로로 맞추면 가로 줄, 세로로 맞추면 세로 줄)
  for (const run of runs) {
    if (run.cells.length !== 4 || run.cells.some(([r, c]) => used.has(key(r, c)))) continue;
    const [r, c] = pick(run);
    create.set(key(r, c), { r, c, t: g[r][c].t, sp: run.dir === 'h' ? 'row' : 'col' });
  }
  for (const k of create.keys()) clear.delete(k);
  return { clear, create };
}

// 지워지는 칸 중 특수 타일이 있으면 그 효과로 더 지운다 (연쇄)
function expand(g, clear, rng = Math.random) {
  const queue = [...clear];
  const fired = new Set();
  while (queue.length) {
    const k = queue.pop();
    const r = (k / COLS) | 0, c = k % COLS;
    const x = g[r][c];
    if (!x || !x.sp || fired.has(k)) continue;
    fired.add(k);
    const add = (rr, cc) => {
      if (!inside(rr, cc) || !g[rr][cc]) return;
      const kk = key(rr, cc);
      if (!clear.has(kk)) { clear.add(kk); queue.push(kk); }
    };
    if (x.sp === 'row') for (let cc = 0; cc < COLS; cc++) add(r, cc);
    else if (x.sp === 'col') for (let rr = 0; rr < ROWS; rr++) add(rr, c);
    else if (x.sp === 'bomb') for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) add(r + dr, c + dc);
    else if (x.sp === 'rainbow') {
      // 다른 효과로 터진 무지개는 판에 가장 많은 동물을 전부 지운다
      const count = new Array(TYPES).fill(0);
      for (const row of g) for (const y of row) if (y && y.t >= 0) count[y.t]++;
      const t = count.indexOf(Math.max(...count));
      for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) if (g[rr][cc] && g[rr][cc].t === t) add(rr, cc);
    }
  }
  return clear;
}

// 특수 타일을 바꿨을 때 지울 칸
function planSpecialSwap(g, a, b) {
  const x = g[a[0]][a[1]], y = g[b[0]][b[1]];
  const clear = new Set([key(...a), key(...b)]);
  const all = (pred) => { for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (g[r][c] && pred(g[r][c])) clear.add(key(r, c)); };
  if (x.sp === 'rainbow' && y.sp === 'rainbow') all(() => true);          // 무지개 둘: 판 전체
  else if (x.sp === 'rainbow') all((z) => z.t === y.t);                    // 무지개 + 동물: 그 동물 전부
  else if (y.sp === 'rainbow') all((z) => z.t === x.t);
  // 특수 + 특수(줄·폭탄): 둘 다 터진다 (expand 가 처리)
  return { clear, create: new Map() };
}

// 지우기 → 특수 타일 놓기 → 떨어뜨리기 → 빈칸 채우기. 새로 생긴 타일 목록을 돌려준다
function applyClear(g, plan, rng = Math.random) {
  const removed = [];
  for (const k of plan.clear) {
    const r = (k / COLS) | 0, c = k % COLS;
    if (g[r][c]) removed.push({ r, c, tile: g[r][c] });
    g[r][c] = null;
  }
  for (const s of plan.create.values()) g[s.r][s.c] = tile(s.t, s.sp);
  const spawned = [];
  for (let c = 0; c < COLS; c++) {
    let w = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (g[r][c]) { const x = g[r][c]; g[r][c] = null; g[w][c] = x; w--; }
    }
    let n = 0;
    for (let r = w; r >= 0; r--) { g[r][c] = tile(Math.floor(rng() * TYPES)); spawned.push({ r, c, above: ++n }); }
  }
  return { removed, spawned };
}

// 둘 수가 없으면 특수 타일은 두고 동물만 섞는다
function shuffle(g, rng = Math.random) {
  for (let tries = 0; tries < 100; tries++) {
    const cells = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!g[r][c].sp) cells.push(g[r][c]);
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    let k = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!g[r][c].sp) g[r][c] = cells[k++];
    if (findRuns(g).length === 0 && findMove(g)) return true;
  }
  // 섞어도 안 되면 새 판
  const fresh = makeBoard(rng);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) g[r][c] = fresh[r][c];
  return false;
}

const LOGIC = { ROWS, COLS, TYPES, tile, key, inside, makeBoard, findRuns, swap, specialSwap, findMove, planRuns, expand, planSpecialSwap, applyClear, shuffle };
if (typeof module !== 'undefined') module.exports = LOGIC;
