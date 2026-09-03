export const BOARD_SIZE = 8;
export const STARTING_MOVES = 25;
export const TILE_TYPES = ["cat", "paw", "fish", "yarn", "mouse", "bell"];

const copyBoard = (board) => board.map((row) => [...row]);
const positionKey = ({ row, column }) => `${row},${column}`;

export class GameEngine {
  constructor(random = Math.random) {
    this.random = random;
  }

  newGame() {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const board = this.createBoardWithoutMatches();
      if (this.hasPossibleMove(board)) {
        return { board, score: 0, movesLeft: STARTING_MOVES };
      }
    }
    return { board: this.createBoardWithoutMatches(), score: 0, movesLeft: STARTING_MOVES };
  }

  trySwap(state, first, second) {
    if (
      state.movesLeft <= 0 ||
      !this.isInside(state.board, first) ||
      !this.isInside(state.board, second) ||
      Math.abs(first.row - second.row) + Math.abs(first.column - second.column) !== 1
    ) {
      return { accepted: false, frames: [state], removedTiles: 0, reshuffled: false };
    }

    const board = copyBoard(state.board);
    this.swap(board, first, second);
    let matches = this.findMatches(board);
    if (matches.size === 0) {
      return { accepted: false, frames: [state], removedTiles: 0, reshuffled: false };
    }

    const movesLeft = state.movesLeft - 1;
    const frames = [{ board: copyBoard(board), score: state.score, movesLeft }];
    let score = state.score;
    let combo = 0;
    let removedTiles = 0;

    while (matches.size > 0 && combo < 100) {
      combo += 1;
      removedTiles += matches.size;
      score += matches.size * 10 * combo;

      for (const key of matches) {
        const [row, column] = key.split(",").map(Number);
        board[row][column] = null;
      }
      frames.push({ board: copyBoard(board), score, movesLeft });

      this.collapseAndRefill(board);
      frames.push({ board: copyBoard(board), score, movesLeft });
      matches = this.findMatches(board);
    }

    let reshuffled = false;
    if (!this.hasPossibleMove(board)) {
      reshuffled = true;
      const freshBoard = this.createBoardWithoutMatches();
      frames.push({ board: freshBoard, score, movesLeft });
    }

    return { accepted: true, frames, removedTiles, reshuffled };
  }

  findMatches(board) {
    const matches = new Set();
    const rowCount = board.length;
    const columnCount = board[0]?.length ?? 0;

    for (let row = 0; row < rowCount; row += 1) {
      let start = 0;
      while (start < columnCount) {
        const tile = board[row][start];
        let end = start + 1;
        while (end < columnCount && tile !== null && board[row][end] === tile) end += 1;
        if (tile !== null && end - start >= 3) {
          for (let column = start; column < end; column += 1) {
            matches.add(positionKey({ row, column }));
          }
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
        if (tile !== null && end - start >= 3) {
          for (let row = start; row < end; row += 1) {
            matches.add(positionKey({ row, column }));
          }
        }
        start = end;
      }
    }

    return matches;
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
          this.swap(candidate, current, neighbour);
          const createsMatch = this.findMatches(candidate).size > 0;
          this.swap(candidate, current, neighbour);
          if (createsMatch) return true;
        }
      }
    }
    return false;
  }

  createBoardWithoutMatches() {
    const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let column = 0; column < BOARD_SIZE; column += 1) {
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
      let destination = rowCount - 1;
      for (let row = rowCount - 1; row >= 0; row -= 1) {
        const tile = board[row][column];
        if (tile !== null) {
          board[destination][column] = tile;
          if (destination !== row) board[row][column] = null;
          destination -= 1;
        }
      }
      while (destination >= 0) {
        board[destination][column] = this.pick(TILE_TYPES);
        destination -= 1;
      }
    }
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
