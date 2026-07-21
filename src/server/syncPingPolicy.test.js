import { describe, expect, it } from 'vitest'
import { getDeviceCoverage, isSyncCandidate } from './syncPingPolicy.js'

describe('selección de dispositivos para sincronización cerrada', () => {
  const now = Date.parse('2026-07-21T18:00:00.000Z')

  it('despierta el dispositivo en cuanto su actividad supera la última sincronización', () => {
    expect(isSyncCandidate({ last_online: '2026-07-21T17:58:00Z', last_sync: '2026-07-21T17:57:59Z' }, now)).toBe(true)
  })

  it('no repite el push si ya confirmó una sincronización posterior', () => {
    expect(isSyncCandidate({ last_online: '2026-07-21T17:55:00Z', last_sync: '2026-07-21T17:56:00Z' }, now)).toBe(false)
  })

  it('ignora suscripciones inactivas desde hace más de un día', () => {
    expect(isSyncCandidate({ last_online: '2026-07-19T17:00:00Z', last_sync: null }, now)).toBe(false)
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
