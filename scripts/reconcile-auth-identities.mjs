import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { planAuthIdentityLinks } from '../src/utils/authIdentityReconciliation.js'

function loadEnvFile(path) {
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

loadEnvFile('.env')
loadEnvFile('.env.local')

const url = String(process.env.VITE_SB_URL || 'https://eyyhlcvpyiorpdnvqsll.supabase.co').replace(/\/$/, '')
const anon = String(process.env.VITE_SB_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I')
const apply = process.argv.includes('--apply')

function createServiceToken() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) throw new Error('Configura SUPABASE_SERVICE_ROLE_KEY o SUPABASE_JWT_SECRET')
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const header = encode({ alg:'HS256', typ:'JWT' })
  const payload = encode({ role:'service_role', iss:'supabase', iat:now, exp:now + 600 })
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

const serviceToken = createServiceToken()
const restHeaders = { apikey:anon, Authorization:`Bearer ${serviceToken}`, 'Content-Type':'application/json' }

async function request(path, options = {}, authBase = false) {
  const base = authBase ? `${url}/auth/v1/` : `${url}/rest/v1/`
  const response = await fetch(base + path, {
    ...options,
    headers:{ ...restHeaders, ...options.headers },
  })
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path.split('?')[0]} respondió ${response.status}: ${(await response.text()).slice(0, 180)}`)
  }
  return response.status === 204 ? null : response.json().catch(() => null)
}

async function readAllAuthUsers() {
  const users = []
  for (let page = 1; ; page++) {
    const payload = await request(`admin/users?page=${page}&per_page=1000`, {}, true)
    const batch = payload?.users || []
    users.push(...batch)
    if (batch.length < 1000) return users
  }
}

const [employees, authUsers, blobRows] = await Promise.all([
  request('employees?select=id,email,auth_id,baja,data,updated_at'),
  readAllAuthUsers(),
  request('app_data?select=data,updated_at&id=eq.1'),
])
const blobRow = blobRows?.[0]
if (!blobRow) throw new Error('No existe app_data id=1')

const plan = planAuthIdentityLinks(employees, authUsers)
console.log(JSON.stringify({
  mode:apply ? 'apply' : 'dry-run',
  authUsers:authUsers.length,
  activeEmployees:employees.filter(item => !item.baja).length,
  currentlyLinked:employees.filter(item => !item.baja && item.auth_id).length,
  candidates:plan.candidates.length,
  conflicts:plan.conflicts.reduce((counts, item) => ({
    ...counts,
    [item.reason]:(counts[item.reason] || 0) + 1,
  }), {}),
}, null, 2))

if (!apply || !plan.candidates.length) process.exit(0)

const nowIso = new Date().toISOString()
const employeeById = new Map(employees.map(item => [String(item.id), item]))
const failures = []
const applied = []
for (const candidate of plan.candidates) {
  const employee = employeeById.get(String(candidate.employeeId))
  try {
    const updated = await request(
      `employees?id=eq.${encodeURIComponent(candidate.employeeId)}&updated_at=eq.${encodeURIComponent(employee.updated_at)}`,
      {
        method:'PATCH',
        headers:{ Prefer:'return=representation' },
        body:JSON.stringify({
          auth_id:candidate.authId,
          data:{ ...(employee.data || {}), authId:candidate.authId, auth_id:candidate.authId, _upd:nowIso },
          updated_at:nowIso,
        }),
      },
    )
    if (!updated?.length) throw new Error('el perfil cambió durante la reconciliación')
    applied.push(candidate)
  } catch (error) {
    failures.push({ employeeId:candidate.employeeId, error:error.message })
  }
}

if (applied.length) {
  const appliedById = new Map(applied.map(item => [String(item.employeeId), item.authId]))
  const nextEmployees = (blobRow.data?.employees || []).map(employee => {
    const authId = appliedById.get(String(employee.id))
    return authId
      ? { ...employee, authId, auth_id:authId, _upd:nowIso }
      : employee
  })
  const updated = await request(
    `app_data?id=eq.1&updated_at=eq.${encodeURIComponent(blobRow.updated_at)}`,
    {
      method:'PATCH',
      headers:{ Prefer:'return=representation' },
      body:JSON.stringify({
        data:{ ...blobRow.data, employees:nextEmployees, _ts:Date.now() },
        updated_at:nowIso,
      }),
    },
  )
  if (!updated?.length) throw new Error('app_data cambió durante la reconciliación; la tabla quedó vinculada y debe reauditarse')
}

console.log(JSON.stringify({ ok:failures.length === 0, linked:applied.length, failures }, null, 2))
if (failures.length) process.exitCode = 1
