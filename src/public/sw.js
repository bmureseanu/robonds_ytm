// Tiny service worker. Strategy:
//  - App shell (HTML/JS/CSS/icon/manifest): cache-first, refreshed on activate.
//  - data.json: stale-while-revalidate — open instantly with cached data,
//    fetch in the background, refresh cache for next open. The page also
//    bypasses the SW when the user clicks Refresh (cache: "reload").

const VERSION = "v1";
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;

const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/data.json")) {
    event.respondWith(staleWhileRevalidate(req, DATA_CACHE));
    return;
  }
  if (SHELL.some((s) => url.pathname.endsWith(s.replace("./", "/")) || url.pathname.endsWith(s.replace("./", "")))) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || new Response(JSON.stringify({ error: "offline" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}
