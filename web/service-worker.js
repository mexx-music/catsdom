const CACHE_NAME = "catsdom-pwa-v27";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=30",
  "./src/app.js?v=30",
  "./src/game-engine.js?v=30",
  "./src/cat-progress.js?v=30",
  "./src/cat-content.js",
  "./src/cat-catalog-repository.js?v=30",
  "./src/cat-asset-store.js?v=30",
  "./src/motion-tuning.js?v=30",
  "./cats/catalog.json",
  "./manifest.webmanifest?v=30",
  "./assets/cats/cat_01.webp",
  "./assets/cats/cat_02.webp",
  "./assets/cats/cat_03.webp",
  "./assets/cats/cat_04.webp",
  "./assets/cats/cat_05.webp",
  "./assets/cats/cat_06.webp",
  "./assets/cats/cat_07.webp",
  "./assets/cats/cat_08.webp",
  "./assets/cats/cat_09.webp",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("catsdom-pwa-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html"))),
    );
    return;
  }

  if (requestUrl.pathname.endsWith("/cats/catalog.json")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  if (requestUrl.pathname.includes("/assets/cats/remote/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        }),
    ),
  );
});
