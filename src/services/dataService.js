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
    records:             (incoming.records?.length > 0)    ? incoming.records.filter(r => r?.inicio && !isNaN(new Date(r.inicio).getTime())) : base.records,
    vacaciones:          incoming.vacaciones           || [],
    medicos:             incoming.medicos              || [],
    ausencias:           incoming.ausencias            || [],
    mensajes:            incoming.mensajes             || [],
    notis:               incoming.notis                || [],
    cierres:             incoming.cierres              || [],
    monthSnapshots:      incoming.monthSnapshots       || {},
    firmas:              incoming.firmas               || {},
    documentos:          incoming.documentos           || [],
    audit:               incoming.audit                || [],
    correccionesFichaje: incoming.correccionesFichaje  || [],
    chats:               incoming.chats                || [],
    gastos:              incoming.gastos               || [],
    denuncias:           incoming.denuncias            || [],
    wellbeing:           incoming.wellbeing            || [],
    turnos:              incoming.turnos               || [],
    anomalias_vistas:    incoming.anomalias_vistas     || [],
    notisSent:           mergedNotisSent,
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
  const { db, onSuccess, onError } = _pushQueue.shift()
  _doCloudPush(db, onSuccess, onError)
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
      _drainQueue()
    })
    .catch((e) => {
      console.error('[cloudPush] error:', e)
      _pushFlight = false
      onError?.()
      if (_saveRetry < 5) {
        _saveRetry++
        _pushQueue.unshift({ db, onSuccess, onError })
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
let _realtimeChannel = null
let _realtimeRetry   = 0
let _realtimeTimer   = null

export function startRealtime(currentGetDB, onUpdate) {
  if (!supabase) return
  stopRealtime()
  _realtimeChannel = supabase
    .channel('app_data_rt')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: TABLE, filter: `id=eq.${ROW_ID}` },
      (payload) => {
        const incoming = payload.new?.data
        if (!incoming) return
        const local = currentGetDB()
        if (incoming._ts != null && local._ts != null && incoming._ts <= local._ts) return
        _realtimeRetry = 0
        onUpdate?.(incoming)
      }
    )
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

export async function queuePush(to, title, body, tag = 'times', url = '/') {
  if (_pushDedupHit(to, tag, title, body)) {
    return { ok: true, deduped: true }
  }
  const safeUrl = (typeof url === 'string' && url.startsWith('/')) ? url : '/'
  try {
    const headers = { 'Content-Type': 'application/json' }
    const secret = import.meta.env.VITE_PUSH_SECRET
    if (secret) headers['Authorization'] = `Bearer ${secret}`
    const res = await fetch('/api/sendpush', { method: 'POST', headers, body: JSON.stringify({ userId: to, title, body, tag, url: safeUrl }) })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[PUSH] sendpush error', res.status, text)
      return { ok: false, status: res.status, error: text }
    }
    return await res.json().catch(() => ({ ok: true }))
  } catch(e) {
    console.error('[PUSH] queuePush fetch error', e)
    return { ok: false, status: 'network', error: e.message }
  }
}

export function auditLog(db, action, detail, user) {
  try {
    const entry = {
      id: Date.now().toString(36),
      action, detail,
      ts: new Date().toISOString(),
      user: user || 'system'
    }
    return { ...db, audit: [...(db.audit || []), entry] }
  } catch { return db }
}
