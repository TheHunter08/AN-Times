import { describe, expect, it } from 'vitest'
import { isOfficialAuthMethod, isOfficialSessionAuthorized } from './sessionAuthorization.js'

const db = {
  employees: [
    { id:'e1', authId:'auth-1' },
    { id:'e2', auth_id:'auth-2' },
    { id:'e3', authId:'auth-3', baja:true },
  ],
  config: { adminEmails:['Admin@Example.com'] },
}

describe('isOfficialSessionAuthorized', () => {
  it('deja fuera del guard las sesiones PIN y biométricas', () => {
    expect(isOfficialAuthMethod('pin')).toBe(false)
    expect(isOfficialSessionAuthorized({ authMethod:'pin', user:{ id:'e1' } }, null, db)).toBe(true)
  })

  it('exige que el auth_id oficial coincida con el empleado local', () => {
    const appSession = { authMethod:'email', user:{ id:'e1' } }
    expect(isOfficialSessionAuthorized(appSession, { user:{ id:'auth-1' } }, db)).toBe(true)
    expect(isOfficialSessionAuthorized(appSession, { user:{ id:'auth-other' } }, db)).toBe(false)
    expect(isOfficialSessionAuthorized({ authMethod:'oauth', user:{ id:'e3' } }, { user:{ id:'auth-3' } }, db)).toBe(false)
  })

  it('revoca una sesión de empleado si la vinculación desaparece', () => {
    expect(isOfficialSessionAuthorized(
      { authMethod:'email', user:{ id:'missing' } },
      { user:{ id:'auth-1' } },
      db,
    )).toBe(false)
  })

  it('autoriza al administrador solo mientras su correo siga configurado', () => {
    const appSession = { authMethod:'oauth', user:null, isAdmin:true }
    expect(isOfficialSessionAuthorized(appSession, { user:{ id:'admin-id', email:'admin@example.com' } }, db)).toBe(true)
    expect(isOfficialSessionAuthorized(appSession, { user:{ id:'admin-id', email:'retirado@example.com' } }, db)).toBe(false)
  })
})
