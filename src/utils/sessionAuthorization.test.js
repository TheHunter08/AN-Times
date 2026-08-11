import { describe, expect, it } from 'vitest'
import { isOfficialAuthMethod, isOfficialSessionAuthorized } from './sessionAuthorization.js'

const db = {
  employees: [
    { id:'e1', authId:'auth-1', role:'empleado' },
    { id:'e2', auth_id:'auth-2', role:'encargado' },
    { id:'e3', authId:'auth-3', baja:true },
    { id:'e-admin', authId:'auth-admin', role:'admin' },
    { id:'e-jo', authId:'auth-jo', role:'jefe_obra' },
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

  it('rechaza el alias administrador heredado aunque el correo siga configurado', () => {
    const legacyAdminSession = { authMethod:'oauth', user:null, isAdmin:true }
    expect(isOfficialSessionAuthorized(
      legacyAdminSession,
      { user:{ id:'admin-id', email:'admin@example.com' } },
      db,
    )).toBe(false)
  })

  it('autoriza admin y jefe de obra solo mediante una ficha enlazada', () => {
    expect(isOfficialSessionAuthorized(
      { authMethod:'email', user:{ id:'e-admin' }, isAdmin:true },
      { user:{ id:'auth-admin', email:'admin@example.com' } },
      db,
    )).toBe(true)
    expect(isOfficialSessionAuthorized(
      { authMethod:'email', user:{ id:'e-jo' }, isAdmin:true, isJO:true },
      { user:{ id:'auth-jo' } },
      db,
    )).toBe(true)
  })

  it('revoca indicadores de privilegio que no correspondan al rol enlazado', () => {
    const authSession = { user:{ id:'auth-1' } }
    expect(isOfficialSessionAuthorized(
      { authMethod:'email', user:{ id:'e1' }, isAdmin:true },
      authSession,
      db,
    )).toBe(false)
    expect(isOfficialSessionAuthorized(
      { authMethod:'email', user:{ id:'e1' }, isEnc:true },
      authSession,
      db,
    )).toBe(false)
    expect(isOfficialSessionAuthorized(
      { authMethod:'email', user:{ id:'e1' }, isJO:true },
      authSession,
      db,
    )).toBe(false)
  })
})
