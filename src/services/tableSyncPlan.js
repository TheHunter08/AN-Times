export const COMPANY_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

export function toEmployeeRow(e, nowIso = new Date().toISOString()) {
  return {
    id: e.id, company_id: COMPANY_ID, name: e.name,
    email: e.email ?? null, pin_hash: e.pin ?? e.pinHash ?? null,
    pin_len: e.pinLen ?? null, role: e.role ?? 'empleado',
    centro_trabajo: e.centroTrabajo ?? null,
    obras_asignadas: e.obrasAsignadas ?? [],
    reminder_time: e.reminderTime ?? '08:30', salida_time: e.salidaTime ?? null,
    telefono: e.telefono ?? null, baja: !!e.baja, updated_at: nowIso,
  }
}

export function toRecordRow(r, nowIso = new Date().toISOString()) {
  return {
    id: r.id, company_id: COMPANY_ID, emp_id: r.empId, emp_name: r.empName ?? null,
    inicio: r.inicio, fin: r.fin ?? null, centro: r.centro ?? null,
    work_secs: r.workSecs ?? 0, break_secs: r.breakSecs ?? 0,
    breaks: r.breaks ?? [], closed: !!r.closed, aceptada: !!r.aceptada,
    correcciones: r.correcciones ?? [], updated_at: r._upd ?? nowIso,
  }
}

export function toVacationRow(v, nowIso = new Date().toISOString()) {
  return {
    id: v.id, company_id: COMPANY_ID, emp_id: v.empId, emp_name: v.empName ?? null,
    fecha_inicio: v.fechaInicio, fecha_fin: v.fechaFin,
    tipo: v.tipo ?? 'vacaciones', estado: v.estado ?? 'pendiente',
    motivo: v.motivo ?? null, resolucion: v.resolucion ?? null,
    updated_at: v._upd ?? nowIso,
  }
}

export function toClosureRow(c, nowIso = new Date().toISOString()) {
  const firmaVal = c.firma ?? c.firmaEmp ?? null
  return {
    id: c.id, company_id: COMPANY_ID, emp_id: c.empId, emp_name: c.empName ?? null,
    mes: c.mes, total_min: c.totalMin ?? 0, extra_min: c.extraMin ?? 0,
    dias: c.dias ?? null, estado: c.estado ?? 'pendiente',
    firma_admin: c.firmaAdmin ?? null,
    firma_emp: firmaVal ? JSON.stringify(firmaVal) : null,
    generado_por: c.generadoPor ?? null, generado_at: c.generadoAt ?? null,
    desactualizado: !!c.desactualizado, updated_at: c._upd ?? nowIso,
  }
}

export function toWorksiteRow(o) {
  return {
    id: o.id, company_id: COMPANY_ID, nombre: o.nombre,
    coords: o.coords ?? null, radio: o.radio ?? 200, activa: o.activa !== false,
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
    isDateValue(v?.fechaInicio)
  )
  const closures = (db.cierres ?? []).filter(c =>
    hasValue(c?.id) && employeeIds.has(c?.empId) && hasValue(c?.mes)
  )
  const worksites = (db.obras ?? []).filter(o => hasValue(o?.id) && hasValue(o?.nombre))

  return {
    upserts: [
      { table: 'employees', rows: employees.map(e => toEmployeeRow(e, nowIso)) },
      { table: 'records', rows: recentRecords.map(r => toRecordRow(r, nowIso)) },
      { table: 'vacaciones', rows: vacations.map(v => toVacationRow(v, nowIso)) },
      { table: 'cierres', rows: closures.map(c => toClosureRow(c, nowIso)) },
      { table: 'obras', rows: worksites.map(toWorksiteRow) },
    ],
    skipped: {
      employees: (db.employees ?? []).length - employees.length,
      records: (db.records ?? []).filter(r => !deletedRecords.has(r?.id) && (!r?.fin || !r?._upd || r._upd > cutoff)).length - recentRecords.length,
      vacaciones: (db.vacaciones ?? []).filter(v => !deletedVacations.has(v?.id)).length - vacations.length,
      cierres: (db.cierres ?? []).length - closures.length,
      obras: (db.obras ?? []).length - worksites.length,
    },
    deletes: [
      { table: 'records', ids: [...deletedRecords], mode: 'delete' },
      { table: 'vacaciones', ids: [...deletedVacations], mode: 'delete' },
      { table: 'employees', ids: [...new Set(deleted?.employees ?? [])], mode: 'deactivate' },
    ],
  }
}
