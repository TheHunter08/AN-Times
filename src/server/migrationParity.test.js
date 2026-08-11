import { describe, expect, it } from 'vitest'
import { buildExpectedMigrationEntries, buildMigrationCheckpoint, evaluateMigrationParity, migrationCheckpointDay } from './migrationParity.js'

describe('migrationParity', () => {
  const db = {
    employees:[{ id:'e1', _upd:'2026-08-06T10:00:00Z' }],
    records:[{ id:'r1', _upd:'2026-08-06T10:00:00Z' }],
    mensajes:[{ id:'m1', _upd:'2026-08-06T10:00:00Z' }],
    config:{ companyName:'Times' },
  }

  it('incluye tablas dedicadas, entidades y singleton', () => {
    expect(buildExpectedMigrationEntries(db)).toEqual(expect.arrayContaining([
      expect.objectContaining({ table:'employees', id:'e1' }),
      expect.objectContaining({ table:'records', id:'r1' }),
      expect.objectContaining({ table:'app_entities', id:'mensajes:m1' }),
      expect.objectContaining({ table:'app_entities', id:'config:__singleton__' }),
    ]))
  })

  it('acepta un superset sin pérdida y detecta faltantes u obsoletos', () => {
    const rows = {
      employees:[{ id:'e1', updated_at:'2026-08-06T10:00:01Z' }],
      records:[{ id:'r1', updated_at:'2026-08-06T10:00:01Z' }, { id:'extra', updated_at:'2026-08-06T10:00:01Z' }],
      app_entities:[
        { id:'mensajes:m1', updated_at:'2026-08-06T10:00:01Z' },
        { id:'config:__singleton__', updated_at:'2026-08-06T10:00:01Z' },
      ],
    }
    expect(evaluateMigrationParity(db, rows)).toMatchObject({ consistent:true, missingCount:0, staleCount:0, extraCount:1 })
    rows.records[0].updated_at = '2026-08-06T09:00:00Z'
    rows.app_entities = rows.app_entities.filter(row => row.id !== 'mensajes:m1')
    expect(evaluateMigrationParity(db, rows)).toMatchObject({ consistent:false, missingCount:1, staleCount:1 })
  })

  it('solo incrementa una vez por día y reinicia ante drift', () => {
    const first = buildMigrationCheckpoint({}, { consistent:true, mismatchCount:0 }, '2026-08-06T04:00:00Z')
    const repeated = buildMigrationCheckpoint(first, { consistent:true, mismatchCount:0 }, '2026-08-06T18:00:00Z')
    const nextDay = buildMigrationCheckpoint(repeated, { consistent:true, mismatchCount:0 }, '2026-08-07T04:00:00Z')
    expect(repeated.consecutiveConsistentChecks).toBe(1)
    expect(nextDay.consecutiveConsistentChecks).toBe(2)
    expect(buildMigrationCheckpoint(nextDay, { consistent:false, mismatchCount:1 }, '2026-08-08T04:00:00Z')).toMatchObject({ startedAt:null, consecutiveConsistentChecks:0 })
  })
  it('cuenta los días operativos en Europe/Madrid y no por fecha UTC', () => {
    const previous = buildMigrationCheckpoint({}, { consistent:true, mismatchCount:0 }, '2026-08-11T21:42:00Z')
    const afterMidnightMadrid = buildMigrationCheckpoint(previous, { consistent:true, mismatchCount:0 }, '2026-08-11T22:45:00Z')
    const sameMadridDayAfterUtcMidnight = buildMigrationCheckpoint(afterMidnightMadrid, { consistent:true, mismatchCount:0 }, '2026-08-12T01:00:00Z')

    expect(migrationCheckpointDay(previous.lastCheckAt)).toBe('2026-08-11')
    expect(migrationCheckpointDay(afterMidnightMadrid.lastCheckAt)).toBe('2026-08-12')
    expect(afterMidnightMadrid.consecutiveConsistentChecks).toBe(2)
    expect(afterMidnightMadrid.lastCountedDay).toBe('2026-08-12')
    expect(sameMadridDayAfterUtcMidnight.consecutiveConsistentChecks).toBe(2)
  })
})
