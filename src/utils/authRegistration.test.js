import { describe, expect, it } from 'vitest'
import { getActiveEmployeesByEmail, getRegistrationEligibility, isValidAccountEmail, normalizeAccountEmail, validateAccountPassword, verifyRegistrationPin } from './authRegistration.js'

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

  it('distingue un correo utilizable de un valor incompleto', () => {
    expect(isValidAccountEmail('persona@empresa.com')).toBe(true)
    expect(isValidAccountEmail('persona@empresa')).toBe(false)
  })

  it('rechaza correos desconocidos, empleados de baja y cuentas ya vinculadas', () => {
    expect(getRegistrationEligibility(employees, 'otro@empresa.com').reason).toBe('not_registered')
    expect(getRegistrationEligibility(employees, 'baja@empresa.com').reason).toBe('not_registered')
    expect(getRegistrationEligibility(employees, 'linked@empresa.com').reason).toBe('already_linked')
  })

  it('permite recuperar con PIN una vinculación cuyo usuario Auth fue eliminado', () => {
    expect(getRegistrationEligibility(
      employees,
      'linked@empresa.com',
      { allowLinkedRecovery:true },
    )).toMatchObject({
      ok:true,
      recovery:true,
      existingAuthId:'auth-1',
      employee:{ id:'linked' },
    })
  })

  it('rechaza una identidad ambigua cuando dos empleados comparten correo', () => {
    const duplicated = [
      ...employees,
      { id:'duplicate', email:'persona@empresa.com', baja:false },
    ]
    expect(getActiveEmployeesByEmail(duplicated, 'PERSONA@EMPRESA.COM')).toHaveLength(2)
    expect(getRegistrationEligibility(duplicated, 'persona@empresa.com')).toMatchObject({
      ok:false,
      reason:'duplicate_email',
    })
  })

  it('exige una contraseña de al menos ocho caracteres', () => {
    expect(validateAccountPassword('1234567')).toMatch(/8 caracteres/)
    expect(validateAccountPassword('12345678')).toBe('')
  })
  it('exige el PIN del empleado antes de permitir el alta por correo', async () => {
    await expect(verifyRegistrationPin({ id:'active', pin:'2468' }, '2468')).resolves.toEqual({ ok:true, reason:null })
    await expect(verifyRegistrationPin({ id:'active', pin:'2468' }, '1111')).resolves.toEqual({ ok:false, reason:'invalid_pin' })
    await expect(verifyRegistrationPin({ id:'active' }, '2468')).resolves.toEqual({ ok:false, reason:'employee_without_pin' })
  })
})
