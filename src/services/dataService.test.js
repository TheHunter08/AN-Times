import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { auditLog, buildBlobDelta, mergeDB, recordTombstones, mergePendingDeletes, mergePersistentDeletes, mergeSyncHints, withPinAuthHeader } from './dataService.js'
import { storePinToken, clearPinToken } from '../utils/pinAuthToken.js'

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

  it('un tombstone remoto elimina tambien la copia persistida en IndexedDB', () => {
    const local = { ...BASE, records: [{ id: 'remote-deleted', inicio: '2026-07-09T08:00:00.000Z' }] }
    const merged = mergeDB(local, { records: [], _deleted: { records: ['remote-deleted'] } })
    expect(merged.records).toEqual([])
  })

  it('una notificación borrada no reaparece al recibir una copia antigua del servidor', () => {
    const staleNotification = {
      id: 'noti-deleted-1', empId: 'e1', action: 'Jornada validada', detail: '',
      ts: '2026-07-09T16:00:00.000Z', _upd: '2026-07-09T16:00:00.000Z',
    }
    recordTombstones({ notis: [staleNotification.id] })
    const merged = mergeDB({ ...BASE, notis: [] }, { notis: [staleNotification] })
    expect(merged.notis).toEqual([])
  })

  it('una descarga incremental actualiza filas sin borrar las no modificadas', () => {
    const local = {
      ...BASE,
      employees: [{ id: 'e1', name: 'Ana' }, { id: 'e2', name: 'Luis' }],
      obras: [{ id: 'o1', nombre: 'Norte' }, { id: 'o2', nombre: 'Sur' }],
      monthSnapshots: { '2026-06': { total: 10 } },
    }
    const merged = mergeDB(local, {
      _partial: true,
      employees: [{ id: 'e1', name: 'Ana Maria', _upd: '2026-07-14T20:00:00Z' }],
      obras: [{ id: 'o2', nombre: 'Sur actualizado', _upd: '2026-07-14T20:00:00Z' }],
    })
    expect(merged.employees.find(item => item.id === 'e1').name).toBe('Ana Maria')
    expect(merged.employees.some(item => item.id === 'e2')).toBe(true)
    expect(merged.obras.find(item => item.id === 'o2').nombre).toBe('Sur actualizado')
    expect(merged.obras.some(item => item.id === 'o1')).toBe(true)
    expect(merged.monthSnapshots).toEqual(local.monthSnapshots)
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

  it('acumula el alcance de varios cambios y conserva compatibilidad con colas antiguas', () => {
    expect(mergeSyncHints(
      { changedKeys: ['records'], recordIds: ['r1'], entityIds:{ records:['r1'] } },
      { changedKeys: ['vacaciones', 'records'], recordIds: ['r2'], entityIds:{ records:['r2'], vacaciones:['v1'] } },
    )).toEqual({ changedKeys: ['records', 'vacaciones'], recordIds: ['r1', 'r2'], entityIds:{ records:['r1','r2'], vacaciones:['v1'] } })
    expect(mergeSyncHints({ full: true }, { changedKeys: ['records'], recordIds: ['r3'] })).toEqual({ full: true })
  })

  it('construye un delta mínimo del blob y conserva eliminaciones', () => {
    const delta = buildBlobDelta({
      records:[{ id:'r1', value:'viejo' }, { id:'r2', value:'nuevo' }],
      audit:[{ id:'a1' }, { id:'a2' }],
      config:{ wdMin:480 },
      _deleted:{ notis:['n1'] },
    }, { records:['r0'] }, {
      changedKeys:['records','audit','config'],
      entityIds:{ records:['r2'], audit:['a2'] },
    })
    expect(delta).toEqual({
      patch:{
        records:[{ id:'r2', value:'nuevo' }],
        audit:[{ id:'a2' }],
        config:{ wdMin:480 },
        _deleted:{ notis:['n1'] },
      },
      deleted:{ records:['r0'] },
    })
  })

  it('conserva tombstones remotos para proteger otros dispositivos desactualizados', () => {
    expect(mergePersistentDeletes(
      { records:['r-old'], notis:['n1'] },
      { records:['r-new', 'r-old'] },
    )).toEqual({ records:['r-old', 'r-new'], notis:['n1'] })
  })
})

describe('trazabilidad de modificaciones', () => {
  it('conserva antes, después, motivo y encadena la entrada anterior', () => {
    const first = auditLog({ audit: [] }, 'Fichaje modificado', 'Ana: 08:00–16:00', 'Admin', {
      category: 'jornada', entityType: 'record', entityId: 'r1', reason: 'Corrección solicitada',
      before: { inicio: '08:15' }, after: { inicio: '08:00' },
    })
    const second = auditLog(first, 'Jornada validada', 'Ana', 'Admin', { entityType: 'record', entityId: 'r1' })
    expect(first.audit[0]).toMatchObject({ immutable: true, entityId: 'r1', reason: 'Corrección solicitada', before: { inicio: '08:15' }, after: { inicio: '08:00' } })
    expect(second.audit[1].previousId).toBe(first.audit[0].id)
    expect(second.audit[1]._upd).toBeTruthy()
  })
})

// Regresión: el tick periódico de useTimer sube una copia ABIERTA del registro
// con _upd nuevo. Si otro dispositivo acababa de cerrar esa jornada, la regla
// "el _upd más nuevo gana" la reabría. Como no existe "reabrir jornada" en la
// app, una copia cerrada nunca debe perder contra una abierta del mismo id.
describe('una jornada cerrada nunca pierde contra una copia abierta (tick en vivo)', () => {
  beforeEach(() => { localStorage.clear() })
  const closedRec = {
    id: 'rc1', empId: 'e1', inicio: '2026-07-24T08:00:00.000Z',
    fin: '2026-07-24T16:00:00.000Z', workSecs: 28800, _upd: '2026-07-24T16:00:00.000Z',
  }
  const staleOpenTick = {
    id: 'rc1', empId: 'e1', inicio: '2026-07-24T08:00:00.000Z',
    fin: null, workSecs: 29100, _upd: '2026-07-24T16:05:00.000Z', // _upd MÁS nuevo
  }

  it('la copia abierta con _upd más nuevo no pisa el cierre local (fetch/realtime)', () => {
    const merged = mergeDB({ ...BASE, records: [closedRec] }, { records: [staleOpenTick] })
    const rec = merged.records.find(r => r.id === 'rc1')
    expect(rec.fin).toBe('2026-07-24T16:00:00.000Z')
  })

  it('el cierre remoto sí sustituye a la copia abierta local aunque sea más antiguo', () => {
    const olderClose = { ...closedRec, _upd: '2026-07-24T15:59:00.000Z' }
    const merged = mergeDB({ ...BASE, records: [staleOpenTick] }, { records: [olderClose] })
    const rec = merged.records.find(r => r.id === 'rc1')
    expect(rec.fin).toBe('2026-07-24T16:00:00.000Z')
  })

  it('entre dos copias cerradas sigue ganando la más reciente', () => {
    const newerClose = { ...closedRec, fin: '2026-07-24T16:30:00.000Z', _upd: '2026-07-24T16:30:00.000Z' }
    const merged = mergeDB({ ...BASE, records: [closedRec] }, { records: [newerClose] })
    expect(merged.records.find(r => r.id === 'rc1').fin).toBe('2026-07-24T16:30:00.000Z')
  })
})

describe('withPinAuthHeader: sustituye Authorization solo si hay sesión de PIN vigente', () => {
  beforeEach(() => { localStorage.clear() })

  it('sin token guardado, devuelve las opciones sin tocar', () => {
    const opts = { headers: { apikey: 'anon-key', Authorization: 'Bearer anon-key' } }
    expect(withPinAuthHeader(opts)).toBe(opts)
  })

  it('con un token vigente, sustituye Authorization y conserva el resto de headers', () => {
    storePinToken({ token: 'emp.jwt.token', expiresAt: Date.now() + 3_600_000, empId: 'e1' })
    const opts = { method: 'GET', headers: { apikey: 'anon-key', Authorization: 'Bearer anon-key' } }
    const result = withPinAuthHeader(opts)
    expect(result.headers.Authorization).toBe('Bearer emp.jwt.token')
    expect(result.headers.apikey).toBe('anon-key')
    expect(result.method).toBe('GET')
  })

  it('con un token caducado, no lo aplica (vuelve a usar la clave anon)', () => {
    storePinToken({ token: 'expired.jwt', expiresAt: Date.now() - 1000, empId: 'e1' })
    const opts = { headers: { Authorization: 'Bearer anon-key' } }
    expect(withPinAuthHeader(opts).headers.Authorization).toBe('Bearer anon-key')
  })

  it('funciona igual si headers llega como instancia de Headers (no objeto plano)', () => {
    storePinToken({ token: 'emp.jwt.token', expiresAt: Date.now() + 3_600_000, empId: 'e1' })
    const opts = { headers: new Headers({ apikey: 'anon-key' }) }
    const result = withPinAuthHeader(opts)
    expect(result.headers.Authorization).toBe('Bearer emp.jwt.token')
    expect(result.headers.apikey).toBe('anon-key')
  })

  afterEach(() => clearPinToken())
})
