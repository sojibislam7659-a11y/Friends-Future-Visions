const CACHE_NAME = "ffv-static-v2";
const STATIC_FILE = /\.(?:css|js|svg|webp|png|woff2|webmanifest)$/i;
const PRECACHE = [
  "/portal.css",
  "/friends-future-standard-logo.svg",
  "/friends-future-community-emblem-optimized.webp",
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

  const updatePromise = caches.open(CACHE_NAME).then(async cache => {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  });
  event.waitUntil(updatePromise.catch(() => {}));
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(request);
    if (cached) return cached;
    return updatePromise;
  }));
});

self.addEventListener("push", event => {
  event.waitUntil(self.registration.showNotification("Friends Future Vision", {
    body: "You have a notification from Friends Future Vision.",
    icon: "/friends-future-community-emblem-optimized.webp",
    badge: "/friends-future-community-emblem-optimized.webp",
    data: { url: "/dashboard.html" }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/dashboard.html"));
});
