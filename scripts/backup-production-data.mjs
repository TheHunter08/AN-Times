import { createHash, createHmac } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

// Mismos valores públicos de respaldo que usa la PWA y el resto de auditorías.
// La autorización sensible de este script sigue dependiendo del secreto local.
const url = String(process.env.VITE_SB_URL || 'https://eyyhlcvpyiorpdnvqsll.supabase.co').replace(/\/$/, '')
const anon = String(process.env.VITE_SB_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I')

function createServiceToken() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY o SUPABASE_JWT_SECRET')
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const header = encode({ alg:'HS256', typ:'JWT' })
  const payload = encode({ role:'service_role', iss:'supabase', iat:now, exp:now + 900 })
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

const serviceToken = createServiceToken()
const headers = { apikey:anon, Authorization:`Bearer ${serviceToken}` }
const tables = [
  'app_data', 'companies', 'employees', 'records', 'vacaciones', 'notis',
  'chats', 'cierres', 'audit', 'obras', 'app_entities', 'sync_operations',
  'push_subs', 'denuncias',
]

async function readTable(table) {
  const all = []
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers:{ ...headers, Range:`${offset}-${offset + 999}` },
    })
    if (!response.ok) throw new Error(`${table} respondió ${response.status}: ${(await response.text()).slice(0, 160)}`)
    const batch = await response.json()
    all.push(...batch)
    if (batch.length < 1000) return all
  }
}

async function readAuthUsers() {
  const users = []
  for (let page = 1; ; page++) {
    const response = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers })
    if (!response.ok) throw new Error(`auth.users respondió ${response.status}`)
    const batch = (await response.json())?.users || []
    users.push(...batch.map(user => ({
      id:user.id,
      email:user.email,
      created_at:user.created_at,
      updated_at:user.updated_at,
      last_sign_in_at:user.last_sign_in_at,
      email_confirmed_at:user.email_confirmed_at,
      app_metadata:user.app_metadata,
      user_metadata:user.user_metadata,
    })))
    if (batch.length < 1000) return users
  }
}

const tableEntries = await Promise.all(tables.map(async table => [table, await readTable(table)]))
const authUsers = await readAuthUsers()
const createdAt = new Date().toISOString()
const payload = {
  metadata:{
    createdAt,
    project:new URL(url).hostname.split('.')[0],
    format:'times-inc-production-backup-v1',
  },
  tables:Object.fromEntries(tableEntries),
  authUsers,
}
const json = `${JSON.stringify(payload, null, 2)}\n`
const digest = createHash('sha256').update(json).digest('hex')
const stamp = createdAt.replace(/[:.]/g, '-')
const directory = resolve('outputs', 'backups')
const backupPath = resolve(directory, `times-inc-${stamp}.json`)
const hashPath = `${backupPath}.sha256`

await mkdir(directory, { recursive:true })
await writeFile(backupPath, json, { encoding:'utf8', mode:0o600 })
await writeFile(hashPath, `${digest}  ${backupPath.split(/[\\/]/).pop()}\n`, { encoding:'utf8', mode:0o600 })

console.log(JSON.stringify({
  ok:true,
  backupPath,
  hashPath,
  sha256:digest,
  counts:Object.fromEntries(tableEntries.map(([table, rows]) => [table, rows.length])),
  authUsers:authUsers.length,
}, null, 2))
