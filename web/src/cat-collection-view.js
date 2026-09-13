export function buildCatCollectionView(cats, collections) {
  const collectionById = new Map(collections.map((collection) => [collection.id, collection]));
  const catsByCollection = new Map();
  for (const cat of cats) {
    const grouped = catsByCollection.get(cat.collectionId) ?? [];
    grouped.push(cat);
    catsByCollection.set(cat.collectionId, grouped);
  }

  const dailyFolders = collections
    .filter((collection) => collection.kind === "daily")
    .map((collection) => {
      const folderCats = catsByCollection.get(collection.id) ?? [];
      return {
        ...collection,
        cats: folderCats,
        discoveredCount: folderCats.filter((cat) => cat.isDiscovered).length,
        hasActiveCat: folderCats.some((cat) => cat.isActive),
      };
    })
    .filter((folder) => folder.cats.length > 0)
    .sort((left, right) => Date.parse(right.releaseDate) - Date.parse(left.releaseDate));

  const looseCats = cats.filter(
    (cat) => collectionById.get(cat.collectionId)?.kind !== "daily",
  );

  return { dailyFolders, looseCats };
}
