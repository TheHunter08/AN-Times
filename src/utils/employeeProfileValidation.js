import { isValidAccountEmail, normalizeAccountEmail } from './authRegistration.js'

const PIN_PATTERN = /^\d{4,6}$/
const PHONE_PATTERN = /^\+?[\d\s()-]{9,15}$/

export function validateEmployeeProfile(form, employees = [], isEdit = false) {
  const name = String(form?.name || '').trim()
  const email = normalizeAccountEmail(form?.email)
  const pin = String(form?.pin || '')
  const telefono = String(form?.telefono || '').trim()
  const centroTrabajo = String(form?.centroTrabajo || '').trim()

  if (!name) return { ok: false, error: 'El nombre es obligatorio' }
  if (!isValidAccountEmail(email)) {
    return { ok: false, error: 'Introduce un email válido. Es necesario para crear el acceso seguro.' }
  }
  if (telefono && !PHONE_PATTERN.test(telefono)) {
    return { ok: false, error: 'Introduce un teléfono válido (solo dígitos, espacios, +, - o paréntesis).' }
  }
  // Sin centro de trabajo, un encargado nunca puede coincidir con nadie
  // (getScopedEmployees le exige centro Y obra a la vez) y un empleado normal
  // se queda sin ninguna obra que ofrecer al fichar si tampoco tiene
  // obrasAsignadas — por eso pasa a ser obligatorio para todos los perfiles.
  if (!centroTrabajo) {
    return { ok: false, error: 'El centro de trabajo es obligatorio.' }
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
