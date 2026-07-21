import { describe, expect, it } from 'vitest'
import { getRegistrationEligibility, normalizeAccountEmail, validateAccountPassword } from './authRegistration.js'

const employees = [
  { id: 'active', email: ' Persona@Empresa.com ', baja: false },
  { id: 'inactive', email: 'baja@empresa.com', baja: true },
  { id: 'linked', email: 'linked@empresa.com', authId: 'auth-1', baja: false },
]

describe('registro seguro de cuentas', () => {
  it('normaliza el correo antes de compararlo', () => {
    expect(normalizeAccountEmail(' Persona@Empresa.com ')).toBe('persona@empresa.com')
    expect(getRegistrationEligibility(employees, 'persona@empresa.com')).toMatchObject({ ok: true, employee: { id: 'active' } })
  })

  it('rechaza correos desconocidos, empleados de baja y cuentas ya vinculadas', () => {
    expect(getRegistrationEligibility(employees, 'otro@empresa.com').reason).toBe('not_registered')
    expect(getRegistrationEligibility(employees, 'baja@empresa.com').reason).toBe('not_registered')
    expect(getRegistrationEligibility(employees, 'linked@empresa.com').reason).toBe('already_linked')
  })

  it('exige una contraseña de al menos ocho caracteres', () => {
    expect(validateAccountPassword('1234567')).toMatch(/8 caracteres/)
    expect(validateAccountPassword('12345678')).toBe('')
  })
})
