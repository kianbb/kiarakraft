// Cache only immutable framework assets and the public offline shell.
// API responses, HTML/RSC, uploads and external images can contain personal data.
const CACHE_NAME = 'kiarakraft-static-v3';
const STATIC_PATHS = new Set([
  '/offline.html',
  '/manifest.webmanifest',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
]);

function canCacheRequest(request) {
  const url = new URL(request.url, self.location.origin);
  return (
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    !url.search &&
    !request.headers.has('authorization') &&
    (STATIC_PATHS.has(url.pathname) ||
      url.pathname.startsWith('/_next/static/'))
  );
}

function canCacheResponse(response) {
  const control = response.headers.get('cache-control') || '';
  return (
    response.status === 200 &&
    response.type !== 'opaque' &&
    !response.redirected &&
    !/(?:^|[,\s])(?:private|no-store|no-cache)(?:[=,\s]|$)/i.test(control) &&
    !response.headers.has('set-cookie') &&
    response.headers.get('vary') !== '*'
  );
}

async function fetchStatic(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (canCacheResponse(response)) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      // Never precache a signed-in page, even on an ostensibly public URL.
      const request = new Request(
        new URL('/offline.html', self.location.origin)
      );
      await fetchStatic(request);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // v2 and its unversioned runtime cache may already contain account data.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            name =>
              name === 'runtime' ||
              (name.startsWith('kiarakraft-') && name !== CACHE_NAME)
          )
          .map(name => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (canCacheRequest(request)) {
    event.respondWith(fetchStatic(request));
  } else if (request.method === 'GET' && request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (
          (await cache.match('/offline.html')) ||
          new Response('Offline - Please check your connection', {
            status: 503,
          })
        );
      })
    );
  }
  // Everything else uses the browser network stack, never Cache Storage.
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  // The former CACHE_URLS command is intentionally unsupported: same-origin
  // URLs alone do not make their contents safe for shared offline storage.
});

// Push notification handlers
// Utility functions for secure notification handling
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .slice(0, 300); // Limit length
}

function sanitizeTag(tag) {
  if (!tag || typeof tag !== 'string') return 'kiarakraft-notification';
  const sanitized = tag.replace(/[^a-zA-Z0-9\-_]/g, '');
  return sanitized || 'kiarakraft-notification';
}

function validateUrl(url) {
  if (!url || typeof url !== 'string') return '/fa';
  if (url.startsWith('/')) {
    return url.replace(/\.\./g, '').replace(/\/+/g, '/');
  }
  return '/fa'; // Only allow relative URLs
}

self.addEventListener('push', event => {
  console.log('[SW] Push notification received');

  if (!event.data) {
    console.warn('[SW] Push event has no data');
    return;
  }

  try {
    const rawData = event.data.json();

    // Sanitize and validate all notification data
    const sanitizedData = {
      title: sanitizeText(rawData.title || 'Kiara Kraft'),
      body: sanitizeText(rawData.body || 'You have a new notification'),
      tag: sanitizeTag(rawData.tag),
      data: {
        url: validateUrl(rawData.data?.url),
        type: sanitizeText(rawData.data?.type || '').slice(0, 50),
      },
    };

    const options = {
      body: sanitizedData.body,
      icon: '/android-chrome-192x192.png',
      badge: '/android-chrome-192x192.png',
      tag: sanitizedData.tag,
      data: sanitizedData.data,
      actions: [], // Disable custom actions for security
      vibrate: [100, 50, 100],
      requireInteraction: false,
    };

    event.waitUntil(
      self.registration.showNotification(sanitizedData.title, options)
    );
  } catch (error) {
    console.error('[SW] Error handling push event:', error);
    // Fallback safe notification
    event.waitUntil(
      self.registration.showNotification('Kiara Kraft', {
        body: 'You have a new notification',
        icon: '/android-chrome-192x192.png',
        tag: 'kiarakraft-fallback',
      })
    );
  }
});

self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked:', event.notification.tag);

  event.notification.close();

  // Handle action clicks
  if (event.action) {
    console.log('[SW] Notification action clicked:', event.action);
  }

  // Open app or navigate to specific page (already validated)
  const urlToOpen = validateUrl(event.notification.data?.url) || '/fa';

  event.waitUntil(
    clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      .then(clientList => {
        // Check if app is already open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            if (event.notification.data?.url) {
              client.navigate(urlToOpen);
            }
            return client.focus();
          }
        }

        // Open new window if app is not open
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

self.addEventListener('notificationclose', event => {
  console.log('[SW] Notification closed:', event.notification.tag);
});

console.log('[SW] Service Worker loaded successfully');
