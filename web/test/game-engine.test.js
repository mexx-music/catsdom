import assert from "node:assert/strict";
import test from "node:test";
import { GameEngine, STARTING_MOVES, TILE_TYPES } from "../src/game-engine.js";

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
    assert.equal(state.movesLeft, STARTING_MOVES);
    assert.equal(state.score, 0);
  }
});

test("a productive adjacent swap clears tiles, scores and costs one move", () => {
  const engine = new GameEngine(seededRandom());
  const board = cleanPattern();
  board[0][0] = "cat";
  board[0][1] = "paw";
  board[0][2] = "cat";
  board[1][1] = "cat";
  const state = { board, score: 0, movesLeft: 25 };

  const result = engine.trySwap(state, { row: 0, column: 1 }, { row: 1, column: 1 });

  assert.equal(result.accepted, true);
  assert.equal(result.frames.at(-1).movesLeft, 24);
  assert.ok(result.frames.at(-1).score >= 30);
  assert.ok(result.removedTiles >= 3);
  assert.equal(engine.findMatches(result.frames.at(-1).board).size, 0);
});

test("invalid swaps leave the state untouched", () => {
  const engine = new GameEngine(seededRandom());
  const state = { board: cleanPattern(), score: 0, movesLeft: 25 };

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
