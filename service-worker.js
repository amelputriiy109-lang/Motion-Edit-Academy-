const CACHE_NAME = 'motion-edit-academy-v13-online-leaderboard';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './avatar-assistant.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Never cache API calls — chat must always hit the network
  if (req.method !== 'GET' || req.url.includes('openrouter.ai') || new URL(req.url).pathname.startsWith('/api/')) {
    return;
  }

  // Network-first for navigations and the app shell, so a new deploy is
  // picked up immediately instead of serving a stale cached page that may
  // behave oddly (e.g. buttons that seem unresponsive).
  const isAppShell = req.mode === 'navigate' || req.url.endsWith('/index.html') || req.url.endsWith('/');
  if (isAppShell) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for static assets (icons, manifest) — safe since each
  // CACHE_NAME bump above busts them anyway.
  event.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req)
          .then((res) => {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
            return res;
          })
          .catch(() => cached)
      );
    })
  );
});
