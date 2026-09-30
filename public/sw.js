const CACHE = 'dashcup-static-v1';
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/','/manifest.webmanifest']))); self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (event) => { const url = new URL(event.request.url); if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') return; event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
