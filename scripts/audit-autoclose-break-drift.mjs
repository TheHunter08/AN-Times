import { readFileSync } from 'node:fs'
import { readAllRestRows } from './read-all-rest-rows.mjs'

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

// Un fichaje afectado por el bug de descanso-sin-cerrar-en-autocierre (ver
// recordLifecycle.js / v4.6.20) tiene autoClosedAt, una jornada de duración
// normal (varias horas) y sin embargo workSecs casi en cero porque el
// descanso "abierto" se contó hasta la hora del autocierre.
const records = await readAllRestRows({
  baseUrl:url,
  path:'records?select=id,emp_id,emp_name,inicio,fin,work_secs,break_secs,data&closed=eq.true&order=id.asc',
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
  // Jornada de más de 2h de duración real pero con menos de 20 min
  // reconocidos como trabajados: patrón del bug (descanso abierto que se
  // comió casi toda la jornada al autocerrar).
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

console.log(JSON.stringify({
  totalRecordsScanned: records.length,
  affectedRecords: affected.length,
  affected: affected.map(row => ({
    id: row.id, empId: row.emp_id, empName: row.emp_name,
    inicio: row.inicio, fin: row.fin,
    workMin: Math.round((Number(row.work_secs) || 0) / 60),
    breakMin: Math.round((Number(row.break_secs) || 0) / 60),
    durationMin: Math.round((Date.parse(row.fin) - Date.parse(row.inicio)) / 60000),
  })),
  closuresScanned: closures.length,
  closuresTouched: closuresTouched.map(closure => ({
    id: closure.id, empId: closure.emp_id, mes: closure.mes,
    estado: closure.estado, firmado: Boolean(closure.firma_emp),
    totalMin: closure.total_min,
  })),
}, null, 2))
