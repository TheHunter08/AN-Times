import { describe, expect, it } from 'vitest'
import { planAuthIdentityLinks } from './authIdentityReconciliation.js'

describe('reconciliación de identidades Auth', () => {
  it('vincula solo una coincidencia única de correo', () => {
    const result = planAuthIdentityLinks(
      [{ id:'e1', email:' ANA@example.com ' }],
      [{ id:'auth-1', email:'ana@example.com', user_metadata:{ employeeId:'e1' } }],
    )
    expect(result).toEqual({
      candidates:[{ employeeId:'e1', authId:'auth-1' }],
      conflicts:[],
    })
  })

  it('bloquea correos duplicados e identidades ya vinculadas', () => {
    const result = planAuthIdentityLinks(
      [
        { id:'e1', email:'shared@example.com' },
        { id:'e2', email:'shared@example.com' },
        { id:'e3', email:'used@example.com' },
        { id:'owner', email:'owner@example.com', auth_id:'auth-used' },
      ],
      [
        { id:'auth-shared', email:'shared@example.com' },
        { id:'auth-used', email:'used@example.com' },
      ],
    )
    expect(result.candidates).toEqual([])
    expect(result.conflicts).toEqual(expect.arrayContaining([
      { employeeId:'e1', reason:'email_duplicado' },
      { employeeId:'e2', reason:'email_duplicado' },
      { employeeId:'e3', reason:'identidad_ya_vinculada' },
    ]))
  })

  it('no vincula una cuenta cuyo metadata pertenece a otro empleado', () => {
    const result = planAuthIdentityLinks(
      [{ id:'e1', email:'ana@example.com' }],
      [{ id:'auth-1', email:'ana@example.com', user_metadata:{ employee_id:'e2' } }],
    )
    expect(result.candidates).toEqual([])
    expect(result.conflicts).toEqual([{ employeeId:'e1', reason:'metadata_incompatible' }])
  })
})
