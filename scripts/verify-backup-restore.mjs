import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { buildRestorePlan, inspectBackupSnapshot } from '../src/server/backupIntegrity.js'

function loadEnv(path) {
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

function serviceToken() {
  const configured = process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (configured && configured.trim() !== '[SENSITIVE]') return configured.trim()
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) return null
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const header = encode({ alg:'HS256', typ:'JWT' })
  const payload = encode({ role:'service_role', iss:'supabase', iat:now, exp:now + 600 })
  return `${header}.${payload}.${createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')}`
}

async function latestStoredBackup() {
  loadEnv('.env')
  loadEnv('.env.local')
  loadEnv('.env.vercel')
  // Mismo proyecto público de respaldo usado por los scripts de auditoría.
  // La URL no es secreta; el acceso al bucket privado sigue exigiendo service role.
  const configuredUrl = String(process.env.VITE_SB_URL || '').trim()
  const url = (configuredUrl && configuredUrl !== '[SENSITIVE]' ? configuredUrl : 'https://eyyhlcvpyiorpdnvqsll.supabase.co').replace(/\/$/, '')
  const token = serviceToken()
  if (!url || !token || url === '[SENSITIVE]' || token === '[SENSITIVE]') throw new Error('Para verificar Storage configura VITE_SB_URL y una service role/JWT secret, o pasa un archivo local')
  const headers = { apikey:token, Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }
  const listing = await fetch(`${url}/storage/v1/object/list/backups`, {
    method:'POST', headers, body:JSON.stringify({ prefix:'', limit:1, offset:0, sortBy:{ column:'name', order:'desc' }, search:'backup-' }),
  })
  if (!listing.ok) throw new Error(`No se pudo listar backups (${listing.status}): ${(await listing.text()).slice(0, 240)}`)
  const filename = (await listing.json())?.[0]?.name
  if (!filename) throw new Error('No hay snapshots en el bucket privado backups')
  const download = await fetch(`${url}/storage/v1/object/backups/${encodeURIComponent(filename)}`, { headers })
  if (!download.ok) throw new Error(`No se pudo descargar ${filename} (${download.status})`)
  return { source:`backups/${filename}`, bytes:Buffer.from(await download.arrayBuffer()) }
}

const file = process.argv.slice(2).find(arg => !arg.startsWith('--'))
const expectedChecksum = process.argv.find(arg => arg.startsWith('--checksum='))?.slice(11)
const input = file
  ? { source:file, bytes:readFileSync(file) }
  : await latestStoredBackup()
const inspection = inspectBackupSnapshot(input.bytes, { expectedChecksum })
if (!inspection.valid) throw new Error(`Backup inválido: ${inspection.errors.join('; ')}`)
const plan = buildRestorePlan(inspection)

console.log(JSON.stringify({
  ok:true,
  source:input.source,
  checksum:plan.checksum,
  timestamp:plan.timestamp,
  counts:plan.counts,
  restoreRows:plan.targetRows.map(row => row.id),
  restoreTables:(plan.targetTables || []).map(entry => ({ table:entry.table, rows:entry.rows.length })),
  mode:'dry-run (ningún dato escrito)',
}, null, 2))
