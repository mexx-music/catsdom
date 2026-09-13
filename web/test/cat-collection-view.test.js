import assert from "node:assert/strict";
import test from "node:test";
import { buildCatCollectionView } from "../src/cat-collection-view.js";

test("daily and multi-cat standard collections are folders while a single special cat stays visible", () => {
  const collections = [
    { id: "starter", name: "Starter-Set", kind: "standard" },
    { id: "special", name: "Sonderkatzen", kind: "standard" },
    { id: "daily_2026_09_13", name: "Sonntag, 13. September", kind: "daily", releaseDate: "2026-09-12T23:00:00.000Z" },
  ];
  const cats = [
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `starter_${index}`,
      collectionId: "starter",
      isDiscovered: index < 3,
      isActive: false,
    })),
    { id: "murli", collectionId: "special", isDiscovered: false, isActive: false },
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `daily_${index}`,
      collectionId: "daily_2026_09_13",
      isDiscovered: index < 2,
      isActive: index === 2,
    })),
  ];

  const view = buildCatCollectionView(cats, collections);
  assert.deepEqual(view.looseCats.map((cat) => cat.id), ["murli"]);
  assert.deepEqual(view.collectionFolders.map((folder) => folder.id), ["daily_2026_09_13", "starter"]);
  assert.equal(view.collectionFolders[0].cats.length, 9);
  assert.equal(view.collectionFolders[0].discoveredCount, 2);
  assert.equal(view.collectionFolders[0].hasActiveCat, true);
  assert.equal(view.collectionFolders[1].cats.length, 9);
  assert.equal(view.collectionFolders[1].discoveredCount, 3);
});

test("newest daily folder appears first", () => {
  const collections = [
    { id: "daily_old", name: "Alt", kind: "daily", releaseDate: "2026-09-10T23:00:00.000Z" },
    { id: "daily_new", name: "Neu", kind: "daily", releaseDate: "2026-09-12T23:00:00.000Z" },
  ];
  const cats = collections.map((collection) => ({
    id: `${collection.id}_cat`,
    collectionId: collection.id,
    isDiscovered: false,
    isActive: false,
  }));

  const view = buildCatCollectionView(cats, collections);
  assert.deepEqual(view.collectionFolders.map((folder) => folder.id), ["daily_new", "daily_old"]);
});
