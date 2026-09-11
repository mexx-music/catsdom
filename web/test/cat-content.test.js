import assert from "node:assert/strict";
import test from "node:test";
import {
  BUNDLED_CATALOG,
  mergeCatCatalogs,
  validateRemoteCatalog,
} from "../src/cat-content.js";
import { createInitialCatProgress, revealCatTiles } from "../src/cat-progress.js";

const remoteCat = (overrides = {}) => ({
  id: "cat_0010",
  name: "Minka",
  imageUrl: "./cat_0010.webp",
  thumbnailUrl: "./cat_0010-thumb.webp",
  imageType: "image/webp",
  releaseDate: "2026-09-11T00:00:00Z",
  collectionId: "community_001",
  sourceType: "community",
  version: 1,
  moderationStatus: "published",
  ...overrides,
});

test("the nine bundled cats use the canonical offline content model", () => {
  assert.equal(BUNDLED_CATALOG.cats.length, 9);
  assert.equal(BUNDLED_CATALOG.cats[0].id, "cat_01");
  assert.equal(BUNDLED_CATALOG.cats.every((cat) => cat.sourceType === "bundled"), true);
  assert.equal(BUNDLED_CATALOG.cats.every((cat) => cat.isDownloadable === false), true);
  assert.equal(BUNDLED_CATALOG.cats.every((cat) => cat.imageUrl.endsWith(".webp")), true);
  assert.equal(
    BUNDLED_CATALOG.cats.every(
      (cat) => cat.thumbnailUrl.includes("/thumbs/") && cat.thumbnailUrl !== cat.imageUrl,
    ),
    true,
  );
});

test("malformed entries are rejected without breaking valid remote cats", () => {
  const catalog = validateRemoteCatalog(
    {
      catalogVersion: 3,
      cats: [remoteCat(), { id: "bad id", name: "Broken" }, remoteCat({ id: "cat_0011", imageUrl: "javascript:alert(1)" })],
    },
    { baseUrl: "https://cdn.example/cats/catalog.json" },
  );

  assert.equal(catalog.cats.length, 1);
  assert.equal(catalog.cats[0].id, "cat_0010");
  assert.equal(catalog.rejectedCount, 2);
});

test("duplicate remote IDs keep only the newest valid asset version", () => {
  const catalog = validateRemoteCatalog(
    { catalogVersion: 4, cats: [remoteCat(), remoteCat({ version: 2 })] },
    { baseUrl: "https://cdn.example/cats/catalog.json" },
  );

  assert.equal(catalog.cats.length, 1);
  assert.equal(catalog.cats[0].version, 2);
});

test("daily set metadata is normalized while malformed set definitions are rejected", () => {
  const catalog = validateRemoteCatalog(
    {
      catalogVersion: 5,
      collections: [
        {
          id: "daily_2026_09_11",
          name: "Freitag, 11. September",
          version: 1,
          kind: "daily",
          releaseDate: "2026-09-10T23:00:00Z",
          timeZone: "Europe/Vienna",
          expectedCatCount: 9,
        },
        { id: "broken_daily", name: "Kaputt", kind: "daily", expectedCatCount: 8 },
      ],
      cats: [],
    },
    { baseUrl: "https://cdn.example/cats/catalog.json" },
  );

  assert.equal(catalog.collections.length, 1);
  assert.equal(catalog.collections[0].kind, "daily");
  assert.equal(catalog.collections[0].releaseDate, "2026-09-10T23:00:00.000Z");
  assert.equal(catalog.collections[0].expectedCatCount, 9);
});

test("release dates hide future cats while released cats extend bundled content", () => {
  const remote = validateRemoteCatalog(
    {
      catalogVersion: 2,
      cats: [remoteCat(), remoteCat({ id: "cat_0011", releaseDate: "2026-09-12T00:00:00Z" })],
    },
    { baseUrl: "https://cdn.example/cats/catalog.json" },
  );

  const september11 = mergeCatCatalogs(BUNDLED_CATALOG, remote, {
    now: new Date("2026-09-11T12:00:00Z"),
  });
  assert.equal(september11.cats.length, 10);
  assert.equal(september11.cats.at(-1).id, "cat_0010");
});

test("a newer image version keeps reveal progress linked to the stable cat ID", () => {
  const versionOne = validateRemoteCatalog(
    { catalogVersion: 1, cats: [remoteCat({ releaseDate: "2026-09-10T00:00:00Z" })] },
    { baseUrl: "https://cdn.example/cats/catalog.json" },
  );
  const catsV1 = mergeCatCatalogs(BUNDLED_CATALOG, versionOne, {
    now: new Date("2026-09-10T12:00:00Z"),
  }).cats;
  let progress = createInitialCatProgress(catsV1);
  progress = { ...progress, activeCatId: "cat_0010", discoveredCatIds: BUNDLED_CATALOG.cats.map((cat) => cat.id), revealByCat: { cat_0010: [] } };
  progress = revealCatTiles(progress, "cat_0010", [2, 9, 18], catsV1);

  const versionTwo = validateRemoteCatalog(
    { catalogVersion: 2, cats: [remoteCat({ version: 2, releaseDate: "2026-09-10T00:00:00Z" })] },
    { baseUrl: "https://cdn.example/cats/catalog.json" },
  );
  const catsV2 = mergeCatCatalogs(BUNDLED_CATALOG, versionTwo, {
    now: new Date("2026-09-10T12:00:00Z"),
  }).cats;

  assert.deepEqual(revealCatTiles(progress, "cat_0010", [], catsV2).revealByCat.cat_0010, [2, 9, 18]);
  assert.equal(catsV2.find((cat) => cat.id === "cat_0010").version, 2);
});
