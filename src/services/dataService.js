import { createClient } from '@supabase/supabase-js'
import { SB_URL, SB_ANON, INITIAL_DB } from '../config/constants.js'

// ── Cliente Supabase ──────────────────────────────────────────────────────────
export const supabase = (SB_URL && SB_ANON)
  ? createClient(SB_URL, SB_ANON)
  : null

const TABLE      = 'app_data'
const PUSH_TABLE = 'push_subs'
const ROW_ID     = 1

// ── Local storage ─────────────────────────────────────────────────────────────
export function loadLocal() {
  let raw = null
  try { raw = localStorage.getItem('an_times_v1') } catch { return { ...INITIAL_DB } }
  if (!raw) return { ...INITIAL_DB }
  try {
    return mergeDB(INITIAL_DB, JSON.parse(raw))
  } catch (err) {
    // Datos locales corruptos: log + limpiar para no quedar bloqueados al arrancar
    console.error('[loadLocal] corrupt localStorage, resetting:', err)
    try { localStorage.removeItem('an_times_v1') } catch {}
    return { ...INITIAL_DB }
  }
}

export function saveLocal(db) {
  try { localStorage.setItem('an_times_v1', JSON.stringify(db)) } catch (e) { console.error('[saveLocal] error:', e) }
}

// ── _unionById helper ─────────────────────────────────────────────────────────
// Merges two arrays by `id` field (union). Base items come first, incoming
// overwrites by id, new incoming items are appended. If incoming is empty but
// base has items, base is preserved (prevents silent data loss on concurrent writes).
function _unionById(base, incoming) {
  const b = Array.isArray(base) ? base : []
  const i = Array.isArray(incoming) ? incoming : []

  // If incoming is empty, keep base (don't replace with empty array)
  if (i.length === 0) return b

  // If base is empty, just return incoming
  if (b.length === 0) return i

  // Fallback: if items don't have `id` fields, return incoming as-is
  if ((b.length > 0 && b[0].id === undefined) || (i.length > 0 && i[0].id === undefined)) {
    return i
  }

  const map = new Map()
  for (const item of b) map.set(item.id, item)
  for (const item of i) map.set(item.id, item)
  return [...map.values()]
}

// ── _mergeRecords ──────────────────────────────────────────────────────────────
// Igual que _unionById, pero para `records` no basta con "incoming gana": si el
// empleado cerró jornada o marcó descanso en modo oficina (offline) y el pull de
// reconexión llega antes de que el push offline confirme, el remoto (viejo) pisaría
// el cierre/descanso local. Por eso comparamos `_upd` y nos quedamos con el más nuevo.
function _mergeRecords(base, incoming) {
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

// ── mergeDB ───────────────────────────────────────────────────────────────────
export function mergeDB(base, incoming) {
  if (!incoming) return { ...base }
  const adm = base.employees?.find(e => e.isAdmin) || {
    id: 'admin', name: 'Administrador', empresa: base.empresas[0] || '',
    pin: '', color: '#5aa9e6', initials: 'AD',
    startDate: '2024-01-01', email: '', isAdmin: true
  }
  // Bug fix #7: no sobrescribir employees locales con array vacío (Supabase reset / rate-limit)
  const incomingEmps = (incoming.employees?.length > 0) ? incoming.employees : base.employees
  // Bug fix #8: union de notisSent — cleanup entries older than 90 days
  const _mergedNotis = { ...(base.notisSent || {}), ...(incoming.notisSent || {}) }
  const _cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000
  const mergedNotisSent = Object.fromEntries(
    Object.entries(_mergedNotis).filter(([, v]) => { const t = Date.parse(v); return isNaN(t) || t > _cutoff })
  )
  return {
    empresas:            (incoming.empresas?.length)       ? incoming.empresas       : base.empresas,
    obras:               (incoming.obras?.length)          ? incoming.obras          : base.obras,
    centrosTrabajo:      (incoming.centrosTrabajo?.length) ? incoming.centrosTrabajo : base.centrosTrabajo,
    employees:           incomingEmps.some(e => e.isAdmin) ? incomingEmps            : [...incomingEmps, adm],
    records:             _mergeRecords(base.records, (incoming.records || []).filter(r => r?.inicio && !isNaN(new Date(r.inicio).getTime()))),
    vacaciones:          _unionById(base.vacaciones,          incoming.vacaciones),
    medicos:             _unionById(base.medicos,             incoming.medicos),
    ausencias:           _unionById(base.ausencias,           incoming.ausencias),
    mensajes:            _unionById(base.mensajes,            incoming.mensajes),
    notis:               _unionById(base.notis,               incoming.notis),
    cierres:             _unionById(base.cierres,             incoming.cierres),
    monthSnapshots:      incoming.monthSnapshots       || {},
    firmas:              incoming.firmas               || {},
    documentos:          _unionById(base.documentos,          incoming.documentos),
    audit:               _unionById(base.audit,               incoming.audit),
    correccionesFichaje: _unionById(base.correccionesFichaje, incoming.correccionesFichaje),
    chats:               _unionById(base.chats,               incoming.chats),
    gastos:              _unionById(base.gastos,              incoming.gastos),
    denuncias:           _unionById(base.denuncias,           incoming.denuncias),
    wellbeing:           _unionById(base.wellbeing,           incoming.wellbeing),
    turnos:              _unionById(base.turnos,              incoming.turnos),
    partesTrabajo:       _unionById(base.partesTrabajo,       incoming.partesTrabajo),
    anomalias_vistas:    _unionById(base.anomalias_vistas,    incoming.anomalias_vistas),
    notisSent:           mergedNotisSent,
    pinLockouts:         { ...(incoming.pinLockouts || {}), ...(base.pinLockouts || {}) },
    config:              { ...(base.config || {}), ...(incoming.config || {}) },
    _ts:                 incoming._ts                  || 0
  }
}

// ── Supabase fetch (descarga datos completos) ─────────────────────────────────
export async function cloudFetch() {
  if (!supabase) return { ok: false, data: null, status: 'no_config' }
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('data, updated_at')
      .eq('id', ROW_ID)
      .maybeSingle()
    if (error) return { ok: false, data: null, status: error.code || 'sb_error' }
    return { ok: true, data: data?.data || null, updatedAt: data?.updated_at || null }
  } catch (e) {
    console.error('[cloudFetch] error:', e)
    return { ok: false, data: null, status: 'red' }
  }
}

// ── Supabase fetch ligero: solo updated_at (~50 bytes) ───────────────────────
export async function cloudFetchTs() {
  if (!supabase) return { ok: false, ts: null, status: 'no_config' }
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('updated_at')
      .eq('id', ROW_ID)
      .maybeSingle()
    if (error) return { ok: false, ts: null, status: error.code || 'sb_error' }
    return { ok: true, ts: data?.updated_at ? new Date(data.updated_at).getTime() : 0 }
  } catch (e) {
    console.error('[cloudFetchTs] error:', e)
    return { ok: false, ts: null, status: 'red' }
  }
}

// ── Supabase push (guarda datos) ──────────────────────────────────────────────
let _pushFlight = false
let _pushQueue  = []     // cola FIFO: nunca se pierden saves consecutivos
let _saveRetry  = 0
let _saveTimer  = null

// ── IndexedDB helpers para Background Sync ────────────────────────────────────
const _IDB_NAME = 'times-inc-sync'
const _IDB_STORE = 'q'

function _idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(_IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(_IDB_STORE)
    req.onsuccess = () => res(req.result)
    req.onerror   = () => rej(req.error)
  })
}

async function _idbSet(key, val) {
  const db = await _idbOpen()
  return new Promise((res, rej) => {
    const tx = db.transaction(_IDB_STORE, 'readwrite')
    const r  = tx.objectStore(_IDB_STORE).put(val, key)
    r.onsuccess = res; r.onerror = () => rej(r.error)
  })
}

async function _idbGet(key) {
  try {
    const db = await _idbOpen()
    return new Promise((res, rej) => {
      const tx = db.transaction(_IDB_STORE, 'readonly')
      const r  = tx.objectStore(_IDB_STORE).get(key)
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
  } catch { return undefined }
}

async function _idbDel(key) {
  try {
    const db = await _idbOpen()
    return new Promise((res, rej) => {
      const tx = db.transaction(_IDB_STORE, 'readwrite')
      const r  = tx.objectStore(_IDB_STORE).delete(key)
      r.onsuccess = res; r.onerror = () => rej(r.error)
    })
  } catch {}
}

async function _storeForBgSync(data) {
  try {
    await _idbSet('pending', data)
    const sw = await navigator.serviceWorker?.ready
    if (sw && 'sync' in sw) {
      await sw.sync.register('sync-data')
    } else {
      // Fallback: escuchar online y sync manual
      const onOnline = async () => {
        window.removeEventListener('online', onOnline)
        await _bgSyncFallback()
      }
      window.addEventListener('online', onOnline)
    }
  } catch (e) { console.error('[_storeForBgSync] error:', e) }
}

async function _bgSyncFallback() {
  try {
    const data = await _idbGet('pending')
    if (!data || !supabase) return
    const { error } = await supabase
      .from(TABLE)
      .upsert({ id: ROW_ID, data, updated_at: new Date().toISOString() })
    if (!error) {
      await _idbDel('pending')
      window.dispatchEvent(new CustomEvent('times-synced'))
    } else {
      console.error('[_bgSyncFallback] supabase error:', error)
    }
  } catch (e) { console.error('[_bgSyncFallback] error:', e) }
}

function _clearBgSync() { _idbDel('pending') }

function _drainQueue() {
  if (_pushFlight || _pushQueue.length === 0) return
  const entry = _pushQueue.shift()
  const freshDb = entry.db || JSON.parse(localStorage.getItem('an_times_v1') || 'null')
  if (!freshDb) return
  _doCloudPush(freshDb, entry.onSuccess, entry.onError)
}

function _doCloudPush(db, onSuccess, onError) {
  _pushFlight = true
  const payload = { ...db, _ts: Date.now() }
  saveLocal(payload)

  // Sin red: guardar en IDB inmediatamente para background sync (no reintentar)
  if (!navigator.onLine) {
    _pushFlight = false
    onError?.()
    _storeForBgSync(payload)
    return
  }

  supabase
    .from(TABLE)
    .upsert({ id: ROW_ID, data: payload, updated_at: new Date().toISOString() })
    .then(({ error }) => {
      _pushFlight = false
      if (error) throw error
      _saveRetry = 0
      _clearBgSync()
      onSuccess?.(payload)
      _broadcastUpdate(payload._ts)
      _drainQueue()
    })
    .catch((e) => {
      console.error('[cloudPush] error:', e)
      _pushFlight = false
      onError?.()
      if (_saveRetry < 5) {
        _saveRetry++
        _pushQueue.unshift({ db: null, onSuccess, onError })
        // Backoff exponencial: 1s, 2s, 4s, 8s, 16s (máx 30s)
        const delay = Math.min(1000 * Math.pow(2, _saveRetry - 1), 30000)
        setTimeout(() => _drainQueue(), delay)
      } else {
        _saveRetry = 0
        _storeForBgSync(payload)
        window.dispatchEvent(new CustomEvent('times-save-failed'))
      }
    })
}

export function cloudPush(db, onSuccess, onError) {
  if (!supabase) { onError?.(); return }
  if (_pushFlight) {
    _pushQueue.push({ db, onSuccess, onError })
    return
  }
  _doCloudPush(db, onSuccess, onError)
}

export function scheduleSave(db, onSuccess, onError, delay = 0) {
  saveLocal(db)
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => cloudPush(db, onSuccess, onError), delay)
}

// ── Supabase Realtime con auto-reconexión ────────────────────────────────────
// IMPORTANTE: usa 'broadcast' (mensaje ligero, unos bytes) en vez de
// 'postgres_changes'. postgres_changes reenvía la FILA COMPLETA (el JSON de
// toda la app) a cada cliente conectado en cada guardado — con varios
// empleados con la app abierta a la vez, cada fichaje se multiplicaba por N
// clientes y disparaba el consumo de ancho de banda de salida de Supabase.
// Con broadcast, cada cliente solo recibe "algo cambió a las X" y decide si
// le hace falta descargar algo con el mismo chequeo de timestamp que ya
// usaba fetchDB() — el dato completo solo viaja una vez, hacia quien lo pide.
let _realtimeChannel = null
let _realtimeRetry   = 0
let _realtimeTimer   = null

export function startRealtime(currentGetDB, onUpdate) {
  if (!supabase) return
  stopRealtime()
  _realtimeChannel = supabase
    .channel('app_data_rt', { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'updated' }, ({ payload }) => {
      const remoteTs = payload?.ts
      const local = currentGetDB()
      if (remoteTs != null && local._ts != null && remoteTs <= local._ts) return
      _realtimeRetry = 0
      onUpdate?.()
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        _realtimeRetry = 0
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Reconexión exponencial: máx 60s
        clearTimeout(_realtimeTimer)
        const delay = Math.min(3000 * Math.pow(2, _realtimeRetry), 60000)
        _realtimeRetry++
        _realtimeTimer = setTimeout(() => startRealtime(currentGetDB, onUpdate), delay)
      }
    })
}

export function stopRealtime() {
  clearTimeout(_realtimeTimer)
  if (_realtimeChannel) { supabase?.removeChannel(_realtimeChannel); _realtimeChannel = null }
  _realtimeRetry = 0
}

// Aviso ligero de que app_data cambió — lo llama _doCloudPush tras guardar con
// éxito. Si el canal no está suscrito (realtime no arrancado en esta pestaña,
// o desconectado), no pasa nada grave: el sondeo de seguridad en App.jsx
// (fetchDB periódico) acaba trayendo el cambio de todas formas.
function _broadcastUpdate(ts) {
  // send() es async — un try/catch no basta, hay que atrapar el rechazo de la promesa
  try { _realtimeChannel?.send({ type: 'broadcast', event: 'updated', payload: { ts } })?.catch(() => {}) } catch {}
}

// ── Push notifications ────────────────────────────────────────────────────────
const VAPID_KEY_STORAGE = 'an_times_vapid_key'

export async function pushSubscribe(userId, vapidPub) {
  if (!supabase) return { ok: false, reason: 'no_supabase' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[PUSH] Navegador sin soporte para Web Push')
    return { ok: false, reason: 'no_support' }
  }
  if (Notification.permission === 'denied') {
    return { ok: false, reason: 'permission_denied', hint: 'Activa las notificaciones en la configuración del navegador para este sitio.' }
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, reason: 'permission_not_granted', hint: 'Necesitas conceder permiso de notificaciones cuando el navegador lo solicite.' }
  }
  try {
    const reg = await navigator.serviceWorker.ready
    // Sanea cualquier whitespace/quotes y normaliza base64url ANTES de atob,
    // si no atob lanza "The string contains invalid characters" en iOS.
    const b64ToUint8 = raw => {
      const b = String(raw || '')
        .replace(/\s+/g, '')
        .replace(/^["']|["']$/g, '')
        .replace(/-/g, '+')
        .replace(/_/g, '/')
      const p = '='.repeat((4 - b.length % 4) % 4)
      const s = atob(b + p)
      return Uint8Array.from([...s].map(c => c.charCodeAt(0)))
    }
    const buf2b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')

    // Si la clave VAPID cambió (o nunca se guardó), la suscripción existente es inválida → forzar re-suscripción
    const storedKey = localStorage.getItem(VAPID_KEY_STORAGE)
    if (storedKey !== vapidPub) {
      const old = await reg.pushManager.getSubscription()
      if (old) { try { await old.unsubscribe() } catch {} }
    }

    // Helper: intentar subscribe con reintento limpio (force unsubscribe + retry)
    const doSubscribe = async () => {
      return await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToUint8(vapidPub)
      })
    }

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      try {
        sub = await doSubscribe()
      } catch (err) {
        console.error('[PUSH] subscribe() falló (intento 1):', err.name, err.message)
        // iOS suele tener suscripciones zombi tras cambios de VAPID/permission.
        // Reintento: limpia cualquier estado residual y vuelve a suscribir.
        try {
          const stale = await reg.pushManager.getSubscription()
          if (stale) { try { await stale.unsubscribe() } catch {} }
          await new Promise(r => setTimeout(r, 400))
          sub = await doSubscribe()
          console.log('[PUSH] subscribe() OK tras reintento')
        } catch (err2) {
          console.error('[PUSH] subscribe() falló (intento 2):', err2.name, err2.message)
          const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
          let hint = err2.message || err2.name || 'desconocido'
          if (isIOS && !isPWA) hint = 'Instala la PWA en pantalla de inicio (Safari → Compartir → Añadir)'
          else if (err2.name === 'NotAllowedError') hint = 'Permiso de notificaciones denegado o restringido por iOS'
          else if (err2.name === 'AbortError') hint = 'No se pudo contactar con el servicio push (red o iOS)'
          else if (err2.name === 'InvalidAccessError') hint = 'Clave VAPID inválida'
          return { ok: false, reason: 'subscribe_failed', error: hint, errName: err2.name }
        }
      }
    }
    localStorage.setItem(VAPID_KEY_STORAGE, vapidPub)
    // Guardar userId en IDB para que el SW lo use en pushsubscriptionchange
    _idbSet('push_user_id', userId).catch(() => {})
    const key  = sub.getKey('p256dh')
    const auth = sub.getKey('auth')
    if (!key || !auth) {
      console.error('[PUSH] Suscripción sin claves p256dh/auth')
      return { ok: false, reason: 'no_keys' }
    }
    const { error } = await supabase.from(PUSH_TABLE).upsert({
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: buf2b64(key),
      auth:   buf2b64(auth),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    if (error) {
      console.error('[PUSH] upsert Supabase falló:', error)
      return { ok: false, reason: 'db_failed', error: error.message }
    }
    return { ok: true, endpoint: sub.endpoint }
  } catch(e) {
    console.error('[PUSH] excepción inesperada:', e)
    return { ok: false, reason: 'exception', error: e.message }
  }
}

// Dedupe persistente per-device: bloquea el mismo (to|tag|title|body) durante 5 min.
// Evita que la misma smart-noti se reenvíe en checks consecutivos del bucle 60s.
function _pushDedupHit(to, tag, title, body) {
  try {
    const key = '__pushdedup__'
    const TTL = 5 * 60 * 1000
    const now = Date.now()
    const raw = localStorage.getItem(key)
    const map = raw ? JSON.parse(raw) : {}
    const fp = `${to}|${tag}|${title}|${body}`
    if (map[fp] && now - map[fp] < TTL) return true
    map[fp] = now
    for (const k in map) { if (now - map[k] > TTL) delete map[k] }
    localStorage.setItem(key, JSON.stringify(map))
    return false
  } catch { return false }
}

// Cola persistente para pushes que fallan por falta de conexión del propio
// emisor (admin/JO offline al fichar/asignar). Sin esto el push se perdía en
// silencio (solo console.error) y el destinatario nunca se enteraba.
const PUSH_QUEUE_KEY = '__pushqueue__'
const PUSH_QUEUE_MAX = 30

function _enqueueFailedPush(item) {
  try {
    const raw = localStorage.getItem(PUSH_QUEUE_KEY)
    const queue = raw ? JSON.parse(raw) : []
    queue.push({ ...item, ts: Date.now() })
    while (queue.length > PUSH_QUEUE_MAX) queue.shift()
    localStorage.setItem(PUSH_QUEUE_KEY, JSON.stringify(queue))
  } catch {}
}

// Envío real, sin pasar por el dedupe (usado tanto por el envío normal como
// por los reintentos de la cola — un reintento NUNCA debe poder "deduplicarse"
// contra su propio intento fallido original).
async function _doSendPush(to, title, body, tag, safeUrl) {
  const payload = { to, title, body, tag, url: safeUrl }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    _enqueueFailedPush(payload)
    return { ok: false, queued: true }
  }
  try {
    const headers = { 'Content-Type': 'application/json' }
    const res = await fetch('/api/sendpush', { method: 'POST', headers, body: JSON.stringify({ userId: to, title, body, tag, url: safeUrl }) })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[PUSH] sendpush error', res.status, text)
      _enqueueFailedPush(payload)
      return { ok: false, status: res.status, error: text }
    }
    return await res.json().catch(() => ({ ok: true }))
  } catch(e) {
    console.error('[PUSH] queuePush fetch error', e)
    _enqueueFailedPush(payload)
    return { ok: false, status: 'network', error: e.message }
  }
}

export async function queuePush(to, title, body, tag = 'times', url = '/') {
  if (_pushDedupHit(to, tag, title, body)) {
    return { ok: true, deduped: true }
  }
  const safeUrl = (typeof url === 'string' && url.startsWith('/')) ? url : '/'
  return _doSendPush(to, title, body, tag, safeUrl)
}

// Reintenta los pushes que fallaron por conexión. Se llama al recuperar
// internet (evento 'online') y al arrancar la app. Bypasa el dedupe: el intento
// original ya quedó registrado en el mapa de dedupe aunque fallara, así que
// pasar por queuePush() aquí lo marcaría como "duplicado" y se perdería para siempre.
export async function flushPushQueue() {
  let queue
  try {
    const raw = localStorage.getItem(PUSH_QUEUE_KEY)
    queue = raw ? JSON.parse(raw) : []
  } catch { return }
  if (!queue.length) return
  localStorage.removeItem(PUSH_QUEUE_KEY)
  for (const item of queue) {
    // Descarta reintentos con más de 24h: la notificación ya no es relevante.
    if (Date.now() - (item.ts || 0) > 24 * 60 * 60 * 1000) continue
    await _doSendPush(item.to, item.title, item.body, item.tag, item.url)
  }
}

export function auditLog(db, action, detail, user) {
  try {
    const entry = {
      id: Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
      action, detail,
      ts: new Date().toISOString(),
      user: user || 'system'
    }
    return { ...db, audit: [...(db.audit || []), entry] }
  } catch { return db }
}
