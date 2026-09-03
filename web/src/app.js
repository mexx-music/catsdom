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
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function tileElement(position) {
  return elements.board.querySelector(
    `[data-row="${position.row}"][data-column="${position.column}"]`,
  );
}

function waitForAnimation(animation) {
  return animation.finished.catch(() => undefined);
}

async function animateSwap(first, second, returnToOrigin = false) {
  if (reducedMotion) return;
  const firstTile = tileElement(first);
  const secondTile = tileElement(second);
  if (!firstTile || !secondTile) return;

  const firstRect = firstTile.getBoundingClientRect();
  const secondRect = secondTile.getBoundingClientRect();
  const deltaX = secondRect.left - firstRect.left;
  const deltaY = secondRect.top - firstRect.top;
  const endOffset = returnToOrigin ? "0" : "1";
  const timing = {
    duration: returnToOrigin ? 330 : 210,
    easing: returnToOrigin ? "cubic-bezier(.34,1.56,.64,1)" : "cubic-bezier(.2,.8,.25,1)",
    fill: "forwards",
  };

  const firstFrames = returnToOrigin
    ? [
        { transform: "translate3d(0,0,0) scale(1)" },
        { transform: `translate3d(${deltaX}px,${deltaY}px,0) scale(1.06)`, offset: 0.48 },
        { transform: "translate3d(0,0,0) scale(1)" },
      ]
    : [
        { transform: "translate3d(0,0,0) scale(1)" },
        { transform: `translate3d(${deltaX}px,${deltaY}px,0) scale(1.04)`, offset: Number(endOffset) },
      ];
  const secondFrames = returnToOrigin
    ? [
        { transform: "translate3d(0,0,0) scale(1)" },
        { transform: `translate3d(${-deltaX}px,${-deltaY}px,0) scale(1.06)`, offset: 0.48 },
        { transform: "translate3d(0,0,0) scale(1)" },
      ]
    : [
        { transform: "translate3d(0,0,0) scale(1)" },
        { transform: `translate3d(${-deltaX}px,${-deltaY}px,0) scale(1.04)`, offset: Number(endOffset) },
      ];

  await Promise.all([
    waitForAnimation(firstTile.animate(firstFrames, timing)),
    waitForAnimation(secondTile.animate(secondFrames, timing)),
  ]);
}

function spawnParticles(tile) {
  if (reducedMotion) return;
  const rect = tile.getBoundingClientRect();
  const color = getComputedStyle(tile).backgroundColor;
  const distance = Math.max(20, rect.width * 0.7);

  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI * 2 * index) / 6 + Math.random() * 0.35;
    const particle = document.createElement("span");
    particle.className = "particle";
    particle.style.left = `${rect.left + rect.width / 2}px`;
    particle.style.top = `${rect.top + rect.height / 2}px`;
    particle.style.setProperty("--particle-size", `${Math.max(5, rect.width * 0.12)}px`);
    particle.style.setProperty("--particle-color", color);
    particle.style.setProperty("--particle-x", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--particle-y", `${Math.sin(angle) * distance}px`);
    document.body.append(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }
}

async function animateClears(beforeBoard, clearedBoard) {
  if (reducedMotion) return;
  const animations = [];
  beforeBoard.forEach((row, rowIndex) => {
    row.forEach((tile, columnIndex) => {
      if (tile === null || clearedBoard[rowIndex][columnIndex] !== null) return;
      const element = tileElement({ row: rowIndex, column: columnIndex });
      if (!element) return;
      spawnParticles(element);
      animations.push(
        waitForAnimation(
          element.animate(
            [
              { opacity: 1, transform: "scale(1) rotate(0deg)" },
              { opacity: 1, transform: "scale(1.2) rotate(-5deg)", offset: 0.42 },
              { opacity: 0, transform: "scale(0.12) rotate(12deg)" },
            ],
            { duration: 290, easing: "cubic-bezier(.3,.8,.35,1)", fill: "forwards" },
          ),
        ),
      );
    });
  });

  const boardBounce = elements.board.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.012)", offset: 0.45 },
      { transform: "scale(1)" },
    ],
    { duration: 260, easing: "ease-out" },
  );
  await Promise.all([...animations, waitForAnimation(boardBounce)]);
}

async function animateFall(clearedBoard) {
  if (reducedMotion) return;
  const first = tileElement({ row: 0, column: 0 });
  const secondRow = tileElement({ row: 1, column: 0 });
  if (!first || !secondRow) return;
  const rowDistance = secondRow.getBoundingClientRect().top - first.getBoundingClientRect().top;
  const animations = [];

  for (let column = 0; column < clearedBoard[0].length; column += 1) {
    const sourceRows = [];
    for (let row = 0; row < clearedBoard.length; row += 1) {
      if (clearedBoard[row][column] !== null) sourceRows.push(row);
    }
    const newTileCount = clearedBoard.length - sourceRows.length;

    for (let destinationRow = 0; destinationRow < clearedBoard.length; destinationRow += 1) {
      const element = tileElement({ row: destinationRow, column });
      if (!element) continue;
      const isNewTile = destinationRow < newTileCount;
      const sourceRow = isNewTile
        ? destinationRow - newTileCount - 1
        : sourceRows[destinationRow - newTileCount];
      const distance = destinationRow - sourceRow;
      if (distance <= 0) continue;

      animations.push(
        waitForAnimation(
          element.animate(
            [
              {
                opacity: isNewTile ? 0.4 : 1,
                transform: `translate3d(0,${-distance * rowDistance}px,0) scale(${isNewTile ? 0.88 : 1})`,
              },
              { opacity: 1, transform: "translate3d(0,5px,0) scale(1.025)", offset: 0.86 },
              { opacity: 1, transform: "translate3d(0,0,0) scale(1)" },
            ],
            {
              duration: 260 + distance * 48,
              delay: column * 9,
              easing: "cubic-bezier(.2,.72,.25,1)",
            },
          ),
        ),
      );
    }
  }
  await Promise.all(animations);
}

async function animateReshuffle() {
  if (reducedMotion) return;
  const tiles = [...elements.board.querySelectorAll(".tile")];
  await Promise.all(
    tiles.map((tile, index) =>
      waitForAnimation(
        tile.animate(
          [
            { opacity: 0, transform: "scale(.65) rotate(-8deg)" },
            { opacity: 1, transform: "scale(1) rotate(0deg)" },
          ],
          { duration: 260, delay: (index % 8) * 18, easing: "cubic-bezier(.34,1.56,.64,1)" },
        ),
      ),
    ),
  );
}

function pulseScore() {
  if (reducedMotion) return;
  elements.score.animate(
    [
      { color: "#3e3150", transform: "scale(1)" },
      { color: "#ff6f61", transform: "scale(1.22)" },
      { color: "#3e3150", transform: "scale(1)" },
    ],
    { duration: 320, easing: "ease-out" },
  );
}

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
    if (isAdjacent(first, second)) {
      busy = true;
      selected = null;
      render();
      await animateSwap(first, second, true);
      busy = false;
    }
    selected = keepSecondSelectedOnFailure ? second : null;
    setMessage("Nur Nachbarn tauschen – die Reihe muss 3+ ergeben");
    render();
    return;
  }

  const gainedPoints = result.frames.at(-1).score - state.score;
  selected = null;
  busy = true;
  setMessage("Miau! Kombination läuft …");
  render();
  await animateSwap(first, second);

  state = result.frames[0];
  render();
  let previousBoard = state.board;
  for (let index = 1; index < result.frames.length; index += 1) {
    const frame = result.frames[index];
    const hasGap = frame.board.some((row) => row.some((tile) => tile === null));
    const previousHasGap = previousBoard.some((row) => row.some((tile) => tile === null));

    if (hasGap) {
      await animateClears(previousBoard, frame.board);
      state = frame;
      render();
      pulseScore();
      await sleep(reducedMotion ? 0 : 45);
    } else if (previousHasGap) {
      state = frame;
      render();
      await animateFall(previousBoard);
    } else {
      state = frame;
      render();
      await animateReshuffle();
    }
    previousBoard = frame.board;
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
