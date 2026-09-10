import assert from "node:assert/strict";
import test from "node:test";
import {
  CAT_CONTENT,
  CAT_PROGRESS_STORAGE_KEY,
  REVEAL_TILE_COUNT,
  createInitialCatProgress,
  discoverActiveCat,
  getActiveCat,
  getCatCollection,
  loadCatProgress,
  normalizeCatProgress,
  revealCatTiles,
  saveCatProgress,
} from "../src/cat-progress.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("the collection starts with Luna active and all cat portraits covered", () => {
  const progress = createInitialCatProgress();
  const collection = getCatCollection(progress);

  assert.equal(CAT_CONTENT.length, 9);
  assert.equal(getActiveCat(progress).name, "Luna");
  assert.equal(collection.filter((cat) => cat.isDiscovered).length, 0);
  assert.equal(collection.filter((cat) => cat.isActive).length, 1);
  assert.equal(collection.every((cat) => cat.name.length > 0), true);
});

test("spatial reveal tiles are deduplicated and persist locally", () => {
  const storage = memoryStorage();
  let progress = createInitialCatProgress();
  progress = revealCatTiles(progress, "cat_01", [0, 7, 7, 63, -1, 64]);

  assert.deepEqual(progress.revealByCat.cat_01, [0, 7, 63]);
  assert.equal(saveCatProgress(progress, storage), true);
  assert.deepEqual(loadCatProgress(storage).revealByCat.cat_01, [0, 7, 63]);
  assert.ok(storage.getItem(CAT_PROGRESS_STORAGE_KEY));
});

test("discovering a cat completes its image and advances to the next cat", () => {
  let progress = revealCatTiles(createInitialCatProgress(), "cat_01", [0, 1, 2]);
  const result = discoverActiveCat(progress);
  progress = result.progress;

  assert.equal(result.completedCat.name, "Luna");
  assert.equal(result.nextCat.name, "Milo");
  assert.equal(progress.activeCatId, "cat_02");
  assert.deepEqual(progress.discoveredCatIds, ["cat_01"]);
  assert.equal(progress.revealByCat.cat_01.length, REVEAL_TILE_COUNT);
  assert.deepEqual(progress.revealByCat.cat_02, []);
});

test("all nine cats unlock sequentially and remain visible in the collection", () => {
  let progress = createInitialCatProgress();

  for (const cat of CAT_CONTENT) {
    assert.equal(getActiveCat(progress).id, cat.id);
    progress = discoverActiveCat(progress).progress;
  }

  const collection = getCatCollection(progress);
  assert.equal(progress.activeCatId, null);
  assert.equal(progress.discoveredCatIds.length, 9);
  assert.equal(collection.every((cat) => cat.isDiscovered), true);
  assert.equal(collection.every((cat) => cat.revealProgress === REVEAL_TILE_COUNT), true);
});

test("invalid saved data safely falls back to the first valid cat", () => {
  const storage = memoryStorage();
  storage.setItem(CAT_PROGRESS_STORAGE_KEY, "not json");
  assert.equal(loadCatProgress(storage).activeCatId, "cat_01");

  storage.setItem(
    CAT_PROGRESS_STORAGE_KEY,
    JSON.stringify({ activeCatId: "missing", discoveredCatIds: [], revealByCat: {} }),
  );
  assert.equal(loadCatProgress(storage).activeCatId, "cat_01");
});

test("temporarily unavailable remote cats do not lose saved discovery data", () => {
  const progress = normalizeCatProgress({
    activeCatId: "cat_0011",
    discoveredCatIds: ["cat_0010"],
    revealByCat: { cat_0010: [0, 1, 2], cat_0011: [4, 7] },
  });

  assert.deepEqual(progress.discoveredCatIds, ["cat_0010"]);
  assert.deepEqual(progress.revealByCat.cat_0010, [0, 1, 2]);
  assert.deepEqual(progress.revealByCat.cat_0011, [4, 7]);
  assert.equal(progress.activeCatId, "cat_01");
});
