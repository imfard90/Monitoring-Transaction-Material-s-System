const CACHE_NAME = 'tailwind-admin-cache-v1';
const urlsToCache = [
    '/auth/login',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

// Install SW
self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)));
    self.skipWaiting();
});

// Activate SW
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Fetch cached resources
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => response || fetch(event.request))
    );
});
