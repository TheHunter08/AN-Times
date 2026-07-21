import { describe, expect, it } from 'vitest'
import { pruneDbRetention } from './dbRetention.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-07-21T12:00:00Z')

describe('pruneDbRetention', () => {
  it('recorta auditoria y devuelve tombstones para limpiar Supabase', () => {
    const audit = Array.from({ length: 320 }, (_, index) => ({
      id:`a${index}`,
      ts:new Date(NOW - (index < 60 ? index / 2 : 45) * DAY).toISOString(),
    }))
    const result = pruneDbRetention({ audit }, NOW)

    expect(result.db.audit).toHaveLength(60)
    expect(result.deleted.audit).toHaveLength(260)
    expect(result.deleted.audit).toContain('a319')
  })

  it('elimina solo notificaciones borradas antiguas', () => {
    const notis = Array.from({ length: 151 }, (_, index) => ({
      id:`n${index}`,
      deleted:index < 2,
      ts:new Date(NOW - (index === 0 ? 10 : 1) * DAY).toISOString(),
    }))
    const result = pruneDbRetention({ notis }, NOW)

    expect(result.db.notis).toHaveLength(150)
    expect(result.deleted).toEqual({ notis:['n0'] })
  })
})
