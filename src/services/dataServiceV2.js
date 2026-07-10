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
    pinHash: e.pin_hash ?? null, role: e.role ?? 'empleado',
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
  return {
    id: c.id, empId: c.emp_id, mes: c.mes,
    totalMin: c.total_min ?? 0, extraMin: c.extra_min ?? 0,
    estado: c.estado ?? 'pendiente',
    firmaAdmin: c.firma_admin ?? null, firmaEmp: c.firma_emp ?? null,
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
    email: e.email ?? null, pin_hash: e.pinHash ?? null,
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
  return {
    id: c.id, company_id: COMPANY_ID,
    emp_id: c.empId, mes: c.mes,
    total_min: c.totalMin ?? 0, extra_min: c.extraMin ?? 0,
    estado: c.estado ?? 'pendiente',
    firma_admin: c.firmaAdmin ?? null, firma_emp: c.firmaEmp ?? null,
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

// ── cloudFetch V2: lee de tablas, cae en V1 si están vacías ──────────────────
export async function cloudFetch() {
  if (!supabase) return _v1Fetch()
  try {
    const [empsR, recsR, vacsR, cierresR, obrasR] = await Promise.all([
      supabase.from('employees').select('*').eq('company_id', COMPANY_ID).order('name'),
      supabase.from('records').select('*').eq('company_id', COMPANY_ID)
        .order('inicio', { ascending: false }).limit(5000),
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

    // Config, notis, chats, audit: aún en blob; leemos de V1 para obtenerlos
    const v1 = await _v1Fetch()
    const blobData = v1.data ?? {}

    return {
      ok: true,
      data: {
        ...blobData,                                         // config, notis, chats, audit del blob
        employees:  (empsR.data   ?? []).map(fromEmployee),
        records:    (recsR.data   ?? []).map(fromRecord),
        vacaciones: (vacsR.data   ?? []).map(fromVac),
        cierres:    (cierresR.data ?? []).map(fromCierre),
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

// Escribe en las tablas lo que acaba de cambiar en el blob.
// • Empleados y vacaciones: upsert completo (arrays pequeños).
// • Fichajes: solo los abiertos + los cerrados con _upd reciente (48h).
//   Los históricos los tiene la migración inicial y no cambian.
// • Borrados: DELETE directo en tablas.
async function _syncToTables(db, deleted) {
  if (!supabase) return

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const ops = []

  // Empleados
  if (db.employees?.length) {
    ops.push(supabase.from('employees').upsert(
      db.employees.map(toEmployee), { onConflict: 'id' }
    ))
  }

  // Fichajes recientes (abiertos o modificados en < 48 h)
  const recentRecs = (db.records ?? []).filter(
    r => !r.fin || !r._upd || r._upd > cutoff
  )
  if (recentRecs.length) {
    ops.push(supabase.from('records').upsert(
      recentRecs.map(toRecord), { onConflict: 'id' }
    ))
  }

  // Vacaciones
  if (db.vacaciones?.length) {
    ops.push(supabase.from('vacaciones').upsert(
      db.vacaciones.map(toVac), { onConflict: 'id' }
    ))
  }

  // Cierres mensuales
  if (db.cierres?.length) {
    ops.push(supabase.from('cierres').upsert(
      db.cierres.map(toCierre), { onConflict: 'id' }
    ))
  }

  // Obras / centros
  if (db.obras?.length) {
    ops.push(supabase.from('obras').upsert(
      db.obras.map(toObra), { onConflict: 'id' }
    ))
  }

  // Borrados físicos: tombstones → DELETE en tablas
  if (deleted?.records?.length) {
    ops.push(supabase.from('records').delete().in('id', deleted.records))
  }
  if (deleted?.vacaciones?.length) {
    ops.push(supabase.from('vacaciones').delete().in('id', deleted.vacaciones))
  }
  // Employees no se borran físicamente: se marcan baja=true
  if (deleted?.employees?.length) {
    ops.push(supabase.from('employees').update({ baja: true }).in('id', deleted.employees))
  }

  if (!ops.length) return
  const results = await Promise.allSettled(ops)
  const failures = results.filter(r => r.status === 'rejected' || r.value?.error)
  if (failures.length) {
    console.warn(`[v2] ${failures.length}/${ops.length} table ops failed (non-fatal)`)
  }
}
