const CACHE_NAME = 'mercado-luso-pwa-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/favicon.ico',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/screenshots/desktop-wide.png',
  '/screenshots/mobile.png'
];

// Install Event: Opens the cache container and assets are loaded with error boundaries
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[PWA SW] Pre-caching static assets list...');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[PWA SW] One or more assets failed to pre-cache silently:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Deletes older versions of caches to free user storage
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[PWA SW] Clean obsolete cache registry:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Offline-First strategy with Network fallback
self.addEventListener('fetch', (event) => {
  // Only intercept HTTP/HTTPS requests (avoid chrome-extension issues)
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached resource immediately but trigger background update fetch (stale-while-revalidate wrapper)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => { /* mute offline fetch failures in devtools */ });
        
        return cachedResponse;
      }

      // Fallback directly to the live network
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch((error) => {
        // Fallback offline screen handler (if main routing doc fails)
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html') || caches.match('/');
        }
        throw error;
      });
    })
  );
});
