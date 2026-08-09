import { readFileSync } from 'node:fs'
import { toClosureRow } from '../src/services/tableSyncPlan.js'
import { readAllRestRows } from './read-all-rest-rows.mjs'

function loadEnv(path) {
  try {
    for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = raw.trim().replace(/^\uFEFF/, '')
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

async function request(path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers:{ ...headers, ...options.headers } })
  const text = await response.text()
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path.split('?')[0]} respondió ${response.status}: ${text.slice(0, 180)}`)
  return text ? JSON.parse(text) : null
}

const [blobRows, tableRows, employees] = await Promise.all([
  request('app_data?select=data&id=eq.1'),
  readAllRestRows({ baseUrl:url, path:'cierres?select=id,emp_id,mes,deleted&order=id.asc', headers }),
  readAllRestRows({ baseUrl:url, path:'employees?select=id&order=id.asc', headers }),
])
const blobClosures = (blobRows[0]?.data?.cierres || []).filter(item => item?.id && !item.deleted)
const activeTable = tableRows.filter(item => !item.deleted)
const tableIds = new Set(activeTable.map(item => String(item.id)))
const employeeIds = new Set(employees.map(item => String(item.id)))
const tableByNaturalKey = new Map(activeTable.map(item => [`${item.emp_id}|${item.mes}`, item]))
const missing = blobClosures.filter(item => !tableIds.has(String(item.id)))
const conflicts = missing.filter(item => {
  const existing = tableByNaturalKey.get(`${item.empId}|${item.mes}`)
  return existing && String(existing.id) !== String(item.id)
})
const conflictIds = new Set(conflicts.map(item => String(item.id)))
const orphans = missing.filter(item => !employeeIds.has(String(item.empId)))
const orphanIds = new Set(orphans.map(item => String(item.id)))
const insertable = missing.filter(item => !conflictIds.has(String(item.id)) && !orphanIds.has(String(item.id)))

console.log(JSON.stringify({
  mode:apply ? 'apply' : 'dry-run',
  blobClosures:blobClosures.length,
  tableClosures:activeTable.length,
  missing:missing.length,
  insertable:insertable.length,
  naturalKeyConflicts:conflicts.map(item => ({ id:item.id, empId:item.empId, mes:item.mes, existingId:tableByNaturalKey.get(`${item.empId}|${item.mes}`)?.id })),
  orphaned:orphans.map(item => ({ id:item.id, empId:item.empId, mes:item.mes })),
  candidates:insertable.map(item => ({ id:item.id, empId:item.empId, mes:item.mes })),
}, null, 2))

if (!apply || !insertable.length) process.exit(conflicts.length || orphans.length ? 2 : 0)

const rows = insertable.map(item => toClosureRow(item, new Date().toISOString()))
const upsert = async batch => {
  const response = await fetch(`${url}/rest/v1/cierres?on_conflict=id`, {
    method:'POST',
    headers:{ ...headers, Prefer:'resolution=merge-duplicates,return=minimal' },
    body:JSON.stringify(batch),
  })
  return { ok:response.ok, status:response.status, detail:response.ok ? '' : (await response.text()).slice(0, 180) }
}

const batch = await upsert(rows)
const failures = []
if (!batch.ok) {
  for (const row of rows) {
    const result = await upsert([row])
    if (!result.ok) failures.push({ id:row.id, status:result.status, detail:result.detail })
  }
}
const verified = await request(`cierres?select=id&id=in.(${insertable.map(item => encodeURIComponent(item.id)).join(',')})`)
const verifiedIds = new Set(verified.map(item => String(item.id)))
const notVerified = insertable.filter(item => !verifiedIds.has(String(item.id))).map(item => item.id)
console.log(JSON.stringify({ ok:failures.length === 0 && notVerified.length === 0, inserted:insertable.length - failures.length, failures, notVerified }, null, 2))
if (failures.length || notVerified.length) process.exitCode = 1
