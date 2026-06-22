import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// Force immediate activation of new SW versions (no waiting for tab close)
self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// HTML/navegación: NetworkFirst para que SIEMPRE se sirva el index.html más
// reciente cuando hay red. Esto evita que un HTML cacheado apunte a hashes de
// assets antiguos y la PWA se quede "pegada" en una versión vieja. Si no hay
// red, cae al index.html precacheado (offline).
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'html-pages',
      networkTimeoutSeconds: 4,
      plugins: [new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 })]
    })
  )
)

// Cache Google Fonts
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({ cacheName: 'google-fonts', plugins: [new ExpirationPlugin({ maxAgeSeconds: 60*60*24*365 })] })
)

// Network-first for Supabase API
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co'),
  new NetworkFirst({ cacheName: 'supabase-api', networkTimeoutSeconds: 10 })
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
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'times-noti',
    renotify: true,
    requireInteraction: true,   // Mantiene la notificación visible en pantalla bloqueada
    data: { url: data.url || '/' },
    actions: data.actions || [],
    vibrate: [200, 100, 200],
    silent: false,
  }

  // Si hay una pestaña de la app en primer plano, enviar mensaje in-app en lugar de notificación OS
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const focused = cs.find(c => c.focused)
      if (focused) {
        focused.postMessage({ type: 'PUSH_RECEIVED', title, body: options.body, tag: options.tag, url: data.url || '/' })
        return
      }
      return self.registration.showNotification(title, options)
    })
  )
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

// ─── BACKGROUND SYNC ────────────────────────────────────────────────────────────
const _SB_URL  = 'https://eyyhlcvpyiorpdnvqsll.supabase.co'
const _SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I'
const _IDB_NAME  = 'times-inc-sync'
const _IDB_STORE = 'q'

function _idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(_IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(_IDB_STORE)
    req.onsuccess = () => res(req.result)
    req.onerror   = () => rej(req.error)
  })
}
async function _idbGet(key) {
  const db = await _idbOpen()
  return new Promise((res, rej) => {
    const tx = db.transaction(_IDB_STORE, 'readonly')
    const r  = tx.objectStore(_IDB_STORE).get(key)
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
}
async function _idbDel(key) {
  const db = await _idbOpen()
  return new Promise((res, rej) => {
    const tx = db.transaction(_IDB_STORE, 'readwrite')
    const r  = tx.objectStore(_IDB_STORE).delete(key)
    r.onsuccess = res; r.onerror = () => rej(r.error)
  })
}

async function _bgSync() {
  const data = await _idbGet('pending')
  if (!data) return
  const res = await fetch(`${_SB_URL}/rest/v1/app_data?id=eq.1`, {
    method: 'PATCH',
    headers: {
      apikey: _SB_ANON, Authorization: `Bearer ${_SB_ANON}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal'
    },
    body: JSON.stringify({ data, updated_at: new Date().toISOString() })
  })
  if (!res.ok && res.status !== 409) throw new Error(`bgSync failed: ${res.status}`)
  await _idbDel('pending')
  const cs = await self.clients.matchAll({ type: 'window' })
  cs.forEach(c => c.postMessage({ type: 'BG_SYNC_DONE' }))
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') event.waitUntil(_bgSync())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
