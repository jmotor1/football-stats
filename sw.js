// sw.js — cache & offline
const CACHE = 'rv-stats-v10';
const ASSETS = [
  './',                // project page root
  'index.html',
  'app.js',
  'tiny-idb.js',
  'sw-register.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

// Install: pre-cache core files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clear old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for our assets, network otherwise
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const name = url.pathname.split('/').pop() || './';
  if (ASSETS.includes(name)) {
    event.respondWith(
      caches.match(event.request).then((resp) => resp || fetch(event.request))
    );
  }
});
