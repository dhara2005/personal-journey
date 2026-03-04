// Quit Addiction — Service Worker
const CACHE_NAME = 'quit-addiction-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/logo.png',
    '/manifest.json'
];

// Install — cache core assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch — network first, fall back to cache
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests and external URLs (Firebase, Google Fonts, etc.)
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Let external requests (Firebase, Google APIs, fonts) go straight to network
    if (url.origin !== location.origin) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clone and cache the fresh response
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                return response;
            })
            .catch(() => {
                // Network failed — serve from cache
                return caches.match(event.request);
            })
    );
});
