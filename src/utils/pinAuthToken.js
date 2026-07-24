// Token de sesión Supabase para logins por PIN — ver api/pin-login.js.
// El login por PIN nunca pasa por Supabase Auth, así que esos empleados no
// tienen auth.uid(). Tras verificar el PIN localmente, LoginV2.tsx pide aquí
// un JWT real (firmado en el servidor con el Legacy JWT Secret) para que las
// políticas RLS de policies_auth.sql puedan reconocerlos cuando se activen.
// Mientras RLS siga sin activar (anon_all permisivo), esto no cambia ningún
// comportamiento visible — solo deja la sesión lista para cuando se active.
const STORAGE_KEY = 'an_times_pin_jwt'

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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt, empId })) } catch {}
}

export function clearPinToken() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
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
