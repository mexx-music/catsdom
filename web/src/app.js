import { BLOCKED_TILE, BOARD_SIZE, GameEngine } from "./game-engine.js?v=16";

const TILE_SYMBOLS = {
  cat: { symbol: "🐱", name: "Katze" },
  paw: { symbol: "🐾", name: "Pfote" },
  fish: { symbol: "🐟", name: "Fisch" },
  yarn: { symbol: "🧶", name: "Wollknäuel" },
  mouse: { symbol: "🐭", name: "Maus" },
  bell: { symbol: "🔔", name: "Glöckchen" },
};

const OBJECT_TOP = 0;
const OBJECT_LEFT = 0;
const OBJECT_SIZE = BOARD_SIZE;
const OBJECT_CELLS = Array.from({ length: OBJECT_SIZE ** 2 }, (_, index) => ({
  row: OBJECT_TOP + Math.floor(index / OBJECT_SIZE),
  column: OBJECT_LEFT + (index % OBJECT_SIZE),
}));

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
  finalMoves: document.querySelector("#final-moves"),
  playAgainButton: document.querySelector("#play-again-button"),
  dialogHomeButton: document.querySelector("#dialog-home-button"),
  installButton: document.querySelector("#install-button"),
  pwaNote: document.querySelector("#pwa-note"),
  revealCount: document.querySelector("#reveal-count"),
};

const engine = new GameEngine();
let state = engine.newGame();
let selected = null;
let busy = false;
let dragGesture = null;
let suppressNextClick = false;
let deferredInstallPrompt = null;
let revealedObjectPieces = new Set();
let newlyRevealedObjectPieces = new Set();
let objectCollected = false;

const sleep = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const samePosition = (a, b) => a?.row === b?.row && a?.column === b?.column;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function tileElement(position) {
  return elements.board.querySelector(
    `[data-row="${position.row}"][data-column="${position.column}"]`,
  );
}

function tileVisual(tile) {
  return tile?.querySelector(".tile-symbol") ?? tile;
}

function waitForAnimation(animation) {
  return animation.finished.catch(() => undefined);
}

async function animateSwap(first, second, returnToOrigin = false) {
  if (reducedMotion) return;
  const firstTile = tileElement(first);
  const secondTile = tileElement(second);
  if (!firstTile || !secondTile) return;
  const firstVisual = tileVisual(firstTile);
  const secondVisual = tileVisual(secondTile);

  const firstRect = firstTile.getBoundingClientRect();
  const secondRect = secondTile.getBoundingClientRect();
  const deltaX = secondRect.left - firstRect.left;
  const deltaY = secondRect.top - firstRect.top;
  const timing = {
    duration: returnToOrigin ? 220 : 150,
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
        { transform: `translate3d(${deltaX}px,${deltaY}px,0) scale(1.04)` },
      ];
  const secondFrames = returnToOrigin
    ? [
        { transform: "translate3d(0,0,0) scale(1)" },
        { transform: `translate3d(${-deltaX}px,${-deltaY}px,0) scale(1.06)`, offset: 0.48 },
        { transform: "translate3d(0,0,0) scale(1)" },
      ]
    : [
        { transform: "translate3d(0,0,0) scale(1)" },
        { transform: `translate3d(${-deltaX}px,${-deltaY}px,0) scale(1.04)` },
      ];

  await Promise.all([
    waitForAnimation(firstVisual.animate(firstFrames, timing)),
    waitForAnimation(secondVisual.animate(secondFrames, timing)),
  ]);
}

function resetDragStyles(gesture) {
  [gesture?.sourceElement, gesture?.targetElement].forEach((tile) => {
    if (!tile) return;
    tile.style.removeProperty("z-index");
    const visual = tileVisual(tile);
    visual.style.removeProperty("transform");
    visual.style.removeProperty("transition");
    visual.style.removeProperty("will-change");
    tile.classList.remove("drag-source", "drag-target");
  });
}

function updateDirectDrag(gesture, clientX, clientY) {
  const rawX = clientX - gesture.startX;
  const rawY = clientY - gesture.startY;
  const horizontal = Math.abs(rawX) >= Math.abs(rawY);
  const dominant = horizontal ? rawX : rawY;
  const direction = dominant < 0 ? -1 : 1;
  const targetPosition = {
    row: gesture.start.row + (horizontal ? 0 : direction),
    column: gesture.start.column + (horizontal ? direction : 0),
  };
  const targetElement = tileElement(targetPosition);

  if (gesture.targetElement && gesture.targetElement !== targetElement) {
    resetDragStyles({ targetElement: gesture.targetElement });
  }

  const sourceRect = gesture.sourceRect;
  const targetRect = targetElement?.getBoundingClientRect();
  const stepX = targetRect ? targetRect.left - sourceRect.left : horizontal ? sourceRect.width * direction : 0;
  const stepY = targetRect ? targetRect.top - sourceRect.top : horizontal ? 0 : sourceRect.height * direction;
  const distance = Math.max(1, Math.hypot(stepX, stepY));
  const progress = targetElement
    ? Math.min(1, Math.abs(dominant) / distance)
    : Math.min(0.22, Math.abs(dominant) / distance);
  const perpendicularLimit = Math.min(8, sourceRect.width * 0.12);
  const moveX = horizontal
    ? stepX * progress
    : Math.max(-perpendicularLimit, Math.min(perpendicularLimit, rawX * 0.16));
  const moveY = horizontal
    ? Math.max(-perpendicularLimit, Math.min(perpendicularLimit, rawY * 0.16))
    : stepY * progress;

  gesture.target = targetElement ? targetPosition : null;
  gesture.targetElement = targetElement;
  gesture.stepX = stepX;
  gesture.stepY = stepY;
  gesture.moveX = moveX;
  gesture.moveY = moveY;
  gesture.progress = progress;

  gesture.sourceElement.classList.add("drag-source");
  gesture.sourceElement.style.zIndex = "6";
  const sourceVisual = tileVisual(gesture.sourceElement);
  sourceVisual.style.transition = "none";
  sourceVisual.style.willChange = "transform";
  sourceVisual.style.transform = `translate3d(${moveX}px,${moveY}px,0) scale(1.055)`;

  if (targetElement) {
    targetElement.classList.add("drag-target");
    targetElement.style.zIndex = "5";
    const targetVisual = tileVisual(targetElement);
    targetVisual.style.transition = "none";
    targetVisual.style.willChange = "transform";
    targetVisual.style.transform = `translate3d(${-stepX * progress}px,${-stepY * progress}px,0) scale(${1 - progress * 0.035})`;
  }
}

async function animateDirectDragRelease(gesture, completeSwap) {
  if (!gesture?.sourceElement || reducedMotion) {
    resetDragStyles(gesture);
    return;
  }

  const target = gesture.targetElement;
  const duration = completeSwap
    ? Math.max(65, 135 * (1 - gesture.progress))
    : 150;
  const sourceEndX = completeSwap ? gesture.stepX : 0;
  const sourceEndY = completeSwap ? gesture.stepY : 0;
  const sourceAnimation = tileVisual(gesture.sourceElement).animate(
    [
      { transform: `translate3d(${gesture.moveX}px,${gesture.moveY}px,0) scale(1.055)` },
      { transform: `translate3d(${sourceEndX}px,${sourceEndY}px,0) scale(1)` },
    ],
    {
      duration,
      easing: completeSwap ? "cubic-bezier(.2,.82,.25,1)" : "cubic-bezier(.34,1.56,.64,1)",
      fill: "forwards",
    },
  );
  const animations = [waitForAnimation(sourceAnimation)];

  if (target) {
    const targetAnimation = tileVisual(target).animate(
      [
        {
          transform: `translate3d(${-gesture.stepX * gesture.progress}px,${-gesture.stepY * gesture.progress}px,0) scale(${1 - gesture.progress * 0.035})`,
        },
        {
          transform: completeSwap
            ? `translate3d(${-gesture.stepX}px,${-gesture.stepY}px,0) scale(1)`
            : "translate3d(0,0,0) scale(1)",
        },
      ],
      {
        duration,
        easing: completeSwap ? "cubic-bezier(.2,.82,.25,1)" : "cubic-bezier(.34,1.56,.64,1)",
        fill: "forwards",
      },
    );
    animations.push(waitForAnimation(targetAnimation));
  }

  await Promise.all(animations);
  resetDragStyles(gesture);
}

function spawnParticles(tile) {
  if (reducedMotion) return;
  const rect = tile.getBoundingClientRect();
  const tileStyle = getComputedStyle(tile);
  const color = tileStyle.getPropertyValue("--tile-color").trim() || tileStyle.backgroundColor;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const ring = document.createElement("span");
  ring.className = "burst-ring";
  ring.style.left = `${centerX}px`;
  ring.style.top = `${centerY}px`;
  ring.style.setProperty("--burst-size", `${rect.width * 0.82}px`);
  ring.style.setProperty("--particle-color", color);
  document.body.append(ring);
  ring.addEventListener("animationend", () => ring.remove(), { once: true });

  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI * 2 * index) / 8 + Math.random() * 0.28;
    const distance = rect.width * (0.78 + Math.random() * 0.42);
    const particle = document.createElement("span");
    particle.className = `particle ${index % 2 === 0 ? "particle-shard" : "particle-spark"}`;
    particle.style.left = `${centerX}px`;
    particle.style.top = `${centerY}px`;
    particle.style.setProperty(
      "--particle-size",
      `${Math.max(7, rect.width * (0.13 + Math.random() * 0.055))}px`,
    );
    particle.style.setProperty("--particle-color", index % 3 === 0 ? "#fff" : color);
    particle.style.setProperty("--particle-x", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--particle-y", `${Math.sin(angle) * distance}px`);
    particle.style.setProperty("--particle-rotation", `${100 + Math.random() * 180}deg`);
    particle.style.setProperty("--particle-delay", `${index * 5}ms`);
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
          tileVisual(element).animate(
            [
              { opacity: 1, transform: "scale(1) rotate(0deg)", filter: "brightness(1)" },
              {
                opacity: 1,
                transform: "scale(1.34) rotate(-6deg)",
                filter: "brightness(1.28)",
                offset: 0.46,
              },
              { opacity: 0, transform: "scale(0.05) rotate(18deg)", filter: "brightness(1.4)" },
            ],
            { duration: 265, easing: "cubic-bezier(.25,.8,.3,1)", fill: "forwards" },
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
    { duration: 220, easing: "ease-out" },
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
    const segments = [];
    let segmentTop = 0;
    for (let row = 0; row <= clearedBoard.length; row += 1) {
      if (row === clearedBoard.length || clearedBoard[row][column] === BLOCKED_TILE) {
        if (segmentTop <= row - 1) segments.push([segmentTop, row - 1]);
        segmentTop = row + 1;
      }
    }

    for (const [top, bottom] of segments) {
      const sourceRows = [];
      for (let row = top; row <= bottom; row += 1) {
        if (clearedBoard[row][column] !== null) sourceRows.push(row);
      }
      const newTileCount = bottom - top + 1 - sourceRows.length;

      for (let destinationRow = top; destinationRow <= bottom; destinationRow += 1) {
        const element = tileElement({ row: destinationRow, column });
        if (!element?.querySelector(".tile-symbol")) continue;
        const isNewTile = destinationRow < top + newTileCount;
        const sourceRow = isNewTile
          ? destinationRow - newTileCount - 1
          : sourceRows[destinationRow - top - newTileCount];
        const distance = destinationRow - sourceRow;
        if (distance <= 0) continue;

        animations.push(
          waitForAnimation(
            tileVisual(element).animate(
              [
                {
                  opacity: isNewTile ? 0.4 : 1,
                  transform: `translate3d(0,${-distance * rowDistance}px,0) scale(${isNewTile ? 0.88 : 1})`,
                },
                { opacity: 1, transform: "translate3d(0,5px,0) scale(1.018)", offset: 0.88 },
                { opacity: 1, transform: "translate3d(0,0,0) scale(1)" },
              ],
              {
                duration: 340 + distance * 52,
                delay: column * 10,
                easing: "cubic-bezier(.18,.62,.24,1)",
              },
            ),
          ),
        );
      }
    }
  }
  await Promise.all(animations);
}

async function animateReshuffle() {
  if (reducedMotion) return;
  const tiles = [...elements.board.querySelectorAll(".tile-symbol")];
  await Promise.all(
    tiles.map((tile, index) =>
      waitForAnimation(
        tile.animate(
          [
            { opacity: 0, transform: "scale(.65) rotate(-8deg)" },
            { opacity: 1, transform: "scale(1) rotate(0deg)" },
          ],
          { duration: 210, delay: (index % 8) * 10, easing: "cubic-bezier(.34,1.56,.64,1)" },
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
    { duration: 220, easing: "ease-out" },
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
  revealedObjectPieces = new Set();
  newlyRevealedObjectPieces = new Set();
  objectCollected = false;
  if (elements.dialog.open) elements.dialog.close();
  clearDragHighlights();
  setMessage("Lege Milos Bild Feld für Feld frei");
  renderObjectProgress();
  render();
}

function setMessage(text) {
  elements.message.textContent = text;
}

function render() {
  elements.score.textContent = state.score.toLocaleString("de-DE");
  elements.moves.textContent = state.moves;
  elements.board.setAttribute("aria-busy", String(busy));
  elements.board.classList.toggle("reveal-complete", objectCollected);
  elements.board.replaceChildren();

  {
    const objectShell = document.createElement("div");
    objectShell.className = "board-object-shell";
    objectShell.setAttribute("aria-hidden", "true");
    const objectLayer = document.createElement("div");
    objectLayer.className = "board-object";
    objectLayer.style.gridRow = `${OBJECT_TOP + 1} / span ${OBJECT_SIZE}`;
    objectLayer.style.gridColumn = `${OBJECT_LEFT + 1} / span ${OBJECT_SIZE}`;
    const photo = document.createElement("img");
    photo.src = "./assets/milo-window-seat.webp";
    photo.alt = "";
    objectLayer.append(photo);
    const cover = document.createElement("div");
    cover.className = "board-object-cover";
    for (let pieceIndex = 0; pieceIndex < OBJECT_SIZE ** 2; pieceIndex += 1) {
      const piece = document.createElement("span");
      if (revealedObjectPieces.has(pieceIndex)) piece.classList.add("revealed");
      if (newlyRevealedObjectPieces.has(pieceIndex)) piece.classList.add("newly-revealed");
      cover.append(piece);
    }
    objectLayer.append(cover);
    objectShell.append(objectLayer);
    elements.board.append(objectShell);
  }

  state.board.forEach((row, rowIndex) => {
    row.forEach((tile, columnIndex) => {
      const position = { row: rowIndex, column: columnIndex };
      const button = document.createElement("button");
      button.type = "button";
      button.className = tile ? `tile tile-${tile}` : "tile empty";
      button.setAttribute("role", "gridcell");
      button.disabled = busy || objectCollected || tile === null || tile === BLOCKED_TILE;
      button.dataset.row = String(rowIndex);
      button.dataset.column = String(columnIndex);

      const objectRow = rowIndex - OBJECT_TOP;
      const objectColumn = columnIndex - OBJECT_LEFT;
      if (
        objectRow >= 0 &&
        objectRow < OBJECT_SIZE &&
        objectColumn >= 0 &&
        objectColumn < OBJECT_SIZE
      ) {
        button.classList.add("object-zone");
      }

      if (tile === BLOCKED_TILE) {
        button.classList.add("blocked-cell");
        button.setAttribute("aria-label", "Vom Katzenkarton belegt");
      } else if (tile) {
        const symbol = document.createElement("span");
        symbol.className = "tile-symbol";
        symbol.textContent = TILE_SYMBOLS[tile].symbol;
        symbol.setAttribute("aria-hidden", "true");
        button.append(symbol);
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
  newlyRevealedObjectPieces.clear();
}

function renderObjectProgress() {
  elements.revealCount.textContent = objectCollected
    ? "✓"
    : `${revealedObjectPieces.size}/${OBJECT_CELLS.length}`;
}

function revealObjectUnderClearedTiles(beforeBoard, clearedBoard) {
  for (let pieceIndex = 0; pieceIndex < OBJECT_CELLS.length; pieceIndex += 1) {
    const { row, column } = OBJECT_CELLS[pieceIndex];
    if (
      beforeBoard[row][column] !== null &&
      beforeBoard[row][column] !== BLOCKED_TILE &&
      clearedBoard[row][column] === null &&
      !revealedObjectPieces.has(pieceIndex)
    ) {
      revealedObjectPieces.add(pieceIndex);
      newlyRevealedObjectPieces.add(pieceIndex);
    }
  }
  renderObjectProgress();
}

function showGameOver() {
  elements.finalScore.textContent = state.score.toLocaleString("de-DE");
  elements.finalMoves.textContent = state.moves.toLocaleString("de-DE");
  elements.dialog.showModal();
}

async function completeCatReveal() {
  objectCollected = true;
  renderObjectProgress();
  elements.board.classList.add("reveal-complete");
  elements.board.querySelectorAll(".tile").forEach((tile) => {
    tile.disabled = true;
  });
  setMessage(`Milo ist frei – geschafft in ${state.moves} Zügen! 🐾`);

  if (reducedMotion) {
    showGameOver();
    return;
  }

  await waitForAnimation(
    elements.board.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.035)", offset: 0.38 },
        { transform: "scale(1)" },
      ],
      { duration: 900, easing: "cubic-bezier(.22,.62,.28,1)" },
    ),
  );
  await sleep(900);
  showGameOver();
}

async function handleTileTap(position) {
  if (busy || objectCollected) return;

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

async function performSwap(first, second, keepSecondSelectedOnFailure = false, directDrag = null) {
  const result = engine.trySwap(state, first, second);
  if (!result.accepted) {
    if (isAdjacent(first, second)) {
      busy = true;
      selected = null;
      if (directDrag) {
        elements.board.setAttribute("aria-busy", "true");
        await animateDirectDragRelease(directDrag, false);
      } else {
        render();
        await animateSwap(first, second, true);
      }
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
  if (directDrag) {
    elements.board.setAttribute("aria-busy", "true");
    await animateDirectDragRelease(directDrag, true);
  } else {
    render();
    await animateSwap(first, second);
  }

  state = result.frames[0];
  render();
  let previousBoard = state.board;
  for (let index = 1; index < result.frames.length; index += 1) {
    const frame = result.frames[index];
    const hasGap = frame.board.some((row) => row.some((tile) => tile === null));
    const previousHasGap = previousBoard.some((row) => row.some((tile) => tile === null));

    if (hasGap) {
      await animateClears(previousBoard, frame.board);
      revealObjectUnderClearedTiles(previousBoard, frame.board);
      state = frame;
      render();
      pulseScore();
      await sleep(reducedMotion ? 0 : 12);
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
  const discoveredNow = revealedObjectPieces.size === OBJECT_SIZE ** 2 && !objectCollected;
  setMessage(
    result.reshuffled
      ? `+${gainedPoints} Punkte · Brett neu gemischt`
      : `+${gainedPoints} Punkte · ${result.removedTiles} Teile entfernt`,
  );
  render();

  if (discoveredNow) {
    await sleep(reducedMotion ? 0 : 380);
    await completeCatReveal();
  }
}

function tileAtPoint(clientX, clientY) {
  const tile = document.elementFromPoint(clientX, clientY)?.closest(".tile");
  if (!tile || tile.disabled || !elements.board.contains(tile)) return null;
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
    tile.style.removeProperty("transform");
    tile.style.removeProperty("transition");
    tile.style.removeProperty("z-index");
    tile.style.removeProperty("will-change");
    tile.classList.remove("drag-source", "drag-target");
  });
}

elements.board.addEventListener("pointerdown", (event) => {
  if (busy || objectCollected || event.button > 0) return;
  const target = tileAtPoint(event.clientX, event.clientY);
  if (!target) return;

  dragGesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    start: target.position,
    sourceElement: target.element,
    sourceRect: target.element.getBoundingClientRect(),
    target: null,
    targetElement: null,
    stepX: 0,
    stepY: 0,
    moveX: 0,
    moveY: 0,
    progress: 0,
    dragging: false,
  };
  elements.board.setPointerCapture(event.pointerId);
});

elements.board.addEventListener("pointermove", (event) => {
  if (!dragGesture || dragGesture.pointerId !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - dragGesture.startX, event.clientY - dragGesture.startY);
  if (!dragGesture.dragging && distance < 8) return;

  dragGesture.dragging = true;
  updateDirectDrag(dragGesture, event.clientX, event.clientY);

  if (dragGesture.target && dragGesture.progress >= 0.28) {
    setMessage("Loslassen zum Tauschen");
  } else {
    setMessage("Teil weiter in eine Richtung ziehen");
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

  if (!gesture.target || gesture.progress < 0.28) {
    busy = true;
    elements.board.setAttribute("aria-busy", "true");
    await animateDirectDragRelease(gesture, false);
    busy = false;
    selected = null;
    setMessage("Etwas weiter ziehen, um zu tauschen");
    render();
    return;
  }

  selected = null;
  await performSwap(gesture.start, gesture.target, false, gesture);
});

elements.board.addEventListener("pointercancel", async () => {
  const gesture = dragGesture;
  dragGesture = null;
  if (gesture?.dragging) await animateDirectDragRelease(gesture, false);
  else resetDragStyles(gesture);
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
