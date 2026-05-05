const CACHE = 'tagtid-v4';
const SHELL = [
  './',
  './index.html',
  './manual.html',
  './manifest.json',
  './css/main.css',
  './js/settings.js',
  './js/api.js',
  './js/location.js',
  './js/app.js',
  './js/traffic-type.js',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Only intercept same-origin requests — let API calls go through uncached
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
