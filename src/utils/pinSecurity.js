// PIN hashing and brute-force protection
// PBKDF2 + random salt via WebCrypto — sin dependencias externas

const MAX_ATTEMPTS  = 5
const LOCKOUT_MS    = 5 * 60 * 1000   // 5 minutos
const PBKDF2_ITER   = 100_000
const SALT_HEX_LEN  = 32              // 16 bytes → 32 hex chars

export const PIN_MAX_ATTEMPTS = MAX_ATTEMPTS

// ── Helpers ───────────────────────────────────────────────────────────────────

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function pbkdf2Derive(pin, saltHex, userId) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(saltHex + userId), iterations: PBKDF2_ITER, hash: 'SHA-256' },
    keyMaterial, 256
  )
  return toHex(bits)
}

// SHA-256(pin:userId) — solo para verificar hashes legacy, NO para crear nuevos
async function legacySha256(pin, userId) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${pin}:${userId}`))
  return toHex(buf)
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Devuelve un hash PBKDF2 con salt aleatorio: "pbkdf2:{salt}:{hash}" */
export async function hashPin(pin, userId) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_HEX_LEN / 2))
  const saltHex = toHex(saltBytes)
  const hash = await pbkdf2Derive(pin, saltHex, userId)
  return `pbkdf2:${saltHex}:${hash}`
}

/** Verdadero si el valor ya es un hash almacenado (PBKDF2 o SHA-256 legacy) */
export function isPinHashed(pin) {
  if (typeof pin !== 'string') return false
  if (pin.startsWith('pbkdf2:')) return true
  return pin.length === 64 && /^[0-9a-f]{64}$/.test(pin)   // legacy SHA-256
}

/** Verdadero si el hash almacenado es legacy y debería migrarse a PBKDF2 */
export function needsRehash(stored) {
  return typeof stored === 'string' && !stored.startsWith('pbkdf2:')
}

/**
 * Compara un PIN en texto plano contra el valor almacenado.
 * Soporta PBKDF2 (nuevo), SHA-256 (legacy) y texto plano (pre-hash).
 */
export async function verifyPin(inputPin, storedPin, userId) {
  if (!storedPin || !inputPin) return false
  if (storedPin.startsWith('pbkdf2:')) {
    const parts = storedPin.split(':')
    if (parts.length !== 3) return false
    const [, salt, storedHash] = parts
    const derived = await pbkdf2Derive(inputPin, salt, userId)
    return derived === storedHash
  }
  if (isPinHashed(storedPin)) {
    // Legacy SHA-256 — verificar y migrar en el sitio de llamada
    return (await legacySha256(inputPin, userId)) === storedPin
  }
  // Texto plano (migración desde versiones muy antiguas)
  return inputPin === storedPin
}

// ── Lockout ───────────────────────────────────────────────────────────────────

/** Estado actual de bloqueo para un empleado */
export function getLockoutState(empId, db) {
  try {
    const lockouts = db?.pinLockouts || {}
    const d = lockouts[empId]
    if (!d) return { locked: false, attempts: 0 }
    if (d.until) {
      const remaining = d.until - Date.now()
      if (remaining > 0) return {
        locked: true,
        lockedUntil: d.until,
        remainingMs: remaining,
        remainingMin: Math.ceil(remaining / 60000),
        remainingSecs: Math.floor(remaining / 1000),
      }
      return { locked: false, attempts: 0, expired: true }
    }
    return { locked: false, attempts: d.attempts || 0 }
  } catch { return { locked: false, attempts: 0 } }
}

/** Registra un intento fallido y devuelve el nuevo estado + lockoutData para guardar */
export function recordFailedAttempt(empId, db) {
  const state = getLockoutState(empId, db)
  if (state.locked) return { state, lockoutData: null }
  const attempts = (state.attempts || 0) + 1
  const lockouts = { ...(db?.pinLockouts || {}) }
  if (attempts >= MAX_ATTEMPTS) {
    lockouts[empId] = { until: Date.now() + LOCKOUT_MS }
    return { state: { locked: true, remainingMin: Math.ceil(LOCKOUT_MS / 60000) }, lockoutData: lockouts }
  }
  lockouts[empId] = { attempts }
  return { state: { locked: false, attempts, remaining: MAX_ATTEMPTS - attempts }, lockoutData: lockouts }
}

/** Limpia el contador de intentos tras login correcto — devuelve lockouts actualizado */
export function clearLockout(empId, db) {
  const lockouts = { ...(db?.pinLockouts || {}) }
  delete lockouts[empId]
  return lockouts
}
