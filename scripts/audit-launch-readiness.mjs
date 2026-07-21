import { readFileSync } from 'node:fs'

function loadEnvFile(path) {
  try {
    for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = raw.trim().replace(/^\uFEFF/, '')
      if (!line || line.startsWith('#')) continue
      const index = line.indexOf('=')
      if (index < 1) continue
      const key = line.slice(0, index).trim()
      if (process.env[key] == null) process.env[key] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    }
  } catch {}
}

loadEnvFile('.env')
// Mismos valores públicos de respaldo que usa la PWA. La clave anon no es un
// secreto; la protección real corresponde a RLS y Supabase Auth.
const url = String(process.env.VITE_SB_URL || 'https://eyyhlcvpyiorpdnvqsll.supabase.co').replace(/\/$/, '')
const key = String(process.env.VITE_SB_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I')

const headers = { apikey:key, Authorization:`Bearer ${key}` }
async function rows(path) {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers })
  if (!response.ok) throw new Error(`${path.split('?')[0]} respondió ${response.status}`)
  return response.json()
}

const [employees, subscriptions, records, closures, blobRows] = await Promise.all([
  rows('employees?select=id,role,baja,auth_id'),
  rows('push_subs?select=user_id,endpoint'),
  rows('records?select=id,fin,aceptada,validado,rechazado,closed,deleted'),
  rows('cierres?select=id,emp_id,mes,estado,firma_admin,firma_emp,deleted'),
  rows('app_data?select=data,updated_at&id=eq.1'),
])

const blob = blobRows[0]?.data || {}
const workers = employees.filter(item => !item.baja && item.role !== 'admin')
const workerIds = new Set(workers.map(item => item.id))
const subscribed = new Set(subscriptions.map(item => item.user_id).filter(id => workerIds.has(id)))
const endpointCounts = new Map()
for (const item of subscriptions) endpointCounts.set(item.endpoint, (endpointCounts.get(item.endpoint) || 0) + 1)
const signatures = blob.firmas || {}
const signed = workers.filter(item => Boolean(signatures[item.id]?.main?.data))
const nowMonth = new Date().toLocaleDateString('en-CA', { timeZone:'Europe/Madrid', year:'numeric', month:'2-digit' }).slice(0, 7)
const invalidCurrentClosures = closures.filter(item => item.mes >= nowMonth && !item.firma_admin && !item.firma_emp && !item.deleted)
const pendingEndedClosures = closures.filter(item => item.mes < nowMonth && item.estado !== 'firmado' && !item.deleted)
const activeRecords = records.filter(item => !item.deleted)
const tableRecordIds = new Set(activeRecords.map(item => item.id))
const blobRecordIds = new Set((blob.records || []).map(item => item.id))
const missingInTables = [...blobRecordIds].filter(id => !tableRecordIds.has(id)).length
const missingInBlob = [...tableRecordIds].filter(id => !blobRecordIds.has(id)).length
const pendingValidation = activeRecords.filter(item => item.fin && !item.aceptada && !item.validado && !item.rechazado).length

const checks = {
  supabaseProject: new URL(url).hostname.split('.')[0],
  activeWorkers: workers.length,
  registeredWorkerDevices: subscribed.size,
  missingDeviceSubscriptions: workers.length - subscribed.size,
  adminAliasSubscriptions: subscriptions.filter(item => item.user_id === '__admin__').length,
  orphanSubscriptions: subscriptions.filter(item => !workerIds.has(item.user_id) && item.user_id !== '__admin__').length,
  duplicatedEndpoints: [...endpointCounts.values()].filter(count => count > 1).length,
  workersWithSignature: signed.length,
  missingSignatures: workers.length - signed.length,
  employeesMissingAuth: employees.filter(item => !item.baja && !item.auth_id).length,
  normalizedRecords: activeRecords.length,
  blobRecords: blobRecordIds.size,
  missingInTables,
  missingInBlob,
  pendingValidation,
  invalidCurrentClosures: invalidCurrentClosures.length,
  pendingEndedClosures: pendingEndedClosures.length,
}

console.log(JSON.stringify(checks, null, 2))
const blockers = checks.missingDeviceSubscriptions + checks.missingSignatures + checks.employeesMissingAuth +
  checks.missingInTables + checks.missingInBlob + checks.invalidCurrentClosures
if (process.argv.includes('--strict') && blockers) process.exitCode = 1
