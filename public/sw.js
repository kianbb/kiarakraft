// Kiara Kraft Service Worker
// Provides offline functionality and caching for better performance

const CACHE_NAME = 'kiarakraft-v1';
const RUNTIME = 'runtime';

// Assets to pre-cache
const PRECACHE_ASSETS = [
  '/',
  '/fa',
  '/en',
  '/fa/explore',
  '/en/explore',
  '/manifest.webmanifest',
  '/offline.html', // fallback page
];

// Cache patterns for different resource types
const CACHE_STRATEGIES = {
  images: 'CacheFirst',
  api: 'NetworkFirst',
  pages: 'NetworkFirst',
  static: 'StaleWhileRevalidate',
};

// Install event - pre-cache critical assets
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('[SW] Pre-caching assets');
      
      try {
        await cache.addAll(PRECACHE_ASSETS);
        console.log('[SW] Pre-cache complete');
      } catch (error) {
        console.warn('[SW] Pre-cache failed for some assets:', error);
        // Cache assets individually to avoid complete failure
        for (const asset of PRECACHE_ASSETS) {
          try {
            await cache.add(asset);
          } catch (err) {
            console.warn(`[SW] Failed to cache ${asset}:`, err);
          }
        }
      }
    })()
  );
  
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      const oldCaches = cacheNames.filter(name => 
        name !== CACHE_NAME && name !== RUNTIME
      );
      
      if (oldCaches.length > 0) {
        console.log('[SW] Cleaning old caches:', oldCaches);
        await Promise.all(oldCaches.map(name => caches.delete(name)));
      }
      
      // Take control of all pages immediately
      await self.clients.claim();
      console.log('[SW] Service worker activated and claimed clients');
    })()
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip cross-origin requests (unless it's our CDN)
  if (url.origin !== location.origin && 
      !url.hostname.includes('unsplash.com') && 
      !url.hostname.includes('cloudinary.com')) {
    return;
  }
  
  event.respondWith(handleRequest(request));
});

// Main request handler with different strategies
async function handleRequest(request) {
  const url = new URL(request.url);
  
  try {
    // API requests - Network First with fallback
    if (url.pathname.startsWith('/api/')) {
      return await networkFirst(request, RUNTIME);
    }
    
    // Images - Cache First for performance
    if (request.destination === 'image' || 
        url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
      return await cacheFirst(request, CACHE_NAME);
    }
    
    // Static assets (JS, CSS) - Stale While Revalidate
    if (request.destination === 'script' || 
        request.destination === 'style' ||
        url.pathname.match(/\.(js|css|woff|woff2|ttf)$/i)) {
      return await staleWhileRevalidate(request, CACHE_NAME);
    }
    
    // Pages - Network First with offline fallback
    if (request.destination === 'document' || 
        request.headers.get('accept')?.includes('text/html')) {
      return await networkFirstWithOffline(request);
    }
    
    // Default - try cache first, then network
    return await cacheFirst(request, CACHE_NAME);
    
  } catch (error) {
    console.warn('[SW] Request failed:', request.url, error);
    
    // Return offline fallback for pages
    if (request.destination === 'document') {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match('/offline.html') || 
             new Response('Offline - Please check your connection', { status: 503 });
    }
    
    throw error;
  }
}

// Network First strategy
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    const response = await fetch(request);
    
    if (response.status === 200) {
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

// Cache First strategy
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    // Update cache in background
    fetch(request).then(response => {
      if (response.status === 200) {
        cache.put(request, response.clone());
      }
    }).catch(() => {
      // Silently fail background updates
    });
    
    return cachedResponse;
  }
  
  const response = await fetch(request);
  
  if (response.status === 200) {
    cache.put(request, response.clone());
  }
  
  return response;
}

// Stale While Revalidate strategy
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  // Always try to update cache in background
  const networkPromise = fetch(request).then(response => {
    if (response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => {
    // Silently fail if network is unavailable
  });
  
  // Return cached version immediately if available
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // If no cache, wait for network
  return await networkPromise;
}

// Network First with offline page fallback
async function networkFirstWithOffline(request) {
  try {
    const response = await fetch(request);
    
    // Cache successful page responses
    if (response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.log('[SW] Page request failed, checking cache:', request.url);
    
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const offlinePage = await cache.match('/offline.html');
      if (offlinePage) {
        return offlinePage;
      }
    }
    
    throw error;
  }
}

// Message handling for cache updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => 
        cache.addAll(event.data.payload)
      )
    );
  }
});

// Background sync for failed requests (if supported)
if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
  self.addEventListener('sync', (event) => {
    if (event.tag === 'background-sync') {
      event.waitUntil(
        // Handle background sync logic here
        console.log('[SW] Background sync triggered')
      );
    }
  });
}

console.log('[SW] Service Worker loaded successfully');