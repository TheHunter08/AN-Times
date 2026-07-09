import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, NavigationRoute, setCatchHandler } from 'workbox-routing'
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// ─── ACTIVACIÓN ────────────────────────────────────────────────────────────────
// NO se llama a self.skipWaiting() automáticamente — el cliente lo invoca vía
// mensaje 'SKIP_WAITING' tras confirmar el banner "Nueva versión disponible".
// Esto evita refrescos sorpresa durante una jornada activa.
const ACTIVE_CACHES = new Set([
  'html-pages', 'static-assets', 'images-fonts', 'google-fonts', 'supabase-api'
])
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Eliminar cachés de versiones antiguas que ya no están en uso
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(k => !ACTIVE_CACHES.has(k) && !k.startsWith('workbox-precache'))
            .map(k => caches.delete(k))
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

// Offline fallback para navegación sin cache hit.
// setCatchHandler (no un fetch listener manual) evita el doble respondWith:
// NavigationRoute ya llama a event.respondWith() internamente vía Workbox router;
// un segundo respondWith() en un fetch listener manual lanzaba InvalidStateError.
setCatchHandler(async ({ event }) => {
  if (event.request.mode === 'navigate') {
    const cached = await caches.match('/index.html')
    if (cached) return cached
    return new Response('<h1>Sin conexión</h1><p>TIMES INC funciona offline. Reconectando…</p>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
  return Response.error()
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
// Solo cachear GETs — los writes (POST/PATCH upsert) nunca deben pasar por cache:
// si el timeout de 8s se dispara en un POST, el SW devuelve respuesta vacía y el
// upsert falla en silencio, dejando el fichaje atrapado en IDB para siempre.
registerRoute(
  ({ url, request }) => url.hostname.includes('supabase.co') && request.method === 'GET',
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

  // waitUntil SIEMPRE (obligatorio iOS aunque sea duplicado — iOS mata la app si no)
  event.waitUntil((async () => {
    // Dedupe persistente en IDB — sobrevive reinicios del SW.
    // IMPORTANTE: NO hacemos return antes de showNotification.
    // iOS exige que SIEMPRE se muestre una notificación en el push handler.
    // El dedup visual lo hacen tag + renotify:false (reemplaza silenciosamente).
    try {
      // Transacción atómica: leer + escribir en la misma tx para evitar race conditions
      // si dos push llegan simultáneamente (ambos pasarían el check de lectura por separado)
      await new Promise((resolve, reject) => {
        _idbOpen().then(idb => {
          const tx = idb.transaction(_IDB_STORE, 'readwrite')
          const store = tx.objectStore(_IDB_STORE)
          const getReq = store.get(idbKey)
          getReq.onsuccess = () => {
            const last = getReq.result
            if (!last || now - last >= 5 * 60_000) {
              store.put(now, idbKey)
              // Limpiar entradas expiradas en la misma tx
              store.openCursor().onsuccess = e => {
                const cur = e.target.result
                if (!cur) return
                if (cur.key.startsWith('psh|') && now - cur.value > 30 * 60_000) cur.delete()
                cur.continue()
              }
            }
          }
          tx.oncomplete = resolve
          tx.onerror = reject
        }).catch(reject)
      })
    } catch {
      // IDB no disponible — continuar sin dedup
    }

    // 1) Mostrar notificación (requisito iOS Web Push — siempre, incluso duplicados)
    await self.registration.showNotification(title, options)

    // 2) Avisar a clientes abiertos para banner in-app
    try {
      const cs = await clients.matchAll({ type: 'window', includeUncontrolled: true })
      const focused = cs.find(c => c.focused) || cs.find(c => c.visibilityState === 'visible')
      if (focused) focused.postMessage({ type: 'PUSH_RECEIVED', title, body, tag, url })
    } catch {}

    // 3) Aprovechar que iOS despertó el SW para subir datos offline pendientes.
    //    En Android también ayuda si el push llega mientras la app está en segundo plano.
    //    _bgSync() sale inmediatamente si IDB está vacío, sin coste.
    try { await _bgSync() } catch {}
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
  // event.action contiene el id del botón de acción pulsado ('' si se hizo clic en el cuerpo)
  const actionUrl = event.notification.data?.actionUrls?.[event.action]
  const rawClickUrl = actionUrl || event.notification.data?.url || '/'
  const clickUrl = (typeof rawClickUrl === 'string' && rawClickUrl.startsWith('/')) ? rawClickUrl : '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.includes(self.location.origin))
      if (existing) {
        existing.focus()
        existing.postMessage({ type:'PUSH_CLICK', url: clickUrl })
        if ('navigate' in existing) existing.navigate(clickUrl).catch(() => {})
      } else {
        clients.openWindow(clickUrl)
      }
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

// Datos "fríos" (gastos/denuncias/wellbeing/anomalias_vistas) viven en la fila 3,
// separados de la fila principal — ver dataService.js _splitHotCold(). Se
// duplica aquí porque el service worker no puede importar ese módulo.
const _COLD_KEYS = ['gastos', 'denuncias', 'wellbeing', 'anomalias_vistas']
function _splitHotCold(data) {
  const cold = {}
  const hot = { ...data }
  for (const k of _COLD_KEYS) { cold[k] = data[k]; delete hot[k] }
  return { hot, cold }
}

// Merge seguro para el guardado — versión mínima duplicada de dataService.js
// (_mergeForPush/_unionById/_mergeRecords; el service worker no puede importar
// ese módulo). Antes de subir el pendiente offline, primero se trae lo que haya
// en el servidor y se fusiona por id — evita que este dispositivo borre
// fichajes de otros empleados o cierres de jornada hechos por un encargado
// mientras este dispositivo aún estaba sin conexión.
function _unionByIdSW(base, incoming) {
  const b = Array.isArray(base) ? base : []
  const i = Array.isArray(incoming) ? incoming : []
  if (i.length === 0) return b
  if (b.length === 0) return i
  if ((b.length > 0 && (b[0] === null || typeof b[0] !== 'object')) ||
      (i.length > 0 && (i[0] === null || typeof i[0] !== 'object'))) {
    return [...new Set([...b, ...i])]
  }
  const map = new Map()
  for (const item of b) map.set(item.id, item)
  for (const item of i) map.set(item.id, item)
  return [...map.values()]
}

function _mergeRecordsSW(base, incoming) {
  const b = Array.isArray(base) ? base : []
  const i = Array.isArray(incoming) ? incoming : []
  if (i.length === 0) return b
  if (b.length === 0) return i
  const map = new Map()
  for (const item of b) map.set(item.id, item)
  for (const item of i) {
    const cur = map.get(item.id)
    if (!cur) { map.set(item.id, item); continue }
    const curTs  = cur._upd  ? Date.parse(cur._upd)  : 0
    const itemTs = item._upd ? Date.parse(item._upd) : 0
    if (itemTs >= curTs) map.set(item.id, item)
  }
  return [...map.values()]
}

const _LIST_KEYS = ['empresas', 'obras', 'centrosTrabajo', 'employees', 'vacaciones', 'medicos', 'ausencias', 'mensajes', 'notis', 'cierres', 'documentos', 'audit', 'correccionesFichaje', 'chats', 'gastos', 'denuncias', 'wellbeing', 'turnos', 'partesTrabajo', 'anomalias_vistas']
const _MAP_KEYS  = ['monthSnapshots', 'firmas', 'notisSent', 'pinLockouts', 'config']

function _mergeForPushSW(server, local, deleted) {
  if (!server) return local
  const out = { ...local }
  for (const k of _LIST_KEYS) out[k] = _unionByIdSW(server[k], local[k])
  out.records = _mergeRecordsSW(server.records, (local.records || []).filter(r => r?.inicio && !isNaN(new Date(r.inicio).getTime())))
  for (const k of _MAP_KEYS) out[k] = { ...(server[k] || {}), ...(local[k] || {}) }
  // Una unión solo puede añadir/actualizar, nunca "quitar" — sin esto, un
  // elemento borrado offline resucitaba porque el servidor todavía lo tenía.
  if (deleted) {
    for (const k of Object.keys(deleted)) {
      if (!Array.isArray(out[k])) continue
      const delSet = new Set(deleted[k])
      out[k] = out[k].filter(item => !delSet.has(item && typeof item === 'object' ? item.id : item))
    }
  }
  return out
}

async function _fetchServerData() {
  const headers = { apikey: _SB_ANON, Authorization: `Bearer ${_SB_ANON}` }
  try {
    const [hotRes, coldRes] = await Promise.all([
      fetch(`${_SB_URL}/rest/v1/app_data?id=eq.1&select=data`, { headers }),
      fetch(`${_SB_URL}/rest/v1/app_data?id=eq.3&select=data`, { headers }),
    ])
    if (!hotRes.ok) return null
    const hotArr = await hotRes.json().catch(() => [])
    const hotData = hotArr?.[0]?.data
    if (!hotData) return null
    const coldArr = coldRes.ok ? await coldRes.json().catch(() => []) : []
    const coldData = coldArr?.[0]?.data || {}
    return { ...hotData, ...coldData }
  } catch { return null }
}

let _bgSyncFlight = false
async function _bgSync() {
  if (_bgSyncFlight) return
  _bgSyncFlight = true
  try {
    const stored = await _idbGet('pending')
    if (!stored) return
    const { payload: pending, deleted } = stored
    const server = await _fetchServerData()
    const data = _mergeForPushSW(server, pending, deleted)
    const { hot, cold } = _splitHotCold(data)
    const nowIso = new Date().toISOString()
    // POST + upsert (no PATCH): la fila fría (id=3) puede no existir todavía la
    // primera vez — un PATCH sobre una fila inexistente no crea nada ni da error,
    // así que el dato se perdería en silencio. upsert la crea si hace falta.
    const upsertHeaders = { apikey: _SB_ANON, Authorization: `Bearer ${_SB_ANON}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }
    const [hotRes, coldRes] = await Promise.all([
      fetch(`${_SB_URL}/rest/v1/app_data`, { method: 'POST', headers: upsertHeaders, body: JSON.stringify({ id: 1, data: hot, updated_at: nowIso }) }),
      fetch(`${_SB_URL}/rest/v1/app_data`, { method: 'POST', headers: upsertHeaders, body: JSON.stringify({ id: 3, data: cold, updated_at: nowIso }) }),
    ])
    if (!hotRes.ok && hotRes.status !== 409) {
      throw new Error(`bgSync failed: hot=${hotRes.status}`)
    }
    // Si solo falla la fila fría (RLS, fila aún no creada, etc.) no bloqueamos
    // todo el sync — igual que en dataService.js, reintentamos metiendo el
    // payload completo en la fila caliente para no perder la jornada/fichaje.
    if (!coldRes.ok && coldRes.status !== 409) {
      const fbRes = await fetch(`${_SB_URL}/rest/v1/app_data`, { method: 'POST', headers: upsertHeaders, body: JSON.stringify({ id: 1, data, updated_at: nowIso }) })
      if (!fbRes.ok && fbRes.status !== 409) {
        throw new Error(`bgSync failed: hot=${hotRes.status} cold=${coldRes.status} fallback=${fbRes.status}`)
      }
    }
    await _idbDel('pending')
    // Borrar badge del icono de la app (si el navegador lo soporta)
    try { await self.navigator?.clearAppBadge?.() } catch {}
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    cs.forEach(c => c.postMessage({ type: 'BG_SYNC_DONE' }))
  } finally {
    _bgSyncFlight = false
  }
}

// Ejecuta _bgSync() y, si falla, avisa a los clientes abiertos — así el banner
// de sincronización se muestra en vez de fallar en silencio para siempre
// (antes solo el listener 'sync' avisaba; FORCE_SYNC tragaba el error).
async function _bgSyncNotify() {
  try {
    await _bgSync()
  } catch (err) {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    cs.forEach(c => c.postMessage({ type: 'BG_SYNC_FAILED', error: err?.message || 'unknown' }))
  }
}

// ─── RED RECUPERADA EN SW (Android background) ────────────────────────────────
// WorkerGlobalScope sí expone el evento 'online'. En Chrome/Android el SW puede
// seguir activo en segundo plano y recibir este evento sin que la app esté abierta.
// En iOS el SW se suspende con la app (poco efecto), pero no tiene coste añadirlo.
self.addEventListener('online', () => { _bgSync().catch(() => {}) })

// ─── BACKGROUND SYNC (One-off: cuando recupera red) ────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') event.waitUntil(_bgSyncNotify())
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
  if (type === 'FORCE_SYNC') event.waitUntil(_bgSyncNotify())

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
