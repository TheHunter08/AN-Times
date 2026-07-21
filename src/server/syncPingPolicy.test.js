import { describe, expect, it } from 'vitest'
import { isSyncCandidate } from './syncPingPolicy.js'

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
