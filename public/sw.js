self.options = { domain: '5gvci.com', zoneId: 11932400 };
self.lary = '';
// Register this first so the ad script cannot cache, alter, or answer API requests.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.stopImmediatePropagation();
    event.respondWith(fetch(event.request));
  }
});
importScripts('https://5gvci.com/act/files/service-worker.min.js?r=sw');

const CACHE = 'dashcup-static-v2';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/', '/manifest.webmanifest'])));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('dashcup-static-') && key !== CACHE).map((key) => caches.delete(key)))),
  ]));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
