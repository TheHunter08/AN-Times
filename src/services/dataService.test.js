import { describe, it, expect, beforeEach, vi } from 'vitest'
import { auditLog, buildBlobDelta, mergeDB, persistedAuthUserId, recordTombstones, resolveLocalDbStorageKey, resolvePendingStorageKeys, mergePendingDeletes, mergePendingSyncEntries, mergePersistentDeletes, mergeSyncHints, isConnectivityError, withConnectivityRetry, withPhase1RestAuth } from './dataService.js'

const BASE = { empresas: [], employees: [], records: [] }

describe('caché local aislada por Supabase Auth', () => {
  it('no abre ninguna caché segura sin una identidad oficial', () => {
    expect(resolveLocalDbStorageKey({ authenticatedDataPath:true, authUserId:null })).toBeNull()
  })

  it('usa una clave distinta por usuario y conserva la clave legacy fuera de RLS', () => {
    expect(resolveLocalDbStorageKey({ authenticatedDataPath:true, authUserId:'auth-1' })).toBe('an_times_auth_auth-1')
    expect(resolveLocalDbStorageKey({ authenticatedDataPath:false, authUserId:'auth-1' })).toBe('an_times_v1')
  })

  it('separa también la cola offline y no crea una cola segura anónima', () => {
    expect(resolvePendingStorageKeys({ authenticatedDataPath:true, authUserId:null })).toBeNull()
    expect(resolvePendingStorageKeys({ authenticatedDataPath:true, authUserId:'auth-1' })).toEqual({
      idb:'pending:auth-1', fallback:'an_times_pending_sync_auth-1',
    })
    expect(resolvePendingStorageKeys({ authenticatedDataPath:false })).toEqual({
      idb:'pending', fallback:'an_times_pending_sync',
    })
  })

  it('lee el usuario de la sesión persistida sin confiar en la sesión de la app', () => {
    expect(persistedAuthUserId(JSON.stringify({ user:{ id:'auth-2' }, access_token:'x.y.z' }))).toBe('auth-2')
    expect(persistedAuthUserId('{malformado')).toBeNull()
  })
})

describe('isConnectivityError', () => {
  it('trata timeouts y fallos de fetch como problema de conectividad', () => {
    expect(isConnectivityError({ name: 'AbortError' })).toBe(true)
    expect(isConnectivityError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isConnectivityError(null)).toBe(true)
  })

  it('trata un error que sí respondió el servidor (RLS, FK, dato inválido) como error real', () => {
    expect(isConnectivityError({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isConnectivityError({ status: 500, message: 'internal error' })).toBe(false)
  })
})

describe('withConnectivityRetry', () => {
  it('reintenta un fallo de conectividad hasta que tiene éxito', async () => {
    let attempts = 0
    const fn = vi.fn(async () => {
      attempts++
      if (attempts < 3) throw { name: 'AbortError' }
      return 'ok'
    })
    const result = await withConnectivityRetry(fn, { attempts: 3, delaysMs: [0, 0] })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('relanza un error real del servidor sin reintentar', async () => {
    const fn = vi.fn(async () => { throw { code: '23505', message: 'duplicate key' } })
    await expect(withConnectivityRetry(fn, { attempts: 3, delaysMs: [0, 0] })).rejects.toMatchObject({ code: '23505' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('relanza el último error de conectividad tras agotar los reintentos', async () => {
    const fn = vi.fn(async () => { throw { name: 'AbortError' } })
    await expect(withConnectivityRetry(fn, { attempts: 3, delaysMs: [0, 0] })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fn).toHaveBeenCalledTimes(3)
  })
})

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

  it('conserva la evidencia legal al cargar y fusionar el estado local', () => {
    const acknowledgement = { id:'legal-e1-v2', empId:'e1', noticeVersion:'2.0', _upd:'2026-08-11T10:00:00Z' }
    const merged = mergeDB({ ...BASE, legalAcknowledgements:[] }, { legalAcknowledgements:[acknowledgement] })
    expect(merged.legalAcknowledgements).toEqual([acknowledgement])
  })

  it('fusiona una firma incremental sin ocultar las demás', () => {
    const merged = mergeDB({ ...BASE, firmas:{ e1:{ main:{ data:'a' } } } }, {
      _partial:true, firmas:{ e2:{ main:{ data:'b' } } },
    })
    expect(Object.keys(merged.firmas).sort()).toEqual(['e1', 'e2'])
  })

  it('aplica tombstones remotos también a mapas privados', () => {
    const merged = mergeDB({ ...BASE, firmas:{ e1:{}, e2:{} } }, {
      _partial:true, _deleted:{ firmas:['e1'] },
    })
    expect(merged.firmas).toEqual({ e2:{} })
  })
})

// Regresión: si un fetchDB (al reabrir la app) llegaba antes de que el push
// de una firma recién guardada aterrizara en el servidor, mergeDB()
// reemplazaba el objeto `firmas` local entero por el del servidor —
// borrando la firma que el empleado sí tenía guardada localmente y
// disparando de nuevo el paso "Tu firma" del onboarding en cada apertura.
describe('firmas: la firma guardada localmente no debe desaparecer si el servidor aún no la tiene', () => {
  it('una firma local sobrevive a un fetchDB cuyo servidor todavía no la tiene (reproduce el bug si falla)', () => {
    const local = { ...BASE, firmas: { e1: { main: { data: 'data:image/png;base64,firma-local', updatedAt: '2026-07-09T08:00:00.000Z' } } } }
    const merged = mergeDB(local, { firmas: {} })
    expect(merged.firmas.e1?.main?.data).toBe('data:image/png;base64,firma-local')
  })

  it('la firma del servidor para otro empleado se añade sin borrar la firma local existente', () => {
    const local = { ...BASE, firmas: { e1: { main: { data: 'data:image/png;base64,firma-e1' } } } }
    const merged = mergeDB(local, { firmas: { e2: { main: { data: 'data:image/png;base64,firma-e2' } } } })
    expect(merged.firmas.e1?.main?.data).toBe('data:image/png;base64,firma-e1')
    expect(merged.firmas.e2?.main?.data).toBe('data:image/png;base64,firma-e2')
  })

  it('una firma más reciente del servidor para el mismo empleado gana sobre la local', () => {
    const local = { ...BASE, firmas: { e1: { main: { data: 'data:image/png;base64,firma-vieja', updatedAt: '2026-07-09T08:00:00.000Z' } } } }
    const merged = mergeDB(local, { firmas: { e1: { main: { data: 'data:image/png;base64,firma-nueva', updatedAt: '2026-07-10T08:00:00.000Z' } } } })
    expect(merged.firmas.e1?.main?.data).toBe('data:image/png;base64,firma-nueva')
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

  it('un guardado nuevo conserva los tombstones y alcance de una cola anterior', () => {
    const merged = mergePendingSyncEntries({
      payload:{ records:[] },
      deleted:{ records:['r-old'] },
      syncHint:{ changedKeys:['records'], recordIds:['r-old'] },
      revision:10,
    }, {
      payload:{ records:[], vacaciones:[{ id:'v-new' }] },
      deleted:{ vacaciones:['v-old'] },
      syncHint:{ changedKeys:['vacaciones'], entityIds:{ vacaciones:['v-new'] } },
    }, 20)

    expect(merged).toEqual({
      payload:{ records:[], vacaciones:[{ id:'v-new' }] },
      deleted:{ records:['r-old'], vacaciones:['v-old'] },
      syncHint:{
        changedKeys:['records','vacaciones'],
        recordIds:['r-old'],
        entityIds:{ vacaciones:['v-new'] },
      },
      revision:20,
    })
  })

  it('una cola legacy obliga a sincronización completa al recibir otro cambio', () => {
    expect(mergePendingSyncEntries({ payload:{ records:[] }, revision:4 }, {
      payload:{ records:[{ id:'r1' }] },
      syncHint:{ changedKeys:['records'], recordIds:['r1'] },
    }, 5)).toMatchObject({
      payload:{ records:[{ id:'r1' }] },
      syncHint:{ full:true },
      revision:5,
    })
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

describe('withPhase1RestAuth: mantiene PostgREST en el rol anon durante Fase 1', () => {
  const projectRestUrl = 'https://fake.supabase.co/rest/v1/employees'

  it('sustituye un JWT authenticated por la clave anon sin duplicar Authorization', () => {
    const result = withPhase1RestAuth(projectRestUrl, {
      method: 'GET',
      headers: {
        authorization: 'Bearer authenticated.user.jwt',
        apikey: 'public-anon-key',
        'x-client-info': 'supabase-js',
      },
    })

    const authEntries = [...result.headers.entries()].filter(([key]) => key.toLowerCase() === 'authorization')
    expect(authEntries).toHaveLength(1)
    expect(authEntries[0][1]).not.toContain('authenticated.user.jwt')
    expect(result.headers.get('apikey')).not.toBe('public-anon-key')
    expect(result.headers.get('x-client-info')).toBe('supabase-js')
    expect(result.method).toBe('GET')
  })

  it('no toca las peticiones de Auth ni Storage', () => {
    const opts = { headers: { Authorization: 'Bearer authenticated.user.jwt' } }
    expect(withPhase1RestAuth('https://fake.supabase.co/auth/v1/token', opts)).toBe(opts)
    expect(withPhase1RestAuth('https://fake.supabase.co/storage/v1/object/file', opts)).toBe(opts)
  })

  it('no toca peticiones REST de otro origen', () => {
    const opts = { headers: { Authorization: 'Bearer external.jwt' } }
    expect(withPhase1RestAuth('https://example.com/rest/v1/employees', opts)).toBe(opts)
  })
})
