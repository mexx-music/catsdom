export function buildCatCollectionView(cats, collections) {
  const catsByCollection = new Map();
  for (const cat of cats) {
    const grouped = catsByCollection.get(cat.collectionId) ?? [];
    grouped.push(cat);
    catsByCollection.set(cat.collectionId, grouped);
  }

  const collectionFolders = collections
    .map((collection) => {
      const folderCats = catsByCollection.get(collection.id) ?? [];
      return {
        ...collection,
        cats: folderCats,
        discoveredCount: folderCats.filter((cat) => cat.isDiscovered).length,
        hasActiveCat: folderCats.some((cat) => cat.isActive),
      };
    })
    .filter((folder) => folder.cats.length > 0 && (folder.kind === "daily" || folder.cats.length > 1))
    .sort((left, right) => {
      if (left.kind === "daily" && right.kind !== "daily") return -1;
      if (left.kind !== "daily" && right.kind === "daily") return 1;
      if (left.kind === "daily") {
        return Date.parse(right.releaseDate) - Date.parse(left.releaseDate);
      }
      return 0;
    });

  const folderIds = new Set(collectionFolders.map((folder) => folder.id));
  const looseCats = cats.filter((cat) => !folderIds.has(cat.collectionId));

  return { collectionFolders, looseCats };
}
