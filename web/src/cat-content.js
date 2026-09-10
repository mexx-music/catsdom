export const CAT_SOURCE_TYPES = Object.freeze([
  "bundled",
  "catlab",
  "community",
  "ai_generated",
]);

export const SUPPORTED_CAT_IMAGE_TYPES = Object.freeze([
  "image/webp",
  "image/jpeg",
  "image/png",
  "image/avif",
]);

export const MAX_CAT_DOWNLOAD_BYTES = 15 * 1024 * 1024;

const STARTER_RELEASE_DATE = "2026-09-03T00:00:00.000Z";
const starterNames = ["Luna", "Milo", "Nala", "Leo", "Coco", "Mia", "Loki", "Bella", "Suki"];

export const BUNDLED_CATALOG = Object.freeze({
  catalogVersion: 1,
  collections: Object.freeze([
    Object.freeze({ id: "starter", name: "Starter Cats", version: 1 }),
  ]),
  cats: Object.freeze(
    starterNames.map((name, index) => {
      const number = String(index + 1).padStart(2, "0");
      return Object.freeze({
        id: `cat_${number}`,
        name,
        imageUrl: `./assets/cats/cat_${number}.webp`,
        thumbnailUrl: `./assets/cats/cat_${number}.webp`,
        imageType: "image/webp",
        sourceType: "bundled",
        collectionId: "starter",
        releaseDate: STARTER_RELEASE_DATE,
        version: 1,
        unlockOrder: index + 1,
        isDownloadable: false,
        downloadSize: null,
        checksum: null,
        moderationStatus: "published",
      });
    }),
  ),
});

export const BUNDLED_CATS = BUNDLED_CATALOG.cats;

const CAT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/i;

function optionalText(value, maxLength) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function normalizeReleaseDate(value) {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeUrl(value, baseUrl) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value, baseUrl);
    const localDevelopment =
      url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !localDevelopment) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function validateRemoteCat(value, { baseUrl = "https://catsdom.invalid/" } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = optionalText(value.id, 64);
  const name = optionalText(value.name, 80);
  const collectionId = optionalText(value.collectionId, 64);
  const sourceType = optionalText(value.sourceType, 32);
  const imageUrl = normalizeUrl(value.imageUrl, baseUrl);
  const thumbnailUrl = normalizeUrl(value.thumbnailUrl, baseUrl);
  const releaseDate = normalizeReleaseDate(value.releaseDate);
  const version = Number(value.version);
  const imageType = optionalText(value.imageType ?? "image/webp", 40);
  const downloadSize = value.downloadSize == null ? null : Number(value.downloadSize);
  const checksum = value.checksum == null ? null : optionalText(value.checksum, 64);

  if (
    !id ||
    !CAT_ID_PATTERN.test(id) ||
    !name ||
    !collectionId ||
    !sourceType ||
    !CAT_SOURCE_TYPES.includes(sourceType) ||
    sourceType === "bundled" ||
    !imageUrl ||
    !thumbnailUrl ||
    !releaseDate ||
    !Number.isInteger(version) ||
    version < 1 ||
    !SUPPORTED_CAT_IMAGE_TYPES.includes(imageType) ||
    value.moderationStatus !== "published"
  ) {
    return null;
  }
  if (
    downloadSize !== null &&
    (!Number.isInteger(downloadSize) || downloadSize < 1 || downloadSize > MAX_CAT_DOWNLOAD_BYTES)
  ) {
    return null;
  }
  if (checksum !== null && (!checksum || !CHECKSUM_PATTERN.test(checksum))) return null;

  return Object.freeze({
    id,
    name,
    imageUrl,
    thumbnailUrl,
    imageType,
    sourceType,
    collectionId,
    releaseDate,
    version,
    unlockOrder: Number.isFinite(Number(value.unlockOrder))
      ? Math.max(1, Math.floor(Number(value.unlockOrder)))
      : null,
    isDownloadable: true,
    downloadSize,
    checksum: checksum?.toLowerCase() ?? null,
    country: optionalText(value.country, 80),
    shortDescription: optionalText(value.shortDescription, 500),
    contributorDisplayName: optionalText(value.contributorDisplayName, 80),
    originalSubmissionId: optionalText(value.originalSubmissionId, 80),
    processedAssetVersion: optionalText(value.processedAssetVersion, 80),
    moderationStatus: "published",
    metadata:
      value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
        ? Object.freeze({ ...value.metadata })
        : null,
  });
}

export function validateRemoteCatalog(
  value,
  { baseUrl = "https://catsdom.invalid/catalog.json" } = {},
) {
  const catalogVersion = Number(value?.catalogVersion);
  if (!Number.isInteger(catalogVersion) || catalogVersion < 1 || !Array.isArray(value?.cats)) {
    return { catalogVersion: 0, collections: [], cats: [], rejectedCount: 0 };
  }

  const catsById = new Map();
  let rejectedCount = 0;
  for (const candidate of value.cats) {
    const cat = validateRemoteCat(candidate, { baseUrl });
    if (!cat) {
      rejectedCount += 1;
      continue;
    }
    const existing = catsById.get(cat.id);
    if (!existing || cat.version > existing.version) catsById.set(cat.id, cat);
  }

  const collections = Array.isArray(value.collections)
    ? value.collections
        .map((collection) => {
          const id = optionalText(collection?.id, 64);
          const name = optionalText(collection?.name, 100);
          if (!id || !CAT_ID_PATTERN.test(id) || !name) return null;
          return Object.freeze({ id, name, version: Math.max(1, Number(collection.version) || 1) });
        })
        .filter(Boolean)
    : [];

  return {
    catalogVersion,
    collections,
    cats: [...catsById.values()],
    rejectedCount,
  };
}

export function mergeCatCatalogs(
  bundledCatalog,
  remoteCatalog,
  { now = new Date(), includeFuture = false } = {},
) {
  const nowTimestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const catsById = new Map(bundledCatalog.cats.map((cat) => [cat.id, cat]));
  const remoteCats = [...(remoteCatalog?.cats ?? [])].sort((a, b) => {
    const orderA = a.unlockOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.unlockOrder ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB || Date.parse(a.releaseDate) - Date.parse(b.releaseDate) || a.id.localeCompare(b.id);
  });

  let nextUnlockOrder = Math.max(0, ...bundledCatalog.cats.map((cat) => cat.unlockOrder ?? 0)) + 1;
  for (const cat of remoteCats) {
    if (catsById.has(cat.id)) continue;
    if (!includeFuture && Date.parse(cat.releaseDate) > nowTimestamp) continue;
    catsById.set(
      cat.id,
      Object.freeze({ ...cat, unlockOrder: cat.unlockOrder ?? nextUnlockOrder++ }),
    );
  }

  const collectionById = new Map(
    [...bundledCatalog.collections, ...(remoteCatalog?.collections ?? [])].map((collection) => [
      collection.id,
      collection,
    ]),
  );
  return Object.freeze({
    catalogVersion: Math.max(bundledCatalog.catalogVersion, remoteCatalog?.catalogVersion ?? 0),
    collections: Object.freeze([...collectionById.values()]),
    cats: Object.freeze(
      [...catsById.values()].sort(
        (a, b) => a.unlockOrder - b.unlockOrder || a.id.localeCompare(b.id),
      ),
    ),
  });
}
