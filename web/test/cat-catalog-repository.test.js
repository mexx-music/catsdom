import assert from "node:assert/strict";
import test from "node:test";
import {
  CAT_CATALOG_CACHE_KEY,
  CatCatalogRepository,
} from "../src/cat-catalog-repository.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

const catalog = (version = 1) => ({
  catalogVersion: version,
  cats: [
    {
      id: "cat_0010",
      name: "Minka",
      imageUrl: "https://cdn.example/cat_0010.webp",
      thumbnailUrl: "https://cdn.example/cat_0010-thumb.webp",
      imageType: "image/webp",
      releaseDate: "2026-09-10T00:00:00Z",
      collectionId: "community_001",
      sourceType: "community",
      version,
      moderationStatus: "published",
    },
  ],
});

test("offline sync falls back to cached remote cats and bundled starters", async () => {
  const storage = memoryStorage({ [CAT_CATALOG_CACHE_KEY]: JSON.stringify(catalog()) });
  const repository = new CatCatalogRepository({
    storage,
    fetchImpl: async () => {
      throw new Error("offline");
    },
    now: () => new Date("2026-09-10T12:00:00Z"),
  });

  const result = await repository.sync({ force: true });

  assert.equal(result.source, "offline");
  assert.equal(result.catalog.cats.length, 10);
  assert.equal(result.catalog.cats[0].id, "cat_01");
  assert.equal(result.catalog.cats.at(-1).id, "cat_0010");
});

test("successful startup sync is cached and not repeated inside the interval", async () => {
  const storage = memoryStorage();
  let fetchCount = 0;
  const repository = new CatCatalogRepository({
    storage,
    fetchImpl: async () => {
      fetchCount += 1;
      return { ok: true, json: async () => catalog() };
    },
    now: () => new Date("2026-09-10T12:00:00Z"),
  });

  const first = await repository.sync();
  const second = await repository.sync();

  assert.equal(first.source, "remote");
  assert.deepEqual(first.newCatIds, ["cat_0010"]);
  assert.equal(second.source, "cache");
  assert.equal(fetchCount, 1);
});

test("an older remote catalog cannot replace a newer cached catalog", async () => {
  const storage = memoryStorage({ [CAT_CATALOG_CACHE_KEY]: JSON.stringify(catalog(3)) });
  const repository = new CatCatalogRepository({
    storage,
    fetchImpl: async () => ({ ok: true, json: async () => catalog(2) }),
    now: () => new Date("2026-09-10T12:00:00Z"),
  });

  const result = await repository.sync({ force: true });

  assert.equal(result.source, "cache");
  assert.equal(result.catalog.cats.at(-1).version, 3);
});

test("a malformed remote response leaves the bundled catalog usable", async () => {
  const repository = new CatCatalogRepository({
    storage: memoryStorage(),
    fetchImpl: async () => ({ ok: true, json: async () => ({ catalogVersion: "bad" }) }),
    now: () => new Date("2026-09-10T12:00:00Z"),
  });

  const result = await repository.sync({ force: true });

  assert.equal(result.source, "offline");
  assert.equal(result.catalog.cats.length, 9);
});
