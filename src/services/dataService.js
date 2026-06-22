import { createClient } from '@supabase/supabase-js'
import { SB_URL, SB_ANON, INITIAL_DB, ADMIN_PIN } from '../config/constants.js'

// ── Cliente Supabase ──────────────────────────────────────────────────────────
export const supabase = (SB_URL && SB_ANON)
  ? createClient(SB_URL, SB_ANON)
  : null

const TABLE      = 'app_data'
const PUSH_TABLE = 'push_subs'
const ROW_ID     = 1

// ── Local storage ─────────────────────────────────────────────────────────────
export function loadLocal() {
  try {
    const raw = localStorage.getItem('an_times_v1')
    if (raw) return mergeDB(INITIAL_DB, JSON.parse(raw))
  } catch {}
  return { ...INITIAL_DB }
}

export function saveLocal(db) {
  try { localStorage.setItem('an_times_v1', JSON.stringify(db)) } catch {}
}

// ── mergeDB ───────────────────────────────────────────────────────────────────
export function mergeDB(base, incoming) {
  if (!incoming) return { ...base }
  const adm = base.employees?.find(e => e.isAdmin) || {
    id: 'admin', name: 'Administrador', empresa: base.empresas[0] || '',
    pin: ADMIN_PIN, color: '#5aa9e6', initials: 'AD',
    startDate: '2024-01-01', email: '', isAdmin: true
  }
  // Bug fix #7: no sobrescribir employees locales con array vacío (Supabase reset / rate-limit)
  const incomingEmps = (incoming.employees?.length > 0) ? incoming.employees : base.employees
  return {
    empresas:            (incoming.empresas?.length)       ? incoming.empresas       : base.empresas,
    obras:               (incoming.obras?.length)          ? incoming.obras          : base.obras,
    centrosTrabajo:      (incoming.centrosTrabajo?.length) ? incoming.centrosTrabajo : base.centrosTrabajo,
    employees:           incomingEmps.some(e => e.isAdmin) ? incomingEmps            : [...incomingEmps, adm],
    records:             (incoming.records?.length > 0)    ? incoming.records          : base.records,
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
    // Bug fix #8: union de notisSent — nunca se "des-envía" una notificación
    notisSent:           { ...(base.notisSent || {}), ...(incoming.notisSent || {}) },
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
  } catch {
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
  } catch {
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
    if (sw && 'sync' in sw) await sw.sync.register('sync-data')
  } catch {}
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
    .catch(() => {
      _pushFlight = false
      onError?.()
      if (_saveRetry < 5) {
        _saveRetry++
        _pushQueue.unshift({ db, onSuccess, onError })
        setTimeout(() => _drainQueue(), 600 * _saveRetry)
      } else {
        _saveRetry = 0
        _storeForBgSync(payload)
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

// ── Supabase Realtime ─────────────────────────────────────────────────────────
let _realtimeChannel = null

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
        if (incoming._ts && local._ts && incoming._ts <= local._ts) return
        onUpdate?.(incoming)
      }
    )
    .subscribe()
}

export function stopRealtime() {
  if (_realtimeChannel) { supabase?.removeChannel(_realtimeChannel); _realtimeChannel = null }
}

// ── Push notifications ────────────────────────────────────────────────────────
const VAPID_KEY_STORAGE = 'an_times_vapid_key'

export async function pushSubscribe(userId, vapidPub) {
  if (!supabase) return
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.ready
    const b64ToUint8 = b => {
      const p = '='.repeat((4 - b.length % 4) % 4)
      const s = atob((b + p).replace(/-/g, '+').replace(/_/g, '/'))
      return Uint8Array.from([...s].map(c => c.charCodeAt(0)))
    }
    const buf2b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')

    // Si la clave VAPID cambió (o nunca se guardó), la suscripción existente es inválida → forzar re-suscripción
    const storedKey = localStorage.getItem(VAPID_KEY_STORAGE)
    if (storedKey !== vapidPub) {
      const old = await reg.pushManager.getSubscription()
      if (old) await old.unsubscribe()
    }

    const sub = await reg.pushManager.getSubscription() ||
      await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapidPub) })
    localStorage.setItem(VAPID_KEY_STORAGE, vapidPub)
    const key = sub.getKey('p256dh'), auth = sub.getKey('auth')
    await supabase.from(PUSH_TABLE).upsert({
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: buf2b64(key),
      auth: buf2b64(auth),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
  } catch(e) { console.warn('[PUSH]', e) }
}

export async function queuePush(to, title, body, tag = 'times', url = '/') {
  try {
    const headers = { 'Content-Type': 'application/json' }
    const secret = import.meta.env.VITE_PUSH_SECRET
    if (secret) headers['Authorization'] = `Bearer ${secret}`
    const res = await fetch('/api/sendpush', { method: 'POST', headers, body: JSON.stringify({ userId: to, title, body, tag, url }) })
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
