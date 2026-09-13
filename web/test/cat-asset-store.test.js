import assert from "node:assert/strict";
import test from "node:test";
import { CAT_ASSET_STATE_STORAGE_KEY, CatAssetStore } from "../src/cat-asset-store.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function memoryCacheStorage() {
  const values = new Map();
  const cache = {
    match: async (key) => values.get(String(key))?.clone() ?? null,
    put: async (key, response) => values.set(String(key), response.clone()),
  };
  return { open: async () => cache };
}

const downloadableCat = (overrides = {}) => ({
  id: "cat_0010",
  name: "Minka",
  imageUrl: "https://cdn.example/cat_0010.webp",
  imageType: "image/webp",
  version: 1,
  isDownloadable: true,
  downloadSize: null,
  checksum: null,
  ...overrides,
});

const imageResponse = () =>
  new Response(new Blob(["catsdom-image"], { type: "image/webp" }), {
    status: 200,
    headers: { "content-type": "image/webp" },
  });

test("downloaded cat state and image cache survive a new store instance", async () => {
  const storage = memoryStorage();
  const cacheStorage = memoryCacheStorage();
  let fetchCount = 0;
  const options = {
    storage,
    cacheStorage,
    fetchImpl: async () => {
      fetchCount += 1;
      return imageResponse();
    },
    createObjectUrl: (blob) => `blob:cat-${blob.size}`,
  };

  const firstStore = new CatAssetStore(options);
  const first = await firstStore.ensureDownloaded(downloadableCat());
  const secondStore = new CatAssetStore(options);
  const second = await secondStore.ensureDownloaded(downloadableCat());

  assert.equal(first.status, "downloaded");
  assert.equal(second.status, "downloaded");
  assert.equal(fetchCount, 1);
  assert.equal(secondStore.getDownloadState(downloadableCat()), "downloaded");
  assert.ok(storage.getItem(CAT_ASSET_STATE_STORAGE_KEY));
});

test("concurrent requests for one cat share a single download", async () => {
  let fetchCount = 0;
  const store = new CatAssetStore({
    storage: memoryStorage(),
    cacheStorage: memoryCacheStorage(),
    fetchImpl: async () => {
      fetchCount += 1;
      return imageResponse();
    },
    createObjectUrl: () => "blob:cat",
  });

  await Promise.all([
    store.ensureDownloaded(downloadableCat()),
    store.ensureDownloaded(downloadableCat()),
  ]);

  assert.equal(fetchCount, 1);
});

test("a newer asset version requires a new download without touching cat identity", async () => {
  const storage = memoryStorage();
  const cacheStorage = memoryCacheStorage();
  let fetchCount = 0;
  const store = new CatAssetStore({
    storage,
    cacheStorage,
    fetchImpl: async () => {
      fetchCount += 1;
      return imageResponse();
    },
    createObjectUrl: () => `blob:cat-${fetchCount}`,
  });

  await store.ensureDownloaded(downloadableCat({ version: 1 }));
  assert.equal(store.getDownloadState(downloadableCat({ version: 2 })), "notDownloaded");
  await store.ensureDownloaded(downloadableCat({ version: 2 }));

  assert.equal(fetchCount, 2);
});

test("a resumed app rebuilds a fresh playable URL from the offline cat cache", async () => {
  const cacheStorage = memoryCacheStorage();
  let fetchCount = 0;
  let objectUrlCount = 0;
  const revokedUrls = [];
  const store = new CatAssetStore({
    storage: memoryStorage(),
    cacheStorage,
    fetchImpl: async () => {
      fetchCount += 1;
      return imageResponse();
    },
    createObjectUrl: () => `blob:cat-${++objectUrlCount}`,
    revokeObjectUrl: (url) => revokedUrls.push(url),
  });

  const first = await store.ensureDownloaded(downloadableCat());
  const restored = await store.refreshPlayableUrl(downloadableCat());

  assert.equal(first.url, "blob:cat-1");
  assert.equal(restored.url, "blob:cat-2");
  assert.equal(fetchCount, 1);
  assert.deepEqual(revokedUrls, ["blob:cat-1"]);
});

test("unsupported downloaded content fails safely", async () => {
  const store = new CatAssetStore({
    storage: memoryStorage(),
    cacheStorage: memoryCacheStorage(),
    fetchImpl: async () =>
      new Response("not an image", { status: 200, headers: { "content-type": "text/html" } }),
    createObjectUrl: () => "blob:invalid",
  });

  const result = await store.ensureDownloaded(downloadableCat());

  assert.equal(result.status, "failed");
  assert.equal(store.getDownloadState(downloadableCat()), "failed");
});

test("a valid cat stays playable when the device cannot write to its offline cache", async () => {
  const storage = memoryStorage();
  const store = new CatAssetStore({
    storage,
    cacheStorage: { open: async () => { throw new Error("cache unavailable"); } },
    fetchImpl: async () => imageResponse(),
    createObjectUrl: () => "blob:online-cat",
  });

  const result = await store.ensureDownloaded(downloadableCat());

  assert.equal(result.status, "online");
  assert.equal(result.url, "blob:online-cat");
  assert.equal(store.getDownloadState(downloadableCat()), "notDownloaded");
});

test("a browser without checksum support can still play a same-session cat online", async () => {
  const store = new CatAssetStore({
    storage: memoryStorage(),
    cacheStorage: memoryCacheStorage(),
    fetchImpl: async () => imageResponse(),
    cryptoImpl: null,
    createObjectUrl: () => "blob:unverified-online-cat",
  });

  const result = await store.ensureDownloaded(downloadableCat({ checksum: "a".repeat(64) }));

  assert.equal(result.status, "online");
  assert.equal(result.url, "blob:unverified-online-cat");
});
