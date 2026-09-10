import {
  BIG_PAW_BOMB,
  BLOCKED_TILE,
  BOARD_SIZE,
  GameEngine,
  PAW_BOMB,
} from "./game-engine.js?v=31";
import {
  discoverActiveCat,
  getActiveCat,
  getCatCollection,
  loadCatProgress,
  revealCatTiles,
  saveCatProgress,
  selectActiveCat,
} from "./cat-progress.js?v=31";
import {
  BUNDLED_CATALOG,
  CatCatalogRepository,
} from "./cat-catalog-repository.js?v=31";
import { CatAssetStore } from "./cat-asset-store.js?v=31";
import { MOTION_TUNING, fallDurationForDistance } from "./motion-tuning.js?v=31";

const TILE_SYMBOLS = {
  cat: { symbol: "🐱", name: "Katze" },
  paw: { symbol: "🐾", name: "Pfote" },
  fish: { symbol: "🐟", name: "Fisch" },
  yarn: { symbol: "🧶", name: "Wollknäuel" },
  mouse: { symbol: "🐭", name: "Maus" },
  bell: { symbol: "🔔", name: "Glöckchen" },
  [PAW_BOMB]: { symbol: "💣", name: "Mini-Pfotenbombe" },
  [BIG_PAW_BOMB]: { symbol: "🧨", name: "Riesen-Pfotenbombe" },
};

const isBombTile = (tile) => tile === PAW_BOMB || tile === BIG_PAW_BOMB;

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
  collectionScreen: document.querySelector("#collection-screen"),
  startButton: document.querySelector("#start-button"),
  startCollectionButton: document.querySelector("#start-collection-button"),
  gameCollectionButton: document.querySelector("#game-collection-button"),
  collectionBackButton: document.querySelector("#collection-back-button"),
  backButton: document.querySelector("#back-button"),
  restartButton: document.querySelector("#restart-button"),
  board: document.querySelector("#board"),
  score: document.querySelector("#score"),
  moves: document.querySelector("#moves"),
  message: document.querySelector("#message"),
  dialog: document.querySelector("#game-over-dialog"),
  finalScore: document.querySelector("#final-score"),
  finalMoves: document.querySelector("#final-moves"),
  completionTitle: document.querySelector("#completion-title"),
  completionCopy: document.querySelector("#completion-copy"),
  playAgainButton: document.querySelector("#play-again-button"),
  dialogHomeButton: document.querySelector("#dialog-home-button"),
  installButton: document.querySelector("#install-button"),
  pwaNote: document.querySelector("#pwa-note"),
  revealCount: document.querySelector("#reveal-count"),
  activeCatLabel: document.querySelector("#active-cat-label"),
  startProgress: document.querySelector("#start-progress"),
  contentStatus: document.querySelector("#content-status"),
  collectionProgress: document.querySelector("#collection-progress"),
  catGrid: document.querySelector("#cat-grid"),
};

const engine = new GameEngine();
const catalogRepository = new CatCatalogRepository({
  bundledCatalog: BUNDLED_CATALOG,
  catalogUrl:
    document.querySelector('meta[name="catsdom-catalog-url"]')?.content ?? "./cats/catalog.json",
});
const catAssetStore = new CatAssetStore();
let catCatalog = catalogRepository.loadCatalog().cats;
let pendingCatCatalog = null;
const catRuntimeImageUrls = new Map();
let state = engine.newGame();
let selected = null;
let busy = false;
let flowGeneration = 0;
let interactionWindow = null;
let dragGesture = null;
let suppressNextClick = false;
let deferredInstallPrompt = null;
let revealedObjectPieces = new Set();
let newlyRevealedObjectPieces = new Set();
let objectCollected = false;
let catProgress = loadCatProgress(globalThis.localStorage, catCatalog);
let activeCat = getActiveCat(catProgress, catCatalog);
let collectionReturnScreen = "start";
let collectionSelectionBusy = false;
let contentReady = null;

const sleep = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const samePosition = (a, b) => a?.row === b?.row && a?.column === b?.column;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function canInteractAt(position) {
  if (objectCollected) return false;
  if (!busy) return true;
  return (
    interactionWindow?.type === "fall" &&
    interactionWindow.flowId === flowGeneration &&
    !interactionWindow.lockedColumns.has(position.column)
  );
}

function closeFallInteractionWindow(flowId) {
  if (interactionWindow?.flowId !== flowId) return;
  interactionWindow = null;
  selected = null;
  const gesture = dragGesture;
  dragGesture = null;
  if (gesture) resetDragStyles(gesture);
}

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
    duration: returnToOrigin
      ? MOTION_TUNING.invalidSwapDuration
      : MOTION_TUNING.swapDuration,
    easing: returnToOrigin ? MOTION_TUNING.invalidSwapEasing : MOTION_TUNING.swapEasing,
    fill: "forwards",
  };

  const firstFrames = returnToOrigin
    ? [
        { transform: "translate3d(0,0,0) scale(1)" },
        {
          transform: `translate3d(${deltaX}px,${deltaY}px,0) scale(${MOTION_TUNING.movingPieceScale})`,
          offset: 0.48,
        },
        { transform: "translate3d(0,0,0) scale(1)" },
      ]
    : [
        { transform: "translate3d(0,0,0) scale(1)" },
        {
          transform: `translate3d(${deltaX}px,${deltaY}px,0) scale(${MOTION_TUNING.movingPieceScale})`,
          offset: 0.82,
        },
        {
          transform: `translate3d(${deltaX}px,${deltaY}px,0) scale(${MOTION_TUNING.landingScale})`,
          offset: 0.92,
        },
        { transform: `translate3d(${deltaX}px,${deltaY}px,0) scale(1)` },
      ];
  const secondFrames = returnToOrigin
    ? [
        { transform: "translate3d(0,0,0) scale(1)" },
        {
          transform: `translate3d(${-deltaX}px,${-deltaY}px,0) scale(${MOTION_TUNING.movingPieceScale})`,
          offset: 0.48,
        },
        { transform: "translate3d(0,0,0) scale(1)" },
      ]
    : [
        { transform: "translate3d(0,0,0) scale(1)" },
        {
          transform: `translate3d(${-deltaX}px,${-deltaY}px,0) scale(${MOTION_TUNING.movingPieceScale})`,
          offset: 0.82,
        },
        {
          transform: `translate3d(${-deltaX}px,${-deltaY}px,0) scale(${MOTION_TUNING.landingScale})`,
          offset: 0.92,
        },
        { transform: `translate3d(${-deltaX}px,${-deltaY}px,0) scale(1)` },
      ];

  await Promise.all([
    waitForAnimation(firstVisual.animate(firstFrames, timing)),
    waitForAnimation(secondVisual.animate(secondFrames, timing)),
  ]);
}

function animateSwapLanding(positions) {
  if (reducedMotion) return;
  for (const position of positions) {
    const tile = tileElement(position);
    if (!tile) continue;
    tile.animate(
      [
        { transform: `scale(${MOTION_TUNING.movingPieceScale})` },
        { transform: `scale(${MOTION_TUNING.landingScale})`, offset: 0.58 },
        { transform: "scale(1)" },
      ],
      { duration: 90, easing: MOTION_TUNING.landingEasing },
    );
  }
}

function directDragResolutionDelay(gesture) {
  if (reducedMotion || gesture.progress >= MOTION_TUNING.swapResolutionProgress) return 0;
  const remainingProgress = Math.max(0.001, 1 - gesture.progress);
  const releaseDuration = Math.max(
    MOTION_TUNING.directDragMinDuration,
    MOTION_TUNING.directDragBaseDuration * remainingProgress,
  );
  return (
    releaseDuration *
    ((MOTION_TUNING.swapResolutionProgress - gesture.progress) / remainingProgress)
  );
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
  const sourceScale = 1 - (1 - MOTION_TUNING.movingPieceScale) * progress;
  sourceVisual.style.transform = `translate3d(${moveX}px,${moveY}px,0) scale(${sourceScale})`;

  if (targetElement) {
    targetElement.classList.add("drag-target");
    targetElement.style.zIndex = "5";
    const targetVisual = tileVisual(targetElement);
    targetVisual.style.transition = "none";
    targetVisual.style.willChange = "transform";
    const targetScale = 1 - (1 - MOTION_TUNING.movingPieceScale) * progress;
    targetVisual.style.transform = `translate3d(${-stepX * progress}px,${-stepY * progress}px,0) scale(${targetScale})`;
  }
}

async function animateDirectDragRelease(gesture, completeSwap) {
  if (!gesture?.sourceElement || reducedMotion) {
    resetDragStyles(gesture);
    return;
  }

  const target = gesture.targetElement;
  const duration = completeSwap
    ? Math.max(
        MOTION_TUNING.directDragMinDuration,
        MOTION_TUNING.directDragBaseDuration * (1 - gesture.progress),
      )
    : MOTION_TUNING.directDragBaseDuration;
  const sourceEndX = completeSwap ? gesture.stepX : 0;
  const sourceEndY = completeSwap ? gesture.stepY : 0;
  const sourceStartScale = 1 - (1 - MOTION_TUNING.movingPieceScale) * gesture.progress;
  const sourceAnimation = tileVisual(gesture.sourceElement).animate(
    completeSwap
      ? [
          {
            transform: `translate3d(${gesture.moveX}px,${gesture.moveY}px,0) scale(${sourceStartScale})`,
          },
          {
            transform: `translate3d(${sourceEndX}px,${sourceEndY}px,0) scale(${MOTION_TUNING.movingPieceScale})`,
            offset: 0.72,
          },
          {
            transform: `translate3d(${sourceEndX}px,${sourceEndY}px,0) scale(${MOTION_TUNING.landingScale})`,
            offset: 0.9,
          },
          { transform: `translate3d(${sourceEndX}px,${sourceEndY}px,0) scale(1)` },
        ]
      : [
          {
            transform: `translate3d(${gesture.moveX}px,${gesture.moveY}px,0) scale(${sourceStartScale})`,
          },
          { transform: "translate3d(0,0,0) scale(1)" },
        ],
    {
      duration,
      easing: completeSwap ? MOTION_TUNING.swapEasing : MOTION_TUNING.invalidSwapEasing,
      fill: "forwards",
    },
  );
  const animations = [waitForAnimation(sourceAnimation)];

  if (target) {
    const targetStartScale = 1 - (1 - MOTION_TUNING.movingPieceScale) * gesture.progress;
    const targetAnimation = tileVisual(target).animate(
      completeSwap
        ? [
            {
              transform: `translate3d(${-gesture.stepX * gesture.progress}px,${-gesture.stepY * gesture.progress}px,0) scale(${targetStartScale})`,
            },
            {
              transform: `translate3d(${-gesture.stepX}px,${-gesture.stepY}px,0) scale(${MOTION_TUNING.movingPieceScale})`,
              offset: 0.72,
            },
            {
              transform: `translate3d(${-gesture.stepX}px,${-gesture.stepY}px,0) scale(${MOTION_TUNING.landingScale})`,
              offset: 0.9,
            },
            { transform: `translate3d(${-gesture.stepX}px,${-gesture.stepY}px,0) scale(1)` },
          ]
        : [
            {
              transform: `translate3d(${-gesture.stepX * gesture.progress}px,${-gesture.stepY * gesture.progress}px,0) scale(${targetStartScale})`,
            },
            { transform: "translate3d(0,0,0) scale(1)" },
          ],
      {
        duration,
        easing: completeSwap ? MOTION_TUNING.swapEasing : MOTION_TUNING.invalidSwapEasing,
        fill: "forwards",
      },
    );
    animations.push(waitForAnimation(targetAnimation));
  }

  await Promise.all(animations);
  resetDragStyles(gesture);
}

function spawnParticles(tile, particleCount = 8) {
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

  for (let index = 0; index < particleCount; index += 1) {
    const angle = (Math.PI * 2 * index) / particleCount + Math.random() * 0.28;
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

async function animateClears(beforeBoard, clearedBoard, particleCount = 8) {
  if (reducedMotion) return;
  const animations = [];
  beforeBoard.forEach((row, rowIndex) => {
    row.forEach((tile, columnIndex) => {
      if (tile === null || clearedBoard[rowIndex][columnIndex] !== null) return;
      const element = tileElement({ row: rowIndex, column: columnIndex });
      if (!element) return;
      spawnParticles(element, particleCount);
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
            {
              duration: MOTION_TUNING.clearDuration,
              easing: "cubic-bezier(.25,.8,.3,1)",
              fill: "forwards",
            },
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
    { duration: MOTION_TUNING.clearBoardResponseDuration, easing: "ease-out" },
  );
  await Promise.all([...animations, waitForAnimation(boardBounce)]);
}

function animatePawBombBlast(blastCenters, isCombo) {
  const points = blastCenters
    .map((position) => ({ position, tile: tileElement(position) }))
    .filter(({ tile }) => Boolean(tile))
    .map(({ position, tile }) => {
      const rect = tile.getBoundingClientRect();
      return {
        tile,
        visual: tileVisual(tile),
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        size: rect.width,
        power: position.power ?? 1,
      };
    });
  if (points.length === 0) return Promise.resolve();

  const hasBigBomb = points.some((point) => point.power >= 2);
  setMessage(
    isCombo
      ? "Doppel-Pfoten-Krawall!"
      : hasBigBomb
        ? "Riesen-Pfotenbombe!"
        : "Pfotenbombe!",
  );
  if (reducedMotion) return Promise.resolve();

  const chargeAnimations = points.map(({ visual }, index) =>
    waitForAnimation(
      visual.animate(
        [
          { transform: "scale(1) rotate(0deg)", filter: "brightness(1)" },
          {
            transform: `scale(${isCombo ? 1.42 : hasBigBomb ? 1.36 : 1.28}) rotate(${index % 2 ? 10 : -10}deg)`,
            filter: "brightness(1.65)",
            offset: 0.58,
          },
          { transform: "scale(1.12) rotate(0deg)", filter: "brightness(1.3)" },
        ],
        {
          duration: MOTION_TUNING.bombChargeDuration,
          easing: "cubic-bezier(.2,.72,.25,1)",
        },
      ),
    )
  );

  const effects = points.map((point) => ({ ...point, comboCore: false }));
  if (isCombo && points.length > 1) {
    effects.push({
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      size: Math.max(...points.map((point) => point.size)),
      comboCore: true,
    });
  }

  const blastAnimations = effects.map((effect, index) => {
    const blast = document.createElement("div");
    blast.className = `paw-blast${effect.power >= 2 ? " paw-blast-big" : ""}${
      effect.comboCore ? " paw-blast-combo" : ""
    }`;
    blast.style.left = `${effect.x}px`;
    blast.style.top = `${effect.y}px`;
    const diameter =
      effect.size *
      (effect.comboCore
        ? 6.1
        : effect.power >= 2
          ? isCombo
            ? 5.7
            : 5.25
          : isCombo
            ? 4.2
            : 3.35);
    blast.style.width = `${diameter}px`;
    blast.style.height = `${diameter}px`;
    blast.innerHTML = '<span class="paw-blast-ring"></span><span class="paw-blast-core">🐾</span>';
    document.body.append(blast);

    const animation = blast.animate(
      [
        { opacity: 0, transform: "translate(-50%,-50%) scale(.12) rotate(-18deg)" },
        { opacity: 1, transform: "translate(-50%,-50%) scale(.46) rotate(5deg)", offset: 0.2 },
        { opacity: 0.92, transform: "translate(-50%,-50%) scale(1) rotate(0deg)", offset: 0.7 },
        { opacity: 0, transform: "translate(-50%,-50%) scale(1.18) rotate(8deg)" },
      ],
      {
        duration: effect.comboCore ? 1050 : isCombo ? 920 : effect.power >= 2 ? 940 : 760,
        delay: index * MOTION_TUNING.explosionChainStagger,
        easing: "cubic-bezier(.16,.72,.22,1)",
        fill: "forwards",
      },
    );
    animation.finished.then(() => blast.remove(), () => blast.remove());
    return waitForAnimation(animation);
  });

  const shake = elements.board.animate(
    isCombo
      ? [
          { transform: "translate3d(0,0,0) rotate(0deg)" },
          { transform: "translate3d(-8px,3px,0) rotate(-0.6deg)" },
          { transform: "translate3d(8px,-3px,0) rotate(0.6deg)" },
          { transform: "translate3d(-5px,2px,0) rotate(-0.35deg)" },
          { transform: "translate3d(0,0,0) rotate(0deg)" },
        ]
      : [
          { transform: "translate3d(0,0,0)" },
          { transform: "translate3d(-4px,2px,0)" },
          { transform: "translate3d(4px,-2px,0)" },
          { transform: "translate3d(0,0,0)" },
        ],
    { duration: isCombo ? 620 : 420, delay: 60, easing: "ease-out" },
  );

  return Promise.all([
    ...chargeAnimations,
    ...blastAnimations,
    waitForAnimation(shake),
  ]);
}

function columnsWithGaps(board) {
  const lockedColumns = new Set();
  for (let column = 0; column < board[0].length; column += 1) {
    if (board.some((row) => row[column] === null)) lockedColumns.add(column);
  }
  return lockedColumns;
}

function animateFall(clearedBoard) {
  const lockedColumns = columnsWithGaps(clearedBoard);
  if (reducedMotion) {
    return {
      lockedColumns,
      resolutionReady: Promise.resolve(),
      finished: Promise.resolve(),
    };
  }
  const first = tileElement({ row: 0, column: 0 });
  const secondRow = tileElement({ row: 1, column: 0 });
  if (!first || !secondRow) {
    return {
      lockedColumns,
      resolutionReady: Promise.resolve(),
      finished: Promise.resolve(),
    };
  }
  const rowDistance = secondRow.getBoundingClientRect().top - first.getBoundingClientRect().top;
  const animations = [];
  let longestAnimation = 0;

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

        const duration = fallDurationForDistance(distance);
        const delay = column * MOTION_TUNING.fallColumnStagger;
        longestAnimation = Math.max(longestAnimation, duration + delay);
        animations.push(
          waitForAnimation(
            element.animate(
              [
                {
                  opacity: 1,
                  transform: `translate3d(0,${-distance * rowDistance}px,0) scale(1)`,
                  easing: MOTION_TUNING.fallEasing,
                },
                {
                  opacity: 1,
                  transform: `translate3d(0,${MOTION_TUNING.landingOffsetPixels}px,0) scale(${MOTION_TUNING.landingScale})`,
                  offset: MOTION_TUNING.landingKeyframe,
                  easing: MOTION_TUNING.landingEasing,
                },
                { opacity: 1, transform: "translate3d(0,0,0) scale(1)" },
              ],
              {
                duration,
                delay,
              },
            ),
          ),
        );
      }
    }
  }
  return {
    lockedColumns,
    resolutionReady: sleep(longestAnimation * MOTION_TUNING.fallResolutionProgress),
    finished: Promise.all(animations),
  };
}

async function animateReshuffle() {
  if (reducedMotion) return;
  const tiles = [...elements.board.querySelectorAll(".tile-symbol")];
  await Promise.all(
    tiles.map((tile, index) =>
      waitForAnimation(
        tile.animate(
          [
            { opacity: 1, transform: "scale(.78) rotate(-8deg)" },
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

function catAssetKey(cat) {
  return `${cat.id}@${cat.version}`;
}

function catImageSource(cat, { thumbnail = false } = {}) {
  if (!cat) return "";
  const runtimeUrl = catRuntimeImageUrls.get(catAssetKey(cat));
  if (runtimeUrl) return runtimeUrl;
  if (!cat.isDownloadable) return cat.imageUrl;
  return thumbnail ? cat.thumbnailUrl : "";
}

function setContentStatus(text = "") {
  elements.contentStatus.textContent = text;
  elements.contentStatus.hidden = text.length === 0;
}

function applyPendingCatCatalog() {
  if (!pendingCatCatalog) return false;
  catCatalog = pendingCatCatalog;
  pendingCatCatalog = null;
  catProgress = loadCatProgress(globalThis.localStorage, catCatalog);
  activeCat = getActiveCat(catProgress, catCatalog);
  updateCollectionProgress();
  return true;
}

async function syncCatContent({ force = false } = {}) {
  const result = await catalogRepository.sync({ force });
  if (!elements.gameScreen.hidden) {
    pendingCatCatalog = result.catalog.cats;
    return result;
  }
  catCatalog = result.catalog.cats;
  catProgress = loadCatProgress(globalThis.localStorage, catCatalog);
  activeCat = getActiveCat(catProgress, catCatalog);
  updateCollectionProgress();
  if (result.newCatIds.length > 0) {
    setContentStatus(
      result.newCatIds.length === 1
        ? "Eine neue Katze ist verfügbar 🐾"
        : `${result.newCatIds.length} neue Katzen sind verfügbar 🐾`,
    );
  }
  if (!elements.collectionScreen.hidden) renderCollection();
  return result;
}

async function prepareCatForPlay(cat) {
  if (!cat?.isDownloadable) return true;
  const existingUrl = catRuntimeImageUrls.get(catAssetKey(cat));
  if (existingUrl) return true;

  elements.startButton.disabled = true;
  elements.playAgainButton.disabled = true;
  setContentStatus(`${cat.name} wird für das Offline-Spielen geladen …`);
  const download = await catAssetStore.ensureDownloaded(cat);
  elements.startButton.disabled = false;
  elements.playAgainButton.disabled = false;
  if (download.status !== "downloaded" || !download.url) {
    setContentStatus(`${cat.name} konnte nicht geladen werden. Bitte Internetverbindung prüfen.`);
    return false;
  }
  catRuntimeImageUrls.set(catAssetKey(cat), download.url);
  setContentStatus(`${cat.name} ist geladen und bleibt offline verfügbar.`);
  return true;
}

function showStart() {
  flowGeneration += 1;
  interactionWindow = null;
  dragGesture = null;
  busy = false;
  elements.dialog.close?.();
  elements.startScreen.hidden = false;
  elements.gameScreen.hidden = true;
  elements.collectionScreen.hidden = true;
  elements.catGrid.replaceChildren();
  applyPendingCatCatalog();
  updateCollectionProgress();
}

async function showGame() {
  if (contentReady) await contentReady;
  applyPendingCatCatalog();
  catProgress = loadCatProgress(globalThis.localStorage, catCatalog);
  activeCat = getActiveCat(catProgress, catCatalog);
  if (!activeCat) {
    showCollection("start");
    return;
  }
  if (!(await prepareCatForPlay(activeCat))) return;
  elements.startScreen.hidden = true;
  elements.gameScreen.hidden = false;
  elements.collectionScreen.hidden = true;
  elements.catGrid.replaceChildren();
  restartGame();
}

function showCollection(returnScreen = "start") {
  if (elements.dialog.open) elements.dialog.close();
  applyPendingCatCatalog();
  collectionReturnScreen = returnScreen;
  catProgress = loadCatProgress(globalThis.localStorage, catCatalog);
  elements.startScreen.hidden = true;
  elements.gameScreen.hidden = true;
  elements.collectionScreen.hidden = false;
  renderCollection();
}

function closeCollection() {
  elements.catGrid.replaceChildren();
  if (collectionReturnScreen === "game" && activeCat) {
    elements.startScreen.hidden = true;
    elements.collectionScreen.hidden = true;
    elements.gameScreen.hidden = false;
    return;
  }
  showStart();
}

function updateCollectionProgress() {
  const catalogIds = new Set(catCatalog.map((cat) => cat.id));
  const discoveredCount = catProgress.discoveredCatIds.filter((id) => catalogIds.has(id)).length;
  const progressText = `${discoveredCount} von ${catCatalog.length} Katzen entdeckt`;
  elements.startProgress.textContent = progressText;
  elements.collectionProgress.textContent = progressText;
  elements.startButton.textContent = discoveredCount === catCatalog.length ? "Meine Katzen" : "Losspielen";
}

function renderCollection() {
  const cats = getCatCollection(catProgress, catCatalog);
  updateCollectionProgress();
  elements.catGrid.replaceChildren();

  for (const cat of cats) {
    const card = document.createElement(cat.isDiscovered ? "article" : "button");
    if (!cat.isDiscovered) {
      card.type = "button";
      card.disabled = collectionSelectionBusy;
      card.addEventListener("click", () => selectCatForPlay(cat.id));
    }
    card.className = `cat-card${cat.isDiscovered ? " discovered" : " covered"}${
      cat.isActive ? " active" : ""
    }`;
    card.setAttribute(
      "aria-label",
      cat.isDiscovered
        ? `${cat.name}, entdeckt`
        : cat.isActive
          ? `${cat.name}, ausgewählt, ${cat.revealProgress} von 64 freigelegt`
          : `${cat.name} auswählen und freispielen`,
    );

    const portrait = document.createElement("div");
    portrait.className = "cat-portrait";
    if (cat.isDiscovered) {
      const imageSource = catImageSource(cat, { thumbnail: true });
      if (imageSource) {
        const image = document.createElement("img");
        image.src = imageSource;
        image.alt = cat.name;
        image.loading = "lazy";
        image.decoding = "async";
        portrait.append(image);
      } else {
        const offlineCover = document.createElement("span");
        offlineCover.className = "cat-card-cover";
        offlineCover.textContent = "☁️";
        offlineCover.setAttribute("aria-label", "Bild muss erneut geladen werden");
        portrait.append(offlineCover);
      }

      const check = document.createElement("span");
      check.className = "cat-check";
      check.textContent = "✓";
      check.setAttribute("aria-hidden", "true");
      portrait.append(check);
    } else {
      const cover = document.createElement("span");
      cover.className = "cat-card-cover";
      cover.textContent = cat.isActive ? "🐾" : "🐱";
      cover.setAttribute("aria-hidden", "true");
      portrait.append(cover);
    }

    const name = document.createElement("h2");
    name.textContent = cat.name;
    card.append(portrait, name);

    if (!cat.isDiscovered) {
      const status = document.createElement("p");
      if (cat.isActive) {
        status.textContent =
          cat.isDownloadable && catAssetStore.getDownloadState(cat) !== "downloaded"
            ? "Antippen zum Laden"
            : `${cat.revealProgress}/64 freigelegt · spielen`;
      } else {
        status.textContent =
          cat.revealProgress > 0
            ? `${cat.revealProgress}/64 freigelegt · weiterspielen`
            : "Antippen zum Freispielen";
      }
      card.append(status);
    }

    elements.catGrid.append(card);
  }
}

async function selectCatForPlay(catId) {
  if (collectionSelectionBusy) return;
  const selectedProgress = selectActiveCat(catProgress, catId, catCatalog);
  if (selectedProgress.activeCatId !== catId) return;

  catProgress = selectedProgress;
  saveCatProgress(catProgress);
  activeCat = getActiveCat(catProgress, catCatalog);
  collectionSelectionBusy = true;
  renderCollection();
  elements.collectionProgress.textContent = `${activeCat.name} wird vorbereitet …`;

  const ready = await prepareCatForPlay(activeCat);
  collectionSelectionBusy = false;
  if (!ready) {
    renderCollection();
    elements.collectionProgress.textContent = `${activeCat.name} konnte nicht geladen werden`;
    return;
  }

  elements.startScreen.hidden = true;
  elements.collectionScreen.hidden = true;
  elements.gameScreen.hidden = false;
  elements.catGrid.replaceChildren();
  restartGame();
}

function restartGame() {
  flowGeneration += 1;
  interactionWindow = null;
  dragGesture = null;
  catProgress = loadCatProgress(globalThis.localStorage, catCatalog);
  activeCat = getActiveCat(catProgress, catCatalog);
  if (!activeCat) {
    showCollection("start");
    return;
  }
  state = engine.newGame();
  selected = null;
  busy = false;
  revealedObjectPieces = new Set(catProgress.revealByCat[activeCat.id] ?? []);
  newlyRevealedObjectPieces = new Set();
  objectCollected = false;
  if (elements.dialog.open) elements.dialog.close();
  clearDragHighlights();
  setMessage(`Lege ${activeCat.name} Feld für Feld frei`);
  renderObjectProgress();
  render();
}

function setMessage(text) {
  elements.message.textContent = text;
}

function render() {
  elements.score.textContent = state.score.toLocaleString("de-DE");
  elements.moves.textContent = state.moves;
  elements.activeCatLabel.textContent = activeCat?.name ?? "Katzen";
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
    photo.src = catImageSource(activeCat);
    photo.alt = "";
    photo.decoding = "async";
    photo.fetchPriority = "high";
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
      button.disabled = !canInteractAt(position) || tile === null || tile === BLOCKED_TILE;
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
  const newlyRevealed = [];
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
      newlyRevealed.push(pieceIndex);
    }
  }
  if (newlyRevealed.length > 0 && activeCat) {
    catProgress = revealCatTiles(catProgress, activeCat.id, newlyRevealed, catCatalog);
    saveCatProgress(catProgress);
  }
  renderObjectProgress();
}

function showGameOver(completedCat) {
  elements.finalScore.textContent = state.score.toLocaleString("de-DE");
  elements.finalMoves.textContent = state.moves.toLocaleString("de-DE");
  elements.completionTitle.textContent = `${completedCat.name} entdeckt! 🐾`;
  elements.playAgainButton.textContent = "Katze auswählen";
  elements.dialog.showModal();
}

async function completeCatReveal() {
  const completedCat = activeCat;
  const completion = discoverActiveCat(catProgress, catCatalog);
  catProgress = completion.progress;
  saveCatProgress(catProgress);
  updateCollectionProgress();
  objectCollected = true;
  renderObjectProgress();
  elements.board.classList.add("reveal-complete");
  elements.board.querySelectorAll(".tile").forEach((tile) => {
    tile.disabled = true;
  });
  setMessage(`${completedCat.name} ist frei – geschafft in ${state.moves} Zügen! 🐾`);

  if (reducedMotion) {
    showGameOver(completedCat);
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
  showGameOver(completedCat);
}

async function handleTileTap(position) {
  if (!canInteractAt(position)) return;

  if (isBombTile(state.board[position.row][position.column])) {
    selected = null;
    await performBombTap(position);
    return;
  }

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
  const attemptedDuringFlow = flowGeneration;
  const wasBusy = busy;
  const result = engine.trySwap(state, first, second);
  if (!result.accepted) {
    if (isAdjacent(first, second)) {
      if (!wasBusy) busy = true;
      selected = null;
      if (directDrag) {
        elements.board.setAttribute("aria-busy", "true");
        await animateDirectDragRelease(directDrag, false);
      } else {
        render();
        await animateSwap(first, second, true);
      }
      if (flowGeneration !== attemptedDuringFlow) return;
      if (!wasBusy) busy = false;
    }
    selected = keepSecondSelectedOnFailure ? second : null;
    setMessage("Nur Nachbarn tauschen – die Reihe muss 3+ ergeben");
    render();
    return;
  }

  const gainedPoints = result.frames.at(-1).score - state.score;
  const flowId = ++flowGeneration;
  selected = null;
  busy = true;
  interactionWindow = null;
  setMessage("Miau! Kombination läuft …");
  let motionPromise;
  let resolutionDelay;
  if (directDrag) {
    elements.board.setAttribute("aria-busy", "true");
    resolutionDelay = directDragResolutionDelay(directDrag);
    motionPromise = animateDirectDragRelease(directDrag, true);
  } else {
    render();
    resolutionDelay = MOTION_TUNING.swapDuration * MOTION_TUNING.swapResolutionProgress;
    motionPromise = animateSwap(first, second);
  }
  motionPromise.catch(() => undefined);
  if (resolutionDelay > 0) await sleep(resolutionDelay);
  if (flowId !== flowGeneration) return;

  await playAcceptedResult(result, gainedPoints, flowId, [first, second]);
}

async function performBombTap(position) {
  const result = engine.activatePawBombAt(state, position);
  if (!result.accepted) return;

  const gainedPoints = result.frames.at(-1).score - state.score;
  const flowId = ++flowGeneration;
  busy = true;
  interactionWindow = null;
  setMessage("Pfotenbombe!");
  elements.board.setAttribute("aria-busy", "true");
  await playAcceptedResult(result, gainedPoints, flowId);
}

async function playAcceptedResult(result, gainedPoints, flowId, swappedPositions = []) {
  if (flowId !== flowGeneration) return;
  state = result.frames[0];
  render();
  animateSwapLanding(swappedPositions);
  if (result.specialActivated) {
    animatePawBombBlast(result.blastCenters ?? [], result.specialCombo).catch(() => undefined);
    if (!reducedMotion) await sleep(MOTION_TUNING.explosionImpactDelay);
    if (flowId !== flowGeneration) return;
  }
  let previousBoard = state.board;
  for (let index = 1; index < result.frames.length; index += 1) {
    if (flowId !== flowGeneration) return;
    const frame = result.frames[index];
    const hasGap = frame.board.some((row) => row.some((tile) => tile === null));
    const previousHasGap = previousBoard.some((row) => row.some((tile) => tile === null));

    if (hasGap) {
      closeFallInteractionWindow(flowId);
      const isInitialBombClear = result.specialActivated && index === 1;
      await animateClears(previousBoard, frame.board, isInitialBombClear ? 4 : 8);
      if (flowId !== flowGeneration) return;
      revealObjectUnderClearedTiles(previousBoard, frame.board);
      state = frame;
      render();
      pulseScore();
      if (!reducedMotion && MOTION_TUNING.cascadeDelay > 0) {
        await sleep(MOTION_TUNING.cascadeDelay);
      }
    } else if (previousHasGap) {
      state = frame;
      interactionWindow = {
        type: "fall",
        flowId,
        lockedColumns: columnsWithGaps(previousBoard),
      };
      render();
      const fallMotion = animateFall(previousBoard);
      const nextFrame = result.frames[index + 1];
      const nextIsClear = nextFrame?.board.some((row) => row.some((tile) => tile === null));
      await (nextIsClear ? fallMotion.resolutionReady : fallMotion.finished);
      if (flowId !== flowGeneration) return;
      closeFallInteractionWindow(flowId);
    } else {
      closeFallInteractionWindow(flowId);
      state = frame;
      render();
      await animateReshuffle();
      if (flowId !== flowGeneration) return;
    }
    previousBoard = frame.board;
  }

  if (flowId !== flowGeneration) return;
  interactionWindow = null;
  busy = false;
  const discoveredNow = revealedObjectPieces.size === OBJECT_SIZE ** 2 && !objectCollected;
  if (result.specialActivated) {
    setMessage(
      result.specialCombo
        ? `Doppel-Pfoten-Krawall! ${result.removedTiles} Felder · +${gainedPoints}`
        : `Pfotenbombe! ${result.removedTiles} Felder getroffen · +${gainedPoints}`,
    );
  } else if (result.createdBigSpecials > 0) {
    setMessage("Riesen-Pfotenbombe erzeugt – 5×5 Sprengkraft!");
  } else if (result.createdSpecials > 0) {
    setMessage("Mini-Pfotenbombe erzeugt – antippen oder ziehen!");
  } else {
    setMessage(
      result.reshuffled
        ? `+${gainedPoints} Punkte · Brett neu gemischt`
        : `+${gainedPoints} Punkte · ${result.removedTiles} Teile entfernt`,
    );
  }
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
  if (objectCollected || event.button > 0) return;
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

  if (dragGesture.target && dragGesture.progress >= MOTION_TUNING.swapResolutionProgress) {
    const gesture = dragGesture;
    dragGesture = null;
    suppressNextClick = true;
    selected = null;
    performSwap(gesture.start, gesture.target, false, gesture).catch(() => {
      resetDragStyles(gesture);
    });
  } else if (dragGesture.target && dragGesture.progress >= 0.28) {
    setMessage("Über die Hälfte ziehen oder loslassen");
  } else {
    setMessage("Teil weiter in eine Richtung ziehen");
  }
});

elements.board.addEventListener("pointerup", async (event) => {
  if (!dragGesture || dragGesture.pointerId !== event.pointerId) {
    if (suppressNextClick) {
      window.setTimeout(() => {
        suppressNextClick = false;
      }, 0);
    }
    return;
  }
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
  if (!dragGesture) return;
  const gesture = dragGesture;
  dragGesture = null;
  if (gesture?.dragging) await animateDirectDragRelease(gesture, false);
  else resetDragStyles(gesture);
  setMessage("Ziehen abgebrochen");
});

elements.startButton.addEventListener("click", showGame);
elements.startCollectionButton.addEventListener("click", async () => {
  if (contentReady) await contentReady;
  showCollection("start");
});
elements.gameCollectionButton.addEventListener("click", () => {
  if (!busy) showCollection("game");
});
elements.collectionBackButton.addEventListener("click", closeCollection);
elements.backButton.addEventListener("click", showStart);
elements.restartButton.addEventListener("click", restartGame);
elements.playAgainButton.addEventListener("click", async () => {
  showCollection("start");
});
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

window.addEventListener("online", () => {
  contentReady = syncCatContent();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") contentReady = syncCatContent();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch(() => {
      // Das Spiel bleibt auch ohne Offline-Modus vollständig nutzbar.
    });
  });
}

updateCollectionProgress();
render();
contentReady = syncCatContent();
