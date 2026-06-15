import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Cache Google Fonts
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({ cacheName: 'google-fonts', plugins: [new ExpirationPlugin({ maxAgeSeconds: 60*60*24*365 })] })
)

// Cache Firebase CDN
registerRoute(
  ({ url }) => url.hostname === 'www.gstatic.com' && url.pathname.includes('firebase'),
  new CacheFirst({ cacheName: 'firebase-cdn', plugins: [new ExpirationPlugin({ maxAgeSeconds: 60*60*24*30 })] })
)

// Network-first for Firebase DB
registerRoute(
  ({ url }) => url.hostname.includes('firebasedatabase.app'),
  new NetworkFirst({ cacheName: 'firebase-db', networkTimeoutSeconds: 10 })
)

// ─── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'TIMES INC', body: event.data ? event.data.text() : '' }
  }

  const title   = data.title || 'TIMES INC'
  const options = {
    body: data.body || data.message || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || 'times-noti',
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || '/' },
    actions: data.actions || [],
    vibrate: [200, 100, 200],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.includes(self.location.origin))
      if (existing) { existing.focus(); existing.postMessage({ type:'PUSH_CLICK', url }) }
      else clients.openWindow(url)
    })
  )
})

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(Promise.resolve())
  }
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
