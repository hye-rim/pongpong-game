'use strict';
// 동물 퐁퐁 규칙 시험. 실행: node test/logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

function rng(seed) {                                   // mulberry32 (시험용 고정 난수)
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const { ROWS, COLS } = L;
// 숫자 판 → 타일 판. 동물 4·5 의 체크무늬 바탕(줄이 생기지 않는다) 위에 rows 를 덮는다. 시험은 동물 0~3 만 쓴다
function board(rows = []) {
  const g = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => L.tile((r + c) % 2 ? 4 : 5)));
  rows.forEach((row, r) => row.forEach((v, c) => { if (v !== null && v !== undefined) g[r][c] = L.tile(v); }));
  return g;
}
const full = (g) => g.every((row) => row.every(Boolean));

test('the plain test background has no lines (so hand-made cases only see what they add)', () => {
  assert.strictEqual(L.findRuns(board()).length, 0);
});

test('new boards: no ready-made lines and at least one move', () => {
  for (let s = 1; s <= 100; s++) {
    const g = L.makeBoard(rng(s));
    assert.ok(full(g));
    assert.strictEqual(L.findRuns(g).length, 0);
    const m = L.findMove(g);
    assert.ok(m);
    L.swap(g, m[0], m[1]);
    assert.ok(L.findRuns(g).length > 0, 'the suggested move really makes a line');
  }
});

test('lines: rows and columns of three or more; rainbows never count', () => {
  const g = board([[0, 0, 0, 0]]);
  const runs = L.findRuns(g);
  assert.strictEqual(runs.length, 1);
  assert.deepStrictEqual(runs[0], { dir: 'h', cells: [[0, 0], [0, 1], [0, 2], [0, 3]] });
  const h = board();
  h[0][0] = L.tile(-1, 'rainbow'); h[0][1] = L.tile(-1, 'rainbow'); h[0][2] = L.tile(-1, 'rainbow');
  assert.strictEqual(L.findRuns(h).length, 0);
});

test('specials: 4 in a row makes a line clearer where you moved, 5 a rainbow, an L a bomb', () => {
  let g = board([[1, 1, 1, 1]]);
  let plan = L.planRuns(g, L.findRuns(g), [[0, 1]]);
  assert.deepStrictEqual([...plan.create.values()], [{ r: 0, c: 1, t: 1, sp: 'row' }]);
  assert.strictEqual(plan.clear.size, 3);

  g = board([[2], [2], [2], [2]]);
  plan = L.planRuns(g, L.findRuns(g));
  assert.strictEqual([...plan.create.values()][0].sp, 'col');

  g = board([[0, 0, 0, 0, 0]]);
  plan = L.planRuns(g, L.findRuns(g), [[0, 4]]);
  assert.deepStrictEqual([...plan.create.values()], [{ r: 0, c: 4, t: -1, sp: 'rainbow' }]);

  g = board([[2, 2, 2], [2], [2]]);                            // ㄱ 모양: (0,0) 에서 가로·세로가 만난다
  plan = L.planRuns(g, L.findRuns(g));
  assert.deepStrictEqual([...plan.create.values()], [{ r: 0, c: 0, t: 2, sp: 'bomb' }]);
  assert.strictEqual(plan.clear.size, 4);

  g = board([[3, 3, 3]]);
  plan = L.planRuns(g, L.findRuns(g));
  assert.strictEqual(plan.create.size, 0);
  assert.strictEqual(plan.clear.size, 3);
});

test('special effects: line, column, 3x3 bomb, chains, rainbow swaps', () => {
  let g = board();
  g[3][3] = L.tile(0, 'row');
  let clear = L.expand(g, new Set([L.key(3, 3)]));
  assert.strictEqual(clear.size, COLS);
  g = board();
  g[3][3] = L.tile(0, 'bomb'); g[3][4] = L.tile(0, 'col');       // 폭탄이 옆의 세로 지우개를 터뜨린다
  clear = L.expand(g, new Set([L.key(3, 3)]));
  assert.strictEqual(clear.size, 9 + ROWS - 3);
  g = board();
  g[0][0] = L.tile(-1, 'rainbow');
  const t = g[0][1].t;
  assert.ok(L.specialSwap(g, [0, 0], [0, 1]));
  const plan = L.planSpecialSwap(g, [0, 0], [0, 1]);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (g[r][c].t === t) assert.ok(plan.clear.has(L.key(r, c)));
  g[0][1] = L.tile(-1, 'rainbow');
  assert.strictEqual(L.planSpecialSwap(g, [0, 0], [0, 1]).clear.size, ROWS * COLS, 'two rainbows clear everything');
});

test('clearing drops tiles down and refills from the top', () => {
  const g = board([[0, 0, 0]]);
  const below = g[1][0];
  const plan = L.planRuns(g, L.findRuns(g));
  const { removed, spawned } = L.applyClear(g, plan, rng(1));
  assert.strictEqual(removed.length, 3);
  assert.strictEqual(spawned.length, 3);
  assert.ok(full(g));
  assert.strictEqual(g[1][0], below, 'tiles under the line do not move');
  const h = board([[], [], [], [1, 1, 1]]);
  const top = h[0][0];
  L.applyClear(h, L.planRuns(h, L.findRuns(h)), rng(2));
  assert.strictEqual(h[1][0], top, 'tiles above fall one row');
});

test('a long random game stays consistent: full board, no lines left between moves, always a move', () => {
  const rand = rng(77);
  const g = L.makeBoard(rand);
  let specials = 0;
  for (let turn = 0; turn < 400; turn++) {
    const [a, b] = L.findMove(g);
    let plan;
    if (L.specialSwap(g, a, b)) { L.swap(g, a, b); plan = L.planSpecialSwap(g, a, b); }
    else { L.swap(g, a, b); plan = L.planRuns(g, L.findRuns(g), [a, b]); }
    for (let cascade = 0; ; cascade++) {
      assert.ok(cascade < 60, 'cascades end');
      specials += plan.create.size;
      L.expand(g, plan.clear, rand);
      L.applyClear(g, plan, rand);
      assert.ok(full(g));
      const runs = L.findRuns(g);
      if (!runs.length) break;
      plan = L.planRuns(g, runs);
    }
    if (!L.findMove(g)) L.shuffle(g, rand);
    assert.ok(L.findMove(g));
    const ids = new Set(g.flat().map((x) => x.id));
    assert.strictEqual(ids.size, ROWS * COLS, 'no tile object appears twice');
  }
  assert.ok(specials > 20);
});

test('shuffle keeps special tiles where they are and leaves a move', () => {
  const rand = rng(5);
  const g = L.makeBoard(rand);
  g[2][2] = L.tile(1, 'bomb'); g[4][5] = L.tile(-1, 'rainbow');
  const bomb = g[2][2], rainbow = g[4][5];
  L.shuffle(g, rand);
  assert.strictEqual(g[2][2], bomb);
  assert.strictEqual(g[4][5], rainbow);
  assert.ok(L.findMove(g));
  assert.ok(full(g));
});
