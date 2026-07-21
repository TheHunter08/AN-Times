import { supabase } from './dataService.js'

export const AUTH_ERRORS = {
  'Invalid login credentials':      'Email o contraseña incorrectos',
  'Email not confirmed':            'Confirma tu email antes de entrar',
  'User not found':                 'No existe cuenta con ese email',
  'Too many requests':              'Demasiados intentos. Espera unos minutos.',
  'Network request failed':         'Sin conexión. Verifica tu internet.',
  'User already registered':        'Ya existe una cuenta con ese email. Entra o recupera la contraseña.',
  'Signups not allowed':             'El alta de cuentas no está disponible. Contacta al administrador.',
  'Password should be at least':     'La contraseña no cumple la longitud mínima.',
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

export async function updatePassword(newPassword) {
  if (!supabase) throw new Error('Sin conexión con el servidor')
  if (!newPassword || newPassword.length < 6) throw { message: 'La contraseña debe tener al menos 6 caracteres' }
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw { code: error.message, message: mapError(error) }
}

export async function signOut() {
  try { await supabase?.auth.signOut() } catch {}
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
