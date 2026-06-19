// PIN hashing and brute-force protection
// SHA-256(pin:userId) via WebCrypto — sin dependencias externas

const MAX_ATTEMPTS = 5
const LOCKOUT_MS   = 5 * 60 * 1000   // 5 minutos
const LK_KEY       = (id) => `an_lk_${id}`

export const PIN_MAX_ATTEMPTS = MAX_ATTEMPTS

/** Devuelve SHA-256 de "pin:userId" como hex string (64 chars) */
export async function hashPin(pin, userId) {
  const msg = `${pin}:${userId}`
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** ¿El valor almacenado es ya un hash SHA-256? */
export function isPinHashed(pin) {
  return typeof pin === 'string' && pin.length === 64 && /^[0-9a-f]{64}$/.test(pin)
}

/**
 * Compara un PIN en texto plano contra el valor almacenado.
 * Soporta tanto hashes SHA-256 (nuevos) como texto plano (migración legacy).
 */
export async function verifyPin(inputPin, storedPin, userId) {
  if (!storedPin || !inputPin) return false
  if (isPinHashed(storedPin)) {
    return (await hashPin(inputPin, userId)) === storedPin
  }
  // Fallback legacy: comparación directa (migra en el siguiente save del admin)
  return inputPin === storedPin
}

/** Estado actual de bloqueo para un empleado */
export function getLockoutState(empId) {
  try {
    const raw = localStorage.getItem(LK_KEY(empId))
    if (!raw) return { locked: false, attempts: 0 }
    const d = JSON.parse(raw)
    if (d.until) {
      if (Date.now() < d.until) return { locked: true, remainingMin: Math.ceil((d.until - Date.now()) / 60000) }
      localStorage.removeItem(LK_KEY(empId))
      return { locked: false, attempts: 0 }
    }
    return { locked: false, attempts: d.attempts || 0 }
  } catch { return { locked: false, attempts: 0 } }
}

/** Registra un intento fallido y devuelve el nuevo estado */
export function recordFailedAttempt(empId) {
  try {
    const state = getLockoutState(empId)
    if (state.locked) return state
    const attempts = (state.attempts || 0) + 1
    if (attempts >= MAX_ATTEMPTS) {
      localStorage.setItem(LK_KEY(empId), JSON.stringify({ until: Date.now() + LOCKOUT_MS }))
      return { locked: true, remainingMin: Math.ceil(LOCKOUT_MS / 60000) }
    }
    localStorage.setItem(LK_KEY(empId), JSON.stringify({ attempts }))
    return { locked: false, attempts, remaining: MAX_ATTEMPTS - attempts }
  } catch { return { locked: false, attempts: 0 } }
}

/** Limpia el contador de intentos tras login correcto */
export function clearLockout(empId) {
  try { localStorage.removeItem(LK_KEY(empId)) } catch {}
}
