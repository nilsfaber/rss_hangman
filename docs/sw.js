/**
 * Service Worker for RSS Hangman PWA
 * Caches app shell for offline use, network-first for external requests.
 */

const CACHE_NAME = 'rss-hangman-v72';
const APP_SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/game.js',
  'js/rss.js',
  'js/settings.js',
  'manifest.json',
  'icons/icon-512.svg'
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // External requests (CORS proxies, RSS feeds, fonts): network-only
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(request).catch(() => new Response('', { status: 408 })));
    return;
  }

  // App shell: cache-first, then network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        // Don't cache non-ok responses or non-GET
        if (!response || response.status !== 200 || request.method !== 'GET') {
          return response;
        }

        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, responseClone);
        });

        return response;
      });
    }).catch(() => {
      // Fallback for navigation requests
      if (request.mode === 'navigate') {
        return caches.match('index.html');
      }
    })
  );
});
