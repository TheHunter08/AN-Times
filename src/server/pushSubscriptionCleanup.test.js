import { describe, expect, it } from 'vitest'
import { findPushSubscriptionCleanup } from './pushSubscriptionCleanup.js'

describe('findPushSubscriptionCleanup', () => {
  it('no marca nada cuando todo apunta a un empleado activo con endpoint único', () => {
    const employees = [{ id: 'e1', baja: false }]
    const subscriptions = [{ user_id: 'e1', endpoint: 'a', updated_at: '2026-01-01' }]
    expect(findPushSubscriptionCleanup({ employees, subscriptions })).toEqual({ orphaned: [], duplicated: [], removals: [] })
  })

  it('marca como huérfana la suscripción de un empleado que ya no existe', () => {
    const employees = [{ id: 'e1', baja: false }]
    const subscriptions = [
      { user_id: 'e1', endpoint: 'a', updated_at: '2026-01-01' },
      { user_id: 'ghost', endpoint: 'b', updated_at: '2026-01-01' },
    ]
    const result = findPushSubscriptionCleanup({ employees, subscriptions })
    expect(result.orphaned).toEqual([subscriptions[1]])
    expect(result.duplicated).toEqual([])
    expect(result.removals).toEqual([subscriptions[1]])
  })

  it('de un endpoint duplicado conserva la fila del empleado activo', () => {
    const employees = [{ id: 'active', baja: false }, { id: 'baja', baja: true }]
    const subscriptions = [
      { user_id: 'baja', endpoint: 'shared', updated_at: '2026-01-01' },
      { user_id: 'active', endpoint: 'shared', updated_at: '2026-01-02' },
    ]
    const result = findPushSubscriptionCleanup({ employees, subscriptions })
    expect(result.duplicated).toEqual([subscriptions[0]])
  })

  it('entre dos empleados activos con el mismo endpoint, conserva el más reciente', () => {
    const employees = [{ id: 'e1', baja: false }, { id: 'e2', baja: false }]
    const subscriptions = [
      { user_id: 'e1', endpoint: 'shared', updated_at: '2026-01-01' },
      { user_id: 'e2', endpoint: 'shared', updated_at: '2026-01-05' },
    ]
    const result = findPushSubscriptionCleanup({ employees, subscriptions })
    expect(result.duplicated).toEqual([subscriptions[0]])
  })

  it('no cuenta dos veces una fila huérfana que también comparte endpoint con otra huérfana', () => {
    const employees = []
    const subscriptions = [
      { user_id: 'ghost1', endpoint: 'shared', updated_at: '2026-01-01' },
      { user_id: 'ghost2', endpoint: 'shared', updated_at: '2026-01-02' },
    ]
    const result = findPushSubscriptionCleanup({ employees, subscriptions })
    expect(result.orphaned).toEqual(subscriptions)
    expect(result.duplicated).toEqual([])
    expect(result.removals).toHaveLength(2)
  })
})
