import { describe, expect, it } from 'vitest'
import { pruneDbRetention } from './dbRetention.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-07-21T12:00:00Z')

describe('pruneDbRetention', () => {
  it('no elimina auditoría reciente por superar un límite arbitrario de filas', () => {
    const audit = Array.from({ length: 320 }, (_, index) => ({
      id:`a${index}`,
      ts:new Date(NOW - (index < 60 ? index / 2 : 45) * DAY).toISOString(),
    }))
    const result = pruneDbRetention({ audit }, NOW)

    expect(result.db.audit).toHaveLength(320)
    expect(result.deleted).toBeNull()
  })

  it('conserva cuatro años los eventos laborales y un año la auditoría general', () => {
    const filler = Array.from({ length: 301 }, (_, index) => ({ id:`recent-${index}`, ts:new Date(NOW - DAY).toISOString() }))
    const audit = [
      ...filler,
      { id:'general-old', ts:new Date(NOW - 2 * 365 * DAY).toISOString(), category:'sistema' },
      { id:'legal-valid', ts:new Date(NOW - 3 * 365 * DAY).toISOString(), category:'jornada', entityType:'record' },
      { id:'legal-expired', ts:new Date(NOW - 5 * 365 * DAY).toISOString(), category:'documento', entityType:'cierre' },
    ]
    const result = pruneDbRetention({ audit }, NOW)

    expect(result.db.audit.some(item => item.id === 'legal-valid')).toBe(true)
    expect(result.deleted.audit).toEqual(expect.arrayContaining(['general-old', 'legal-expired']))
    expect(result.deleted.audit).not.toContain('legal-valid')
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
