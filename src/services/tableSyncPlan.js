export const COMPANY_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
// 'denuncias' NO está aquí a propósito — tiene tabla y RPCs propios
// (submit_denuncia/track_denuncia, ver migration-2026-07-18-denuncias-
// privadas.sql) precisamente para que no se sincronice en bloque a todos
// los clientes como el resto de estas colecciones.
export const ENTITY_COLLECTIONS = ['medicos','ausencias','mensajes','notis','documentos','audit','correccionesFichaje','chats','gastos','wellbeing','turnos','partesTrabajo']
export const SINGLETON_COLLECTIONS = ['empresas','centrosTrabajo','monthSnapshots','firmas','anomalias_vistas','notisSent','pinLockouts','config']

export function entityRowId(collection, entityId) {
  return `${collection}:${entityId}`
}

export function toEntityRows(db, nowIso = new Date().toISOString()) {
  const rows = []
  for (const collection of ENTITY_COLLECTIONS) {
    for (const item of (db[collection] ?? [])) {
      if (!item || !hasValue(String(item.id ?? ''))) continue
      const entityId = String(item.id)
      rows.push({ id:entityRowId(collection, entityId), company_id:COMPANY_ID, collection, entity_id:entityId, data:item, revision:Math.max(1, Number(item._rev) || 1), deleted:false, updated_at:item._upd ?? nowIso })
    }
  }
  for (const collection of SINGLETON_COLLECTIONS) {
    if (db[collection] === undefined) continue
    rows.push({ id:entityRowId(collection, '__singleton__'), company_id:COMPANY_ID, collection, entity_id:'__singleton__', data:db[collection], revision:1, deleted:false, updated_at:nowIso })
  }
  return rows
}

export function toEmployeeRow(e, nowIso = new Date().toISOString()) {
  return {
    id: e.id, company_id: COMPANY_ID, name: e.name,
    email: e.email ?? null, pin_hash: e.pin ?? e.pinHash ?? null,
    pin_len: e.pinLen ?? null, role: e.role ?? 'empleado',
    centro_trabajo: e.centroTrabajo ?? null,
    obras_asignadas: e.obrasAsignadas ?? [],
    reminder_time: e.reminderTime ?? '08:30', salida_time: e.salidaTime ?? null,
    telefono: e.telefono ?? null, baja: !!e.baja,
    auth_id: e.authId ?? e.auth_id ?? null,
    data: e, updated_at: e._upd ?? nowIso,
  }
}

export function toRecordRow(r, nowIso = new Date().toISOString()) {
  return {
    id: r.id, company_id: COMPANY_ID, emp_id: r.empId, emp_name: r.empName ?? null,
    inicio: r.inicio, fin: r.fin ?? null, centro: r.centro ?? null,
    work_secs: r.workSecs ?? 0, break_secs: r.breakSecs ?? 0,
    breaks: r.breaks ?? [], closed: !!r.closed, aceptada: !!r.aceptada,
    correcciones: r.correcciones ?? [], updated_at: r._upd ?? nowIso,
    revision: Math.max(1, Number(r._rev) || 1), operation_id: r.operationId ?? null,
    validado: !!r.validado, rechazado: !!r.rechazado, modificado: !!r.modificado,
    validado_by: r.validadoBy ?? null, validado_at: r.validadoAt ?? null,
    cerrado_por: r.cerradoPor ?? null, cerrado_por_id: r.cerradoPorId ?? null,
    cierre_manual: !!r.cierreManual, motivo_cierre: r.motivoCierre ?? null,
    data: r, deleted: false, deleted_at: null,
  }
}

export function toVacationRow(v, nowIso = new Date().toISOString()) {
  const fechaInicio = v.fechaInicio ?? v.desde
  const fechaFin = v.fechaFin ?? v.hasta ?? fechaInicio
  return {
    id: v.id, company_id: COMPANY_ID, emp_id: v.empId, emp_name: v.empName ?? null,
    fecha_inicio: fechaInicio, fecha_fin: fechaFin,
    tipo: v.tipo ?? 'vacaciones', estado: v.estado ?? 'pendiente',
    motivo: v.motivo ?? null, resolucion: v.resolucion ?? null,
    data: v, deleted: false, deleted_at: null, updated_at: v._upd ?? nowIso,
  }
}

export function toClosureRow(c, nowIso = new Date().toISOString()) {
  const firmaVal = c.firma ?? c.firmaEmp ?? null
  // emp_name, dias, generado_por y generado_at NO son columnas reales de
  // `cierres` (solo existen id, company_id, emp_id, mes, total_min, extra_min,
  // estado, firma_admin, firma_emp, desactualizado, data, deleted*, updated_at
  // — ver supabase/schema.sql). Enviarlas como columnas sueltas hacía fallar
  // CADA upsert con "columna desconocida" (PGRST204, fuera del rango 22xxx/
  // 23xxx que el cliente sabe poner en cuarentena, así que se reintentaba sin
  // éxito en cada sincronización). Quedan preservadas igualmente dentro de
  // `data: c`, que ya se guarda completo.
  return {
    id: c.id, company_id: COMPANY_ID, emp_id: c.empId,
    mes: c.mes, total_min: c.totalMin ?? 0, extra_min: c.extraMin ?? 0,
    estado: c.estado ?? 'pendiente',
    firma_admin: c.firmaAdmin ?? null,
    firma_emp: firmaVal ? JSON.stringify(firmaVal) : null,
    desactualizado: !!c.desactualizado, data: c, deleted: false, deleted_at: null,
    updated_at: c._upd ?? nowIso,
  }
}

export function toWorksiteRow(o, nowIso = new Date().toISOString()) {
  return {
    id: o.id, company_id: COMPANY_ID, nombre: o.nombre,
    coords: o.coords ?? null, radio: o.radio ?? 200, activa: o.activa !== false,
    data: o, deleted: false, deleted_at: null, updated_at: o._upd ?? nowIso,
  }
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isDateValue(value) {
  return hasValue(value) && !Number.isNaN(Date.parse(value))
}

export function buildTableSyncPlan(db, deleted, now = Date.now()) {
  const nowIso = new Date(now).toISOString()
  const cutoff = new Date(now - 48 * 60 * 60 * 1000).toISOString()
  const deletedRecords = new Set(deleted?.records ?? [])
  const deletedVacations = new Set(deleted?.vacaciones ?? [])
  const deletedClosures = new Set(deleted?.cierres ?? [])
  const deletedWorksites = new Set(deleted?.obras ?? [])
  const employees = (db.employees ?? []).filter(e => hasValue(e?.id) && hasValue(e?.name))
  const employeeIds = new Set(employees.map(e => e.id))
  const recentRecords = (db.records ?? []).filter(
    r => !deletedRecords.has(r.id) && hasValue(r?.id) && employeeIds.has(r?.empId) && isDateValue(r?.inicio) && (!r.fin || !r._upd || r._upd > cutoff)
  )
  // El blob legacy puede contener solicitudes antiguas incompletas. La tabla
  // normalizada aplica constraints más estrictas; esas filas se conservan en
  // el blob, pero no deben bloquear la sincronización de todos los fichajes.
  const vacations = (db.vacaciones ?? []).filter(v =>
    !deletedVacations.has(v?.id) &&
    hasValue(v?.id) &&
    employeeIds.has(v?.empId) &&
    isDateValue(v?.fechaInicio ?? v?.desde)
  )
  const closures = (db.cierres ?? []).filter(c =>
    !deletedClosures.has(c?.id) && hasValue(c?.id) && employeeIds.has(c?.empId) && hasValue(c?.mes)
  )
  const worksites = (db.obras ?? []).filter(o => !deletedWorksites.has(o?.id) && hasValue(o?.id) && hasValue(o?.nombre))

  return {
    upserts: [
      { table: 'employees', rows: employees.map(e => toEmployeeRow(e, nowIso)) },
      { table: 'records', rows: recentRecords.map(r => toRecordRow(r, nowIso)) },
      { table: 'vacaciones', rows: vacations.map(v => toVacationRow(v, nowIso)) },
      { table: 'cierres', rows: closures.map(c => toClosureRow(c, nowIso)) },
      { table: 'obras', rows: worksites.map(o => toWorksiteRow(o, nowIso)) },
      { table: 'app_entities', rows: toEntityRows(db, nowIso) },
    ],
    skipped: {
      employees: (db.employees ?? []).length - employees.length,
      records: (db.records ?? []).filter(r => !deletedRecords.has(r?.id) && (!r?.fin || !r?._upd || r._upd > cutoff)).length - recentRecords.length,
      vacaciones: (db.vacaciones ?? []).filter(v => !deletedVacations.has(v?.id)).length - vacations.length,
      cierres: (db.cierres ?? []).length - closures.length,
      obras: (db.obras ?? []).length - worksites.length,
    },
    deletes: [
      { table: 'records', ids: [...deletedRecords], mode: 'soft_delete' },
      { table: 'vacaciones', ids: [...deletedVacations], mode: 'soft_delete' },
      { table: 'employees', ids: [...new Set(deleted?.employees ?? [])], mode: 'deactivate' },
      { table: 'cierres', ids: [...deletedClosures], mode: 'soft_delete' },
      { table: 'obras', ids: [...deletedWorksites], mode: 'soft_delete' },
      { table: 'app_entities', ids: ENTITY_COLLECTIONS.flatMap(collection => [...new Set(deleted?.[collection] ?? [])].map(id => entityRowId(collection, id))), mode: 'soft_delete' },
    ],
  }
}
