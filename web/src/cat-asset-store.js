import { MAX_CAT_DOWNLOAD_BYTES, SUPPORTED_CAT_IMAGE_TYPES } from "./cat-content.js?v=33";

export const CAT_ASSET_CACHE_NAME = "catsdom-downloaded-cats-v1";
export const CAT_ASSET_STATE_STORAGE_KEY = "catsdom.downloadedCatState.v1";

function safeStates(storage) {
  try {
    const value = JSON.parse(storage?.getItem(CAT_ASSET_STATE_STORAGE_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

async function sha256Hex(blob, cryptoImpl) {
  if (!cryptoImpl?.subtle) return null;
  const hash = await cryptoImpl.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class CatAssetStore {
  constructor({
    storage = globalThis.localStorage,
    cacheStorage = globalThis.caches,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    cryptoImpl = globalThis.crypto,
    createObjectUrl = globalThis.URL?.createObjectURL?.bind(globalThis.URL),
    baseUrl = globalThis.document?.baseURI ?? "https://catsdom.invalid/",
    now = () => new Date(),
  } = {}) {
    this.storage = storage;
    this.cacheStorage = cacheStorage;
    this.fetchImpl = fetchImpl;
    this.cryptoImpl = cryptoImpl;
    this.createObjectUrl = createObjectUrl;
    this.baseUrl = baseUrl;
    this.now = now;
    this.pending = new Map();
    this.objectUrls = new Map();
  }

  cacheKey(cat) {
    return new URL(
      `./__catsdom_cache__/cats/${encodeURIComponent(cat.id)}/v${cat.version}`,
      this.baseUrl,
    ).href;
  }

  assetKey(cat) {
    return `${cat.id}@${cat.version}`;
  }

  getDownloadState(cat) {
    if (!cat.isDownloadable) return "downloaded";
    const saved = safeStates(this.storage)[cat.id];
    if (!saved || saved.version !== cat.version) return "notDownloaded";
    return ["downloaded", "failed"].includes(saved.status) ? saved.status : "notDownloaded";
  }

  writeState(cat, status) {
    try {
      const states = safeStates(this.storage);
      states[cat.id] = { status, version: cat.version, updatedAt: this.now().toISOString() };
      this.storage?.setItem(CAT_ASSET_STATE_STORAGE_KEY, JSON.stringify(states));
    } catch {
      // Cache availability is authoritative if metadata storage is unavailable.
    }
  }

  async loadPlayableUrl(cat) {
    if (!cat.isDownloadable) return cat.imageUrl;
    const assetKey = this.assetKey(cat);
    if (this.objectUrls.has(assetKey)) return this.objectUrls.get(assetKey);
    if (!this.cacheStorage) return null;
    try {
      const cache = await this.cacheStorage.open(CAT_ASSET_CACHE_NAME);
      const response = await cache.match(this.cacheKey(cat));
      if (!response) return null;
      const blob = await response.blob();
      const url = this.createObjectUrl ? this.createObjectUrl(blob) : null;
      if (url) this.objectUrls.set(assetKey, url);
      this.writeState(cat, "downloaded");
      return url;
    } catch {
      return null;
    }
  }

  async ensureDownloaded(cat) {
    if (!cat.isDownloadable) return { status: "downloaded", url: cat.imageUrl };
    const assetKey = this.assetKey(cat);
    const cachedUrl = await this.loadPlayableUrl(cat);
    if (cachedUrl) return { status: "downloaded", url: cachedUrl };
    if (this.pending.has(assetKey)) return this.pending.get(assetKey);

    const download = this.download(cat).finally(() => this.pending.delete(assetKey));
    this.pending.set(assetKey, download);
    return download;
  }

  async download(cat) {
    if (!this.fetchImpl || !this.cacheStorage) {
      this.writeState(cat, "failed");
      return { status: "failed", url: null };
    }

    this.writeState(cat, "downloading");
    try {
      const response = await this.fetchImpl(cat.imageUrl, { cache: "no-store" });
      if (!response?.ok) throw new Error("image unavailable");
      const contentType = response.headers?.get?.("content-type")?.split(";")[0]?.trim();
      if (!contentType || !SUPPORTED_CAT_IMAGE_TYPES.includes(contentType)) {
        throw new Error("unsupported image type");
      }
      const declaredSize = Number(response.headers?.get?.("content-length"));
      if (Number.isFinite(declaredSize) && declaredSize > MAX_CAT_DOWNLOAD_BYTES) {
        throw new Error("image too large");
      }

      const blob = await response.clone().blob();
      if (blob.size < 1 || blob.size > MAX_CAT_DOWNLOAD_BYTES) throw new Error("image too large");
      if (cat.downloadSize && blob.size > Math.max(cat.downloadSize * 1.15, cat.downloadSize + 4096)) {
        throw new Error("unexpected image size");
      }
      if (cat.checksum) {
        const actualChecksum = await sha256Hex(blob, this.cryptoImpl);
        if (!actualChecksum || actualChecksum !== cat.checksum) throw new Error("checksum mismatch");
      }

      const cache = await this.cacheStorage.open(CAT_ASSET_CACHE_NAME);
      await cache.put(this.cacheKey(cat), response);
      this.writeState(cat, "downloaded");
      const url = this.createObjectUrl ? this.createObjectUrl(blob) : null;
      if (url) this.objectUrls.set(this.assetKey(cat), url);
      return { status: "downloaded", url };
    } catch {
      this.writeState(cat, "failed");
      return { status: "failed", url: null };
    }
  }
}
