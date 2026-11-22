// Service worker: caches the app shell so the app opens offline.
// Bump CACHE whenever you deploy changes so installed copies refresh.
const CACHE = 'pocket-ledger-v35';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './js/app.js',
  './js/store.js',
  './js/sync.js',
  './js/config.js',
  './js/charts.js',
  './js/currencies.js',
  './js/institutions.js',
  './js/logos.js',
  './js/picker.js',
  './js/emoji.js',
  './js/colors.js',
  './js/themes.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache-first: every file is stored with the versioned cache, so nothing is fetched from the network on launch.
// New versions arrive when CACHE changes. Pages (navigations) fall back to the cached shell when offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return req.mode === 'navigate' ? cache.match('./index.html') : Response.error();
      }
    }),
  );
});
