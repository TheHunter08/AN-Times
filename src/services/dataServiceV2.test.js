import { describe, expect, it } from 'vitest'
import { fromEmployee } from './dataServiceV2.js'

describe('mapeo de empleados desde tablas V2', () => {
  it('expone la vinculación Auth necesaria para auditar la preparación RLS', () => {
    const employee = fromEmployee({
      id:'e1', name:'Ana', role:'empleado', auth_id:'11111111-1111-4111-8111-111111111111',
      pin_hash:'pbkdf2:salt:hash', pin_len:4, updated_at:'2026-07-16T12:00:00Z',
    })

    expect(employee.authId).toBe('11111111-1111-4111-8111-111111111111')
    expect(employee.pin).toBe('pbkdf2:salt:hash')
  })
})

