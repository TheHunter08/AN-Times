// ── Migración única: blob JSON → tablas Supabase reales ────────────────────
// POST /api/migrate-to-tables  (requiere Authorization: Bearer <CRON_SECRET>)
//
// Orden de ejecución:
//   1. Aplicar supabase/schema.sql   en Supabase Dashboard → SQL Editor
//   2. Aplicar supabase/policies.sql en Supabase Dashboard → SQL Editor
//   3. Llamar este endpoint UNA SOLA VEZ (es idempotente: upsert, no insert)
//   4. En appStore.js cambiar el import:
//        from '../services/dataService.js'
//      a:
//        from '../services/dataServiceV2.js'
//   5. Desplegar con ese cambio → la app lee de tablas + dual-write activo
//
// Idempotente: se puede repetir sin duplicar datos (usa upsert con onConflict=id).
// Usa SB_SERVICE_KEY si está disponible (recomendado para saltar RLS durante la
// migración); si no, usa el anon key (requiere que policies.sql esté aplicado).
import { timingSafeEqual } from 'crypto'

const cleanEnv   = s => (s || '').replace(/^﻿/, '').trim()
const SB_URL     = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON    = cleanEnv(process.env.VITE_SB_ANON)
const SB_SERVICE = cleanEnv(process.env.SB_SERVICE_KEY)
const CRON_SECRET = process.env.CRON_SECRET

// Usar service key si está disponible (evita problemas de RLS durante la migración)
const KEY     = SB_SERVICE || SB_ANON
const SB_H    = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const SB_H_RD = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` }

const COMPANY_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const ENTITY_COLLECTIONS = ['empresas','centrosTrabajo','medicos','ausencias','mensajes','notis','documentos','audit','correccionesFichaje','chats','gastos','denuncias','wellbeing','turnos','partesTrabajo']
const SINGLETON_COLLECTIONS = ['monthSnapshots','firmas','anomalias_vistas','notisSent','pinLockouts','config']

async function sb(path, method = 'GET', body = null, extraHeaders = {}) {
  const opts = { method, headers: { ...SB_H, ...extraHeaders, Prefer: 'return=minimal' } }
  if (body !== null) opts.body = JSON.stringify(body)
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, opts)
  const text = await r.text()
  if (!r.ok) throw new Error(`[${method} ${path}] ${r.status}: ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

async function upsert(table, rows, onConflict = 'id') {
  if (!rows?.length) return 0
  // Supabase upsert en lotes de 500 para evitar payload demasiado grande
  let count = 0
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    await sb(`${table}?on_conflict=${onConflict}`, 'POST', batch, { Prefer: 'resolution=merge-duplicates,return=minimal' })
    count += batch.length
  }
  return count
}

async function countCompanyRows(table) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?select=id&company_id=eq.${COMPANY_ID}`, {
    headers: { ...SB_H, Prefer: 'count=exact', Range: '0-0' },
  })
  if (!r.ok) throw new Error(`[count ${table}] ${r.status}: ${(await r.text()).slice(0, 160)}`)
  const total = r.headers.get('content-range')?.split('/')[1]
  return total && total !== '*' ? Number(total) : 0
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()

  if (!CRON_SECRET) return res.status(500).json({ error: 'CRON_SECRET no configurado' })
  const token = (req.headers['authorization'] || '').replace('Bearer ', '')
  if (token.length !== CRON_SECRET.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(CRON_SECRET))) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!SB_URL || !SB_ANON) return res.status(500).json({ error: 'Supabase config missing' })

  try {
    // ── 1. Leer datos actuales del blob ─────────────────────────────────
    const [hotRows, coldRows] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data`, { headers: SB_H_RD }).then(r => r.json()),
      fetch(`${SB_URL}/rest/v1/app_data?id=eq.3&select=data`, { headers: SB_H_RD }).then(r => r.json()),
    ])
    const hot  = hotRows?.[0]?.data  || {}
    const cold = coldRows?.[0]?.data || {}
    const db   = { ...hot, ...cold }

    if (!db.employees?.length) {
      return res.status(400).json({ error: 'El blob no tiene empleados — ¿ya existe app_data?' })
    }

    const stats = {}

    // ── 2. Empresa ─────────────────────────────────────────────────────
    await upsert('companies', [{
      id: COMPANY_ID,
      name: db.config?.companyName || 'TIMES INC',
      cif:  db.config?.cif || null,
      config: db.config || {},
      updated_at: new Date().toISOString(),
    }], 'id')
    stats.company = 1

    // ── 3. Empleados ────────────────────────────────────────────────────
    const employees = (db.employees || []).filter(e => e.id && e.name).map(e => ({
      id: e.id, company_id: COMPANY_ID, name: e.name,
      email: e.email || null, pin_hash: e.pin || e.pinHash || null, pin_len: e.pinLen || null,
      role: e.role || (e.isAdmin ? 'admin' : e.isEnc ? 'encargado' : e.isJO ? 'jefe_obra' : 'empleado'),
      centro_trabajo: e.centroTrabajo || null,
      obras_asignadas: e.obrasAsignadas || [],
      reminder_time: e.reminderTime || '08:30',
      salida_time: e.salidaTime || null,
      telefono: e.telefono || null,
      baja: !!e.baja,
      updated_at: new Date().toISOString(),
    }))
    stats.employees = await upsert('employees', employees)

    // ── 4. Fichajes (records) ────────────────────────────────────────────
    const validEmpIds = new Set(employees.map(e => e.id))
    const records = (db.records || []).filter(r => r.id && r.inicio && r.empId && validEmpIds.has(r.empId)).map(r => ({
      id: r.id, company_id: COMPANY_ID,
      emp_id: r.empId, emp_name: r.empName || null,
      inicio: r.inicio, fin: r.fin || null, centro: r.centro || null,
      work_secs: r.workSecs || 0, break_secs: r.breakSecs || 0,
      breaks: r.breaks || [], closed: !!r.closed, aceptada: !!r.aceptada,
      correcciones: r.correcciones || [],
      revision: Math.max(1, Number(r._rev) || 1), operation_id: r.operationId || null,
      validado: !!r.validado, rechazado: !!r.rechazado, modificado: !!r.modificado,
      validado_by: r.validadoBy || null, validado_at: r.validadoAt || null,
      cerrado_por: r.cerradoPor || null, cerrado_por_id: r.cerradoPorId || null,
      cierre_manual: !!r.cierreManual, motivo_cierre: r.motivoCierre || null,
      deleted: false, deleted_at: null,
      updated_at: r._upd || new Date().toISOString(),
    }))
    stats.records = await upsert('records', records)

    // ── 5. Vacaciones / ausencias ────────────────────────────────────────
    const vacaciones = (db.vacaciones || []).filter(v => v.id && v.empId && validEmpIds.has(v.empId) && v.fechaInicio && v.fechaFin).map(v => ({
      id: v.id, company_id: COMPANY_ID,
      emp_id: v.empId, emp_name: v.empName || null,
      fecha_inicio: v.fechaInicio, fecha_fin: v.fechaFin,
      tipo: v.tipo || 'vacaciones', estado: v.estado || 'pendiente',
      motivo: v.motivo || null, resolucion: v.resolucion || null,
      updated_at: new Date().toISOString(),
    }))
    stats.vacaciones = await upsert('vacaciones', vacaciones)

    // ── 6. Cierres mensuales ─────────────────────────────────────────────
    const cierres = (db.cierres || []).filter(c => c.id && c.empId && c.mes && validEmpIds.has(c.empId)).map(c => ({
      id: c.id, company_id: COMPANY_ID,
      emp_id: c.empId, mes: c.mes,
      total_min: c.totalMin || 0, extra_min: c.extraMin || 0,
      estado: c.estado || 'pendiente',
      firma_admin: c.firmaAdmin || null, firma_emp: c.firmaEmp || null,
      desactualizado: !!c.desactualizado,
      updated_at: new Date().toISOString(),
    }))
    stats.cierres = await upsert('cierres', cierres)

    // ── 7. Obras / centros de trabajo ────────────────────────────────────
    const obras = (db.obras || []).filter(o => o.id && o.nombre).map(o => ({
      id: o.id, company_id: COMPANY_ID, nombre: o.nombre,
      coords: o.coords || null, radio: o.radio || 200,
      activa: o.activa !== false,
    }))
    stats.obras = await upsert('obras', obras)

    // 8. Colecciones que antes solo existían dentro del blob monolítico.
    const nowIso = new Date().toISOString()
    const entities = []
    for (const collection of ENTITY_COLLECTIONS) {
      for (const item of (db[collection] || [])) {
        if (!item || item.id === undefined || item.id === null || String(item.id).trim() === '') continue
        const entityId = String(item.id)
        entities.push({
          id: `${collection}:${entityId}`, company_id: COMPANY_ID, collection, entity_id: entityId,
          data: item, revision: Math.max(1, Number(item._rev) || 1), deleted: false,
          updated_at: item._upd || nowIso,
        })
      }
    }
    for (const collection of SINGLETON_COLLECTIONS) {
      if (db[collection] === undefined) continue
      entities.push({
        id: `${collection}:__singleton__`, company_id: COMPANY_ID, collection, entity_id: '__singleton__',
        data: db[collection], revision: 1, deleted: false, updated_at: nowIso,
      })
    }
    stats.app_entities = await upsert('app_entities', entities)

    const expected = {
      employees: employees.length, records: records.length, vacaciones: vacaciones.length,
      cierres: cierres.length, obras: obras.length, app_entities: entities.length,
    }
    const actual = Object.fromEntries(await Promise.all(Object.keys(expected).map(async table => [table, await countCompanyRows(table)])))
    const mismatch = Object.entries(expected).filter(([key, value]) => actual[key] !== value)

    console.log('[migrate-to-tables] completado:', JSON.stringify(stats))
    return res.status(200).json({
      ok: true,
      stats,
      verification: { expected, actual, mismatch, consistent: mismatch.length === 0 },
      next: [
        'En appStore.js cambia el import:',
        "  from '../services/dataService.js'",
        "  a:  '../services/dataServiceV2.js'",
        'Despliega y verifica que la app lee de tablas (habrá un log [v2] en consola)',
      ],
    })
  } catch (e) {
    console.error('[migrate-to-tables] fatal:', e)
    return res.status(500).json({ error: e.message })
  }
}
