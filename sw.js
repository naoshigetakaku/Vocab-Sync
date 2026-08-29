/**
 * sw.js — offline shell for the standalone web app.
 *
 * iOS drops standalone web apps from memory quickly, so a cold start happens
 * far more often than in a browser tab. Serving the shell from cache is what
 * makes that relaunch feel instant.
 *
 * Bump CACHE_VERSION on every release. Without it, GitHub Pages would keep
 * serving new files to a device that never stops using the old ones.
 */

var CACHE_VERSION = 'v1';
var CACHE_NAME = 'vocabsync-' + CACHE_VERSION;

var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/theme.css',
  './css/layout.css',
  './css/components.css',
  './css/animations.css',
  './js/app.js',
  './js/api.js',
  './js/auth.js',
  './js/config.js',
  './js/detail.js',
  './js/dialog.js',
  './js/form.js',
  './js/install-hint.js',
  './js/list.js',
  './js/setup.js',
  './js/sort.js',
  './js/storage.js',
  './js/store.js',
  './js/toast.js',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL);
    })
  );
  // No skipWaiting() here on purpose: the page shows a Reload banner and the
  // user decides when to switch, so an update never interrupts typing.
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.map(function (name) {
          return name === CACHE_NAME ? null : caches.delete(name);
        })
      );
    })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  // Apps Script calls must always hit the network, never a cache.
  if (url.origin !== self.location.origin) return;

  // Navigations: try the network so a new deploy is picked up, fall back to
  // the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  // Static assets: cache first. The version bump is what invalidates them.
  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;

      return fetch(request).then(function (response) {
        if (response && response.ok && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      });
    })
  );
});
