// M8 service worker for the PWA: precaches the app shell, the bundled fonts and
// the start-up sprite folders (PRECACHED_SPRITES); the rest is cached the first
// time it loads, so Homestead plays offline after a visit. Registered by main.ts
// only after the game's own art is in.
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
      // A few files at a time: hundreds of parallel requests can make a phone's
      // connection (or the host) drop some, including the page's own scripts.
      .then(async (cache) => {
        for (let i = 0; i < PRECACHE.length; i += 6) await cache.addAll(PRECACHE.slice(i, i + 6));
      })
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
    // The device-check page never comes from the cache: it has to work when the game doesn't.
    if (url.pathname.endsWith('/check.html')) return;
    // The page itself is network-first, so a new release (or a fix) arrives on the next
    // visit instead of an old copy sticking; the cached shell is the offline fallback,
    // and also the answer when the network takes more than a few seconds.
    const cached = () => caches.match(new URL('index.html', self.registration.scope).href, MATCH);
    event.respondWith(
      new Promise((resolve) => {
        let done = false;
        const settle = (res) => {
          if (!done && res) {
            done = true;
            resolve(res);
          }
        };
        const timer = setTimeout(() => cached().then(settle), 4000);
        fetch(req)
          .then((res) => {
            clearTimeout(timer);
            if (res.ok) settle(res);
            else cached().then((hit) => settle(hit || res));
          })
          .catch(() => {
            clearTimeout(timer);
            cached().then((hit) => settle(hit || Response.error()));
          });
      }),
    );
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
