export function normalizeAccountEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function isValidAccountEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeAccountEmail(value))
}

export function getRegistrationEligibility(employees, email) {
  const normalizedEmail = normalizeAccountEmail(email)
  if (!isValidAccountEmail(normalizedEmail)) return { ok: false, reason: 'missing_email' }

  const employee = (employees || []).find((item) =>
    !item?.baja && normalizeAccountEmail(item?.email) === normalizedEmail
  )
  if (!employee) return { ok: false, reason: 'not_registered' }
  if (employee.authId || employee.auth_id) {
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
