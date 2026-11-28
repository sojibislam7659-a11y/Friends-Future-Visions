const CACHE_NAME = "ffv-static-v11";
const STATIC_FILE = /\.(?:css|js|svg|webp|png|woff2|webmanifest)$/i;
const PRECACHE = [
  "/portal.css",
  "/friends-future-standard-logo.svg",
  "/manifest.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).catch(error => {
    console.warn("Static asset precache skipped", error);
  }));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("ffv-static-") && key !== CACHE_NAME).map(key => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate" || url.pathname.endsWith(".html")) return;
  if (url.pathname.includes("/rest/v1/") || url.pathname.includes("/auth/") || url.pathname.includes("/storage/")) return;
  if (!STATIC_FILE.test(url.pathname)) return;

  // Network-first for same-origin static assets: never render stale CSS/JS while online.
  // Keep a cache fallback for offline access and update it only with successful responses.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request, { cache: "no-cache" });
      if (response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;
      throw error;
    }
  })());
});

self.addEventListener("push", event => {
  event.waitUntil(self.registration.showNotification("Friends Future Vision", {
    body: "You have a notification from Friends Future Vision.",
    icon: "/friends-future-standard-logo.svg",
    badge: "/friends-future-standard-logo.svg",
    data: { url: "/dashboard.html" }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/dashboard.html"));
});
