/**
 * Minimal service worker. Its only job today is to exist — Chrome won't
 * mark a site as "installable as PWA" without a registered SW that
 * handles `fetch`. We intentionally do not cache anything yet: the app
 * is server-rendered and changes often, so a stale cache during dev
 * would be more painful than the network round-trips we'd save.
 *
 * Future: opt-in offline shell (cache /login + /icon-* + the latest
 * thumbnails) once the data layer can serve from a local store.
 */
self.addEventListener("install", () => {
  // Activate immediately so the user doesn't have to refresh twice on
  // first install to get the SW running.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take over any open clients straight away (same rationale).
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Pass-through. Required by Chrome's installability heuristic — even
  // a no-op listener satisfies "has a fetch handler".
});
