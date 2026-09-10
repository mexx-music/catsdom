import { BUNDLED_CATS } from "./cat-content.js";

export const REVEAL_TILE_COUNT = 64;
export const CAT_PROGRESS_STORAGE_KEY = "catsdom.catCollection.v1";
export const CAT_CONTENT = BUNDLED_CATS;

const allRevealTiles = () => Array.from({ length: REVEAL_TILE_COUNT }, (_, index) => index);

function cleanRevealTiles(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < REVEAL_TILE_COUNT)
    .sort((a, b) => a - b);
}

export function createInitialCatProgress(cats = BUNDLED_CATS) {
  const firstCat = [...cats].sort((a, b) => a.unlockOrder - b.unlockOrder)[0];
  return {
    version: 1,
    activeCatId: firstCat?.id ?? null,
    discoveredCatIds: [],
    revealByCat: firstCat ? { [firstCat.id]: [] } : {},
  };
}

export function normalizeCatProgress(value, cats = BUNDLED_CATS) {
  if (!value || typeof value !== "object") return createInitialCatProgress(cats);

  const orderedCats = [...cats].sort((a, b) => a.unlockOrder - b.unlockOrder);
  const discoveredCatIds = [...new Set(value.discoveredCatIds ?? [])].filter(
    (id) => typeof id === "string" && id.length >= 3 && id.length <= 64,
  );
  const discovered = new Set(discoveredCatIds);
  const firstUndiscovered = orderedCats.find((cat) => !discovered.has(cat.id));
  const requestedActive = orderedCats.find(
    (cat) => cat.id === value.activeCatId && !discovered.has(cat.id),
  );
  const activeCatId = requestedActive?.id ?? firstUndiscovered?.id ?? null;
  const revealByCat = Object.fromEntries(
    Object.entries(value.revealByCat ?? {})
      .filter(([id]) => typeof id === "string" && id.length >= 3 && id.length <= 64)
      .map(([id, tiles]) => [id, cleanRevealTiles(tiles)]),
  );

  for (const cat of orderedCats) {
    if (discovered.has(cat.id)) {
      revealByCat[cat.id] = allRevealTiles();
    } else if (cat.id === activeCatId) {
      revealByCat[cat.id] = cleanRevealTiles(value.revealByCat?.[cat.id]);
    }
  }

  return { version: 1, activeCatId, discoveredCatIds, revealByCat };
}

export function loadCatProgress(storage = globalThis.localStorage, cats = BUNDLED_CATS) {
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

export function getActiveCat(progress, cats = BUNDLED_CATS) {
  return cats.find((cat) => cat.id === progress.activeCatId) ?? null;
}

export function selectActiveCat(progress, catId, cats = BUNDLED_CATS) {
  const normalized = normalizeCatProgress(progress, cats);
  const selectedCat = cats.find((cat) => cat.id === catId);
  if (!selectedCat || normalized.discoveredCatIds.includes(catId)) return normalized;

  return {
    ...normalized,
    activeCatId: catId,
    revealByCat: {
      ...normalized.revealByCat,
      [catId]: normalized.revealByCat[catId] ?? [],
    },
  };
}

export function revealCatTiles(progress, catId, tileIndices, cats = BUNDLED_CATS) {
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

export function discoverActiveCat(progress, cats = BUNDLED_CATS) {
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

export function getCatCollection(progress, cats = BUNDLED_CATS) {
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
        isUnlocked: true,
      };
    });
}
