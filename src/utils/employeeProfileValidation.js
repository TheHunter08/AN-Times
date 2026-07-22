import { isValidAccountEmail, normalizeAccountEmail } from './authRegistration.js'

const PIN_PATTERN = /^\d{4,6}$/

export function validateEmployeeProfile(form, employees = [], isEdit = false) {
  const name = String(form?.name || '').trim()
  const email = normalizeAccountEmail(form?.email)
  const pin = String(form?.pin || '')

  if (!name) return { ok: false, error: 'El nombre es obligatorio' }
  if (!isValidAccountEmail(email)) {
    return { ok: false, error: 'Introduce un email válido. Es necesario para crear el acceso seguro.' }
  }

  const duplicate = employees.find((employee) =>
    employee?.id !== form?.id && normalizeAccountEmail(employee?.email) === email
  )
  if (duplicate) {
    return { ok: false, error: `Ese email ya pertenece a ${duplicate.name || 'otro empleado'}.` }
  }

  const existing = isEdit ? employees.find((employee) => employee?.id === form?.id) : null
  const linked = Boolean(existing?.authId || existing?.auth_id)
  if (linked && normalizeAccountEmail(existing?.email) !== email) {
    return { ok: false, error: 'No se puede cambiar el email de una cuenta ya vinculada. Actualízalo primero en Supabase Auth.' }
  }

  if ((!isEdit || pin) && !PIN_PATTERN.test(pin)) {
    return { ok: false, error: 'El PIN debe tener entre 4 y 6 dígitos.' }
  }

  return { ok: true, name, email }
}
