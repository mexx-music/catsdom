export const BOARD_SIZE = 8;
export const TILE_TYPES = ["cat", "paw", "fish", "yarn", "mouse", "bell"];
export const BLOCKED_TILE = "blocked";
export const PAW_BOMB = "paw-bomb";

const copyBoard = (board) => board.map((row) => [...row]);
const positionKey = ({ row, column }) => `${row},${column}`;

export class GameEngine {
  constructor(random = Math.random) {
    this.random = random;
  }

  newGame(blockedPositions = []) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const board = this.createBoardWithoutMatches(blockedPositions);
      if (this.hasPossibleMove(board)) {
        return { board, score: 0, moves: 0 };
      }
    }
    return {
      board: this.createBoardWithoutMatches(blockedPositions),
      score: 0,
      moves: 0,
    };
  }

  trySwap(state, first, second) {
    if (
      !this.isInside(state.board, first) ||
      !this.isInside(state.board, second) ||
      state.board[first.row][first.column] === BLOCKED_TILE ||
      state.board[second.row][second.column] === BLOCKED_TILE ||
      Math.abs(first.row - second.row) + Math.abs(first.column - second.column) !== 1
    ) {
      return { accepted: false, frames: [state], removedTiles: 0, reshuffled: false };
    }

    const board = copyBoard(state.board);
    const firstTile = board[first.row][first.column];
    const secondTile = board[second.row][second.column];
    this.swap(board, first, second);

    if (firstTile === PAW_BOMB || secondTile === PAW_BOMB) {
      return this.activatePawBombSwap(state, board, first, second, firstTile, secondTile);
    }

    let matches = this.findMatches(board);
    if (matches.size === 0) {
      return { accepted: false, frames: [state], removedTiles: 0, reshuffled: false };
    }

    const moves = state.moves + 1;
    const frames = [{ board: copyBoard(board), score: state.score, moves }];
    const resolution = this.resolveMatches(board, state.score, moves, frames, [second, first]);
    const { score, removedTiles, createdSpecials } = resolution;

    let reshuffled = false;
    if (!this.hasPossibleMove(board)) {
      reshuffled = true;
      const freshBoard = this.createBoardWithoutMatches();
      frames.push({ board: freshBoard, score, moves });
    }

    return {
      accepted: true,
      frames,
      removedTiles,
      reshuffled,
      createdSpecials,
      specialActivated: false,
    };
  }

  findMatches(board) {
    const matches = new Set();
    for (const group of this.findMatchGroups(board)) {
      for (const position of group) matches.add(positionKey(position));
    }
    return matches;
  }

  findMatchGroups(board) {
    const groups = [];
    const rowCount = board.length;
    const columnCount = board[0]?.length ?? 0;

    for (let row = 0; row < rowCount; row += 1) {
      let start = 0;
      while (start < columnCount) {
        const tile = board[row][start];
        let end = start + 1;
        while (end < columnCount && tile !== null && board[row][end] === tile) end += 1;
        if (TILE_TYPES.includes(tile) && end - start >= 3) {
          groups.push(
            Array.from({ length: end - start }, (_, index) => ({
              row,
              column: start + index,
            })),
          );
        }
        start = end;
      }
    }

    for (let column = 0; column < columnCount; column += 1) {
      let start = 0;
      while (start < rowCount) {
        const tile = board[start][column];
        let end = start + 1;
        while (end < rowCount && tile !== null && board[end][column] === tile) end += 1;
        if (TILE_TYPES.includes(tile) && end - start >= 3) {
          groups.push(
            Array.from({ length: end - start }, (_, index) => ({
              row: start + index,
              column,
            })),
          );
        }
        start = end;
      }
    }

    return groups;
  }

  resolveMatches(board, initialScore, moves, frames, preferredBombPositions = []) {
    let groups = this.findMatchGroups(board);
    let score = initialScore;
    let combo = 0;
    let removedTiles = 0;
    let createdSpecials = 0;

    while (groups.length > 0 && combo < 100) {
      combo += 1;
      const matches = new Set(groups.flatMap((group) => group.map(positionKey)));
      const bombSpawns = new Map();

      for (const group of groups.filter((candidate) => candidate.length === 4)) {
        const preferred = preferredBombPositions.find((position) =>
          group.some((candidate) => positionKey(candidate) === positionKey(position)),
        );
        const spawn = preferred ?? group[Math.floor((group.length - 1) / 2)];
        bombSpawns.set(positionKey(spawn), spawn);
      }

      score += matches.size * 10 * combo;
      for (const key of matches) {
        const [row, column] = key.split(",").map(Number);
        board[row][column] = null;
      }
      for (const [key, spawn] of bombSpawns) {
        board[spawn.row][spawn.column] = PAW_BOMB;
        matches.delete(key);
      }
      removedTiles += matches.size;
      createdSpecials += bombSpawns.size;
      frames.push({ board: copyBoard(board), score, moves });

      this.collapseAndRefill(board);
      frames.push({ board: copyBoard(board), score, moves });
      groups = this.findMatchGroups(board);
      preferredBombPositions = [];
    }

    return { score, removedTiles, createdSpecials };
  }

  activatePawBombAt(state, position) {
    if (!this.isInside(state.board, position) || state.board[position.row][position.column] !== PAW_BOMB) {
      return { accepted: false, frames: [state], removedTiles: 0, reshuffled: false };
    }
    return this.detonatePawBombs(state, copyBoard(state.board), [position]);
  }

  activatePawBombSwap(state, board, first, second, firstTile, secondTile) {
    const centers = [firstTile === PAW_BOMB ? second : first];
    if (firstTile === PAW_BOMB && secondTile === PAW_BOMB) {
      centers.push(secondTile === PAW_BOMB ? first : second);
    }
    return this.detonatePawBombs(state, board, centers);
  }

  detonatePawBombs(state, board, centers) {
    const moves = state.moves + 1;
    const frames = [{ board: copyBoard(board), score: state.score, moves }];
    const queue = [...centers];
    const detonated = new Set();
    const cleared = new Set();

    while (queue.length > 0) {
      const center = queue.shift();
      const centerKey = positionKey(center);
      if (detonated.has(centerKey)) continue;
      detonated.add(centerKey);

      for (let row = center.row - 1; row <= center.row + 1; row += 1) {
        for (let column = center.column - 1; column <= center.column + 1; column += 1) {
          const position = { row, column };
          if (!this.isInside(board, position) || board[row][column] === BLOCKED_TILE) continue;
          if (board[row][column] === PAW_BOMB && !detonated.has(positionKey(position))) {
            queue.push(position);
          }
          if (board[row][column] !== null) cleared.add(positionKey(position));
          board[row][column] = null;
        }
      }
    }

    let score = state.score + cleared.size * 15;
    frames.push({ board: copyBoard(board), score, moves });
    this.collapseAndRefill(board);
    frames.push({ board: copyBoard(board), score, moves });
    const resolution = this.resolveMatches(board, score, moves, frames);
    score = resolution.score;

    let reshuffled = false;
    if (!this.hasPossibleMove(board)) {
      reshuffled = true;
      frames.push({ board: this.createBoardWithoutMatches(), score, moves });
    }

    return {
      accepted: true,
      frames,
      removedTiles: cleared.size + resolution.removedTiles,
      reshuffled,
      createdSpecials: resolution.createdSpecials,
      specialActivated: true,
    };
  }

  hasPossibleMove(board) {
    const candidate = copyBoard(board);
    for (let row = 0; row < candidate.length; row += 1) {
      for (let column = 0; column < candidate[row].length; column += 1) {
        const current = { row, column };
        const neighbours = [
          { row, column: column + 1 },
          { row: row + 1, column },
        ];

        for (const neighbour of neighbours) {
          if (!this.isInside(candidate, neighbour)) continue;
          if (
            candidate[current.row][current.column] === BLOCKED_TILE ||
            candidate[neighbour.row][neighbour.column] === BLOCKED_TILE
          ) {
            continue;
          }
          if (
            candidate[current.row][current.column] === PAW_BOMB ||
            candidate[neighbour.row][neighbour.column] === PAW_BOMB
          ) {
            return true;
          }
          this.swap(candidate, current, neighbour);
          const createsMatch = this.findMatches(candidate).size > 0;
          this.swap(candidate, current, neighbour);
          if (createsMatch) return true;
        }
      }
    }
    return false;
  }

  createBoardWithoutMatches(blockedPositions = []) {
    const blocked = new Set(blockedPositions.map(positionKey));
    const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let column = 0; column < BOARD_SIZE; column += 1) {
        if (blocked.has(positionKey({ row, column }))) {
          board[row][column] = BLOCKED_TILE;
          continue;
        }
        const candidates = TILE_TYPES.filter((tile) => {
          const horizontal =
            column >= 2 && board[row][column - 1] === tile && board[row][column - 2] === tile;
          const vertical =
            row >= 2 && board[row - 1][column] === tile && board[row - 2][column] === tile;
          return !horizontal && !vertical;
        });
        board[row][column] = this.pick(candidates);
      }
    }
    return board;
  }

  collapseAndRefill(board) {
    const rowCount = board.length;
    const columnCount = board[0]?.length ?? 0;
    for (let column = 0; column < columnCount; column += 1) {
      let segmentBottom = rowCount - 1;
      for (let row = rowCount - 1; row >= -1; row -= 1) {
        if (row === -1 || board[row][column] === BLOCKED_TILE) {
          this.collapseSegment(board, column, row + 1, segmentBottom);
          segmentBottom = row - 1;
        }
      }
    }
  }

  collapseSegment(board, column, top, bottom) {
    if (top > bottom) return;
    let destination = bottom;
    for (let row = bottom; row >= top; row -= 1) {
      const tile = board[row][column];
      if (tile !== null && tile !== BLOCKED_TILE) {
        board[destination][column] = tile;
        if (destination !== row) board[row][column] = null;
        destination -= 1;
      }
    }
    while (destination >= top) {
      board[destination][column] = this.pick(TILE_TYPES);
      destination -= 1;
    }
  }

  unlockCells(state, positions) {
    const board = copyBoard(state.board);
    for (const position of positions) {
      if (board[position.row]?.[position.column] !== BLOCKED_TILE) continue;
      board[position.row][position.column] = null;
      const candidates = TILE_TYPES.filter((tile) => {
        board[position.row][position.column] = tile;
        const staysClean = this.findMatches(board).size === 0;
        board[position.row][position.column] = null;
        return staysClean;
      });
      board[position.row][position.column] = this.pick(candidates.length ? candidates : TILE_TYPES);
    }

    if (this.findMatches(board).size > 0 || !this.hasPossibleMove(board)) {
      return { ...state, board: this.createBoardWithoutMatches() };
    }
    return { ...state, board };
  }

  pick(values) {
    return values[Math.floor(this.random() * values.length)];
  }

  swap(board, first, second) {
    const temporary = board[first.row][first.column];
    board[first.row][first.column] = board[second.row][second.column];
    board[second.row][second.column] = temporary;
  }

  isInside(board, { row, column }) {
    return row >= 0 && row < board.length && column >= 0 && column < (board[0]?.length ?? 0);
  }
}
