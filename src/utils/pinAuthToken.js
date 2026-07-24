// Token de sesión Supabase para logins por PIN — ver api/pin-login.js.
// El login por PIN nunca pasa por Supabase Auth, así que esos empleados no
// tienen auth.uid(). Tras verificar el PIN localmente, LoginV2.tsx pide aquí
// un JWT real (firmado en el servidor con el Legacy JWT Secret) para que las
// políticas RLS de policies_auth.sql puedan reconocerlos cuando se activen.
// Mientras RLS siga sin activar (anon_all permisivo), esto no cambia ningún
// comportamiento visible — solo deja la sesión lista para cuando se active.
const STORAGE_KEY = 'an_times_pin_jwt'

// Mismos _IDB_NAME/_IDB_STORE que dataService.js y sw.js — un Service Worker
// no puede leer localStorage, así que el token se guarda también aquí para
// que la sincronización en segundo plano (ver sw.js _restHeaders) tenga
// acceso a la misma identidad que el hilo principal. Se duplican los
// helpers de IndexedDB en vez de importarlos (mismo patrón ya usado entre
// dataService.js y sw.js — un Service Worker no puede importar módulos que
// toquen el DOM/localStorage).
const _IDB_NAME = 'times-inc-sync'
const _IDB_STORE = 'q'
const _IDB_KEY = 'pin_auth_token'

function _idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(_IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(_IDB_STORE)
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}
async function _idbSet(value) {
  const db = await _idbOpen()
  return new Promise((res, rej) => {
    const tx = db.transaction(_IDB_STORE, 'readwrite')
    tx.objectStore(_IDB_STORE).put(value, _IDB_KEY)
    tx.oncomplete = res
    tx.onerror = () => rej(tx.error)
  })
}
async function _idbDel() {
  const db = await _idbOpen()
  return new Promise((res, rej) => {
    const tx = db.transaction(_IDB_STORE, 'readwrite')
    tx.objectStore(_IDB_STORE).delete(_IDB_KEY)
    tx.oncomplete = res
    tx.onerror = () => rej(tx.error)
  })
}

export function getStoredPinToken() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.token || !parsed?.expiresAt) return null
    // Margen de 60s: evita usar un token que caduca a mitad de una petición
    // en vuelo por una pequeña diferencia de reloj entre cliente y servidor.
    if (Date.now() >= parsed.expiresAt - 60_000) return null
    return parsed
  } catch { return null }
}

export function storePinToken({ token, expiresAt, empId }) {
  const value = { token, expiresAt, empId }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) } catch {}
  // No bloquea: IndexedDB puede fallar (Safari privado, cuota…) sin que eso
  // impida que el login termine — sw.js simplemente seguirá usando la clave
  // anon si este mirror no llegó a escribirse.
  _idbSet(value).catch(() => {})
}

export function clearPinToken() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
  _idbDel().catch(() => {})
}

// Pide un token nuevo a /api/pin-login. Falla en silencio (devuelve null) si
// el endpoint no está disponible (aún no desplegado, offline, dev local sin
// funciones serverless…) — el login por PIN sigue funcionando exactamente
// igual que antes con la clave anon; esto es puramente aditivo.
export async function requestPinToken(empId, pin) {
  try {
    const res = await fetch('/api/pin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empId, pin }),
    })
    if (!res.ok) {
      // Vite no ejecuta /api en dev — un 404 local es esperado, no un fallo real.
      if (!(import.meta.env.DEV && res.status === 404)) {
        console.warn('[pinAuthToken] /api/pin-login respondió', res.status)
      }
      return null
    }
    const data = await res.json().catch(() => null)
    if (!data?.token || !data?.expiresAt) return null
    storePinToken({ token: data.token, expiresAt: data.expiresAt, empId })
    return data.token
  } catch (e) {
    console.warn('[pinAuthToken] no se pudo obtener token:', e.message)
    return null
  }
}
