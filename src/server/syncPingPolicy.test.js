import { describe, expect, it } from 'vitest'
import { getDeviceCoverage, isSyncCandidate } from './syncPingPolicy.js'

describe('selección de dispositivos para sincronización cerrada', () => {
  const now = Date.parse('2026-07-21T18:00:00.000Z')

  it('despierta un dispositivo usado recientemente cuando toca la comprobación', () => {
    expect(isSyncCandidate({ last_online: '2026-07-21T17:58:00Z', last_sync: '2026-07-21T17:55:00Z' }, now)).toBe(true)
  })

  it('no repite el push inmediatamente si acaba de comprobar la cola', () => {
    expect(isSyncCandidate({ last_online: '2026-07-21T17:55:00Z', last_sync: '2026-07-21T17:59:00Z' }, now)).toBe(false)
  })

  it('vuelve a despertar aunque no hubiera heartbeat posterior al último sync', () => {
    expect(isSyncCandidate({ last_online: '2026-07-21T12:00:00Z', last_sync: '2026-07-21T17:50:00Z' }, now)).toBe(true)
  })

  it('usa la fecha de alta si el primer heartbeat todavía no llegó', () => {
    expect(isSyncCandidate({ updated_at: '2026-07-21T17:50:00Z', last_online: null, last_sync: null }, now)).toBe(true)
  })

  it('ignora suscripciones inactivas desde hace más de siete días', () => {
    expect(isSyncCandidate({ last_online: '2026-07-10T17:00:00Z', last_sync: null }, now)).toBe(false)
  })
})

describe('cobertura real de dispositivos', () => {
  const employees = [
    { id: 'admin', role: 'admin', baja: false },
    { id: 'ana', role: 'empleado', baja: false },
    { id: 'jorge', role: 'empleado', baja: false },
    { id: 'antiguo', role: 'empleado', baja: true },
  ]
  const subscriptions = [
    { user_id: '__admin__' },
    { user_id: 'ana' },
    { user_id: 'antiguo' },
  ]

  it('separa esperados, registrados, pendientes y suscripciones huérfanas', () => {
    const coverage = getDeviceCoverage(employees, subscriptions)
    expect(coverage.expectedWorkers).toBe(2)
    expect(coverage.registeredWorkers).toBe(1)
    expect(coverage.missingWorkerIds).toEqual(['jorge'])
    expect(coverage.orphanSubscriptions.map(item => item.user_id)).toEqual(['antiguo'])
    expect(coverage.activeSubscriptions.map(item => item.user_id)).toEqual(['__admin__', 'ana'])
  })
})
