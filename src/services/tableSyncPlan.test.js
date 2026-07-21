import { describe, expect, it } from 'vitest'
import { buildTableSyncPlan, entityRowId, toClosureRow, toEmployeeRow, toEntityRows, toRecordRow, toVacationRow } from './tableSyncPlan.js'

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
    }, { records: ['r1'], vacaciones: ['v1'], cierres: ['c1'], obras: ['o1'], employees: ['e2'] }, now)
    expect(plan.upserts.find(op => op.table === 'records').rows).toHaveLength(0)
    expect(plan.upserts.find(op => op.table === 'vacaciones').rows).toHaveLength(0)
    expect(plan.deletes).toEqual([
      { table: 'records', ids: ['r1'], mode: 'soft_delete' },
      { table: 'vacaciones', ids: ['v1'], mode: 'soft_delete' },
      { table: 'employees', ids: ['e2'], mode: 'deactivate' },
      { table: 'cierres', ids: ['c1'], mode: 'soft_delete' },
      { table: 'obras', ids: ['o1'], mode: 'soft_delete' },
      { table: 'app_entities', ids: [], mode: 'soft_delete' },
    ])
  })

  it('descompone colecciones legacy en entidades granulares y ajustes singleton', () => {
    const rows = toEntityRows({
      gastos: [{ id:'g1', concepto:'Taxi', _upd:'2026-07-13T10:00:00Z' }],
      documentos: [{ id:'d1', titulo:'Contrato' }],
      config: { wdMin:480 },
    }, '2026-07-13T12:00:00Z')
    expect(rows.map(row => row.id)).toEqual(['documentos:d1', 'gastos:g1', 'config:__singleton__'])
    expect(rows.find(row => row.id === 'gastos:g1').updated_at).toBe('2026-07-13T10:00:00Z')
    expect(rows.find(row => row.id === 'config:__singleton__').data).toEqual({ wdMin:480 })
  })

  it('crea tombstones de entidades con ids deterministas', () => {
    const plan = buildTableSyncPlan({}, { gastos:['g1'], documentos:['d1'] }, now)
    const entityDelete = plan.deletes.find(op => op.table === 'app_entities')
    expect(entityDelete.ids).toEqual([entityRowId('documentos','d1'), entityRowId('gastos','g1')])
  })

  it('persiste revisión, operación id y metadatos del cierre en records', () => {
    const source = { id:'r1', empId:'e1', inicio:'2026-07-13T08:00:00Z', _rev:3, operationId:'11111111-1111-4111-8111-111111111111', validado:true, cierreManual:true, cerradoPor:'Ana', motivoCierre:'Olvido', campoLegacy:'preservado' }
    const row = toRecordRow(source)
    expect(row).toMatchObject({ revision:3, operation_id:'11111111-1111-4111-8111-111111111111', validado:true, cierre_manual:true, cerrado_por:'Ana', motivo_cierre:'Olvido' })
    expect(row.data).toEqual(source)
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

  it('persiste auth_id al vincular un empleado a su sesión de Supabase Auth', () => {
    const row = toEmployeeRow({ id: 'e1', name: 'Ana', authId: '11111111-1111-4111-8111-111111111111' })
    expect(row.auth_id).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('no rompe empleados sin auth_id vinculado', () => {
    expect(toEmployeeRow({ id: 'e1', name: 'Ana' }).auth_id).toBeNull()
  })

  it('conserva integrityHash del cierre dentro de data para la verificación pública', () => {
    const row = toClosureRow({ id: 'c1', empId: 'e1', mes: '2026-06', integrityHash: 'abc123' })
    expect(row.data.integrityHash).toBe('abc123')
  })

  it('no convierte una firma administrativa falsa en el texto firmado "false"', () => {
    expect(toClosureRow({ id:'pending', empId:'e1', mes:'2026-07', firmaAdmin:false }).firma_admin).toBeNull()
    expect(toClosureRow({ id:'signed', empId:'e1', mes:'2026-06', firmaAdmin:true }).firma_admin).toBe('true')
  })

  it('limita una mutación de fichaje a su fila y no reenvía las demás tablas', () => {
    const plan = buildTableSyncPlan({
      employees: [{ id: 'e1', name: 'Ana' }],
      records: [
        { id: 'changed', empId: 'e1', inicio: '2026-07-13T08:00:00Z', _upd: '2026-07-13T11:00:00Z' },
        { id: 'unchanged', empId: 'e1', inicio: '2026-07-13T08:00:00Z', _upd: '2026-07-13T11:00:00Z' },
      ],
      vacaciones: [{ id: 'v1', empId: 'e1', fechaInicio: '2026-08-01' }],
      gastos: [{ id: 'g1', concepto: 'Taxi' }],
    }, null, now, { changedKeys: ['records'], recordIds: ['changed'] })

    expect(plan.upserts.find(op => op.table === 'records').rows.map(row => row.id)).toEqual(['changed'])
    expect(plan.upserts.filter(op => op.table !== 'records').every(op => op.rows.length === 0)).toBe(true)
  })
})
