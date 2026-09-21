import { readFileSync } from 'node:fs'
import { readAllRestRows } from './read-all-rest-rows.mjs'
import { calcSecs } from '../src/utils/time.js'
import { MAX_OPEN_BREAK_MIN_ON_AUTOCLOSE } from '../src/utils/recordLifecycle.js'

function loadEnv(path) {
  try {
    for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = raw.trim().replace(/^﻿/, '')
      const index = line.indexOf('=')
      if (!line || line.startsWith('#') || index < 1) continue
      const name = line.slice(0, index).trim()
      if (process.env[name] == null) process.env[name] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    }
  } catch {}
}

loadEnv('.env')
loadEnv('.env.local')
const url = String(process.env.VITE_SB_URL || 'https://eyyhlcvpyiorpdnvqsll.supabase.co').replace(/\/$/, '')
const key = String(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SB_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I')
const headers = { apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json' }
const apply = process.argv.includes('--apply')

// Un fichaje afectado por el bug de descanso-sin-cerrar-en-autocierre (ver
// recordLifecycle.js / v4.6.20) tiene autoClosedAt, una jornada de duración
// normal (varias horas) y sin embargo workSecs casi en cero porque el
// descanso "abierto" se contó hasta la hora del autocierre.
const records = await readAllRestRows({
  baseUrl:url,
  path:'records?select=id,emp_id,emp_name,inicio,fin,work_secs,break_secs,breaks,data,updated_at&closed=eq.true&order=id.asc',
  headers,
})

const affected = records.filter(row => {
  const autoClosedAt = row.data?.autoClosedAt
  if (!autoClosedAt) return false
  const inicio = Date.parse(row.inicio || '')
  const fin = Date.parse(row.fin || '')
  if (!Number.isFinite(inicio) || !Number.isFinite(fin)) return false
  const durationSecs = (fin - inicio) / 1000
  const workSecs = Number(row.work_secs) || 0
  const breakSecs = Number(row.break_secs) || 0
  return durationSecs > 2 * 3600 && workSecs < 20 * 60 && breakSecs > durationSecs * 0.7
})

const affectedIds = new Set(affected.map(row => String(row.id)))

const closures = affectedIds.size
  ? await readAllRestRows({ baseUrl:url, path:'cierres?select=id,emp_id,mes,estado,firma_emp,total_min,data&order=id.asc', headers })
  : []

const closuresTouched = closures.filter(closure => {
  const snapshot = closure.data?.records_snapshot || closure.data?.recordsSnapshot || []
  return Array.isArray(snapshot) && snapshot.some(item => affectedIds.has(String(item?.id)))
})

// El descanso "malo" es siempre el ÚLTIMO de `breaks`: finalizeRecord solo
// añade una entrada al cerrar (breaks.push(...)), y estos fichajes se
// cerraron por el autocierre, no manualmente — así que el push final es
// justo el descanso que se quedó abierto y se extendió de más. Recortarlo
// al mismo tope (MAX_OPEN_BREAK_MIN_ON_AUTOCLOSE) que ya usa el código en
// producción y volver a calcular con calcSecs es la MISMA operación que
// habría hecho el autocierre si el bug ya hubiera estado arreglado entonces.
function repairedRecordPayload(row) {
  const breaks = Array.isArray(row.breaks) ? row.breaks.map(item => ({ ...item })) : []
  if (!breaks.length) return null
  const lastIndex = breaks.length - 1
  const last = breaks[lastIndex]
  const start = Date.parse(last?.start || '')
  const end = Date.parse(last?.end || '')
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  const cappedEndMs = start + MAX_OPEN_BREAK_MIN_ON_AUTOCLOSE * 60000
  if (cappedEndMs >= end) return null // el descanso ya estaba dentro del tope; no es el causante
  breaks[lastIndex] = { ...last, end: new Date(cappedEndMs).toISOString() }
  const record = { ...(row.data || {}), id: row.id, empId: row.emp_id, inicio: row.inicio, fin: row.fin, breaks }
  const totals = calcSecs(record)
  return {
    breaks,
    work_secs: totals.work,
    break_secs: totals.brk,
    data: { ...(row.data || {}), breaks, workSecs: totals.work, breakSecs: totals.brk, repairedAt: new Date().toISOString(), repairedFrom: 'audit-autoclose-break-drift' },
  }
}

const repairPlan = affected
  .map(row => ({ row, patch: repairedRecordPayload(row) }))
  .filter(({ patch }) => patch)

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  totalRecordsScanned: records.length,
  affectedRecords: affected.length,
  affected: affected.map(row => ({
    id: row.id, empId: row.emp_id, empName: row.emp_name,
    inicio: row.inicio, fin: row.fin,
    workMin: Math.round((Number(row.work_secs) || 0) / 60),
    breakMin: Math.round((Number(row.break_secs) || 0) / 60),
    durationMin: Math.round((Date.parse(row.fin) - Date.parse(row.inicio)) / 60000),
  })),
  repairable: repairPlan.length,
  repairPreview: repairPlan.map(({ row, patch }) => ({
    id: row.id, empId: row.emp_id,
    workMinAntes: Math.round((Number(row.work_secs) || 0) / 60),
    workMinDespues: Math.round(patch.work_secs / 60),
    breakMinAntes: Math.round((Number(row.break_secs) || 0) / 60),
    breakMinDespues: Math.round(patch.break_secs / 60),
  })),
  closuresScanned: closures.length,
  closuresTouched: closuresTouched.map(closure => ({
    id: closure.id, empId: closure.emp_id, mes: closure.mes,
    estado: closure.estado, firmado: Boolean(closure.firma_emp),
    totalMin: closure.total_min,
    // Un cierre FIRMADO es un documento legal ya entregado: este script
    // nunca lo toca. Hay que reabrirlo a mano (el propio flujo de admin ya
    // soporta reabrir/corregir un mes firmado) para que el empleado vuelva
    // a firmar con las horas corregidas.
    accion: closure.firma_emp ? 'firmado — requiere reapertura manual y nueva firma' : 'sin firmar — se recalculará solo la próxima vez que se abra/edite en la app',
  })),
}, null, 2))

if (!apply || !repairPlan.length) {
  if (!apply && repairPlan.length) {
    console.log(`\nEjecuta con --apply para corregir ${repairPlan.length} fichaje(s). No se modifica ningún cierre (ver "closuresTouched" para el seguimiento manual).`)
  }
  process.exit(0)
}

const failures = []
for (const { row, patch } of repairPlan) {
  const response = await fetch(`${url}/rest/v1/records?id=eq.${encodeURIComponent(row.id)}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  })
  if (!response.ok) failures.push({ id: row.id, status: response.status, detail: (await response.text()).slice(0, 200) })
}

console.log(JSON.stringify({ ok: failures.length === 0, repaired: repairPlan.length - failures.length, failures }, null, 2))
if (failures.length) process.exitCode = 1
