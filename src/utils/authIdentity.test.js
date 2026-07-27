import { describe, expect, it } from 'vitest'
import { canLinkAuthIdentity, linkAuthIdentity, linkEmployeeAuthIdentity, relinkEmployeeAuthIdentity } from './authIdentity.js'

describe('vinculación segura de Supabase Auth', () => {
  it('permite la primera vinculación y añade fecha de actualización', () => {
    expect(linkAuthIdentity({ id:'e1' }, 'auth-1', '2026-07-21T20:00:00.000Z')).toMatchObject({
      id:'e1', authId:'auth-1', _upd:'2026-07-21T20:00:00.000Z',
    })
  })

  it('acepta la misma identidad ya vinculada', () => {
    expect(canLinkAuthIdentity({ id:'e1', authId:'auth-1' }, 'auth-1')).toBe(true)
  })

  it('impide reemplazar una identidad por otra cuenta', () => {
    expect(canLinkAuthIdentity({ id:'e1', authId:'auth-1' }, 'auth-2')).toBe(false)
    expect(linkAuthIdentity({ id:'e1', auth_id:'auth-1' }, 'auth-2')).toBeNull()
  })

  it('vincula sobre la versión más reciente sin pisar cambios concurrentes', () => {
    const result = linkEmployeeAuthIdentity(
      [{ id:'e1', email:'nuevo@empresa.com', telefono:'600123123' }],
      'e1',
      'auth-1',
      '2026-07-27T18:00:00.000Z',
    )
    expect(result).toMatchObject({ ok:true, changed:true })
    expect(result.employee).toMatchObject({
      id:'e1', email:'nuevo@empresa.com', telefono:'600123123',
      authId:'auth-1', _upd:'2026-07-27T18:00:00.000Z',
    })
  })

  it('rechaza una carrera si otra identidad ya ganó la vinculación', () => {
    const employees = [{ id:'e1', authId:'auth-existing' }]
    const result = linkEmployeeAuthIdentity(employees, 'e1', 'auth-attacker')
    expect(result).toMatchObject({ ok:false, changed:false, employees })
  })

  it('impide vincular una identidad que ya pertenece a otro perfil', () => {
    const employees = [
      { id:'e1', authId:'auth-compartida', baja:true },
      { id:'e2', email:'nuevo@empresa.com', baja:false },
    ]
    expect(linkEmployeeAuthIdentity(employees, 'e2', 'auth-compartida')).toMatchObject({
      ok:false,
      changed:false,
      employees,
      reason:'identity_in_use',
    })
  })

  it('recupera una vinculación obsoleta mediante comparación atómica', () => {
    const result = relinkEmployeeAuthIdentity(
      [{ id:'e1', authId:'auth-antigua', email:'empleado@empresa.com' }],
      'e1',
      'auth-antigua',
      'auth-nueva',
      '2026-07-28T00:30:00.000Z',
    )
    expect(result).toMatchObject({ ok:true, changed:true })
    expect(result.employee).toMatchObject({
      id:'e1', authId:'auth-nueva', email:'empleado@empresa.com', _upd:'2026-07-28T00:30:00.000Z',
    })
  })

  it('no recupera si el vínculo cambió durante la verificación o la identidad ya pertenece a otro empleado', () => {
    const employees = [
      { id:'e1', authId:'auth-actual' },
      { id:'e2', authId:'auth-nueva' },
    ]
    expect(relinkEmployeeAuthIdentity(employees, 'e1', 'auth-antigua', 'auth-otra')).toMatchObject({
      ok:false, changed:false, employees,
    })
    expect(relinkEmployeeAuthIdentity(employees, 'e1', 'auth-actual', 'auth-nueva')).toMatchObject({
      ok:false, changed:false, employees,
    })
  })
})
