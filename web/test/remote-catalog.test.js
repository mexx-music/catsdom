import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateRemoteCatalog } from "../src/cat-content.js";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogUrl = "https://mexx-music.github.io/catsdom/cats/catalog.json";

function localAssetPath(assetUrl) {
  const pathname = new URL(assetUrl, catalogUrl).pathname;
  const publicPrefix = "/catsdom/";
  assert.equal(pathname.startsWith(publicPrefix), true, `Asset liegt außerhalb von Catsdom: ${pathname}`);
  return resolve(webRoot, pathname.slice(publicPrefix.length));
}

test("the published remote catalog and all referenced assets are valid", async () => {
  const rawCatalog = JSON.parse(await readFile(resolve(webRoot, "cats/catalog.json"), "utf8"));
  const catalog = validateRemoteCatalog(rawCatalog, { baseUrl: catalogUrl });

  assert.equal(catalog.rejectedCount, 0);
  assert.equal(catalog.cats.length, rawCatalog.cats.length);

  for (const cat of catalog.cats) {
    const [full, thumbnail] = await Promise.all([
      readFile(localAssetPath(cat.imageUrl)),
      readFile(localAssetPath(cat.thumbnailUrl)),
    ]);
    assert.equal(full.length, cat.downloadSize, `${cat.id}: Dateigröße stimmt nicht`);
    assert.equal(
      createHash("sha256").update(full).digest("hex"),
      cat.checksum,
      `${cat.id}: Prüfsumme stimmt nicht`,
    );
    assert.equal(full.toString("ascii", 0, 4), "RIFF", `${cat.id}: Vollbild ist kein WebP`);
    assert.equal(thumbnail.toString("ascii", 0, 4), "RIFF", `${cat.id}: Thumbnail ist kein WebP`);
  }
});
