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
  installButton: document.querySelector("#install-button"),
  pwaNote: document.querySelector("#pwa-note"),
};

const engine = new GameEngine();
let state = engine.newGame();
let selected = null;
let busy = false;
let dragGesture = null;
let suppressNextClick = false;
let deferredInstallPrompt = null;

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
  clearDragHighlights();
  setMessage("Tippe zwei Felder an oder ziehe ein Teil auf seinen Nachbarn");
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

      button.addEventListener("click", () => {
        if (suppressNextClick) return;
        handleTileTap(position);
      });
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

  await performSwap(selected, position, true);
}

async function performSwap(first, second, keepSecondSelectedOnFailure = false) {
  const result = engine.trySwap(state, first, second);
  if (!result.accepted) {
    selected = keepSecondSelectedOnFailure ? second : null;
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

function tileAtPoint(clientX, clientY) {
  const tile = document.elementFromPoint(clientX, clientY)?.closest(".tile");
  if (!tile || !elements.board.contains(tile)) return null;
  return {
    element: tile,
    position: { row: Number(tile.dataset.row), column: Number(tile.dataset.column) },
  };
}

function isAdjacent(first, second) {
  return Math.abs(first.row - second.row) + Math.abs(first.column - second.column) === 1;
}

function clearDragHighlights() {
  elements.board.querySelectorAll(".drag-source, .drag-target").forEach((tile) => {
    tile.classList.remove("drag-source", "drag-target");
  });
}

elements.board.addEventListener("pointerdown", (event) => {
  if (busy || state.movesLeft === 0 || event.button > 0) return;
  const target = tileAtPoint(event.clientX, event.clientY);
  if (!target) return;

  dragGesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    start: target.position,
    dragging: false,
  };
  elements.board.setPointerCapture(event.pointerId);
});

elements.board.addEventListener("pointermove", (event) => {
  if (!dragGesture || dragGesture.pointerId !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - dragGesture.startX, event.clientY - dragGesture.startY);
  if (!dragGesture.dragging && distance < 8) return;

  dragGesture.dragging = true;
  clearDragHighlights();
  const source = elements.board.querySelector(
    `[data-row="${dragGesture.start.row}"][data-column="${dragGesture.start.column}"]`,
  );
  source?.classList.add("drag-source");

  const target = tileAtPoint(event.clientX, event.clientY);
  if (target && isAdjacent(dragGesture.start, target.position)) {
    target.element.classList.add("drag-target");
    setMessage("Loslassen zum Tauschen");
  } else {
    setMessage("Auf ein direktes Nachbarfeld ziehen");
  }
});

elements.board.addEventListener("pointerup", async (event) => {
  if (!dragGesture || dragGesture.pointerId !== event.pointerId) return;
  const gesture = dragGesture;
  dragGesture = null;

  if (!gesture.dragging) return;
  suppressNextClick = true;
  window.setTimeout(() => {
    suppressNextClick = false;
  }, 0);

  const target = tileAtPoint(event.clientX, event.clientY);
  clearDragHighlights();
  if (!target || !isAdjacent(gesture.start, target.position)) {
    selected = null;
    setMessage("Ziehe ein Teil auf ein direktes Nachbarfeld");
    render();
    return;
  }

  selected = null;
  await performSwap(gesture.start, target.position);
});

elements.board.addEventListener("pointercancel", () => {
  dragGesture = null;
  clearDragHighlights();
  setMessage("Ziehen abgebrochen");
});

elements.startButton.addEventListener("click", showGame);
elements.backButton.addEventListener("click", showStart);
elements.restartButton.addEventListener("click", restartGame);
elements.playAgainButton.addEventListener("click", restartGame);
elements.dialogHomeButton.addEventListener("click", showStart);

const isAppleTouchDevice =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

if (isAppleTouchDevice && !isStandalone) {
  elements.installButton.hidden = false;
  elements.pwaNote.hidden = false;
  elements.pwaNote.textContent = "Auf iPad/iPhone: Teilen antippen und ‚Zum Home-Bildschirm‘ wählen.";
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  elements.installButton.hidden = false;
});

elements.installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    elements.pwaNote.hidden = false;
    elements.pwaNote.textContent = isAppleTouchDevice
      ? "In Safari: Teilen antippen und ‚Zum Home-Bildschirm‘ wählen."
      : "Im Browsermenü ‚App installieren‘ oder ‚Zum Startbildschirm hinzufügen‘ wählen.";
    return;
  }

  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  if (choice.outcome === "accepted") elements.installButton.hidden = true;
});

window.addEventListener("appinstalled", () => {
  elements.installButton.hidden = true;
  elements.pwaNote.hidden = false;
  elements.pwaNote.textContent = "Catsdom wurde installiert und kann vom Homescreen gestartet werden.";
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch(() => {
      // Das Spiel bleibt auch ohne Offline-Modus vollständig nutzbar.
    });
  });
}

render();
