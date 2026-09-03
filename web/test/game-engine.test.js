import assert from "node:assert/strict";
import test from "node:test";
import { BLOCKED_TILE, GameEngine, PAW_BOMB, TILE_TYPES } from "../src/game-engine.js";

function seededRandom(seed = 7) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

const cleanPattern = () =>
  Array.from({ length: 8 }, (_, row) =>
    Array.from({ length: 8 }, (_, column) => TILE_TYPES[(row + column) % TILE_TYPES.length]),
  );

test("new games start with a clean, playable 8 by 8 board", () => {
  const engine = new GameEngine(seededRandom());

  for (let index = 0; index < 30; index += 1) {
    const state = engine.newGame();
    assert.equal(state.board.length, 8);
    assert.ok(state.board.every((row) => row.length === 8));
    assert.equal(engine.findMatches(state.board).size, 0);
    assert.equal(engine.hasPossibleMove(state.board), true);
    assert.equal(state.moves, 0);
    assert.equal(state.score, 0);
  }
});

test("a productive adjacent swap clears tiles, scores and counts one move", () => {
  const engine = new GameEngine(seededRandom());
  const board = cleanPattern();
  board[0][0] = "cat";
  board[0][1] = "paw";
  board[0][2] = "cat";
  board[1][1] = "cat";
  const state = { board, score: 0, moves: 0 };

  const result = engine.trySwap(state, { row: 0, column: 1 }, { row: 1, column: 1 });

  assert.equal(result.accepted, true);
  assert.equal(result.frames.at(-1).moves, 1);
  assert.ok(result.frames.at(-1).score >= 30);
  assert.ok(result.removedTiles >= 3);
  assert.equal(engine.findMatches(result.frames.at(-1).board).size, 0);
});

test("invalid swaps leave the state untouched", () => {
  const engine = new GameEngine(seededRandom());
  const state = { board: cleanPattern(), score: 0, moves: 0 };

  const result = engine.trySwap(state, { row: 0, column: 0 }, { row: 3, column: 3 });

  assert.equal(result.accepted, false);
  assert.deepEqual(result.frames.at(-1), state);
});

test("cross-shaped matches count their shared tile once", () => {
  const engine = new GameEngine(seededRandom());
  const board = cleanPattern();
  board[3][2] = "bell";
  board[3][3] = "bell";
  board[3][4] = "bell";
  board[2][3] = "bell";
  board[4][3] = "bell";

  const matches = engine.findMatches(board);

  assert.equal(matches.size, 5);
  assert.ok(matches.has("3,3"));
});

test("a four-tile match creates a mini paw bomb", () => {
  const engine = new GameEngine(seededRandom());
  const board = cleanPattern();
  board[0][0] = "cat";
  board[0][1] = "cat";
  board[0][2] = "paw";
  board[0][3] = "cat";
  board[1][2] = "cat";
  const state = { board, score: 0, moves: 0 };

  const result = engine.trySwap(state, { row: 1, column: 2 }, { row: 0, column: 2 });

  assert.equal(result.accepted, true);
  assert.ok(result.createdSpecials >= 1);
  assert.ok(result.frames.at(-1).board.flat().includes(PAW_BOMB));
});

test("dragging a mini paw bomb clears a three by three area", () => {
  const engine = new GameEngine(seededRandom());
  const board = cleanPattern();
  board[4][4] = PAW_BOMB;
  const state = { board, score: 0, moves: 0 };

  const result = engine.trySwap(state, { row: 4, column: 4 }, { row: 4, column: 5 });
  const blastFrame = result.frames.find((frame) => frame.board.flat().includes(null));

  assert.equal(result.accepted, true);
  assert.equal(result.specialActivated, true);
  assert.equal(result.frames.at(-1).moves, 1);
  assert.equal(result.removedTiles >= 9, true);
  assert.ok(blastFrame);
  for (let row = 3; row <= 5; row += 1) {
    for (let column = 4; column <= 6; column += 1) {
      assert.equal(blastFrame.board[row][column], null);
    }
  }
});

test("tapping a mini paw bomb detonates it in place", () => {
  const engine = new GameEngine(seededRandom());
  const board = cleanPattern();
  board[3][3] = PAW_BOMB;
  const state = { board, score: 0, moves: 4 };

  const result = engine.activatePawBombAt(state, { row: 3, column: 3 });
  const blastFrame = result.frames.find((frame) => frame.board.flat().includes(null));

  assert.equal(result.accepted, true);
  assert.equal(result.specialActivated, true);
  assert.equal(result.frames.at(-1).moves, 5);
  assert.equal(result.removedTiles >= 9, true);
  assert.ok(blastFrame);
  for (let row = 2; row <= 4; row += 1) {
    for (let column = 2; column <= 4; column += 1) {
      assert.equal(blastFrame.board[row][column], null);
    }
  }
});

test("adjacent paw bombs create a double blast", () => {
  const engine = new GameEngine(seededRandom());
  const board = cleanPattern();
  board[3][3] = PAW_BOMB;
  board[3][4] = PAW_BOMB;
  const state = { board, score: 0, moves: 2 };

  const result = engine.activatePawBombAt(state, { row: 3, column: 3 });

  assert.equal(result.accepted, true);
  assert.equal(result.specialCombo, true);
  assert.equal(result.detonatedSpecials, 2);
  assert.equal(result.blastCenters.length, 2);
  assert.ok(result.removedTiles >= 12);
  assert.ok(result.frames.at(-1).score >= 360);
});

test("blocked object cells split gravity and cannot be swapped", () => {
  const engine = new GameEngine(seededRandom());
  const blocked = [
    { row: 3, column: 3 },
    { row: 3, column: 4 },
    { row: 4, column: 3 },
    { row: 4, column: 4 },
  ];
  const state = engine.newGame(blocked);

  assert.ok(blocked.every(({ row, column }) => state.board[row][column] === BLOCKED_TILE));
  assert.equal(engine.findMatches(state.board).size, 0);
  assert.equal(engine.hasPossibleMove(state.board), true);
  assert.equal(
    engine.trySwap(state, { row: 3, column: 2 }, { row: 3, column: 3 }).accepted,
    false,
  );
});

test("collected objects release clean playable cells", () => {
  const engine = new GameEngine(seededRandom());
  const blocked = [
    { row: 3, column: 3 },
    { row: 3, column: 4 },
    { row: 4, column: 3 },
    { row: 4, column: 4 },
  ];
  const unlocked = engine.unlockCells(engine.newGame(blocked), blocked);

  assert.ok(blocked.every(({ row, column }) => TILE_TYPES.includes(unlocked.board[row][column])));
  assert.equal(engine.findMatches(unlocked.board).size, 0);
  assert.equal(engine.hasPossibleMove(unlocked.board), true);
});
