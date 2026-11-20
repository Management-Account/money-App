// Service worker: caches the app shell so the app opens offline.
// Bump CACHE whenever you deploy changes so installed copies refresh.
const CACHE = 'pocket-ledger-v27';
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

// Stale-while-revalidate for same-origin GET requests.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached || (req.mode === 'navigate' ? cache.match('./index.html') : undefined));
      return cached || network;
    }),
  );
});
