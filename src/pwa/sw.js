import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, NavigationRoute, setCatchHandler } from 'workbox-routing'
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { buildTableSyncPlan } from '../services/tableSyncPlan.js'
import { pickNewestSyncItem } from './syncConflict.js'

// ─── ACTIVACIÓN ────────────────────────────────────────────────────────────────
// El cliente invoca skipWaiting mediante 'SKIP_WAITING' cuando ha comprobado que
// no quedan cambios locales por sincronizar. Así la actualización es automática
// sin arriesgar fichajes pendientes cuando el dispositivo está sin conexión.
const ACTIVE_CACHES = new Set([
  'html-pages', 'static-assets', 'images-fonts', 'google-fonts', 'offline-shell'
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

// Los datos mutables de Supabase NO se cachean. En señal débil, un NetworkFirst
// podía devolver un snapshot antiguo con HTTP 200 y la aplicación lo trataba
// como verdad actual. El respaldo offline correcto es loadLocal/IndexedDB; las
// lecturas remotas deben confirmar red real o fallar para activar esa ruta.

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

  // SYNC_PING: enviado por el cron /api/sync-ping para despertar el SW en iOS.
  // Flujo silencioso — sincroniza datos offline y muestra notificación mínima.
  if (data.type === 'SYNC_PING') {
    event.waitUntil(_handleSyncPing())
    return
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

  // waitUntil SIEMPRE: incluso un duplicado debe completar su trabajo asíncrono.
  event.waitUntil((async () => {
    let duplicate = false
    // Dedupe persistente en IDB — sobrevive reinicios del SW.
    // El registro IDB decide si este evento ya se mostró en este dispositivo.
    // Un evento nuevo muestra el aviso; uno ya registrado solo sincroniza.
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
            } else {
              duplicate = true
            }
          }
          tx.oncomplete = resolve
          tx.onerror = reject
        }).catch(reject)
      })
    } catch {
      // IDB no disponible — continuar sin dedup
    }

    // 1) Mostrar una sola vez; los duplicados sincronizan datos sin repetir el aviso.
    // try/catch obligatorio: si showNotification lanza, el waitUntil rechaza y
    // iOS puede terminar la suscripción push de forma permanente.
    // event.waitUntil mantiene vivo el evento. Si es repetido, no recreamos el
    // banner visible (en iOS se mostraba dos veces aun compartiendo el tag).
    if (duplicate) {
      try { await _bgSync() } catch {}
      return
    }
    try { await self.registration.showNotification(title, options) } catch {}

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
      await _sbFetch(`${_SB_URL}/rest/v1/push_subs?user_id=eq.${encodeURIComponent(userId)}`, {
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
// Antes con la URL/clave de Supabase escritas aquí a fuego, sin leer las
// variables de entorno como hace el resto de la app (src/config/constants.js).
// Si el proyecto de Supabase configurado en despliegue (VITE_SB_URL/ANON)
// difiere de este valor de respaldo, cualquier fichaje guardado sin conexión
// que se sincroniza en segundo plano (con la app cerrada, vía Background
// Sync API) se enviaba en silencio a un proyecto de Supabase distinto al
// real — nunca llegaba a aparecer en la base de datos de producción. El
// fallback se mantiene igual por si las variables de entorno no están
// definidas en el build, pero ahora coincide siempre con constants.js.
const _SB_URL  = import.meta.env.VITE_SB_URL  || 'https://eyyhlcvpyiorpdnvqsll.supabase.co'
const _SB_ANON = import.meta.env.VITE_SB_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I'
const _IDB_NAME  = 'times-inc-sync'
const _IDB_STORE = 'q'
// El esquema de producción admite únicamente app_data.id=1.
const _USE_COLD_ROW = false

// Timeout explícito: estas peticiones las hace el propio SW directamente (no
// pasan por su registerRoute, que solo intercepta peticiones de la página), así
// que sin esto pueden quedarse colgadas indefinidamente en señal débil.
const _SB_FETCH_TIMEOUT_MS = 10000
function _sbFetch(url, options) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), _SB_FETCH_TIMEOUT_MS)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}

const _restHeaders = (extra = {}) => ({
  apikey: _SB_ANON,
  Authorization: `Bearer ${_SB_ANON}`,
  'Content-Type': 'application/json',
  ...extra,
})

async function _restUpsertResilient(table, rows) {
  if (!rows.length) return
  const url = `${_SB_URL}/rest/v1/${table}`
  const headers = _restHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' })
  const batch = await _sbFetch(url, { method: 'POST', headers, body: JSON.stringify(rows) })
  if (batch.ok) return
  // Una FK inválida no debe impedir que el resto de fichajes se sincronice.
  let firstFailure = null
  for (const row of rows) {
    const response = await _sbFetch(url, { method: 'POST', headers, body: JSON.stringify(row) })
    if (!response.ok && !firstFailure) {
      firstFailure = new Error(`table sync ${table}/${row.id}: ${response.status}`)
    }
  }
  if (firstFailure) throw firstFailure
}

async function _syncTablesSW(data, deleted, syncHint) {
  const plan = buildTableSyncPlan(data, deleted, Date.now(), syncHint)
  const employees = plan.upserts.find(op => op.table === 'employees')
  if (employees?.rows.length) await _restUpsertResilient(employees.table, employees.rows)
  for (const operation of plan.upserts) {
    if (operation.table !== 'employees' && operation.rows.length) {
      await _restUpsertResilient(operation.table, operation.rows)
    }
  }
  for (const operation of plan.deletes) {
    if (!operation.ids.length) continue
    const idFilter = operation.ids.map(id => encodeURIComponent(id)).join(',')
    const url = `${_SB_URL}/rest/v1/${operation.table}?id=in.(${idFilter})`
    const response = operation.mode === 'deactivate'
      ? await _sbFetch(url, { method: 'PATCH', headers: _restHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ baja: true }) })
      : operation.mode === 'soft_delete'
        ? await _sbFetch(url, {
            method: 'PATCH',
            headers: _restHeaders({ Prefer: 'return=minimal' }),
            body: JSON.stringify({ deleted: true, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
          })
        : await _sbFetch(url, { method: 'DELETE', headers: _restHeaders({ Prefer: 'return=minimal' }) })
    if (!response.ok) throw new Error(`table delete ${operation.table}: ${response.status}`)
  }
}

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
    tx.objectStore(_IDB_STORE).delete(key)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
    tx.onabort = () => rej(tx.error)
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
  for (const item of i) {
    const current = map.get(item.id)
    if (!current) { map.set(item.id, item); continue }
    map.set(item.id, pickNewestSyncItem(current, item))
  }
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

function _mergeDeletedSW(...groups) {
  const out = {}
  for (const group of groups) {
    if (!group || typeof group !== 'object') continue
    for (const [key, ids] of Object.entries(group)) {
      if (!Array.isArray(ids)) continue
      out[key] = [...new Set([...(out[key] || []), ...ids])].slice(-5000)
    }
  }
  return Object.keys(out).length ? out : null
}

function _mergeForPushSW(server, local, deleted) {
  server = server || {}
  const persistentDeleted = _mergeDeletedSW(server._deleted, local._deleted, deleted)
  const out = { ...local }
  for (const k of _LIST_KEYS) out[k] = _unionByIdSW(server[k], local[k])
  out.records = _mergeRecordsSW(server.records, (local.records || []).filter(r => r?.inicio && !isNaN(new Date(r.inicio).getTime())))
  for (const k of _MAP_KEYS) out[k] = { ...(server[k] || {}), ...(local[k] || {}) }
  // Una unión solo puede añadir/actualizar, nunca "quitar" — sin esto, un
  // elemento borrado offline resucitaba porque el servidor todavía lo tenía.
  if (persistentDeleted) {
    out._deleted = persistentDeleted
    for (const k of Object.keys(persistentDeleted)) {
      if (!Array.isArray(out[k])) continue
      const delSet = new Set(persistentDeleted[k])
      out[k] = out[k].filter(item => !delSet.has(item && typeof item === 'object' ? item.id : item))
    }
  }
  return out
}

async function _fetchServerData() {
  const headers = { apikey: _SB_ANON, Authorization: `Bearer ${_SB_ANON}` }
  try {
    const hotRes = await _sbFetch(`${_SB_URL}/rest/v1/app_data?id=eq.1&select=data`, { headers })
    const coldRes = _USE_COLD_ROW
      ? await _sbFetch(`${_SB_URL}/rest/v1/app_data?id=eq.3&select=data`, { headers })
      : null
    if (!hotRes.ok) return null
    const hotArr = await hotRes.json().catch(() => [])
    const hotData = hotArr?.[0]?.data
    if (!hotData) return null
    const coldArr = coldRes?.ok ? await coldRes.json().catch(() => []) : []
    const coldData = coldArr?.[0]?.data || {}
    return { ...hotData, ...coldData }
  } catch { return null }
}

let _bgSyncFlight = false
// Devuelve true si había datos pendientes y se subieron con éxito, false si no había nada
async function _bgSync() {
  if (_bgSyncFlight) return false
  _bgSyncFlight = true
  try {
    const stored = await _idbGet('pending')
    if (!stored) return false
    // Compatibilidad con datos guardados antes del cambio de formato (fd6ecd4):
    // el formato antiguo era el objeto raw; el nuevo es { payload, deleted }.
    const isNewFmt = stored !== null && typeof stored === 'object' && 'payload' in stored
    const pending = isNewFmt ? stored.payload : stored
    const deleted = isNewFmt ? stored.deleted : undefined
    const syncHint = isNewFmt ? stored.syncHint : undefined
    const revision = isNewFmt ? stored.revision : undefined
    if (!pending) return false
    const server = await _fetchServerData()
    const data = _mergeForPushSW(server, pending, deleted)
    const { hot, cold } = _splitHotCold(data)
    const nowIso = new Date().toISOString()
    // POST + upsert (no PATCH): la fila fría (id=3) puede no existir todavía la
    // primera vez — un PATCH sobre una fila inexistente no crea nada ni da error,
    // así que el dato se perdería en silencio. upsert la crea si hace falta.
    const upsertHeaders = { apikey: _SB_ANON, Authorization: `Bearer ${_SB_ANON}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }
    const hotRes = await _sbFetch(`${_SB_URL}/rest/v1/app_data`, { method: 'POST', headers: upsertHeaders, body: JSON.stringify({ id: 1, data: _USE_COLD_ROW ? hot : data, updated_at: nowIso }) })
    const coldRes = _USE_COLD_ROW
      ? await _sbFetch(`${_SB_URL}/rest/v1/app_data`, { method: 'POST', headers: upsertHeaders, body: JSON.stringify({ id: 3, data: cold, updated_at: nowIso }) })
      : { ok: true, status: 200 }
    if (!hotRes.ok) {
      throw new Error(`bgSync failed: hot=${hotRes.status}`)
    }
    // Si solo falla la fila fría (RLS, fila aún no creada, etc.) no bloqueamos
    // todo el sync — igual que en dataService.js, reintentamos metiendo el
    // payload completo en la fila caliente para no perder la jornada/fichaje.
    if (!coldRes.ok) {
      const fbRes = await _sbFetch(`${_SB_URL}/rest/v1/app_data`, { method: 'POST', headers: upsertHeaders, body: JSON.stringify({ id: 1, data, updated_at: nowIso }) })
      if (!fbRes.ok) {
        throw new Error(`bgSync failed: hot=${hotRes.status} cold=${coldRes.status} fallback=${fbRes.status}`)
      }
    }
    // El blob y las tablas V2 forman una sola confirmación offline. Si una
    // tabla falla, conservamos la revisión en IDB para reintentar; así informes,
    // planning y otros dispositivos no quedan leyendo horas antiguas.
    await _syncTablesSW(data, deleted, syncHint)
    const current = await _idbGet('pending')
    const hasNewerPending = revision != null && current?.revision != null && current.revision !== revision
    if (!hasNewerPending) await _idbDel('pending')
    // Borrar badge del icono de la app (si el navegador lo soporta)
    try { await self.navigator?.clearAppBadge?.() } catch {}
    // Marcar last_sync en BD para espaciar la siguiente comprobación periódica
    // ahora que ya no hay datos pendientes. Se identifica por endpoint de
    // suscripción (sin auth): mismo acceso anon que usa sync-ping.js para SELECT.
    try {
      const sub = await self.registration.pushManager.getSubscription()
      if (sub) {
        _sbFetch(
          `${_SB_URL}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
          {
            method: 'PATCH',
            headers: { apikey: _SB_ANON, Authorization: `Bearer ${_SB_ANON}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ last_sync: new Date().toISOString() }),
          }
        ).catch(() => {})
      }
    } catch {}
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (!hasNewerPending) cs.forEach(c => c.postMessage({ type: 'BG_SYNC_DONE' }))
    else {
      // Llegó otro cambio mientras subíamos. Programar una segunda pasada en
      // Android/Chromium incluso si la aplicación ya está en segundo plano.
      try { await self.registration.sync?.register('sync-data') } catch {}
    }
    return !hasNewerPending
  } finally {
    _bgSyncFlight = false
  }
}

// Handler especial para SYNC_PING enviado por el cron /api/sync-ping.
//
// Problema de fondo en iOS: no existe "silent push" en Web Push — iOS exige que
// showNotification() se llame en todo push handler o termina la suscripción. Si
// el usuario descartó la notificación anterior, la siguiente SYNC_PING crea una
// nueva entrada en el centro de notificaciones aunque use el mismo tag (renotify:false
// solo suprime el banner si el tag YA EXISTE; si fue descartado, es notif nueva).
//
// Estrategia:
//   · Cuando no hay datos pendientes: mostrar vacía y cerrarla lo antes posible
//     con reintentos cada 100→500→1500→4000ms — al menos uno debería funcionar
//     antes de que el usuario abra el centro de notificaciones.
//   · Cuando sí se sincronizaron datos: mostrar "✓ Fichaje sincronizado" con
//     renotify:true (el usuario quiere ver esta), cerrar a los 8s.
//   · Siempre cerrar notificaciones sync-ping previas primero.
async function _markEmptyQueueChecked() {
  try {
    const sub = await self.registration.pushManager.getSubscription()
    if (!sub) return
    await _sbFetch(
      `${_SB_URL}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
      {
        method: 'PATCH',
        headers: { ..._restHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ last_sync: new Date().toISOString() }),
      }
    )
  } catch {}
}

async function _handleSyncPing() {
  // Cerrar cualquier sync-ping anterior (puede haber quedado si el close anterior falló)
  try {
    const prev = await self.registration.getNotifications({ tag: 'sync-ping' })
    prev.forEach(n => n.close())
  } catch {}

  let synced = false
  try { synced = await _bgSync() } catch {}
  // Si el despertador comprobó una cola realmente vacía, confirmarlo al
  // servidor. Así espera al siguiente ciclo antes de comprobar otra vez. Si
  // queda pending, no se toca last_sync y el siguiente cron reintentará.
  if (!synced) {
    try {
      if (!await _idbGet('pending')) await _markEmptyQueueChecked()
    } catch {}
  }

  // ¿Descartó el usuario la notificación recientemente (< 2h)?
  // Si es así y no hay datos reales que informar, acortamos al máximo los delays
  // de cierre para que la notificación desaparezca antes de que la vea.
  let userDismissedRecently = false
  if (!synced) {
    try {
      const dismissed = await _idbGet('sync_ping_user_dismissed')
      userDismissedRecently = !!(dismissed && Date.now() - dismissed < 2 * 60 * 60_000)
    } catch {}
  }

  if (synced) {
    // Datos subidos — notificación útil para el usuario, con sonido/banner
    try {
      await self.registration.showNotification('Times INC', {
        body: '✓ Fichaje sincronizado',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'sync-ping',
        silent: false,
        renotify: true,
        requireInteraction: false,
      })
    } catch {}
    // Cerrar a los 8s — tiempo suficiente para que el usuario la vea
    await new Promise(r => setTimeout(r, 8000))
    try {
      const ns = await self.registration.getNotifications({ tag: 'sync-ping' })
      ns.forEach(n => n.close())
    } catch {}
  } else {
    // Sin datos pendientes — mostrar vacía (iOS exige showNotification) y cerrar ASAP.
    // Múltiples intentos: iOS registra la notificación con retraso variable.
    try {
      await self.registration.showNotification('Times INC', {
        body: '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'sync-ping',
        silent: true,
        renotify: false,
        requireInteraction: false,
      })
    } catch {}
    // Reintentos agresivos — el primero a 100ms puede llegar antes de que iOS
    // muestre la notificación al usuario; los siguientes son fallback.
    // Si el usuario ya descartó antes, reducimos delays para ser aún más rápidos.
    const delays = userDismissedRecently ? [50, 200, 800] : [100, 500, 1500, 4000]
    for (const ms of delays) {
      await new Promise(r => setTimeout(r, ms))
      try {
        const ns = await self.registration.getNotifications({ tag: 'sync-ping' })
        if (ns.length > 0) { ns.forEach(n => n.close()); break }
      } catch {}
    }
  }
}

// Cuando el usuario descarta manualmente una notificación: guardar en IDB para
// no volver a molestarle con ese tipo durante las próximas 2 horas.
// Nota: notificationclose NO se dispara al cerrar programáticamente con n.close().
self.addEventListener('notificationclose', (event) => {
  if (event.notification.tag === 'sync-ping') {
    // event.waitUntil obligatorio: sin él el SW puede morir antes de que la
    // escritura IDB termine, y el flag "usuario descartó" nunca se persiste.
    event.waitUntil(_idbPut('sync_ping_user_dismissed', Date.now()).catch(() => {}))
  }
})

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
