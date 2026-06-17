import { DB_URL, FB_BASE, INITIAL_DB, ADMIN_PIN, FB_CONFIG } from '../config/constants.js'

let _pushFlight = false
let _saveRetry = 0
let _saveTimer = null
let _pollInterval = null
let _authPromise = null

// ─── Auth anónima de Firebase (REST) ───────────────────────────────────────
// Las reglas de la Realtime Database exigen un usuario autenticado para leer/
// escribir. Usamos auth anónima (invisible para el usuario, que sigue
// entrando con su PIN) para que la base de datos no quede abierta a internet.
function readCachedAuth() {
  try { return JSON.parse(localStorage.getItem('an_times_auth') || 'null') } catch { return null }
}
function writeCachedAuth(a) {
  try { localStorage.setItem('an_times_auth', JSON.stringify(a)) } catch {}
}

async function signInAnon() {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FB_CONFIG.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  })
  if (!r.ok) throw new Error('auth signup failed')
  const d = await r.json()
  const auth = { idToken: d.idToken, refreshToken: d.refreshToken, expiresAt: Date.now() + Number(d.expiresIn || 3600) * 1000 }
  writeCachedAuth(auth)
  return auth
}

async function refreshAnon(refreshToken) {
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FB_CONFIG.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
  })
  if (!r.ok) throw new Error('auth refresh failed')
  const d = await r.json()
  const auth = { idToken: d.id_token, refreshToken: d.refresh_token, expiresAt: Date.now() + Number(d.expires_in || 3600) * 1000 }
  writeCachedAuth(auth)
  return auth
}

export async function getAuthToken() {
  if (_authPromise) return _authPromise
  _authPromise = (async () => {
    try {
      const cached = readCachedAuth()
      if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) return cached.idToken
      if (cached?.refreshToken) {
        try { return (await refreshAnon(cached.refreshToken)).idToken } catch {}
      }
      return (await signInAnon()).idToken
    } finally {
      _authPromise = null
    }
  })()
  return _authPromise
}

function withAuth(url, token) {
  return token ? `${url}${url.includes('?') ? '&' : '?'}auth=${token}` : url
}

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
    documentos:      incoming.documentos    || [],
    audit:           incoming.audit         || [],
    _ts:             incoming._ts           || 0
  }
}

export async function cloudFetch() {
  try {
    const token = await getAuthToken()
    const r = await fetch(withAuth(DB_URL + '.json', token), { cache: 'no-store' })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

export async function cloudPush(db, onSuccess, onError) {
  if (_pushFlight) return
  _pushFlight = true
  const payload = { ...db, _ts: Date.now() }
  saveLocal(payload)
  try {
    const token = await getAuthToken()
    const r = await fetch(withAuth(DB_URL + '.json', token), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    _pushFlight = false
    if (!r.ok) throw new Error('HTTP ' + r.status)
    _saveRetry = 0
    onSuccess?.(payload)
  } catch {
    _pushFlight = false
    onError?.()
    if (_saveRetry < 5) {
      _saveRetry++
      setTimeout(() => cloudPush(db, onSuccess, onError), 600 * _saveRetry)
    }
  }
}

export async function cloudPatchPath(path, value) {
  try {
    const token = await getAuthToken()
    const r = await fetch(withAuth(DB_URL + '/' + path + '.json', token), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    })
    return r.ok
  } catch { return false }
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

export function sendPushNotif(userId, title, body, tag = 'times', url = '/') {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, {
        body, tag, icon: '/icon.svg', badge: '/icon.svg',
        data: { url }, vibrate: [100, 50, 100]
      })
      n.onclick = () => { window.focus(); n.close() }
    } catch {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(title, {
            body, tag, icon: '/icon.svg', badge: '/icon.svg',
            data: { url }, vibrate: [100, 50, 100]
          }).catch(() => {})
        }).catch(() => {})
      }
    }
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
