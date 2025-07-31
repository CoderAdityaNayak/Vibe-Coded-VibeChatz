// service-worker.js

const CACHE_NAME = 'chat-app-v1'; // Cache version for cache busting
const urlsToCache = [
  '/', // Caches the root path, which might serve index.html
  '/index.html',
  // Your logo icons from manifest.json
  '',
  '',
  '',
  // Google Fonts CSS
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap',
  // Firebase and Supabase SDKs (important to cache for offline use)
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
];

// Install event: caches the static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('[Service Worker] Cache addAll failed:', error);
      })
  );
});

// Activate event: cleans up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
          return null;
        })
      );
    })
  );
});

// Fetch event: serves content from cache or network
self.addEventListener('fetch', (event) => {
  // Check if the request is for an API call (Firebase RTDB or Supabase)
  const requestUrl = new URL(event.request.url);
  const isFirebaseApi = requestUrl.hostname.includes('firebaseio.com');
  const isSupabaseApi = requestUrl.hostname.includes('supabase.co') && requestUrl.pathname.includes('/rest/v1/'); // Supabase API
  const isSupabaseStorage = requestUrl.hostname.includes('supabase.co') && requestUrl.pathname.includes('/storage/v1/'); // Supabase Storage

  // For Firebase Realtime Database and Supabase API/Storage, always go to network first
  // Caching these directly can lead to stale data in a real-time app.
  if (isFirebaseApi || isSupabaseApi || isSupabaseStorage) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For other requests (e.g., HTML, CSS, JS, images), try cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          console.log('[Service Worker] Serving from cache:', event.request.url);
          return response;
        }
        console.log('[Service Worker] Fetching from network:', event.request.url);
        return fetch(event.request);
      })
      .catch((error) => {
        console.error('[Service Worker] Fetch failed:', event.request.url, error);
        // You could add an offline fallback page here if desired
        // return caches.match('/offline.html');
      })
  );
});

