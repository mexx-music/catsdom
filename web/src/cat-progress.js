export const REVEAL_TILE_COUNT = 64;
export const CAT_PROGRESS_STORAGE_KEY = "catsdom.catCollection.v1";

export const CAT_CONTENT = Object.freeze([
  { id: "cat_01", name: "Luna", imageAsset: "./assets/cats/cat_01.webp", unlockOrder: 1 },
  { id: "cat_02", name: "Milo", imageAsset: "./assets/cats/cat_02.webp", unlockOrder: 2 },
  { id: "cat_03", name: "Nala", imageAsset: "./assets/cats/cat_03.webp", unlockOrder: 3 },
  { id: "cat_04", name: "Leo", imageAsset: "./assets/cats/cat_04.webp", unlockOrder: 4 },
  { id: "cat_05", name: "Coco", imageAsset: "./assets/cats/cat_05.webp", unlockOrder: 5 },
  { id: "cat_06", name: "Mia", imageAsset: "./assets/cats/cat_06.webp", unlockOrder: 6 },
  { id: "cat_07", name: "Loki", imageAsset: "./assets/cats/cat_07.webp", unlockOrder: 7 },
  { id: "cat_08", name: "Bella", imageAsset: "./assets/cats/cat_08.webp", unlockOrder: 8 },
  { id: "cat_09", name: "Suki", imageAsset: "./assets/cats/cat_09.webp", unlockOrder: 9 },
]);

const allRevealTiles = () => Array.from({ length: REVEAL_TILE_COUNT }, (_, index) => index);

function cleanRevealTiles(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < REVEAL_TILE_COUNT)
    .sort((a, b) => a - b);
}

export function createInitialCatProgress(cats = CAT_CONTENT) {
  const firstCat = [...cats].sort((a, b) => a.unlockOrder - b.unlockOrder)[0];
  return {
    version: 1,
    activeCatId: firstCat?.id ?? null,
    discoveredCatIds: [],
    revealByCat: firstCat ? { [firstCat.id]: [] } : {},
  };
}

export function normalizeCatProgress(value, cats = CAT_CONTENT) {
  if (!value || typeof value !== "object") return createInitialCatProgress(cats);

  const orderedCats = [...cats].sort((a, b) => a.unlockOrder - b.unlockOrder);
  const validIds = new Set(orderedCats.map((cat) => cat.id));
  const discoveredCatIds = [...new Set(value.discoveredCatIds ?? [])].filter((id) =>
    validIds.has(id),
  );
  const discovered = new Set(discoveredCatIds);
  const firstUndiscovered = orderedCats.find((cat) => !discovered.has(cat.id));
  const requestedActive = orderedCats.find(
    (cat) => cat.id === value.activeCatId && !discovered.has(cat.id),
  );
  const activeCatId = requestedActive?.id ?? firstUndiscovered?.id ?? null;
  const revealByCat = {};

  for (const cat of orderedCats) {
    if (discovered.has(cat.id)) {
      revealByCat[cat.id] = allRevealTiles();
    } else if (cat.id === activeCatId) {
      revealByCat[cat.id] = cleanRevealTiles(value.revealByCat?.[cat.id]);
    }
  }

  return { version: 1, activeCatId, discoveredCatIds, revealByCat };
}

export function loadCatProgress(storage = globalThis.localStorage, cats = CAT_CONTENT) {
  try {
    const saved = storage?.getItem(CAT_PROGRESS_STORAGE_KEY);
    return saved ? normalizeCatProgress(JSON.parse(saved), cats) : createInitialCatProgress(cats);
  } catch {
    return createInitialCatProgress(cats);
  }
}

export function saveCatProgress(progress, storage = globalThis.localStorage) {
  try {
    storage?.setItem(CAT_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function getActiveCat(progress, cats = CAT_CONTENT) {
  return cats.find((cat) => cat.id === progress.activeCatId) ?? null;
}

export function revealCatTiles(progress, catId, tileIndices, cats = CAT_CONTENT) {
  const normalized = normalizeCatProgress(progress, cats);
  if (normalized.activeCatId !== catId) return normalized;

  const currentTiles = normalized.revealByCat[catId] ?? [];
  return {
    ...normalized,
    revealByCat: {
      ...normalized.revealByCat,
      [catId]: cleanRevealTiles([...currentTiles, ...tileIndices]),
    },
  };
}

export function discoverActiveCat(progress, cats = CAT_CONTENT) {
  const normalized = normalizeCatProgress(progress, cats);
  const completedCat = getActiveCat(normalized, cats);
  if (!completedCat) return { progress: normalized, completedCat: null, nextCat: null };

  const discoveredCatIds = [...normalized.discoveredCatIds, completedCat.id];
  const discovered = new Set(discoveredCatIds);
  const nextCat = [...cats]
    .sort((a, b) => a.unlockOrder - b.unlockOrder)
    .find((cat) => !discovered.has(cat.id)) ?? null;
  const revealByCat = {
    ...normalized.revealByCat,
    [completedCat.id]: allRevealTiles(),
  };
  if (nextCat) revealByCat[nextCat.id] = revealByCat[nextCat.id] ?? [];

  return {
    progress: {
      version: 1,
      activeCatId: nextCat?.id ?? null,
      discoveredCatIds,
      revealByCat,
    },
    completedCat,
    nextCat,
  };
}

export function getCatCollection(progress, cats = CAT_CONTENT) {
  const normalized = normalizeCatProgress(progress, cats);
  const discovered = new Set(normalized.discoveredCatIds);
  return [...cats]
    .sort((a, b) => a.unlockOrder - b.unlockOrder)
    .map((cat) => {
      const isDiscovered = discovered.has(cat.id);
      const revealProgress = isDiscovered
        ? REVEAL_TILE_COUNT
        : (normalized.revealByCat[cat.id]?.length ?? 0);
      return {
        ...cat,
        revealProgress,
        isDiscovered,
        isActive: cat.id === normalized.activeCatId,
        isUnlocked: isDiscovered || cat.id === normalized.activeCatId,
      };
    });
}
