import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// ─── ACTIVACIÓN ────────────────────────────────────────────────────────────────
// NO se llama a self.skipWaiting() automáticamente — el cliente lo invoca vía
// mensaje 'SKIP_WAITING' tras confirmar el banner "Nueva versión disponible".
// Esto evita refrescos sorpresa durante una jornada activa.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Limpiar cachés antiguas de versiones previas del SW
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(k => k.startsWith('times-') && !['times-inc-sync'].includes(k))
            .map(k => k.startsWith('html-pages') || k.startsWith('google-fonts') || k.startsWith('supabase-api') ? null : caches.delete(k))
            .filter(Boolean)
        )
      )
    ])
  )
})

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// ─── HTML / NAVEGACIÓN ─────────────────────────────────────────────────────────
// NetworkFirst: siempre sirve el index.html más reciente cuando hay red.
// Evita que HTML cacheado apunte a hashes de assets obsoletos.
// Fallback offline: precache de index.html.
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'html-pages',
      networkTimeoutSeconds: 4,
      plugins: [new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 })]
    }),
    { whitelist: [/^\/(?!offline\.html)/] }
  )
)

// Offline fallback para navegación sin cache hit
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match('/index.html')
      if (cached) return cached
      return new Response('<h1>Sin conexión</h1><p>TIMES INC funciona offline. Reconectando…</p>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    })
  )
})

// ─── ASSETS ESTÁTICOS ─────────────────────────────────────────────────────────
// StaleWhileRevalidate para JS/CSS: responde rápido desde cache y actualiza en background
registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style',
  new StaleWhileRevalidate({
    cacheName: 'static-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 })]
  })
)

// Imágenes y fuentes locales: CacheFirst (raramente cambian)
registerRoute(
  ({ request }) => request.destination === 'image' || request.destination === 'font',
  new CacheFirst({
    cacheName: 'images-fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 })]
  })
)

// ─── GOOGLE FONTS ─────────────────────────────────────────────────────────────
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 365 })]
  })
)

// ─── SUPABASE API ─────────────────────────────────────────────────────────────
// NetworkFirst con timeout: funciona offline con datos cacheados
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co'),
  new NetworkFirst({
    cacheName: 'supabase-api',
    networkTimeoutSeconds: 8,
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 2 })]
  })
)

// ─── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
// CRÍTICO: iOS PWA exige que TODO evento push llame a event.waitUntil().
// Dedupe persistente en IDB (no se pierde al reiniciar el SW en iOS/Android):
//   - Clave: "psh|{tag}|{title}|{body}" → timestamp del último envío
//   - Ventana: 5 minutos (evita duplicados del cron + cliente en background)
//   - Limpieza: TTL 30min (no acumula entradas obsoletas)
const _pushIdbKey = (tag, title, body) => `psh|${tag}|${title}|${body}`

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'TIMES INC', body: event.data ? event.data.text() : '' }
  }

  const title  = data.title || 'TIMES INC'
  const rawUrl = data.url || '/'
  const url    = (typeof rawUrl === 'string' && rawUrl.startsWith('/')) ? rawUrl : '/'
  const tag    = data.tag || 'times-noti'
  const body   = data.body || data.message || ''
  const now    = Date.now()
  const idbKey = _pushIdbKey(tag, title, body)

  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag,
    renotify: false,
    requireInteraction: false,
    data: { url, tag },
    actions: data.actions || [],
    vibrate: [180, 80, 180],
    silent: false,
  }

  // waitUntil SIEMPRE (obligatorio iOS aunque descartemos el push)
  event.waitUntil((async () => {
    // Dedupe persistente en IDB — sobrevive reinicios del SW
    try {
      const last = await _idbGet(idbKey)
      if (last && now - last < 5 * 60_000) return  // duplicado, descartar silenciosamente

      // Marcar ANTES de mostrar (evita race con otra instancia del SW)
      await _idbPut(idbKey, now)

      // Limpieza asíncrona de entradas antiguas (>30 min) — no bloquea
      _idbOpen().then(db => {
        const tx = db.transaction(_IDB_STORE, 'readwrite')
        const store = tx.objectStore(_IDB_STORE)
        store.openCursor().onsuccess = e => {
          const cur = e.target.result
          if (!cur) return
          if (cur.key.startsWith('psh|') && now - cur.value > 30 * 60_000) cur.delete()
          cur.continue()
        }
      }).catch(() => {})
    } catch {
      // IDB no disponible — continuar sin dedup
    }

    // 1) Mostrar notificación (requisito iOS Web Push)
    await self.registration.showNotification(title, options)

    // 2) Avisar a clientes abiertos para banner in-app
    try {
      const cs = await clients.matchAll({ type: 'window', includeUncontrolled: true })
      const focused = cs.find(c => c.focused) || cs.find(c => c.visibilityState === 'visible')
      if (focused) focused.postMessage({ type: 'PUSH_RECEIVED', title, body, tag, url })
    } catch {}
  })())
})

// ─── PUSH SUBSCRIPTION CHANGE ────────────────────────────────────────────────
// Cuando el navegador invalida la suscripción (expira, cambia de dispositivo…)
// re-suscribimos automáticamente y guardamos el nuevo endpoint en Supabase.
// Sin este handler, las push desaparecen silenciosamente tras días/semanas.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      // 1. Obtener la nueva suscripción del PushManager
      let newSub = null
      try {
        newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: event.newSubscription?.options?.applicationServerKey
            || event.oldSubscription?.options?.applicationServerKey
        })
      } catch { return }

      if (!newSub) return

      // 2. Leer userId guardado en IDB (lo guardamos al suscribir desde la app)
      const userId = await _idbGet('push_user_id')
      if (!userId) return

      // 3. Helpers base64
      const buf2b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

      const key  = newSub.getKey('p256dh')
      const auth = newSub.getKey('auth')
      if (!key || !auth) return

      // 4. Actualizar en Supabase
      await fetch(`${_SB_URL}/rest/v1/push_subs?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: {
          apikey: _SB_ANON, Authorization: `Bearer ${_SB_ANON}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          endpoint: newSub.endpoint,
          p256dh: buf2b64(key),
          auth: buf2b64(auth),
          updated_at: new Date().toISOString()
        })
      })
    } catch {}
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const rawClickUrl = event.notification.data?.url || '/'
  const clickUrl = (typeof rawClickUrl === 'string' && rawClickUrl.startsWith('/')) ? rawClickUrl : '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.includes(self.location.origin))
      if (existing) { existing.focus(); existing.postMessage({ type:'PUSH_CLICK', url: clickUrl }) }
      else clients.openWindow(clickUrl)
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
async function _idbPut(key, value) {
  const db = await _idbOpen()
  return new Promise((res, rej) => {
    const tx = db.transaction(_IDB_STORE, 'readwrite')
    const r  = tx.objectStore(_IDB_STORE).put(value, key)
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

// ─── BACKGROUND SYNC (One-off: cuando recupera red) ────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') event.waitUntil(
    _bgSync().catch(async (err) => {
      const cs = await self.clients.matchAll({ type: 'window' })
      cs.forEach(c => c.postMessage({ type: 'BG_SYNC_FAILED', error: err?.message || 'unknown' }))
    })
  )
})

// ─── PERIODIC BACKGROUND SYNC (V3 Premium — sincroniza aunque la app esté cerrada) ──
// Requiere permisos 'periodic-background-sync' en el navegador (Chrome/Android)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'periodic-sync-data') {
    event.waitUntil(
      _bgSync().catch(() => {})
    )
  }
})

// ─── MENSAJES DESDE LA APP ────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  const { type } = event.data || {}

  // La app pide al SW que active la nueva versión inmediatamente
  if (type === 'SKIP_WAITING') self.skipWaiting()

  // La app pide hacer sync manual ahora
  if (type === 'FORCE_SYNC') event.waitUntil(_bgSync().catch(() => {}))

  // El banner in-app ya se ha mostrado: cerrar la notificación OS para no duplicar
  if (type === 'PUSH_DISMISS' && event.data?.tag) {
    event.waitUntil(
      self.registration.getNotifications({ tag: event.data.tag })
        .then(ns => ns.forEach(n => n.close()))
        .catch(() => {})
    )
  }

  // La app pide limpiar la caché de Supabase (por ejemplo, tras login)
  if (type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.delete('supabase-api').then(() =>
        event.source?.postMessage({ type: 'CACHE_CLEARED' })
      )
    )
  }
})

// ─── INSTALACIÓN GUIADA — OfflineShell ────────────────────────────────────────
// Cuando el SW instala, pre-carga las rutas críticas para experiencia offline perfecta
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('offline-shell').then(cache =>
      cache.addAll(['/', '/index.html']).catch(() => {})
    )
  )
})
