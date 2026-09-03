import { GameEngine } from "./game-engine.js";

const TILE_SYMBOLS = {
  cat: { symbol: "🐱", name: "Katze" },
  paw: { symbol: "🐾", name: "Pfote" },
  fish: { symbol: "🐟", name: "Fisch" },
  yarn: { symbol: "🧶", name: "Wollknäuel" },
  mouse: { symbol: "🐭", name: "Maus" },
  bell: { symbol: "🔔", name: "Glöckchen" },
};

const elements = {
  startScreen: document.querySelector("#start-screen"),
  gameScreen: document.querySelector("#game-screen"),
  startButton: document.querySelector("#start-button"),
  backButton: document.querySelector("#back-button"),
  restartButton: document.querySelector("#restart-button"),
  board: document.querySelector("#board"),
  score: document.querySelector("#score"),
  moves: document.querySelector("#moves"),
  message: document.querySelector("#message"),
  dialog: document.querySelector("#game-over-dialog"),
  finalScore: document.querySelector("#final-score"),
  playAgainButton: document.querySelector("#play-again-button"),
  dialogHomeButton: document.querySelector("#dialog-home-button"),
};

const engine = new GameEngine();
let state = engine.newGame();
let selected = null;
let busy = false;

const sleep = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const samePosition = (a, b) => a?.row === b?.row && a?.column === b?.column;

function showStart() {
  elements.dialog.close?.();
  elements.startScreen.hidden = false;
  elements.gameScreen.hidden = true;
}

function showGame() {
  elements.startScreen.hidden = true;
  elements.gameScreen.hidden = false;
  restartGame();
}

function restartGame() {
  state = engine.newGame();
  selected = null;
  busy = false;
  if (elements.dialog.open) elements.dialog.close();
  setMessage("Wähle zwei benachbarte Felder");
  render();
}

function setMessage(text) {
  elements.message.textContent = text;
}

function render() {
  elements.score.textContent = state.score.toLocaleString("de-DE");
  elements.moves.textContent = state.movesLeft;
  elements.board.setAttribute("aria-busy", String(busy));
  elements.board.replaceChildren();

  state.board.forEach((row, rowIndex) => {
    row.forEach((tile, columnIndex) => {
      const position = { row: rowIndex, column: columnIndex };
      const button = document.createElement("button");
      button.type = "button";
      button.className = tile ? `tile tile-${tile}` : "tile empty";
      button.setAttribute("role", "gridcell");
      button.disabled = busy || tile === null || state.movesLeft === 0;
      button.dataset.row = String(rowIndex);
      button.dataset.column = String(columnIndex);

      if (tile) {
        button.textContent = TILE_SYMBOLS[tile].symbol;
        button.setAttribute("aria-label", `${TILE_SYMBOLS[tile].name}, Reihe ${rowIndex + 1}, Spalte ${columnIndex + 1}`);
      } else {
        button.setAttribute("aria-label", "Leeres Feld");
      }

      if (samePosition(selected, position)) {
        button.classList.add("selected");
        button.setAttribute("aria-pressed", "true");
      } else {
        button.setAttribute("aria-pressed", "false");
      }

      button.addEventListener("click", () => handleTileTap(position));
      elements.board.append(button);
    });
  });
}

async function handleTileTap(position) {
  if (busy || state.movesLeft === 0) return;

  if (!selected) {
    selected = position;
    setMessage("Jetzt ein Nachbarfeld wählen");
    render();
    return;
  }

  if (samePosition(selected, position)) {
    selected = null;
    setMessage("Auswahl aufgehoben");
    render();
    return;
  }

  const result = engine.trySwap(state, selected, position);
  if (!result.accepted) {
    selected = position;
    setMessage("Nur Nachbarn tauschen – die Reihe muss 3+ ergeben");
    render();
    return;
  }

  const gainedPoints = result.frames.at(-1).score - state.score;
  selected = null;
  busy = true;
  setMessage("Miau! Kombination läuft …");

  for (const frame of result.frames) {
    state = frame;
    render();
    const hasGap = frame.board.some((row) => row.some((tile) => tile === null));
    await sleep(hasGap ? 190 : 130);
  }

  busy = false;
  setMessage(
    result.reshuffled
      ? `+${gainedPoints} Punkte · Brett neu gemischt`
      : `+${gainedPoints} Punkte · ${result.removedTiles} Teile entfernt`,
  );
  render();

  if (state.movesLeft === 0) {
    elements.finalScore.textContent = state.score.toLocaleString("de-DE");
    elements.dialog.showModal();
  }
}

elements.startButton.addEventListener("click", showGame);
elements.backButton.addEventListener("click", showStart);
elements.restartButton.addEventListener("click", restartGame);
elements.playAgainButton.addEventListener("click", restartGame);
elements.dialogHomeButton.addEventListener("click", showStart);

render();
