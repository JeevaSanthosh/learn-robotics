// Offline support. MakeCode's "works on a plane" property, done cheaply:
// the site is already fully static, so we just need a cache.
//
// Strategy:
//   /api/*        -> never touched (always network, never cached)
//   hashed assets -> cache-first (their URL changes when content changes)
//   pages         -> network-first, fall back to cache when offline
const CACHE = 'lr-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['/', '/glossary/', '/resources/'])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // tutor calls are always live

  const isAsset = url.pathname.startsWith('/_astro/') || /\.(js|css|woff2?|json|png|svg)$/.test(url.pathname);

  if (isAsset) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
            return res;
          })
      )
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('/')))
  );
});
