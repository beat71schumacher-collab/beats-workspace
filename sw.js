/* Beats Workspace — Service Worker (app shell only; never cache Supabase). */
const CACHE_NAME = "beats-workspace-v7";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./css/components.css",
  "./js/config.js",
  "./js/data.js",
  "./js/storage.js",
  "./js/ui.js",
  "./js/auth.js",
  "./js/calls.js",
  "./js/files-api.js",
  "./js/app.js",
  "./assets/logo.svg",
  "./assets/icons.svg",
  "./assets/icon-192.svg",
  "./assets/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept cross-origin (Supabase API / realtime / CDN).
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-first for navigations so updates appear quickly.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request);
    })
  );
});
