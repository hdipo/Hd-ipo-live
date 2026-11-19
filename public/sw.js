const CACHE_NAME = "hd-ipo-v26";
const ASSETS = [
  "/",
  "/style.css",
  "/data.js",
  "/app.js",
  "/manifest.json",
  "/pwa-192x192.png",
  "/pwa-512x512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(ASSETS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || e.request.url.includes("/api/") || /\.(apk|zip)(\?|$)/i.test(e.request.url)) return;
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put("/", clone)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/") || caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
