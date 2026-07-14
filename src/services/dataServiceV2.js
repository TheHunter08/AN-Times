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
  cloudFetchTs,
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

function fromEmployee(e) {
  return {
    id: e.id, name: e.name, email: e.email ?? null,
    pin: e.pin_hash ?? null, pinLen: e.pin_len ?? null, role: e.role ?? 'empleado',
    centroTrabajo: e.centro_trabajo ?? null,
    obrasAsignadas: e.obras_asignadas ?? [],
    reminderTime: e.reminder_time ?? '08:30',
    salidaTime: e.salida_time ?? null,
    telefono: e.telefono ?? null, baja: !!e.baja,
    isAdmin: e.role === 'admin',
    isEnc:   e.role === 'encargado',
    isJO:    e.role === 'jefe_obra',
  }
}

function fromRecord(r) {
  return {
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
  return {
    id: c.id, empId: c.emp_id, empName: c.emp_name ?? null, mes: c.mes,
    totalMin: c.total_min ?? 0, extraMin: c.extra_min ?? 0,
    dias: c.dias ?? null,
    estado: c.estado ?? 'pendiente',
    firma: firmaObj,          // campo canónico que usa la app
    firmaEmp: firmaObj,       // alias usado en algunos filtros
    firmaAdmin: c.firma_admin ?? null,
    generadoPor: c.generado_por ?? null, generadoAt: c.generado_at ?? null,
    desactualizado: !!c.desactualizado, _upd: c.updated_at,
  }
}

function fromObra(o) {
  return { id: o.id, nombre: o.nombre, coords: o.coords, radio: o.radio ?? 200, activa: !!o.activa }
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
  const { error } = await supabase.from('records').delete().eq('id', id).eq('company_id', COMPANY_ID)
  if (error) throw error
  return true
}

const RECORDS_PAGE_SIZE = 1000

// PostgREST limita el tamaño de respuesta. Leer por páginas evita que los
// fichajes históricos desaparezcan silenciosamente al superar 5.000 filas.
async function fetchAllRecords() {
  const rows = []
  for (let from = 0; ; from += RECORDS_PAGE_SIZE) {
    const { data, error } = await supabase.from('records').select('*')
      .eq('company_id', COMPANY_ID)
      .eq('deleted', false)
      .order('inicio', { ascending: false })
      .range(from, from + RECORDS_PAGE_SIZE - 1)
    if (error) return { data: rows, error }
    rows.push(...(data || []))
    if (!data || data.length < RECORDS_PAGE_SIZE) return { data: rows, error: null }
  }
}

// ── cloudFetch V2: lee de tablas, cae en V1 si están vacías ──────────────────
export async function cloudFetch() {
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
export function cloudPush(db, deleted, onSuccess, onError) {
  _v1Push(db, deleted, onSuccess, onError)
}

// Sube un lote de filas a una tabla en un único upsert. Si Postgres rechaza
// el lote (una sola fila con datos inválidos — FK a un empleado borrado,
// constraint violada, etc. — hace fallar el INSERT...ON CONFLICT entero),
// reintenta fila a fila para aislar el problema en vez de perder en
// silencio los cambios de TODAS las demás filas del lote.
async function _upsertResilient(table, rows) {
  if (!rows.length) return
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' })
  if (!error) return
  console.warn(`[v2] batch upsert failed for ${table}, retrying individually:`, error.message)
  const failures = []
  const quarantined = []
  for (const row of rows) {
    const { error: rowErr } = await supabase.from(table).upsert(row, { onConflict: 'id' })
    if (rowErr) {
      // Errores 22xxx/23xxx son datos legacy incompatibles (fecha inválida,
      // NOT NULL, FK, UNIQUE...). Reintentarlos nunca los arreglará y mantener
      // la cola PWA bloqueada impide subir incluso fichajes perfectamente
      // válidos. El blob principal conserva la fila para no perder información.
      if (/^(22|23)/.test(rowErr.code || '')) {
        quarantined.push(row.id)
        console.warn(`[v2] ${table} row ${row.id} quarantined:`, rowErr.message)
      } else {
        failures.push(row.id)
        console.warn(`[v2] ${table} row ${row.id} upsert failed:`, rowErr.message)
      }
    }
  }
  if (failures.length) throw new Error(`${table}: ${failures.length} filas no sincronizadas`)
  return { quarantined }
}

let _entitiesTableAvailable = null
async function hasEntitiesTable() {
  if (_entitiesTableAvailable !== null) return _entitiesTableAvailable
  const { error } = await supabase.from('app_entities').select('id').limit(1)
  _entitiesTableAvailable = !error
  if (error) console.info('[v2] app_entities aún no está desplegada; se mantiene app_data como respaldo')
  return _entitiesTableAvailable
}

// Escribe en las tablas lo que acaba de cambiar en el blob.
// • Empleados y vacaciones: upsert completo (arrays pequeños).
// • Fichajes: solo los abiertos + los cerrados con _upd reciente (48h).
//   Los históricos los tiene la migración inicial y no cambian.
// • Borrados: DELETE directo en tablas.
async function _syncToTables(db, deleted) {
  if (!supabase) return
  const plan = buildTableSyncPlan(db, deleted)
  const entitiesEnabled = await hasEntitiesTable()
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

// ── postgres_changes: detecta cambios en tablas y dispara un re-fetch ────────
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

export function startTableRealtime(onRefresh) {
  if (!supabase) return
  stopTableRealtime()
  _tableRealtimeCh = supabase
    .channel('db-table-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records',    filter: `company_id=eq.${COMPANY_ID}` }, () => _debouncedRefresh(onRefresh))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'employees',  filter: `company_id=eq.${COMPANY_ID}` }, () => _debouncedRefresh(onRefresh))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vacaciones', filter: `company_id=eq.${COMPANY_ID}` }, () => _debouncedRefresh(onRefresh))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cierres',    filter: `company_id=eq.${COMPANY_ID}` }, () => _debouncedRefresh(onRefresh))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'obras',      filter: `company_id=eq.${COMPANY_ID}` }, () => _debouncedRefresh(onRefresh))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_entities', filter: `company_id=eq.${COMPANY_ID}` }, () => _debouncedRefresh(onRefresh))
    .subscribe()
}

export function stopTableRealtime() {
  if (_tableRealtimeCh) { supabase?.removeChannel(_tableRealtimeCh); _tableRealtimeCh = null }
  clearTimeout(_tableDebounce)
}

function _debouncedRefresh(fn) {
  clearTimeout(_tableDebounce)
  _tableDebounce = setTimeout(fn, 1500)
}
