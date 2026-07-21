import { describe, expect, it } from 'vitest'
import { fromEmployee, tableChangeToPatch } from './dataServiceV2.js'

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

describe('parches ligeros de Realtime', () => {
  it('usa directamente la fila de fichaje recibida sin otra descarga', () => {
    const patch = tableChangeToPatch('records', {
      eventType: 'UPDATE',
      new: {
        id:'r1', emp_id:'e1', emp_name:'Ana', inicio:'2026-07-21T08:00:00Z', fin:'2026-07-21T16:00:00Z',
        closed:true, updated_at:'2026-07-21T16:00:01Z', data:{ empName:'Ana' },
      },
    })

    expect(patch._partial).toBe(true)
    expect(patch.records).toHaveLength(1)
    expect(patch.records[0]).toMatchObject({ id:'r1', empId:'e1', empName:'Ana', closed:true })
  })

  it('convierte borrados logicos en tombstones locales', () => {
    const patch = tableChangeToPatch('vacaciones', {
      eventType: 'UPDATE',
      new: { id:'v1', deleted:true },
    })

    expect(patch).toMatchObject({ _partial:true, _deleted:{ vacaciones:['v1'] } })
  })

  it('actualiza colecciones normalizadas de app_entities', () => {
    const patch = tableChangeToPatch('app_entities', {
      eventType: 'INSERT',
      new: { collection:'gastos', entity_id:'g1', revision:3, updated_at:'2026-07-21T10:00:00Z', data:{ id:'g1', total:25 } },
    })

    expect(patch.gastos[0]).toMatchObject({ id:'g1', total:25, _rev:3, _upd:'2026-07-21T10:00:00Z' })
  })
})
