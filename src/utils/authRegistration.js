import { verifyPin } from './pinSecurity.js'

export function normalizeAccountEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function isValidAccountEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeAccountEmail(value))
}

export function getActiveEmployeesByEmail(employees, email) {
  const normalizedEmail = normalizeAccountEmail(email)
  if (!isValidAccountEmail(normalizedEmail)) return []
  return (employees || []).filter((item) =>
    !item?.baja && normalizeAccountEmail(item?.email) === normalizedEmail
  )
}

export function getRegistrationEligibility(employees, email, options = {}) {
  const normalizedEmail = normalizeAccountEmail(email)
  if (!isValidAccountEmail(normalizedEmail)) return { ok: false, reason: 'missing_email' }

  const matches = getActiveEmployeesByEmail(employees, normalizedEmail)
  if (matches.length > 1) return { ok:false, reason:'duplicate_email', employees:matches }
  const employee = matches[0]
  if (!employee) return { ok: false, reason: 'not_registered' }
  const existingAuthId = employee.authId || employee.auth_id
  if (existingAuthId && options.allowLinkedRecovery) {
    return { ok:true, employee, recovery:true, existingAuthId }
  }
  if (existingAuthId) {
    return { ok: false, reason: 'already_linked', employee }
  }
  return { ok: true, employee }
}

export function validateAccountPassword(password) {
  if (String(password || '').length < 8) {
    return 'La contraseña debe tener al menos 8 caracteres.'
  }
  return ''
}

export async function verifyRegistrationPin(employee, inputPin) {
  if (!employee?.pin) return { ok:false, reason:'employee_without_pin' }
  if (!String(inputPin || '').trim()) return { ok:false, reason:'missing_pin' }
  const ok = await verifyPin(String(inputPin), employee.pin, employee.id)
  return { ok, reason:ok ? null : 'invalid_pin' }
}
