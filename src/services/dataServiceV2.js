// ╔══════════════════════════════════════════════════════════════════╗
// ║  dataServiceV2 — Capa de datos sobre tablas Supabase reales     ║
// ║                                                                  ║
// ║  Estrategia: dual-write                                          ║
// ║   • cloudFetch  → lee de tablas (fallback a blob si vacías)     ║
// ║   • cloudPush   → escribe en blob (V1) + tablas en background   ║
// ║   • Todo lo demás → re-exportado de dataService.js sin cambios  ║
// ║                                                                  ║
// ║  Para activar: en appStore.js, cambia la línea de import:       ║
// ║    from '../services/dataService.js'                             ║
// ║    →                                                             ║
// ║    from '../services/dataServiceV2.js'                           ║
// ║                                                                  ║
// ║  Requisitos previos:                                             ║
// ║    1. Aplicar supabase/schema.sql en Supabase Dashboard          ║
// ║    2. Aplicar supabase/policies.sql                              ║
// ║    3. POST /api/migrate-to-tables  (una vez)                    ║
// ╚══════════════════════════════════════════════════════════════════╝

// Re-exportar TODO de V1 — solo sobreescribimos cloudFetch y cloudPush
export {
  supabase,
  loadLocal,
  saveLocal,
  mergeDB,
  scheduleSave,
  startRealtime,
  stopRealtime,
  recordTombstones,
  startPresence,
  stopPresence,
  broadcastSync,
  sendHeartbeat,
  _updateLastSync,
  uploadPendingIfAny,
  pushSubscribe,
  queuePush,
  flushPushQueue,
  auditLog,
} from './dataService.js'

import {
  supabase,
  cloudFetch as _v1Fetch,
  cloudFetchTs as _v1FetchTs,
  cloudPush  as _v1Push,
  setPostBlobSyncHandler,
} from './dataService.js'
import {
  COMPANY_ID,
  buildTableSyncPlan,
  ENTITY_COLLECTIONS,
  SINGLETON_COLLECTIONS,
  toEmployeeRow as toEmployee,
  toRecordRow as toRecord,
} from './tableSyncPlan.js'

// ── Mappers DB→App (snake_case → camelCase) ──────────────────────────────────

export function fromEmployee(e) {
  return {
    ...(e.data ?? {}),
    id: e.id, name: e.name, email: e.email ?? null,
    authId: e.auth_id ?? null,
    pin: e.pin_hash ?? null, pinLen: e.pin_len ?? null, role: e.role ?? 'empleado',
    centroTrabajo: e.centro_trabajo ?? null,
    obrasAsignadas: e.obras_asignadas ?? [],
    reminderTime: e.reminder_time ?? '08:30',
    salidaTime: e.salida_time ?? null,
    telefono: e.telefono ?? null, baja: !!e.baja, _upd: e.updated_at,
    isAdmin: e.role === 'admin',
    isEnc:   e.role === 'encargado',
    isJO:    e.role === 'jefe_obra',
  }
}

function fromRecord(r) {
  return {
    ...(r.data ?? {}),
    id: r.id, empId: r.emp_id, empName: r.emp_name,
    inicio: r.inicio, fin: r.fin ?? null, centro: r.centro ?? null,
    workSecs: r.work_secs ?? 0, breakSecs: r.break_secs ?? 0,
    breaks: r.breaks ?? [], closed: !!r.closed, aceptada: !!r.aceptada,
    correcciones: r.correcciones ?? [], _upd: r.updated_at,
    _rev: r.revision ?? 1, operationId: r.operation_id ?? null,
    validado: !!r.validado, rechazado: !!r.rechazado, modificado: !!r.modificado,
    validadoBy: r.validado_by ?? null, validadoAt: r.validado_at ?? null,
    cerradoPor: r.cerrado_por ?? null, cerradoPorId: r.cerrado_por_id ?? null,
    cierreManual: !!r.cierre_manual, motivoCierre: r.motivo_cierre ?? null,
  }
}

function fromVac(v) {
  return {
    ...(v.data ?? {}),
    id: v.id, empId: v.emp_id, empName: v.emp_name,
    fechaInicio: v.fecha_inicio, fechaFin: v.fecha_fin,
    tipo: v.tipo ?? 'vacaciones', estado: v.estado ?? 'pendiente',
    motivo: v.motivo ?? null, resolucion: v.resolucion ?? null,
    _upd: v.updated_at,
  }
}

function fromCierre(c) {
  // firma_emp se guarda como JSON string en la columna text
  const firmaObj = (() => { try { return c.firma_emp ? JSON.parse(c.firma_emp) : null } catch { return null } })()
  // empName, dias, generadoPor y generadoAt no son columnas reales (ver
  // toClosureRow) — se recuperan del blob `data`, ya incluido en el spread;
  // no sobreescribir con `c.emp_name`/`c.dias`/etc, que al no existir la
  // columna siempre serían `undefined` y borrarían el valor bueno del blob.
  return {
    ...(c.data ?? {}),
    id: c.id, empId: c.emp_id, mes: c.mes,
    totalMin: c.total_min ?? 0, extraMin: c.extra_min ?? 0,
    estado: c.estado ?? 'pendiente',
    firma: firmaObj,          // campo canónico que usa la app
    firmaEmp: firmaObj,       // alias usado en algunos filtros
    firmaAdmin: c.firma_admin ?? null,
    desactualizado: !!c.desactualizado, _upd: c.updated_at,
  }
}

function fromObra(o) {
  return { ...(o.data ?? {}), id: o.id, nombre: o.nombre, coords: o.coords, radio: o.radio ?? 200, activa: !!o.activa, _upd: o.updated_at }
}

// ── Mappers App→DB (camelCase → snake_case) ──────────────────────────────────

// Mutaciones críticas de fichajes: el panel de encargado necesita confirmación
// de la tabla antes de mostrar éxito. El push general al blob sigue ejecutándose
// después mediante saveDB, pero realtime ya no puede devolver una fila antigua
// durante esa ventana.
export async function persistRecordRow(record) {
  if (!supabase) return false
  const { error } = await supabase.from('records').upsert(toRecord(record), { onConflict: 'id' })
  if (error) throw error
  return true
}

export async function deleteRecordRow(id) {
  if (!supabase) return false
  const nowIso = new Date().toISOString()
  const { error } = await supabase.from('records')
    .update({ deleted: true, deleted_at: nowIso, updated_at: nowIso })
    .eq('id', id).eq('company_id', COMPANY_ID)
  if (error) throw error
  return true
}

const RECORDS_PAGE_SIZE = 1000

// PostgREST limita el tamaño de respuesta. Leer por páginas evita que los
// fichajes históricos desaparezcan silenciosamente al superar 5.000 filas.
async function fetchAllRecords(sinceIso = null) {
  const rows = []
  for (let from = 0; ; from += RECORDS_PAGE_SIZE) {
    let query = supabase.from('records').select('*')
      .eq('company_id', COMPANY_ID)
      .order('inicio', { ascending: false })
    if (sinceIso) query = query.gt('updated_at', sinceIso)
    const { data, error } = await query.range(from, from + RECORDS_PAGE_SIZE - 1)
    if (error) return { data: rows, error }
    rows.push(...(data || []))
    if (!data || data.length < RECORDS_PAGE_SIZE) return { data: rows, error: null }
  }
}

// ── cloudFetch V2: lee de tablas, cae en V1 si están vacías ──────────────────
// Reloj ligero calculado sobre las tablas. app_data deja de participar en las
// lecturas normales, aunque se mantiene como respaldo durante la fase 2.
export async function cloudFetchTs() {
  if (!supabase) return _v1FetchTs()
  try {
    const { data, error } = await supabase.rpc('get_app_sync_state', { p_company_id: COMPANY_ID })
    if (error) return _v1FetchTs()
    const ts = data ? new Date(data).getTime() : 0
    return { ok: true, ts: Number.isFinite(ts) ? ts : 0 }
  } catch {
    return _v1FetchTs()
  }
}

function noteRemoteDelete(deleted, collection, id) {
  if (!id) return
  if (!deleted[collection]) deleted[collection] = []
  deleted[collection].push(id)
}

// Fase 2: las tablas son la fuente principal de lectura. Cada fila normalizada
// contiene tambien `data`, una copia JSON completa que evita perder metadatos.
export async function cloudFetch(sinceTs = 0) {
  if (!supabase) return _v1Fetch()
  try {
    const isPartial = Number(sinceTs) > 0
    // Solape de un segundo para no perder dos commits dentro del mismo
    // milisegundo al convertir timestamptz a Date de JavaScript.
    const sinceIso = isPartial ? new Date(Math.max(0, Number(sinceTs) - 1000)).toISOString() : null
    const tableQuery = table => {
      let query = supabase.from(table).select('*').eq('company_id', COMPANY_ID)
      if (sinceIso) query = query.gt('updated_at', sinceIso)
      return query
    }
    let employeeQuery = tableQuery('employees')
    if (!isPartial) employeeQuery = employeeQuery.order('name')
    let entitiesQuery = supabase.from('app_entities')
      .select('collection,entity_id,data,revision,deleted,updated_at')
      .eq('company_id', COMPANY_ID)
    if (sinceIso) entitiesQuery = entitiesQuery.gt('updated_at', sinceIso)
    const [empsR, recsR, vacsR, cierresR, obrasR, entitiesR] = await Promise.all([
      employeeQuery,
      fetchAllRecords(sinceIso),
      tableQuery('vacaciones'),
      tableQuery('cierres'),
      tableQuery('obras'),
      entitiesQuery,
    ])
    const responses = [empsR, recsR, vacsR, cierresR, obrasR, entitiesR]
    if (responses.some(result => result.error) || (!isPartial && !empsR.data?.length)) return _v1Fetch()

    const phase2Ready = [empsR.data, recsR.data, vacsR.data, cierresR.data, obrasR.data]
      .every(rows => !rows?.length || Object.prototype.hasOwnProperty.call(rows[0], 'data'))
    if (!phase2Ready) return _v1Fetch()

    const deleted = {}
    const entityData = isPartial
      ? {}
      : Object.fromEntries(ENTITY_COLLECTIONS.map(collection => [collection, []]))
    if (!isPartial) for (const collection of SINGLETON_COLLECTIONS) entityData[collection] = {}

    const grouped = new Map()
    for (const row of (entitiesR.data ?? [])) {
      if (row.deleted) {
        if (ENTITY_COLLECTIONS.includes(row.collection)) noteRemoteDelete(deleted, row.collection, row.entity_id)
        continue
      }
      if (!grouped.has(row.collection)) grouped.set(row.collection, [])
      grouped.get(row.collection).push(row)
    }
    for (const collection of ENTITY_COLLECTIONS) {
      const rows = grouped.get(collection)
      if (!rows && isPartial) continue
      entityData[collection] = (rows ?? []).map(row => ({
        ...row.data,
        _rev: row.revision ?? row.data?._rev,
        _upd: row.updated_at ?? row.data?._upd,
      }))
    }
    for (const collection of SINGLETON_COLLECTIONS) {
      const row = grouped.get(collection)?.find(item => item.entity_id === '__singleton__')
      if (row) entityData[collection] = row.data
    }

    const records = (recsR.data ?? []).filter(row => !row.deleted).map(fromRecord)
    for (const row of (recsR.data ?? [])) if (row.deleted) noteRemoteDelete(deleted, 'records', row.id)
    const vacaciones = (vacsR.data ?? []).filter(row => !row.deleted).map(fromVac)
    for (const row of (vacsR.data ?? [])) if (row.deleted) noteRemoteDelete(deleted, 'vacaciones', row.id)
    const cierres = (cierresR.data ?? []).filter(row => !row.deleted).map(fromCierre)
    for (const row of (cierresR.data ?? [])) if (row.deleted) noteRemoteDelete(deleted, 'cierres', row.id)
    const obras = (obrasR.data ?? []).filter(row => !row.deleted).map(fromObra)
    for (const row of (obrasR.data ?? [])) if (row.deleted) noteRemoteDelete(deleted, 'obras', row.id)

    return {
      ok: true,
      data: {
        ...entityData,
        employees: (empsR.data ?? []).map(fromEmployee),
        records,
        vacaciones,
        cierres,
        obras,
        _deleted: deleted,
        _partial: isPartial,
        _ts: Date.now(),
      },
    }
  } catch (error) {
    console.warn('[v2] table-first fetch failed, fallback V1:', error.message)
    return _v1Fetch()
  }
}

async function cloudFetchLegacy() {
  if (!supabase) return _v1Fetch()
  try {
    const [empsR, recsR, vacsR, cierresR, obrasR, entitiesR] = await Promise.all([
      supabase.from('employees').select('*').eq('company_id', COMPANY_ID).order('name'),
      fetchAllRecords(),
      supabase.from('vacaciones').select('*').eq('company_id', COMPANY_ID),
      supabase.from('cierres').select('*').eq('company_id', COMPANY_ID),
      supabase.from('obras').select('*').eq('company_id', COMPANY_ID),
      supabase.from('app_entities').select('collection,entity_id,data,revision,updated_at').eq('company_id', COMPANY_ID).eq('deleted', false),
    ])

    // Si employees está vacía, las tablas aún no han sido migradas → fallback V1
    if (empsR.error || !empsR.data?.length) {
      if (empsR.error) console.warn('[v2] employees fetch error:', empsR.error.message)
      else             console.warn('[v2] employees table vacía → fallback V1 (ejecuta /api/migrate-to-tables)')
      return _v1Fetch()
    }
    if (recsR.error) {
      console.warn('[v2] records paginated fetch error:', recsR.error.message)
      return _v1Fetch()
    }

    // Config, notis, chats, audit: aún en blob; leemos de V1 para obtenerlos
    const v1 = await _v1Fetch()
    const blobData = v1.data ?? {}
    const entityData = { ...blobData }
    if (!entitiesR.error) {
      const grouped = new Map()
      for (const row of (entitiesR.data ?? [])) {
        if (!grouped.has(row.collection)) grouped.set(row.collection, [])
        grouped.get(row.collection).push(row)
      }
      for (const collection of ENTITY_COLLECTIONS) {
        const rows = grouped.get(collection)
        if (rows?.length) {
          const blobItems = blobData[collection] ?? []
          const blobById = new Map(blobItems.map(item => [String(item?.id), item]))
          const merged = rows.map(row => {
            const tableItem = { ...row.data, _rev:row.revision ?? row.data?._rev, _upd:row.updated_at ?? row.data?._upd }
            const blobItem = blobById.get(String(row.entity_id))
            blobById.delete(String(row.entity_id))
            if (!blobItem) return tableItem
            const blobTs = Date.parse(blobItem._upd || '') || 0
            const tableTs = Date.parse(tableItem._upd || '') || 0
            return blobTs > tableTs ? { ...tableItem, ...blobItem } : { ...blobItem, ...tableItem }
          })
          entityData[collection] = [...merged, ...blobById.values()]
        }
      }
      for (const collection of SINGLETON_COLLECTIONS) {
        const row = grouped.get(collection)?.find(item => item.entity_id === '__singleton__')
        if (row) entityData[collection] = row.data
      }
    }

    const blobEmployeeMap = new Map((blobData.employees ?? []).map(e => [e.id, e]))
    const tableEmployees = (empsR.data ?? []).map(fromEmployee)
    const employees = tableEmployees.map(employee => ({
      ...(blobEmployeeMap.get(employee.id) || {}),
      ...employee,
    }))
    const tableEmployeeIds = new Set(tableEmployees.map(employee => employee.id))
    for (const blobEmployee of (blobData.employees ?? [])) {
      if (!tableEmployeeIds.has(blobEmployee.id)) employees.push(blobEmployee)
    }

    const blobRecordMap = new Map((blobData.records ?? []).map(r => [r.id, r]))
    const tableRecords = (recsR.data ?? []).map(fromRecord)
    // Workflow metadata such as rejected/validated flags still lives in the
    // legacy blob. Keep it when a realtime table snapshot is merged; otherwise
    // a refresh can make an edited row look pending again.
    const records = tableRecords.map(record => {
      const blobRecord = blobRecordMap.get(record.id)
      if (!blobRecord) return record
      const blobTs = Date.parse(blobRecord._upd || '') || 0
      const tableTs = Date.parse(record._upd || '') || 0
      // Si el blob contiene una corrección más reciente que la tabla (ventana
      // entre ambos writes u operación offline), conservar también sus horas.
      const merged = blobTs > tableTs
        ? { ...record, ...blobRecord }
        : { ...blobRecord, ...record }
      for (const key of ['validado', 'rechazado', 'modificado', 'validadoBy', 'validadoAt', 'aceptadaPor', 'aceptadaAt']) {
        if (blobRecord[key] !== undefined) merged[key] = blobRecord[key]
      }
      return merged
    })
    // El blob sigue siendo una escritura primaria. Si una fila aún no alcanzó
    // la tabla (modo offline o fallo aislado de FK), no puede desaparecer al
    // refrescar: se conserva hasta que el sincronizador consiga subirla.
    const tableRecordIds = new Set(tableRecords.map(record => record.id))
    for (const blobRecord of (blobData.records ?? [])) {
      if (!tableRecordIds.has(blobRecord.id)) records.push(blobRecord)
    }

    const blobCierreMap = new Map((blobData.cierres ?? []).map(c => [c.id, c]))
    const tableCierres = (cierresR.data ?? []).map(fromCierre)
    const cierres = tableCierres.map(cierre => ({
      ...(blobCierreMap.get(cierre.id) || {}),
      ...cierre,
    }))
    const tableCierreIds = new Set(tableCierres.map(cierre => cierre.id))
    for (const blobCierre of (blobData.cierres ?? [])) {
      if (!tableCierreIds.has(blobCierre.id)) cierres.push(blobCierre)
    }

    return {
      ok: true,
      data: {
        ...entityData,                                       // granular cuando existe; blob como respaldo
        employees,
        records,
        vacaciones: (vacsR.data   ?? []).map(fromVac),
        cierres,
        obras:      (obrasR.data  ?? []).map(fromObra),
        _ts: Date.now(),
      },
    }
  } catch (e) {
    console.warn('[v2] cloudFetch error, fallback V1:', e.message)
    return _v1Fetch()
  }
}

// ── cloudPush V2: blob (V1) primario + tablas en background ──────────────────
export function cloudPush(db, deleted, onSuccess, onError, syncHint) {
  _v1Push(db, deleted, onSuccess, onError, syncHint)
}

// Filas que Postgres rechazó de forma permanente (22xxx/23xxx — nunca se
// arreglan solas reintentando) se recuerdan aquí entre sincronizaciones.
// Sin esto, cada ciclo de sync las volvía a intentar, las volvía a rechazar
// y las volvía a "poner en cuarentena" para siempre, generando tráfico y
// ruido en consola sin ningún efecto (la fila nunca se sincronizaba de
// todos modos). Se guarda en localStorage, no en el blob, porque es un
// detalle de transporte de este dispositivo, no un dato de negocio.
// Se guarda "id → updated_at" (no solo el id) para que, si la fila cambia
// de verdad más adelante (p.ej. un admin reabre y vuelve a firmar un cierre
// después de fin de mes), deje de coincidir con lo ya intentado y se
// reintente sola — la cuarentena no debe esconder para siempre una
// corrección legítima posterior.
const _QUARANTINE_KEY = 'an_v2_quarantine'
function _loadQuarantine() {
  try { return JSON.parse(localStorage.getItem(_QUARANTINE_KEY) || '{}') } catch { return {} }
}
function _saveQuarantine(map) {
  try { localStorage.setItem(_QUARANTINE_KEY, JSON.stringify(map)) } catch {}
}
function _isQuarantined(table, row) {
  const map = _loadQuarantine()
  return map[`${table}:${row.id}`] === (row.updated_at ?? null)
}
function _addQuarantined(table, rows) {
  if (!rows.length) return
  const map = _loadQuarantine()
  rows.forEach(row => { map[`${table}:${row.id}`] = row.updated_at ?? null })
  _saveQuarantine(map)
}

// Sube un lote de filas a una tabla en un único upsert. Si Postgres rechaza
// el lote (una sola fila con datos inválidos — FK a un empleado borrado,
// constraint violada, etc. — hace fallar el INSERT...ON CONFLICT entero),
// reintenta fila a fila para aislar el problema en vez de perder en
// silencio los cambios de TODAS las demás filas del lote.
async function _upsertResilient(table, rows) {
  const pending = rows.filter(row => !_isQuarantined(table, row))
  if (!pending.length) return
  const { error } = await supabase.from(table).upsert(pending, { onConflict: 'id' })
  if (!error) return
  console.warn(`[v2] batch upsert failed for ${table}, retrying individually:`, error.message)
  const failures = []
  const quarantined = []
  for (const row of pending) {
    const { error: rowErr } = await supabase.from(table).upsert(row, { onConflict: 'id' })
    if (rowErr) {
      // Errores 22xxx/23xxx son datos legacy incompatibles (fecha inválida,
      // NOT NULL, FK, UNIQUE...); 42xxx son de sintaxis/permisos (columna
      // inexistente, RLS denegando la fila — p.ej. si algún día se activa
      // policies_auth.sql y una fila no cumple la política). Ninguno de los
      // tres se arregla reintentando, y mantener la cola PWA bloqueada
      // impide subir incluso fichajes perfectamente válidos. El blob
      // principal conserva la fila para no perder información.
      if (/^(22|23|42)/.test(rowErr.code || '')) {
        quarantined.push(row)
        console.warn(`[v2] ${table} row ${row.id} quarantined:`, rowErr.message)
      } else {
        failures.push(row.id)
        console.warn(`[v2] ${table} row ${row.id} upsert failed:`, rowErr.message)
      }
    }
  }
  if (quarantined.length) _addQuarantined(table, quarantined)
  if (failures.length) throw new Error(`${table}: ${failures.length} filas no sincronizadas`)
  return { quarantined }
}

// Solo se cachea el resultado POSITIVO para siempre (una vez desplegada, la
// tabla no desaparece). Un error puntual (blip de red durante la primera
// comprobación) ya NO se fija en `false` de por vida para el resto de la
// sesión — sin esto, un solo fallo transitorio al arrancar apagaba la
// sincronización de medicos/gastos/denuncias/wellbeing/turnos/chats/config/
// pinLockouts hacia la tabla normalizada durante toda la sesión, sin ningún
// aviso salvo un console.info que nadie ve.
let _entitiesTableAvailable = null
async function hasEntitiesTable() {
  if (_entitiesTableAvailable === true) return true
  const { error } = await supabase.from('app_entities').select('id').limit(1)
  if (!error) { _entitiesTableAvailable = true; return true }
  console.info('[v2] app_entities no disponible (aún no desplegada o error transitorio); se mantiene app_data como respaldo:', error.message)
  return false
}

// Escribe en las tablas lo que acaba de cambiar en el blob.
// • Empleados y vacaciones: upsert completo (arrays pequeños).
// • Fichajes: solo los abiertos + los cerrados con _upd reciente (48h).
//   Los históricos los tiene la migración inicial y no cambian.
// • Borrados: DELETE directo en tablas.
async function _syncToTables(db, deleted, syncHint) {
  if (!supabase) return
  const plan = buildTableSyncPlan(db, deleted, Date.now(), syncHint)
  const entityUpsert = plan.upserts.find(op => op.table === 'app_entities')
  const entityDelete = plan.deletes.find(op => op.table === 'app_entities')
  const entitiesNeeded = !!(entityUpsert?.rows.length || entityDelete?.ids.length)
  const entitiesEnabled = entitiesNeeded ? await hasEntitiesTable() : false
  const skipped = Object.entries(plan.skipped || {}).filter(([, count]) => count > 0)
  if (skipped.length) {
    console.warn('[v2] filas legacy omitidas sin bloquear la sincronización:', Object.fromEntries(skipped))
  }
  // Empleados primero: records/vacaciones/cierres tienen FK hacia esta tabla.
  const employeeBatch = plan.upserts.find(op => op.table === 'employees')
  if (employeeBatch?.rows.length) await _upsertResilient(employeeBatch.table, employeeBatch.rows)
  const upsertOps = plan.upserts
    .filter(op => op.table !== 'employees' && op.rows.length && (op.table !== 'app_entities' || entitiesEnabled))
    .map(op => _upsertResilient(op.table, op.rows))
  const upsertResults = await Promise.allSettled(upsertOps)
  const upsertFailures = upsertResults.filter(r => r.status === 'rejected' || r.value?.error)
  if (upsertFailures.length) throw new Error(`${upsertFailures.length}/${upsertOps.length} grupos de tablas no sincronizados`)
  const deleteOps = plan.deletes.filter(op => op.ids.length && (op.table !== 'app_entities' || entitiesEnabled)).map(op =>
    op.mode === 'deactivate'
      ? supabase.from(op.table).update({ baja: true }).in('id', op.ids)
      : op.mode === 'soft_delete'
        ? supabase.from(op.table).update({ deleted: true, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in('id', op.ids)
      : supabase.from(op.table).delete().in('id', op.ids)
  )

  if (!deleteOps.length) return
  const results = await Promise.allSettled(deleteOps)
  const failures = results.filter(r => r.status === 'rejected' || r.value?.error)
  if (failures.length) throw new Error(`${failures.length}/${deleteOps.length} borrados de tablas no sincronizados`)
}

// Debe registrarse también para uploadPendingIfAny(): una recuperación
// offline no se considera terminada hasta que blob y tablas coinciden.
setPostBlobSyncHandler(_syncToTables)

// ── postgres_changes: aplica directamente las filas recibidas ────────────
// Complementa el canal broadcast con escucha directa en las tablas — cubre
// cambios del cron, la API de migración y escrituras externas que no
// pasen por el broadcast (p.ej. ediciones desde el dashboard de Supabase).
//
// Requisito: las tablas deben estar en la publicación de Realtime:
//   ALTER PUBLICATION supabase_realtime ADD TABLE records;
//   ALTER PUBLICATION supabase_realtime ADD TABLE employees;
// (ver supabase/realtime.sql)
let _tableRealtimeCh = null
let _tableDebounce   = null
let _pendingTableChanges = []

// Realtime already delivers the complete changed row. Converting that payload
// to a mergeDB patch avoids an HTTP download of every table after each event.
export function tableChangeToPatch(table, payload) {
  const eventType = payload?.eventType
  const row = eventType === 'DELETE' ? payload?.old : payload?.new
  if (!row || typeof row !== 'object') return null

  const isDeleted = eventType === 'DELETE' || row.deleted === true
  const deletedPatch = (collection, id) => id == null
    ? null
    : { _partial: true, _deleted: { [collection]: [id] }, _ts: Date.now() }

  if (table === 'app_entities') {
    const collection = row.collection
    const entityId = row.entity_id
    if (!ENTITY_COLLECTIONS.includes(collection) && !SINGLETON_COLLECTIONS.includes(collection)) return null
    if (isDeleted) return SINGLETON_COLLECTIONS.includes(collection) ? null : deletedPatch(collection, entityId)
    if (!row.data || typeof row.data !== 'object') return null
    if (SINGLETON_COLLECTIONS.includes(collection)) {
      return { _partial: true, [collection]: row.data, _ts: Date.now() }
    }
    return {
      _partial: true,
      [collection]: [{ ...row.data, _rev: row.revision ?? row.data?._rev, _upd: row.updated_at ?? row.data?._upd }],
      _ts: Date.now(),
    }
  }

  const definitions = {
    employees: fromEmployee,
    records: fromRecord,
    vacaciones: fromVac,
    cierres: fromCierre,
    obras: fromObra,
  }
  const mapper = definitions[table]
  if (!mapper || row.id == null) return null
  if (isDeleted) return deletedPatch(table, row.id)
  return { _partial: true, [table]: [mapper(row)], _ts: Date.now() }
}

export function startTableRealtime(onRefresh) {
  if (!supabase) return
  stopTableRealtime()
  _tableRealtimeCh = supabase
    .channel('db-table-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records',    filter: `company_id=eq.${COMPANY_ID}` }, payload => _debouncedRefresh(onRefresh, 'records', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'employees',  filter: `company_id=eq.${COMPANY_ID}` }, payload => _debouncedRefresh(onRefresh, 'employees', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vacaciones', filter: `company_id=eq.${COMPANY_ID}` }, payload => _debouncedRefresh(onRefresh, 'vacaciones', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cierres',    filter: `company_id=eq.${COMPANY_ID}` }, payload => _debouncedRefresh(onRefresh, 'cierres', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'obras',      filter: `company_id=eq.${COMPANY_ID}` }, payload => _debouncedRefresh(onRefresh, 'obras', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_entities', filter: `company_id=eq.${COMPANY_ID}` }, payload => _debouncedRefresh(onRefresh, 'app_entities', payload))
    .subscribe()
}

export function stopTableRealtime() {
  if (_tableRealtimeCh) { supabase?.removeChannel(_tableRealtimeCh); _tableRealtimeCh = null }
  clearTimeout(_tableDebounce)
  _pendingTableChanges = []
}

function _debouncedRefresh(fn, table, payload) {
  _pendingTableChanges.push({ table, payload })
  clearTimeout(_tableDebounce)
  // Agrupa la ráfaga de escrituras de un mismo guardado sin añadir un retraso
  // visible al fichaje en los demás dispositivos.
  _tableDebounce = setTimeout(() => {
    const changes = _pendingTableChanges
    _pendingTableChanges = []
    fn?.(changes)
  }, 120)
}
