import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { readAllRestRows } from './read-all-rest-rows.mjs'
import { isValidAccountEmail, normalizeAccountEmail } from '../src/utils/authRegistration.js'
import { evaluateRlsTransition, RLS_RUNTIME_CAPABILITIES } from '../src/config/securityReadiness.js'
import { evaluateSecurityDeployment } from '../src/config/securityDeployment.js'
import { summarizeAutomationHealth } from '../src/server/automationHealth.js'
import { isPinHashed, needsRehash } from '../src/utils/pinSecurity.js'
import { summarizeDocumentReadiness } from '../src/utils/documentReadiness.js'

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

const auditToken = serviceToken() || key
const headers = { apikey:key, Authorization:`Bearer ${auditToken}` }
async function rows(path) {
  return readAllRestRows({ baseUrl:url, path, headers })
}

async function resourceAvailable(path) {
  try {
    const response = await fetch(`${url}/rest/v1/${path}`, { headers:{ ...headers, Range:'0-0' } })
    return response.ok
  } catch { return false }
}

function serviceToken() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) return null
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const header = encode({ alg:'HS256', typ:'JWT' })
  const payload = encode({ role:'service_role', iss:'supabase', iat:now, exp:now + 600 })
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

async function readAuthUsers() {
  const token = serviceToken()
  if (!token) return null
  const users = []
  for (let page = 1; ; page++) {
    const response = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers:{ apikey:key, Authorization:`Bearer ${token}` },
    })
    if (!response.ok) return null
    const batch = (await response.json())?.users || []
    users.push(...batch)
    if (batch.length < 1000) return users
  }
}

const securityDeployment = evaluateSecurityDeployment(process.env)
const [employees, subscriptions, records, vacations, closures, entityRows, blobRows, authUsers, secureEntitiesReady, auditEventsReady] = await Promise.all([
  rows('employees?select=id,role,baja,email,auth_id,pin_hash,data'),
  rows('push_subs?select=user_id,endpoint'),
  rows('records?select=id,emp_id,fin,aceptada,validado,rechazado,closed,deleted,updated_at'),
  rows('vacaciones?select=id,emp_id,estado,deleted,updated_at'),
  rows('cierres?select=id,emp_id,mes,estado,firma_admin,firma_emp,target_min,deficit_min,balance_min,justified_min,non_contract_min,data,deleted'),
  rows('app_entities?select=collection,entity_id,data,deleted,updated_at'),
  rows('app_data?select=data,updated_at&id=eq.1'),
  readAuthUsers(),
  resourceAvailable('app_entities?select=id,access_scope,subject_emp_id,participant_emp_ids&limit=1'),
  resourceAvailable('audit_events?select=id&limit=1'),
])

const blob = blobRows[0]?.data || {}
function normalizedDb() {
  const db = {
    employees:employees.map(row => ({ ...(row.data || {}), id:row.id, role:row.role, baja:row.baja, email:row.email, authId:row.auth_id })),
    records:records.filter(row => !row.deleted).map(row => ({ id:row.id, empId:row.emp_id, fin:row.fin, _upd:row.updated_at })),
    vacaciones:vacations.filter(row => !row.deleted).map(row => ({ id:row.id, empId:row.emp_id, estado:row.estado, _upd:row.updated_at })),
    firmas:{},
  }
  for (const row of entityRows.filter(item => !item.deleted)) {
    if (row.collection === 'firmas') {
      if (row.entity_id === '__singleton__') Object.assign(db.firmas, row.data || {})
      else db.firmas[row.entity_id] = row.data || {}
      continue
    }
    if (row.entity_id === '__singleton__') db[row.collection] = row.data
    else {
      if (!Array.isArray(db[row.collection])) db[row.collection] = []
      db[row.collection].push(row.data || {})
    }
  }
  return db
}
const operationalDb = securityDeployment.active ? normalizedDb() : blob
const documentReadiness = summarizeDocumentReadiness(operationalDb)
const workers = employees.filter(item => !item.baja && item.role !== 'admin' && !item.isAdmin)
const blobWorkers = (blob.employees || []).filter(item => !item.baja && item.role !== 'admin' && !item.isAdmin)
const activeEmployees = employees.filter(item => !item.baja)
const authUserIds = new Set((authUsers || []).map(item => item.id))
const workerIds = new Set(workers.map(item => item.id))
const subscribed = new Set(subscriptions.map(item => item.user_id).filter(id => workerIds.has(id)))
const endpointCounts = new Map()
for (const item of subscriptions) endpointCounts.set(item.endpoint, (endpointCounts.get(item.endpoint) || 0) + 1)
const signatures = operationalDb.firmas || {}
const signed = workers.filter(item => Boolean(signatures[item.id]?.main?.data))
const nowMonth = new Date().toLocaleDateString('en-CA', { timeZone:'Europe/Madrid', year:'numeric', month:'2-digit' }).slice(0, 7)
const invalidCurrentClosures = closures.filter(item => item.mes >= nowMonth && !item.firma_admin && !item.firma_emp && !item.deleted)
const pendingEndedClosures = closures.filter(item => item.mes < nowMonth && item.estado !== 'firmado' && !item.deleted)
const normalizedWeeklyClosures = closures.filter(item =>
  ['target_min','deficit_min','balance_min','justified_min','non_contract_min']
    .every(column => Number.isFinite(Number(item[column])))
)
const weeklyClosureDrift = closures.filter(item => {
  const pairs = [
    ['target_min','targetMin'],
    ['deficit_min','deficitMin'],
    ['balance_min','balanceMin'],
    ['justified_min','justifiedMin'],
    ['non_contract_min','nonContractMin'],
  ]
  return pairs.some(([column, key]) =>
    item.data?.[key] != null && Number(item[column]) !== Number(item.data[key]))
})
const activeRecords = records.filter(item => !item.deleted)
const deletedRecordIds = new Set(records.filter(item => item.deleted).map(item => item.id))
const tableRecordIds = new Set(activeRecords.map(item => item.id))
const blobRecordIds = new Set((blob.records || []).map(item => item.id))
const validUpdatedAt = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
const openBlobRecords = (operationalDb.records || []).filter(item => item && !item.fin && !item.deleted)
const pendingBlobVacations = (operationalDb.vacaciones || []).filter(item => item && item.estado === 'pendiente' && !item.deleted)
const pendingBlobExpenses = (operationalDb.gastos || []).filter(item => item && item.estado === 'pendiente' && !item.deleted)
// Un registro presente en el blob pero marcado como deleted en la tabla no
// está "perdido": es un tombstone que debe limpiar el proceso específico sin
// resucitarlo. Separarlo evita que la auditoría recomiende una reparación
// destructiva en la dirección equivocada.
const protectedRecordTombstones = [...blobRecordIds].filter(id => deletedRecordIds.has(id)).length
const missingInTables = [...blobRecordIds].filter(id => !tableRecordIds.has(id) && !deletedRecordIds.has(id)).length
const missingInBlob = [...tableRecordIds].filter(id => !blobRecordIds.has(id)).length
const pendingValidation = activeRecords.filter(item => item.fin && !item.aceptada && !item.validado && !item.rechazado).length
const authCounts = new Map()
for (const item of activeEmployees) if (item.auth_id) authCounts.set(item.auth_id, (authCounts.get(item.auth_id) || 0) + 1)
const emailCounts = new Map()
for (const item of activeEmployees) {
  if (!isValidAccountEmail(item.email)) continue
  const normalizedEmail = normalizeAccountEmail(item.email)
  emailCounts.set(normalizedEmail, (emailCounts.get(normalizedEmail) || 0) + 1)
}

const checks = {
  supabaseProject: new URL(url).hostname.split('.')[0],
  activeWorkers: workers.length,
  registeredWorkerDevices: subscribed.size,
  missingDeviceSubscriptions: workers.length - subscribed.size,
  workersWithModernPin: workers.filter(item => item.pin_hash && !needsRehash(item.pin_hash)).length,
  workersWithLegacyPin: workers.filter(item => item.pin_hash && needsRehash(item.pin_hash)).length,
  workersWithPlaintextPin: workers.filter(item => item.pin_hash && !isPinHashed(item.pin_hash)).length,
  workersWithLegacyHash: workers.filter(item => item.pin_hash && isPinHashed(item.pin_hash) && needsRehash(item.pin_hash)).length,
  workerDataWithPlaintextPin: workers.filter(item => item.data?.pin && !isPinHashed(item.data.pin)).length,
  workerDataWithLegacyHash: workers.filter(item => item.data?.pin && isPinHashed(item.data.pin) && needsRehash(item.data.pin)).length,
  workersMissingPin: workers.filter(item => !item.pin_hash).length,
  blobWorkersWithModernPin: blobWorkers.filter(item => item.pin && !needsRehash(item.pin)).length,
  blobWorkersWithLegacyPin: blobWorkers.filter(item => item.pin && needsRehash(item.pin)).length,
  blobWorkersWithPlaintextPin: blobWorkers.filter(item => item.pin && !isPinHashed(item.pin)).length,
  blobWorkersWithLegacyHash: blobWorkers.filter(item => item.pin && isPinHashed(item.pin) && needsRehash(item.pin)).length,
  blobWorkersMissingPin: blobWorkers.filter(item => !item.pin).length,
  adminAliasSubscriptions: subscriptions.filter(item => item.user_id === '__admin__').length,
  orphanSubscriptions: subscriptions.filter(item => !workerIds.has(item.user_id) && item.user_id !== '__admin__').length,
  duplicatedEndpoints: [...endpointCounts.values()].filter(count => count > 1).length,
  workersWithSignature: signed.length,
  missingSignatures: workers.length - signed.length,
  employeesWithEmail: activeEmployees.filter(item => isValidAccountEmail(item.email)).length,
  employeesMissingEmail: activeEmployees.filter(item => !isValidAccountEmail(item.email)).length,
  duplicatedEmployeeEmails: [...emailCounts.values()].filter(count => count > 1).length,
  employeesMissingAuth: activeEmployees.filter(item => !item.auth_id).length,
  authUsersAudited: Array.isArray(authUsers),
  authUsersTotal: Array.isArray(authUsers) ? authUsers.length : null,
  employeesWithVerifiedAuth: Array.isArray(authUsers)
    ? activeEmployees.filter(item => item.auth_id && authUserIds.has(item.auth_id)).length
    : null,
  orphanedAuthLinks: Array.isArray(authUsers)
    ? activeEmployees.filter(item => item.auth_id && !authUserIds.has(item.auth_id)).length
    : null,
  duplicatedAuthIdentities: [...authCounts.values()].filter(count => count > 1).length,
  normalizedRecords: activeRecords.length,
  blobRecords: blobRecordIds.size,
  protectedRecordTombstones,
  missingInTables,
  missingInBlob,
  pendingValidation,
  openRecordsMissingUpd: openBlobRecords.filter(item => !validUpdatedAt(item._upd)).length,
  pendingVacationsMissingUpd: pendingBlobVacations.filter(item => !validUpdatedAt(item._upd)).length,
  pendingExpensesMissingUpd: pendingBlobExpenses.filter(item => !validUpdatedAt(item._upd)).length,
  invalidCurrentClosures: invalidCurrentClosures.length,
  pendingEndedClosures: pendingEndedClosures.length,
  normalizedWeeklyClosures: normalizedWeeklyClosures.length,
  weeklyClosureDrift: weeklyClosureDrift.length,
  automationHealth:summarizeAutomationHealth(operationalDb.config?.automationHealth),
  documentReadiness,
}
const auditedCapabilities = {
  ...RLS_RUNTIME_CAPABILITIES,
  authIdsVerifiedAgainstAuthUsers:checks.authUsersAudited && checks.orphanedAuthLinks === 0,
  secureCollectionsPrepared:secureEntitiesReady && auditEventsReady,
}
const rlsTransition = evaluateRlsTransition({
  authTotal:activeEmployees.length,
  authReady:activeEmployees.length - checks.employeesMissingAuth,
  emailReady:activeEmployees.length - checks.employeesMissingEmail,
  duplicatedAuthIds:checks.duplicatedAuthIdentities,
  duplicatedEmails:checks.duplicatedEmployeeEmails,
  capabilities:auditedCapabilities,
})
checks.rlsTransitionState = rlsTransition.state
checks.rlsRuntimeCapabilities = auditedCapabilities
checks.rlsRuntimeBlockers = rlsTransition.runtimeBlockers
checks.securityDeployment = securityDeployment

console.log(JSON.stringify(checks, null, 2))
const pinCredentialBlockers = securityDeployment.active
  // Auth sustituye al PIN y policies_auth.sql retira sus hashes. Solo un PIN
  // en texto claro bloquea la activación; los hashes legacy se archivan para
  // rollback fuera del alcance del cliente.
  ? checks.workerDataWithPlaintextPin
  : checks.workersWithLegacyPin + checks.workersMissingPin +
    checks.workerDataWithPlaintextPin + checks.workerDataWithLegacyHash +
    checks.blobWorkersWithLegacyPin + checks.blobWorkersMissingPin
const blockers = checks.missingDeviceSubscriptions + checks.missingSignatures + checks.employeesMissingAuth +
  checks.employeesMissingEmail + checks.duplicatedEmployeeEmails + checks.duplicatedAuthIdentities +
  (securityDeployment.active ? 0 : checks.missingInTables + checks.missingInBlob) +
  checks.invalidCurrentClosures + pinCredentialBlockers + checks.openRecordsMissingUpd +
  checks.pendingVacationsMissingUpd + checks.pendingExpensesMissingUpd + checks.rlsRuntimeBlockers.length +
  checks.securityDeployment.issues.length +
  checks.documentReadiness.signatureWithoutArtifact + checks.documentReadiness.privateWithoutAuth +
  checks.weeklyClosureDrift + checks.automationHealth.unhealthy + (checks.orphanedAuthLinks || 0)
if (process.argv.includes('--strict') && blockers) process.exitCode = 1
