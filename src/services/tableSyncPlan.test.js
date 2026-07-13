import { describe, expect, it } from 'vitest'
import { buildTableSyncPlan, toRecordRow, toVacationRow } from './tableSyncPlan.js'

describe('plan de sincronización offline V2', () => {
  const now = Date.parse('2026-07-13T12:00:00.000Z')

  it('sube fichajes abiertos y modificaciones recientes, pero no históricos fríos', () => {
    const plan = buildTableSyncPlan({
      employees: [{ id: 'e1', name: 'Ana' }],
      records: [
        { id: 'open', empId: 'e1', inicio: '2026-07-01T08:00:00Z', _upd: '2026-07-01T08:00:00Z' },
        { id: 'recent', empId: 'e1', inicio: '2026-07-10T08:00:00Z', fin: '2026-07-10T16:00:00Z', _upd: '2026-07-13T11:00:00Z' },
        { id: 'cold', empId: 'e1', inicio: '2026-05-01T08:00:00Z', fin: '2026-05-01T16:00:00Z', _upd: '2026-05-01T16:00:00Z' },
      ],
    }, null, now)
    const rows = plan.upserts.find(op => op.table === 'records').rows
    expect(rows.map(row => row.id)).toEqual(['open', 'recent'])
  })

  it('no vuelve a insertar elementos eliminados y conserva sus tombstones', () => {
    const plan = buildTableSyncPlan({
      records: [{ id: 'r1', empId: 'e1', inicio: '2026-07-13T08:00:00Z' }],
      vacaciones: [{ id: 'v1', empId: 'e1', fechaInicio: '2026-08-01', fechaFin: '2026-08-02' }],
    }, { records: ['r1'], vacaciones: ['v1'], employees: ['e2'] }, now)
    expect(plan.upserts.find(op => op.table === 'records').rows).toHaveLength(0)
    expect(plan.upserts.find(op => op.table === 'vacaciones').rows).toHaveLength(0)
    expect(plan.deletes).toEqual([
      { table: 'records', ids: ['r1'], mode: 'delete' },
      { table: 'vacaciones', ids: ['v1'], mode: 'delete' },
      { table: 'employees', ids: ['e2'], mode: 'deactivate' },
    ])
  })

  it('mantiene _upd en fichajes y vacaciones para resolver concurrencia', () => {
    expect(toRecordRow({ id: 'r1', empId: 'e1', inicio: '2026-07-13T08:00:00Z', _upd: '2026-07-13T09:00:00Z' }, 'fallback').updated_at)
      .toBe('2026-07-13T09:00:00Z')
    expect(toVacationRow({ id: 'v1', empId: 'e1', _upd: '2026-07-13T10:00:00Z' }, 'fallback').updated_at)
      .toBe('2026-07-13T10:00:00Z')
  })

  it('una vacación legacy sin fecha no bloquea las filas válidas', () => {
    const plan = buildTableSyncPlan({
      employees: [{ id: 'e1', name: 'Ana' }],
      vacaciones: [
        { id: 'legacy', empId: 'e1', fechaInicio: null, fechaFin: null },
        { id: 'ok', empId: 'e1', fechaInicio: '2026-08-01', fechaFin: '2026-08-03' },
      ],
    }, null, now)

    expect(plan.upserts.find(op => op.table === 'vacaciones').rows.map(row => row.id)).toEqual(['ok'])
    expect(plan.skipped.vacaciones).toBe(1)
  })

  it('omite hijos huérfanos para que una FK antigua no atasque la cola PWA', () => {
    const plan = buildTableSyncPlan({
      employees: [{ id: 'e1', name: 'Ana' }],
      records: [
        { id: 'ok', empId: 'e1', inicio: '2026-07-13T08:00:00Z' },
        { id: 'orphan', empId: 'deleted', inicio: '2026-07-13T08:00:00Z' },
      ],
      cierres: [{ id: 'c1', empId: 'deleted', mes: '2026-06' }],
    }, null, now)

    expect(plan.upserts.find(op => op.table === 'records').rows.map(row => row.id)).toEqual(['ok'])
    expect(plan.upserts.find(op => op.table === 'cierres').rows).toHaveLength(0)
    expect(plan.skipped.records).toBe(1)
    expect(plan.skipped.cierres).toBe(1)
  })
})
