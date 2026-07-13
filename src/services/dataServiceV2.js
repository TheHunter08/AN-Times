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
} from './dataService.js'

// UUID fijo para la empresa (app single-tenant).
// El script de migración crea una fila en la tabla companies con este id.
const COMPANY_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

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
  }
}

function fromVac(v) {
  return {
    id: v.id, empId: v.emp_id, empName: v.emp_name,
    fechaInicio: v.fecha_inicio, fechaFin: v.fecha_fin,
    tipo: v.tipo ?? 'vacaciones', estado: v.estado ?? 'pendiente',
    motivo: v.motivo ?? null, resolucion: v.resolucion ?? null,
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
    desactualizado: !!c.desactualizado,
  }
}

function fromObra(o) {
  return { id: o.id, nombre: o.nombre, coords: o.coords, radio: o.radio ?? 200, activa: !!o.activa }
}

// ── Mappers App→DB (camelCase → snake_case) ──────────────────────────────────

function toEmployee(e) {
  return {
    id: e.id, company_id: COMPANY_ID, name: e.name,
    email: e.email ?? null, pin_hash: e.pin ?? e.pinHash ?? null,
    pin_len: e.pinLen ?? null,
    role: e.role ?? 'empleado',
    centro_trabajo: e.centroTrabajo ?? null,
    obras_asignadas: e.obrasAsignadas ?? [],
    reminder_time: e.reminderTime ?? '08:30',
    salida_time: e.salidaTime ?? null,
    telefono: e.telefono ?? null, baja: !!e.baja,
    updated_at: new Date().toISOString(),
  }
}

function toRecord(r) {
  return {
    id: r.id, company_id: COMPANY_ID,
    emp_id: r.empId, emp_name: r.empName ?? null,
    inicio: r.inicio, fin: r.fin ?? null, centro: r.centro ?? null,
    work_secs: r.workSecs ?? 0, break_secs: r.breakSecs ?? 0,
    breaks: r.breaks ?? [], closed: !!r.closed, aceptada: !!r.aceptada,
    correcciones: r.correcciones ?? [],
    updated_at: r._upd ?? new Date().toISOString(),
  }
}

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

function toVac(v) {
  return {
    id: v.id, company_id: COMPANY_ID,
    emp_id: v.empId, emp_name: v.empName ?? null,
    fecha_inicio: v.fechaInicio, fecha_fin: v.fechaFin,
    tipo: v.tipo ?? 'vacaciones', estado: v.estado ?? 'pendiente',
    motivo: v.motivo ?? null, resolucion: v.resolucion ?? null,
    updated_at: new Date().toISOString(),
  }
}

function toCierre(c) {
  // firma vive en c.firma (objeto) — serializar a JSON para la columna text
  const firmaVal = c.firma ?? c.firmaEmp ?? null
  return {
    id: c.id, company_id: COMPANY_ID,
    emp_id: c.empId, emp_name: c.empName ?? null, mes: c.mes,
    total_min: c.totalMin ?? 0, extra_min: c.extraMin ?? 0,
    dias: c.dias ?? null,
    estado: c.estado ?? 'pendiente',
    firma_admin: c.firmaAdmin ?? null,
    firma_emp: firmaVal ? JSON.stringify(firmaVal) : null,
    generado_por: c.generadoPor ?? null, generado_at: c.generadoAt ?? null,
    desactualizado: !!c.desactualizado,
    updated_at: new Date().toISOString(),
  }
}

function toObra(o) {
  return {
    id: o.id, company_id: COMPANY_ID, nombre: o.nombre,
    coords: o.coords ?? null, radio: o.radio ?? 200,
    activa: o.activa !== false,
  }
}

const RECORDS_PAGE_SIZE = 1000

// PostgREST limita el tamaño de respuesta. Leer por páginas evita que los
// fichajes históricos desaparezcan silenciosamente al superar 5.000 filas.
async function fetchAllRecords() {
  const rows = []
  for (let from = 0; ; from += RECORDS_PAGE_SIZE) {
    const { data, error } = await supabase.from('records').select('*')
      .eq('company_id', COMPANY_ID)
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
    const [empsR, recsR, vacsR, cierresR, obrasR] = await Promise.all([
      supabase.from('employees').select('*').eq('company_id', COMPANY_ID).order('name'),
      fetchAllRecords(),
      supabase.from('vacaciones').select('*').eq('company_id', COMPANY_ID),
      supabase.from('cierres').select('*').eq('company_id', COMPANY_ID),
      supabase.from('obras').select('*').eq('company_id', COMPANY_ID),
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
        ...blobData,                                         // config, notis, chats, audit del blob
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
  _v1Push(db, deleted, (reconciled) => {
    onSuccess?.(reconciled)
    // Sincronización a tablas: best-effort, no bloquea ni falla el push
    _syncToTables(reconciled ?? db, deleted).catch(e =>
      console.warn('[v2] table sync (non-fatal):', e.message))
  }, onError)
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
  for (const row of rows) {
    const { error: rowErr } = await supabase.from(table).upsert(row, { onConflict: 'id' })
    if (rowErr) console.warn(`[v2] ${table} row ${row.id} upsert failed:`, rowErr.message)
  }
}

// Escribe en las tablas lo que acaba de cambiar en el blob.
// • Empleados y vacaciones: upsert completo (arrays pequeños).
// • Fichajes: solo los abiertos + los cerrados con _upd reciente (48h).
//   Los históricos los tiene la migración inicial y no cambian.
// • Borrados: DELETE directo en tablas.
async function _syncToTables(db, deleted) {
  if (!supabase) return

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const deletedRecords = new Set(deleted?.records ?? [])
  const deletedVacaciones = new Set(deleted?.vacaciones ?? [])
  const upsertOps = []

  if (db.employees?.length) {
    upsertOps.push(_upsertResilient('employees', db.employees.map(toEmployee)))
  }

  // Fichajes recientes (abiertos o modificados en < 48 h)
  const recentRecs = (db.records ?? []).filter(
    r => !deletedRecords.has(r.id) && (!r.fin || !r._upd || r._upd > cutoff)
  )
  if (recentRecs.length) {
    upsertOps.push(_upsertResilient('records', recentRecs.map(toRecord)))
  }

  if (db.vacaciones?.length) {
    const activeVacaciones = db.vacaciones.filter(v => !deletedVacaciones.has(v.id))
    if (activeVacaciones.length) upsertOps.push(_upsertResilient('vacaciones', activeVacaciones.map(toVac)))
  }

  if (db.cierres?.length) {
    upsertOps.push(_upsertResilient('cierres', db.cierres.map(toCierre)))
  }

  if (db.obras?.length) {
    upsertOps.push(_upsertResilient('obras', db.obras.map(toObra)))
  }

  // Borrados físicos: tombstones → DELETE en tablas
  const upsertResults = await Promise.allSettled(upsertOps)
  const upsertFailures = upsertResults.filter(r => r.status === 'rejected' || r.value?.error)
  if (upsertFailures.length) console.warn(`[v2] ${upsertFailures.length}/${upsertOps.length} table upserts failed`)
  const deleteOps = []
  if (deleted?.records?.length) {
    deleteOps.push(supabase.from('records').delete().in('id', deleted.records))
  }
  if (deleted?.vacaciones?.length) {
    deleteOps.push(supabase.from('vacaciones').delete().in('id', deleted.vacaciones))
  }
  // Employees no se borran físicamente: se marcan baja=true
  if (deleted?.employees?.length) {
    deleteOps.push(supabase.from('employees').update({ baja: true }).in('id', deleted.employees))
  }

  if (!deleteOps.length) return
  const results = await Promise.allSettled(deleteOps)
  const failures = results.filter(r => r.status === 'rejected' || r.value?.error)
  if (failures.length) {
    console.warn(`[v2] ${failures.length}/${deleteOps.length} table deletes failed (non-fatal)`)
  }
}

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
