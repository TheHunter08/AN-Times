import { verifyPin } from './pinSecurity.js'

export function normalizeAccountEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function isValidAccountEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeAccountEmail(value))
}

export function isEmployeeOfficialAccountReady(employee) {
  return Boolean(
    employee
    && isValidAccountEmail(employee.email)
    && (employee.authId || employee.auth_id)
    && !employee.authActivationPending
  )
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

export function getEmployeeActivationEligibility(employees, employeeId, email) {
  const normalizedEmail = normalizeAccountEmail(email)
  if (!isValidAccountEmail(normalizedEmail)) return { ok:false, reason:'missing_email' }

  const list = Array.isArray(employees) ? employees : []
  const employee = list.find((item) => item?.id === employeeId && !item?.baja)
  if (!employee) return { ok:false, reason:'employee_not_found' }

  const emailInUse = list.some((item) =>
    item?.id !== employeeId && normalizeAccountEmail(item?.email) === normalizedEmail
  )
  if (emailInUse) return { ok:false, reason:'duplicate_email' }

  return { ok:true, employee, normalizedEmail }
}

export function activateEmployeeOfficialAccount(employees, employeeId, email, authUserId, nowIso = new Date().toISOString(), pendingConfirmation = true) {
  const eligibility = getEmployeeActivationEligibility(employees, employeeId, email)
  const list = Array.isArray(employees) ? employees : []
  if (!eligibility.ok) return { ...eligibility, changed:false, employees:list }
  if (!authUserId) return { ok:false, reason:'missing_auth_user', changed:false, employees:list }

  const identityInUse = list.some((item) =>
    item?.id !== employeeId && (item?.authId || item?.auth_id) === authUserId
  )
  if (identityInUse) return { ok:false, reason:'identity_in_use', changed:false, employees:list }

  const existingAuthId = eligibility.employee.authId || eligibility.employee.auth_id
  if (existingAuthId && existingAuthId !== authUserId) {
    return { ok:false, reason:'already_linked', changed:false, employees:list }
  }

  const index = list.findIndex((item) => item?.id === employeeId)
  const updatedEmployee = {
    ...eligibility.employee,
    email:eligibility.normalizedEmail,
    authId:authUserId,
    authActivationPending:pendingConfirmation,
    _upd:nowIso,
  }
  const changed = normalizeAccountEmail(eligibility.employee.email) !== eligibility.normalizedEmail
    || existingAuthId !== authUserId
    || Boolean(eligibility.employee.authActivationPending) !== pendingConfirmation
  if (!changed) return { ok:true, changed:false, employees:list, employee:eligibility.employee }

  const updated = [...list]
  updated[index] = updatedEmployee
  return { ok:true, changed:true, employees:updated, employee:updatedEmployee }
}

export async function verifyRegistrationPin(employee, inputPin) {
  if (!employee?.pin) return { ok:false, reason:'employee_without_pin' }
  if (!String(inputPin || '').trim()) return { ok:false, reason:'missing_pin' }
  const ok = await verifyPin(String(inputPin), employee.pin, employee.id)
  return { ok, reason:ok ? null : 'invalid_pin' }
}
