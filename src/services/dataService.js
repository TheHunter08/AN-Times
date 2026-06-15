import { DB_URL, FB_BASE, INITIAL_DB, ADMIN_PIN } from '../config/constants.js'

let _pushFlight = false
let _saveRetry = 0
let _saveTimer = null
let _pollInterval = null

export function loadLocal() {
  try {
    const raw = localStorage.getItem('an_times_v1')
    if (raw) {
      const parsed = JSON.parse(raw)
      return mergeDB(INITIAL_DB, parsed)
    }
  } catch {}
  return { ...INITIAL_DB }
}

export function saveLocal(db) {
  try { localStorage.setItem('an_times_v1', JSON.stringify(db)) } catch {}
}

export function mergeDB(base, incoming) {
  if (!incoming) return { ...base }
  const adm = base.employees?.find(e => e.isAdmin) || {
    id: 'admin', name: 'Administrador', empresa: base.empresas[0] || '',
    pin: ADMIN_PIN, color: '#5aa9e6', initials: 'AD',
    startDate: '2024-01-01', email: '', isAdmin: true
  }
  const inc = incoming.employees?.length ? incoming.employees : base.employees
  return {
    empresas:        (incoming.empresas?.length)        ? incoming.empresas        : base.empresas,
    obras:           (incoming.obras?.length)           ? incoming.obras           : base.obras,
    centrosTrabajo:  (incoming.centrosTrabajo?.length)  ? incoming.centrosTrabajo  : base.centrosTrabajo,
    employees:       inc.some(e => e.isAdmin)           ? inc                      : [...inc, adm],
    records:         incoming.records       || [],
    vacaciones:      incoming.vacaciones    || [],
    medicos:         incoming.medicos       || [],
    ausencias:       incoming.ausencias     || [],
    mensajes:        incoming.mensajes      || [],
    notis:           incoming.notis         || [],
    cierres:         incoming.cierres       || [],
    monthSnapshots:  incoming.monthSnapshots|| {},
    firmas:          incoming.firmas        || {},
    _ts:             incoming._ts           || 0
  }
}

export async function cloudFetch() {
  try {
    const r = await fetch(DB_URL + '.json', { cache: 'no-store' })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

export function cloudPush(db, onSuccess, onError) {
  if (_pushFlight) return
  _pushFlight = true
  const payload = { ...db, _ts: Date.now() }
  saveLocal(payload)
  fetch(DB_URL + '.json', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(r => {
      _pushFlight = false
      if (!r.ok) throw new Error('HTTP ' + r.status)
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

export function startPolling(currentDB, onUpdate, interval = 30000) {
  stopPolling()
  _pollInterval = setInterval(async () => {
    const data = await cloudFetch()
    if (!data) return
    const shouldMerge = !currentDB._ts || data._ts > currentDB._ts ||
      (data.employees || []).length !== (currentDB.employees || []).length
    if (shouldMerge) onUpdate?.(data)
  }, interval)
}

export function stopPolling() {
  if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null }
}

export async function pushSubscribe(userId, vapidPub) {
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
    await fetch(FB_BASE + '/pushSubs/' + encodeURIComponent(userId) + '.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: buf2b64(key), auth: buf2b64(auth) } })
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
    fetch(FB_BASE + '/auditLog.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    }).catch(() => {})
    return { ...db, notis }
  } catch { return db }
}
