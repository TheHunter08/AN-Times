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
  const inc = incoming.employees?.length ? incoming.employees : base.employees
  return {
    empresas:       (incoming.empresas?.length)       ? incoming.empresas       : base.empresas,
    obras:          (incoming.obras?.length)          ? incoming.obras          : base.obras,
    centrosTrabajo: (incoming.centrosTrabajo?.length) ? incoming.centrosTrabajo : base.centrosTrabajo,
    employees:      inc.some(e => e.isAdmin)          ? inc                     : [...inc, adm],
    records:        incoming.records        || [],
    vacaciones:     incoming.vacaciones     || [],
    medicos:        incoming.medicos        || [],
    ausencias:      incoming.ausencias      || [],
    mensajes:       incoming.mensajes       || [],
    notis:          incoming.notis          || [],
    cierres:        incoming.cierres        || [],
    monthSnapshots: incoming.monthSnapshots || {},
    firmas:         incoming.firmas         || {},
    documentos:     incoming.documentos     || [],
    _ts:            incoming._ts            || 0
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
let _saveRetry  = 0
let _saveTimer  = null

export function cloudPush(db, onSuccess, onError) {
  if (!supabase) { onError?.(); return }
  if (_pushFlight) return
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
      onSuccess?.(payload)
    })
    .catch(() => {
      _pushFlight = false
      onError?.()
      if (_saveRetry < 5) {
        _saveRetry++
        setTimeout(() => cloudPush(db, onSuccess, onError), 600 * _saveRetry)
      }
    })
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
      { event: 'UPDATE', schema: 'public', table: TABLE, filter: `id=eq.${ROW_ID}` },
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
export async function pushSubscribe(userId, vapidPub) {
  if (!supabase) return
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return
    const reg = await navigator.serviceWorker.ready
    const b64ToUint8 = b => {
      const p = '='.repeat((4 - b.length % 4) % 4)
      const s = atob((b + p).replace(/-/g, '+').replace(/_/g, '/'))
      return Uint8Array.from([...s].map(c => c.charCodeAt(0)))
    }
    const buf2b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
    const sub = await reg.pushManager.getSubscription() ||
      await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapidPub) })
    const key = sub.getKey('p256dh'), auth = sub.getKey('auth')
    await supabase.from(PUSH_TABLE).upsert({
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: buf2b64(key),
      auth: buf2b64(auth),
      updated_at: new Date().toISOString()
    })
  } catch(e) { console.warn('[PUSH]', e) }
}

export function sendPushNotif(userId, title, body, tag = 'times') {
  fetch('/api/sendpush', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, title, body, tag })
  }).catch(() => {})
}

export function auditLog(action, detail, empId, db) {
  try {
    const entry = {
      id: Date.now().toString(36),
      action, detail, empId,
      ts: new Date().toISOString(),
      user: empId || 'system'
    }
    const notis = [...(db.notis || []), entry]
    return { ...db, notis }
  } catch { return db }
}
