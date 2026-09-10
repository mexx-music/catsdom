# Catsdom content catalog

`catalog.json` is the provider-neutral boundary between the game and a future
CatLab CDN/API. The catalog may stay on GitHub Pages now and move later by
changing the `catsdom-catalog-url` meta tag in `index.html`; gameplay code does
not need to change.

The nine starter cats remain bundled with the PWA. A released remote entry can
look like this:

```json
{
  "catalogVersion": 2,
  "collections": [
    { "id": "community_2026", "name": "Community Cats 2026", "version": 1 }
  ],
  "cats": [
    {
      "id": "community_minka_0001",
      "name": "Minka",
      "imageUrl": "https://cdn.example.com/cats/community_minka_0001/v1/full.webp",
      "thumbnailUrl": "https://cdn.example.com/cats/community_minka_0001/v1/thumb.webp",
      "imageType": "image/webp",
      "sourceType": "community",
      "collectionId": "community_2026",
      "releaseDate": "2026-10-01T08:00:00.000Z",
      "version": 1,
      "unlockOrder": 10,
      "downloadSize": 340000,
      "checksum": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "moderationStatus": "published",
      "country": "Austria",
      "shortDescription": "A curious rescue cat.",
      "contributorDisplayName": "Cat Friend",
      "originalSubmissionId": "submission_123",
      "processedAssetVersion": "crop-v1"
    }
  ]
}
```

## Publishing boundary

Only entries marked `published` are accepted by the client. A future upload
pipeline should keep original submissions private, moderate them outside the
game, remove metadata, create normalized thumbnail/full WebP or AVIF assets,
record consent and provenance, and publish only the processed asset plus the
catalog entry. The public catalog must never contain private contributor data.

IDs are permanent. Updating an image increments its `version` but keeps the
same `id`, so player progress remains intact. Removing an entry from a catalog
does not erase locally stored progress; it becomes visible again if that ID is
published later.

The client rejects malformed items independently, non-HTTPS production URLs,
unsupported image types, unpublished community content, oversized assets and
checksum mismatches. The full image downloads only when that cat becomes the
active puzzle target and is then kept in a separate offline cache.
