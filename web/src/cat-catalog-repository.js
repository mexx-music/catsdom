import {
  BUNDLED_CATALOG,
  mergeCatCatalogs,
  validateRemoteCatalog,
} from "./cat-content.js?v=32";

export { BUNDLED_CATALOG } from "./cat-content.js?v=32";

export const CAT_CATALOG_CACHE_KEY = "catsdom.remoteCatalog.v1";
export const CAT_CATALOG_SYNC_KEY = "catsdom.remoteCatalogLastSync.v2";
export const DEFAULT_CATALOG_SYNC_INTERVAL = 6 * 60 * 60 * 1000;

export class CatCatalogRepository {
  constructor({
    bundledCatalog = BUNDLED_CATALOG,
    catalogUrl = "./cats/catalog.json",
    storage = globalThis.localStorage,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    now = () => new Date(),
    syncInterval = DEFAULT_CATALOG_SYNC_INTERVAL,
    baseUrl = globalThis.document?.baseURI ?? "https://catsdom.invalid/",
  } = {}) {
    this.bundledCatalog = bundledCatalog;
    this.catalogUrl = new URL(catalogUrl, baseUrl).href;
    this.storage = storage;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.syncInterval = syncInterval;
  }

  readCachedRemoteCatalog() {
    try {
      const saved = this.storage?.getItem(CAT_CATALOG_CACHE_KEY);
      if (!saved) return null;
      const catalog = validateRemoteCatalog(JSON.parse(saved), { baseUrl: this.catalogUrl });
      return catalog.catalogVersion > 0 ? catalog : null;
    } catch {
      return null;
    }
  }

  loadCatalog({ includeFuture = false } = {}) {
    return mergeCatCatalogs(this.bundledCatalog, this.readCachedRemoteCatalog(), {
      now: this.now(),
      includeFuture,
    });
  }

  shouldSync() {
    try {
      const lastSync = Number(this.storage?.getItem(CAT_CATALOG_SYNC_KEY));
      return !Number.isFinite(lastSync) || this.now().getTime() - lastSync >= this.syncInterval;
    } catch {
      return true;
    }
  }

  async sync({ force = false } = {}) {
    const previousCatalog = this.loadCatalog();
    if (!force && !this.shouldSync()) {
      return { catalog: previousCatalog, source: "cache", newCatIds: [], rejectedCount: 0 };
    }
    if (!this.fetchImpl) {
      return { catalog: previousCatalog, source: "offline", newCatIds: [], rejectedCount: 0 };
    }

    try {
      const response = await this.fetchImpl(this.catalogUrl, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response?.ok) throw new Error(`catalog ${response?.status ?? "unavailable"}`);
      const remoteCatalog = validateRemoteCatalog(await response.json(), {
        baseUrl: this.catalogUrl,
      });
      if (remoteCatalog.catalogVersion < 1) throw new Error("invalid catalog");

      const cachedCatalog = this.readCachedRemoteCatalog();
      const acceptedCatalog =
        cachedCatalog && cachedCatalog.catalogVersion > remoteCatalog.catalogVersion
          ? cachedCatalog
          : remoteCatalog;
      try {
        this.storage?.setItem(CAT_CATALOG_CACHE_KEY, JSON.stringify(acceptedCatalog));
        this.storage?.setItem(CAT_CATALOG_SYNC_KEY, String(this.now().getTime()));
      } catch {
        // A valid in-memory catalog is still useful when browser storage is unavailable.
      }

      const catalog = mergeCatCatalogs(this.bundledCatalog, acceptedCatalog, {
        now: this.now(),
      });
      const previousIds = new Set(previousCatalog.cats.map((cat) => cat.id));
      return {
        catalog,
        source: acceptedCatalog === remoteCatalog ? "remote" : "cache",
        newCatIds: catalog.cats.filter((cat) => !previousIds.has(cat.id)).map((cat) => cat.id),
        rejectedCount: remoteCatalog.rejectedCount,
      };
    } catch {
      return { catalog: previousCatalog, source: "offline", newCatIds: [], rejectedCount: 0 };
    }
  }
}
