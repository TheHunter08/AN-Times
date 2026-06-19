import { DB_URL, FB_BASE, INITIAL_DB, ADMIN_PIN, FB_CONFIG } from '../config/constants.js'
import { idbSave, idbLoad, idbQueuePush, idbGetPendingPushes, idbClearPendingPushes, migrateFromLocalStorage } from './idbService.js'

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
  // Lectura síncrona desde localStorage para startup sin bloquear
  try {
    const raw = localStorage.getItem('an_times_v1')
    if (raw) return mergeDB(INITIAL_DB, JSON.parse(raw))
  } catch {}
  return { ...INITIAL_DB }
}

export async function loadLocalAsync() {
  // Lectura async desde IndexedDB — más capacidad, sin límite de 5MB
  try {
    const data = await idbLoad()
    if (data) return mergeDB(INITIAL_DB, data)
  } catch {}
  return loadLocal()
}

export function saveLocal(db) {
  // Escribe en localStorage (sync, para lectura rápida) y en IDB (async, sin límite)
  try { localStorage.setItem('an_times_v1', JSON.stringify(db)) } catch {}
  idbSave(db) // fire-and-forget
}

export async function initStorage() {
  // Migra datos de localStorage a IDB en el primer arranque
  await migrateFromLocalStorage(mergeDB, INITIAL_DB)
}

// Vacía la cola offline y empuja cada snapshot pendiente
export async function flushOfflineQueue(onSuccess, onError) {
  const pending = await idbGetPendingPushes()
  if (!pending.length) return
  // El último snapshot tiene el estado más reciente — el resto se pueden descartar
  const latest = pending[pending.length - 1]
  // Borra la cola DESPUÉS de que el push tenga éxito, no antes
  await cloudPush(latest.snapshot, async (pushed) => {
    await idbClearPendingPushes()
    onSuccess?.(pushed)
  }, onError, () => {})
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
    firmas:          incoming.firmas              || {},
    documentos:      incoming.documentos          || [],
    audit:           incoming.audit               || [],
    correccionesFichaje: incoming.correccionesFichaje || [],
    chats:           incoming.chats               || [],
    _ts:             incoming._ts                 || 0
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

// Comprueba _ts primero (~15 bytes) antes de descargar la DB completa.
// Devuelve null (error), 'no-change' (sin cambios), o los datos completos.
export async function cloudFetchSmart(localTS) {
  try {
    const token = await getAuthToken()
    const tsResp = await fetch(withAuth(DB_URL + '/_ts.json', token), { cache: 'no-store' })
    if (!tsResp.ok) return null
    const remoteTS = await tsResp.json()
    if (remoteTS && localTS && remoteTS <= localTS) return 'no-change'
    const r = await fetch(withAuth(DB_URL + '.json', token), { cache: 'no-store' })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

function mergeArraysById(local, remote) {
  const map = new Map()
  ;(remote || []).forEach(item => item?.id && map.set(item.id, item))
  ;(local  || []).forEach(item => item?.id && map.set(item.id, item)) // local wins same id
  return [...map.values()]
}

function mergeStringArrays(local, remote) {
  return [...new Set([...(remote || []), ...(local || [])].filter(Boolean))]
}

function mergeObjects(local, remote) {
  return { ...(remote || {}), ...(local || {}) }
}

function mergeForPush(local, remote) {
  if (!remote) return local
  return {
    ...remote,
    ...local,
    empresas:        mergeStringArrays(local.empresas,       remote.empresas),
    obras:           mergeStringArrays(local.obras,          remote.obras),
    centrosTrabajo:  mergeStringArrays(local.centrosTrabajo, remote.centrosTrabajo),
    employees:       mergeArraysById(local.employees,        remote.employees),
    records:         mergeArraysById(local.records,          remote.records),
    vacaciones:      mergeArraysById(local.vacaciones,       remote.vacaciones),
    medicos:         mergeArraysById(local.medicos,          remote.medicos),
    ausencias:       mergeArraysById(local.ausencias,        remote.ausencias),
    mensajes:        mergeArraysById(local.mensajes,         remote.mensajes),
    notis:           mergeArraysById(local.notis,            remote.notis),
    cierres:         mergeArraysById(local.cierres,          remote.cierres),
    chats:           mergeArraysById(local.chats,            remote.chats),
    correccionesFichaje: mergeArraysById(local.correccionesFichaje, remote.correccionesFichaje),
    documentos:      mergeArraysById(local.documentos,       remote.documentos),
    audit:           mergeArraysById(local.audit,            remote.audit),
    firmas:          mergeObjects(local.firmas,              remote.firmas),
    monthSnapshots:  mergeObjects(local.monthSnapshots,      remote.monthSnapshots),
  }
}

export async function cloudPush(db, onSuccess, onError, onFinalError) {
  if (_pushFlight) return
  _pushFlight = true
  try {
    const token = await getAuthToken()
    // Optimistic locking: check remote _ts first to detect concurrent edits
    let localBase = db
    try {
      const tsResp = await fetch(withAuth(DB_URL + '/_ts.json', token), { cache: 'no-store' })
      if (tsResp.ok) {
        const remoteTS = await tsResp.json()
        if (remoteTS && db._ts && remoteTS > db._ts) {
          const remoteResp = await fetch(withAuth(DB_URL + '.json', token), { cache: 'no-store' })
          if (remoteResp.ok) {
            const remote = await remoteResp.json()
            if (remote) localBase = mergeForPush(db, remote)
          }
        }
      }
    } catch {}
    const payload = { ...localBase, _ts: Date.now() }
    saveLocal(payload)
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
      setTimeout(() => cloudPush(loadLocal(), onSuccess, onError, onFinalError), 600 * _saveRetry)
    } else {
      _saveRetry = 0
      // Sin conexión definitiva: encolar en IDB para reintentar cuando vuelva la red
      idbQueuePush(loadLocal())
      onFinalError?.()
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
    const token = await getAuthToken()
    await fetch(withAuth(FB_BASE + '/pushSubs/' + encodeURIComponent(userId) + '.json', token), {
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

export async function queuePush(to, title, body, tag = 'times', url = '/') {
  try {
    const token = await getAuthToken()
    const entry = { userId: to, title, body, tag, url, ts: Date.now() }
    await fetch(withAuth(FB_BASE + '/pushQueue.json', token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    })
  } catch {}
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
