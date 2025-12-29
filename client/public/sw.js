/**
 * Service Worker for caching KuzuDB graph data
 *
 * Strategy: Cache-first with network fallback and background refresh
 * - Serves cached data immediately for fast cold starts
 * - Refreshes cache in background to keep data up-to-date
 */

const CACHE_NAME = "kuzu-auth-v1";
const CSV_ENDPOINT_PATTERN = /\/org\/[^/]+\/csv$/;

self.addEventListener("install", (event) => {
  console.log("[ServiceWorker] Installing...");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[ServiceWorker] Activating...");
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only intercept CSV data requests
  if (!CSV_ENDPOINT_PATTERN.test(url.pathname)) {
    return;
  }

  console.log("[ServiceWorker] Fetch CSV:", url.href);

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Try to get from cache first
      const cachedResponse = await cache.match(event.request);

      if (cachedResponse) {
        console.log("[ServiceWorker] Serving from cache:", url.href);

        // Return cached response immediately
        const response = cachedResponse.clone();

        // Refresh cache in background (stale-while-revalidate pattern)
        event.waitUntil(
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse.ok) {
                console.log(
                  "[ServiceWorker] Background cache refresh:",
                  url.href
                );
                cache.put(event.request, networkResponse.clone());
              }
            })
            .catch((error) => {
              console.log("[ServiceWorker] Background refresh failed:", error);
            })
        );

        return response;
      }

      // No cache - fetch from network
      console.log("[ServiceWorker] Fetching from network:", url.href);
      try {
        const networkResponse = await fetch(event.request);

        if (networkResponse.ok) {
          console.log("[ServiceWorker] Caching new response:", url.href);
          cache.put(event.request, networkResponse.clone());
        }

        return networkResponse;
      } catch (error) {
        console.error("[ServiceWorker] Network fetch failed:", error);
        throw error;
      }
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_CACHE") {
    console.log("[ServiceWorker] Clearing cache...");
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        event.ports[0].postMessage({ success: true });
      })
    );
  }
});
