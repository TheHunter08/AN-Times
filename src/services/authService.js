import { createClient } from '@supabase/supabase-js'
import { SB_URL, SB_ANON } from '../config/constants.js'

const AUTH_FETCH_TIMEOUT_MS = 9000
function authFetch(url, options = {}) {
  if (options.signal) return fetch(url, options)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AUTH_FETCH_TIMEOUT_MS)
  return fetch(url, { ...options, signal:controller.signal }).finally(() => clearTimeout(timer))
}

const AUTH_SINGLETON_KEY = '__times_inc_supabase_auth_v1__'
const projectRef = (() => {
  try { return new URL(SB_URL).hostname.split('.')[0] } catch { return 'times-inc' }
})()
export const AUTH_STORAGE_KEY = `sb-${projectRef}-auth-token`
export const authSupabase = (SB_URL && SB_ANON)
  ? (globalThis[AUTH_SINGLETON_KEY] ||= createClient(SB_URL, SB_ANON, {
      global:{ fetch:authFetch },
      auth:{
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:true,
        // Coincide con la clave por defecto de supabase-js para conservar las
        // sesiones existentes durante la separación de clientes.
        storageKey:AUTH_STORAGE_KEY,
      },
    }))
  : null

const supabase = authSupabase

export const AUTH_ERRORS = {
  'Invalid login credentials':      'Email o contraseña incorrectos. Si aún no vinculaste tu cuenta, usa «Primera vez: vincular mi cuenta».',
  'Email not confirmed':            'Confirma tu email antes de entrar',
  'User not found':                 'No existe cuenta con ese email',
  'Too many requests':              'Demasiados intentos. Espera unos minutos.',
  'Network request failed':         'Sin conexión. Verifica tu internet.',
  'User already registered':        'Ya existe una cuenta con ese email. Entra o recupera la contraseña.',
  'Signups not allowed':             'El alta de cuentas no está disponible. Contacta al administrador.',
  'Password should be at least':     'La contraseña no cumple la longitud mínima.',
  'Auth session missing':            'El enlace de recuperación no es válido o ha caducado. Solicita uno nuevo.',
  'popup_closed_by_user':          null,
  'access_denied':                  null,
}

function mapError(err) {
  const msg = err?.message || ''
  for (const [key, val] of Object.entries(AUTH_ERRORS)) {
    if (msg.toLowerCase().includes(key.toLowerCase())) return val
  }
  return msg || 'Error al iniciar sesión'
}

export async function signInEmail(email, pass) {
  if (!supabase) throw new Error('Sin conexión con el servidor')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass })
  if (error) {
    const mapped = mapError(error)
    throw { code: error.message, message: mapped }
  }
  return data
}

export async function signInGoogle() {
  if (!supabase) throw new Error('Sin conexión con el servidor')
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/?auth=google' }
  })
  if (error) {
    const mapped = mapError(error)
    throw { code: error.message, message: mapped }
  }
}

export async function resetPassword(email) {
  if (!supabase) throw new Error('Sin conexión con el servidor')
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/?reset=1`
  })
  if (error) throw { code: error.message, message: mapError(error) }
}

export async function resendConfirmationEmail(email) {
  if (!supabase) throw new Error('Sin conexión con el servidor')
  const { error } = await supabase.auth.resend({
    type:'signup',
    email,
    options:{ emailRedirectTo:`${window.location.origin}/?auth=confirmed` },
  })
  if (error) throw { code:error.message, message:mapError(error) }
}

export async function updatePassword(newPassword) {
  if (!supabase) throw new Error('Sin conexión con el servidor')
  if (!newPassword || newPassword.length < 8) throw { message: 'La contraseña debe tener al menos 8 caracteres' }
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw { code: error.message, message: mapError(error) }
}

export function clearAuthSessionStorage() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem(`${AUTH_STORAGE_KEY}-code-verifier`)
  } catch {}
}

export async function signOut() {
  try {
    const { error } = await supabase?.auth.signOut() || {}
    if (error) throw error
  } catch {
    // Sin red, Supabase no elimina por sí mismo la sesión persistida. Si se
    // conserva, INITIAL_SESSION puede volver a iniciar sesión justo después
    // de que la aplicación haya mostrado la pantalla de acceso.
  } finally {
    clearAuthSessionStorage()
  }
}

export function isAuthReady() {
  return !!supabase
}

export async function signUpEmail(email, pass) {
  if (!supabase) throw new Error('Sin conexión con el servidor')
  const { data, error } = await supabase.auth.signUp({
    email,
    password: pass,
    options: { emailRedirectTo: `${window.location.origin}/?auth=confirmed` },
  })
  if (error) throw { code: error.message, message: mapError(error) }
  return data
}

export async function getAuthSession() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) return null
  return data?.session || null
}

export function onAuthStateChange(cb) {
  if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } }
  return supabase.auth.onAuthStateChange(cb)
}
