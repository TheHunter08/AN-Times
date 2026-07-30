import { readFileSync } from 'node:fs'
import { toRecordRow } from '../src/services/tableSyncPlan.js'

function fromRecord(row) {
  return {
    ...(row.data ?? {}),
    id:row.id, empId:row.emp_id, empName:row.emp_name,
    inicio:row.inicio, fin:row.fin ?? null, centro:row.centro ?? null,
    workSecs:row.work_secs ?? 0, breakSecs:row.break_secs ?? 0,
    breaks:row.breaks ?? [], closed:!!row.closed, aceptada:!!row.aceptada,
    correcciones:row.correcciones ?? [], _upd:row.updated_at,
    _rev:row.revision ?? 1, operationId:row.operation_id ?? null,
    validado:!!row.validado, rechazado:!!row.rechazado, modificado:!!row.modificado,
    validadoBy:row.validado_by ?? null, validadoAt:row.validado_at ?? null,
    cerradoPor:row.cerrado_por ?? null, cerradoPorId:row.cerrado_por_id ?? null,
    cierreManual:!!row.cierre_manual, motivoCierre:row.motivo_cierre ?? null,
  }
}

function loadEnvFile(path) {
  try {
    for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = raw.trim().replace(/^\uFEFF/, '')
      const index = line.indexOf('=')
      if (!line || line.startsWith('#') || index < 1) continue
      const name = line.slice(0, index).trim()
      if (process.env[name] == null) {
        process.env[name] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
      }
    }
  } catch {}
}

loadEnvFile('.env')
loadEnvFile('.env.local')

const url = String(process.env.VITE_SB_URL || 'https://eyyhlcvpyiorpdnvqsll.supabase.co').replace(/\/$/, '')
const key = String(process.env.VITE_SB_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I')
const headers = { apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json' }
const apply = process.argv.includes('--apply')
const PAGE_SIZE = 1000

async function request(path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers:{ ...headers, ...options.headers },
  })
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path.split('?')[0]} respondió ${response.status}: ${(await response.text()).slice(0, 240)}`)
  }
  return response.status === 204 ? null : response.json().catch(() => null)
}

async function pagedRows(path) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await request(path, {
      headers:{ Range:`${from}-${from + PAGE_SIZE - 1}` },
    })
    rows.push(...(page || []))
    if (!page || page.length < PAGE_SIZE) return rows
  }
}

const [blobRows, tableRows, employeeRows] = await Promise.all([
  request('app_data?select=data,updated_at&id=eq.1'),
  pagedRows('records?select=*'),
  pagedRows('employees?select=id,baja'),
])

const blobRow = blobRows[0]
if (!blobRow) throw new Error('No existe app_data id=1')

const blobRecords = Array.isArray(blobRow.data?.records) ? blobRow.data.records : []
const tableById = new Map(tableRows.map(row => [String(row.id), row]))
const employeeIds = new Set(employeeRows.filter(row => !row.baja).map(row => String(row.id)))
const tombstonedInTable = blobRecords.filter(record => tableById.get(String(record?.id))?.deleted)
const absent = blobRecords.filter(record => record?.id && !tableById.has(String(record.id)))
const valid = absent.filter(record =>
  employeeIds.has(String(record.empId))
  && typeof record.inicio === 'string'
  && Number.isFinite(Date.parse(record.inicio))
)
const invalid = absent.filter(record => !valid.includes(record))
const rowsToInsert = valid.map(record => toRecordRow(record))
const blobIds = new Set(blobRecords.map(record => String(record?.id || '')).filter(Boolean))
const rowsMissingFromBlob = tableRows.filter(row => !row.deleted && !blobIds.has(String(row.id)))
const recordsToRestoreInBlob = rowsMissingFromBlob.map(fromRecord)

console.log(JSON.stringify({
  mode:apply ? 'apply' : 'dry-run',
  blobRecords:blobRecords.length,
  tableRows:tableRows.length,
  absentFromTable:absent.length,
  absentFromBlob:recordsToRestoreInBlob.length,
  insertable:rowsToInsert.length,
  invalidOrOrphaned:invalid.length,
  protectedTableTombstones:tombstonedInTable.length,
  candidates:valid.map(record => ({
    id:record.id,
    inicio:record.inicio,
    fin:record.fin || null,
    updatedAt:record._upd || null,
  })),
  blobRestoreCandidates:recordsToRestoreInBlob.map(record => ({
    id:record.id,
    inicio:record.inicio,
    fin:record.fin || null,
    updatedAt:record._upd || null,
  })),
}, null, 2))

if (!apply || (!rowsToInsert.length && !recordsToRestoreInBlob.length)) process.exit(0)

async function insertIgnoringDuplicates(rows) {
  if (!rows.length) return { inserted:0, failures:[] }
  const path = 'records?on_conflict=id'
  const options = {
    method:'POST',
    headers:{ Prefer:'resolution=ignore-duplicates,return=minimal' },
  }
  try {
    await request(path, { ...options, body:JSON.stringify(rows) })
    return { inserted:rows.length, failures:[] }
  } catch (batchError) {
    const failures = []
    let inserted = 0
    for (const row of rows) {
      try {
        await request(path, { ...options, body:JSON.stringify(row) })
        inserted++
      } catch (error) {
        failures.push({ id:row.id, error:error.message })
      }
    }
    return { inserted, failures, batchError:batchError.message }
  }
}

const result = await insertIgnoringDuplicates(rowsToInsert)
if (result.failures.length) {
  console.log(JSON.stringify({ ok:false, ...result }, null, 2))
  process.exitCode = 1
} else if (recordsToRestoreInBlob.length) {
  const nextData = {
    ...(blobRow.data || {}),
    records:[...blobRecords, ...recordsToRestoreInBlob],
    _ts:Date.now(),
  }
  const updatedFilter = encodeURIComponent(blobRow.updated_at)
  const patched = await request(`app_data?id=eq.1&updated_at=eq.${updatedFilter}`, {
    method:'PATCH',
    headers:{ Prefer:'return=representation' },
    body:JSON.stringify({ data:nextData, updated_at:new Date().toISOString() }),
  })
  if (!patched?.length) throw new Error('app_data cambió durante la reparación; vuelve a ejecutar el comando')
}
console.log(JSON.stringify({
  ok:result.failures.length === 0,
  ...result,
  restoredInBlob:recordsToRestoreInBlob.length,
}, null, 2))
