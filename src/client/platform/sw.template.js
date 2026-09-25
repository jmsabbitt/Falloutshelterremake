// M8 service worker for the PWA: precaches the app shell, the bundled fonts
// and every sprite so Homestead plays offline after the first visit.
// Built by vite.config.ts (serviceWorkerPlugin), which fills in the version
// and the file list. Never registered inside the native app.

const VERSION = '__VERSION__';
const CACHE = `homestead-${VERSION}`;
const PRECACHE = __PRECACHE__;
// Dev and static servers often send `Vary: Origin`; module scripts are fetched with an
// Origin header and precached copies without one, so matching must ignore Vary.
const MATCH = { ignoreSearch: true, ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('homestead-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // The shell is versioned with its assets: serve the cached one, fall back to the network.
    event.respondWith(caches.match(new URL('index.html', self.registration.scope).href, MATCH).then((hit) => hit || fetch(req)));
    return;
  }
  event.respondWith(
    caches.match(req, MATCH).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            void caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
