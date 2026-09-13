import assert from "node:assert/strict";
import test from "node:test";
import { buildCatCollectionView } from "../src/cat-collection-view.js";

test("daily cats are grouped into one compact folder while standard cats stay visible", () => {
  const collections = [
    { id: "starter", name: "Starter Cats", kind: "standard" },
    { id: "daily_2026_09_13", name: "Sonntag, 13. September", kind: "daily", releaseDate: "2026-09-12T23:00:00.000Z" },
  ];
  const cats = [
    { id: "luna", collectionId: "starter", isDiscovered: true, isActive: false },
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `daily_${index}`,
      collectionId: "daily_2026_09_13",
      isDiscovered: index < 2,
      isActive: index === 2,
    })),
  ];

  const view = buildCatCollectionView(cats, collections);
  assert.deepEqual(view.looseCats.map((cat) => cat.id), ["luna"]);
  assert.equal(view.dailyFolders.length, 1);
  assert.equal(view.dailyFolders[0].cats.length, 9);
  assert.equal(view.dailyFolders[0].discoveredCount, 2);
  assert.equal(view.dailyFolders[0].hasActiveCat, true);
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
  assert.deepEqual(view.dailyFolders.map((folder) => folder.id), ["daily_new", "daily_old"]);
});
