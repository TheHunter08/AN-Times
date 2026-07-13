import { describe, it, expect, beforeEach } from 'vitest'
import { mergeDB, recordTombstones, mergePendingDeletes } from './dataService.js'

const BASE = { empresas: [], employees: [], records: [] }

// Regresión: un empleado/encargado borraba una jornada y, si un fetchDB
// (sondeo, realtime, o simplemente reabrir la app) llegaba antes de que el
// push del borrado aterrizara en el servidor, la unión por id de mergeDB()
// la volvía a traer del servidor — el borrado "no se quedaba pegado".
describe('tombstones: borrar una jornada no debe resucitar en el siguiente fetchDB', () => {
  beforeEach(() => { localStorage.clear() })

  it('sin tombstone, un fetchDB que gana la carrera al push del borrado resucita el registro (reproduce el bug)', () => {
    const rec = { id: 'r1', empId: 'e1', empName: 'Juan', inicio: '2026-07-09T08:00:00.000Z', fin: '2026-07-09T16:00:00.000Z' }
    const localAfterDelete = { ...BASE }
    const serverStillHasIt = { records: [rec] }
    const buggy = mergeDB(localAfterDelete, serverStillHasIt)
    expect(buggy.records.some(r => r.id === 'r1')).toBe(true)
  })

  it('con el tombstone registrado, el mismo fetchDB ya no resucita el registro', () => {
    const rec = { id: 'r2', empId: 'e1', empName: 'Juan', inicio: '2026-07-09T08:00:00.000Z', fin: '2026-07-09T16:00:00.000Z' }
    const localAfterDelete = { ...BASE }
    const serverStillHasIt = { records: [rec] }
    recordTombstones({ records: ['r2'] })
    const fixed = mergeDB(localAfterDelete, serverStillHasIt)
    expect(fixed.records.some(r => r.id === 'r2')).toBe(false)
  })

  it('un registro nuevo (no borrado) sigue llegando normalmente', () => {
    const rec = { id: 'r3', empId: 'e2', empName: 'Ana', inicio: '2026-07-09T09:00:00.000Z', fin: '2026-07-09T17:00:00.000Z' }
    const merged = mergeDB({ ...BASE }, { records: [rec] })
    expect(merged.records.some(r => r.id === 'r3')).toBe(true)
  })
})

describe('cola offline', () => {
  it('acumula tombstones de varios guardados sin cobertura', () => {
    expect(mergePendingDeletes(
      { records: ['r1'], vacaciones: ['v1'] },
      { records: ['r2', 'r1'], gastos: ['g1'] },
    )).toEqual({ records: ['r1', 'r2'], vacaciones: ['v1'], gastos: ['g1'] })
  })

  it('no crea grupos vacíos de eliminaciones', () => {
    expect(mergePendingDeletes(null, null)).toBeNull()
  })
})
