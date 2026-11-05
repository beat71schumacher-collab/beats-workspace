/* ==========================================================================
   Beats Workspace — Service Worker
   Offline-Cache für die App-Shell (alle App-Dateien).
   ========================================================================== */

const CACHE_NAME = "beats-workspace-v2";

// Alle Dateien, die zum Offline-Betrieb der App gehoren müssen.
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./css/components.css",
  "./js/data.js",
  "./js/storage.js",
  "./js/ui.js",
  "./js/app.js",
  "./assets/logo.svg",
  "./assets/icons.svg",
  "./assets/icon-192.svg",
  "./assets/icon-512.svg"
];

// Install: App-Shell im Cache speichern und sofort aktiv werden.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// Activate: alte Caches loeschen und Kontrolle uber offene Seiten ubernehmen.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: Cache-first fuer die App-Shell, andernfalls Netzwerk.
// Funktioniert nur fuer Anfragen gleichem Ursprung (keine externen Inhalte).
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        // Bei Netzwerkfehlern gibt es nichts zu cachen; die Antwort wird durchgereicht.
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }
        return response;
      });
    })
  );
});
