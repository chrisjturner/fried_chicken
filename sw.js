/* Caches the app shell so entries can still be logged with no signal.
   Bump CACHE when you change any of the files below. */
var CACHE = 'fci-v2';

var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/styles.css',
  './assets/icon.svg',
  './js/config.js',
  './js/ui.js',
  './js/store.js',
  './js/score.js',
  './js/sync.js',
  './js/geo.js',
  './js/view-place.js',
  './js/view-map.js',
  './js/view-list.js',
  './js/view-add.js',
  './js/view-settings.js',
  './js/app.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);

  /* Never cache Supabase or Nominatim — those must always hit the network. */
  if (e.request.method !== 'GET' ||
      url.hostname.indexOf('supabase') !== -1 ||
      url.hostname.indexOf('nominatim') !== -1) {
    return;
  }

  /* Network-first for our own shell so updates land; cache is the fallback. */
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
          return res;
        })
        .catch(function () { return caches.match(e.request); })
    );
    return;
  }

  /* Cache-first for CDN assets (Leaflet) and map tiles. */
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        if (res.ok && res.type !== 'opaque') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      });
    })
  );
});
