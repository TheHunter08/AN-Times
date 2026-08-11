// Copia diaria inmutable. En Auth/RLS respalda las tablas normalizadas; en el
// despliegue transitorio conserva compatibilidad con app_data.
import { createHash, timingSafeEqual } from 'crypto'
import { createAutomationRun } from '../src/server/automationHealth.js'
import { buildRestorePlan, inspectBackupSnapshot } from '../src/server/backupIntegrity.js'
import { persistAutomationRun } from '../src/server/persistAutomationHealth.js'
import { isAuthRlsServerMode } from '../src/server/securityMode.js'

const clean = value => String(value || '').replace(/^\uFEFF/, '').trim()
const SB_URL = clean(process.env.VITE_SB_URL)
const SB_ANON = clean(process.env.VITE_SB_ANON)
const SB_SERVICE = clean(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
const CRON_SECRET = process.env.CRON_SECRET
const AUTH_RLS_MODE = isAuthRlsServerMode()
const ANON_HEADERS = { apikey:SB_ANON, Authorization:`Bearer ${SB_ANON}` }
const SERVICE_HEADERS = { apikey:SB_SERVICE, Authorization:`Bearer ${SB_SERVICE}` }
const LEGACY_READ_HEADERS = SB_SERVICE ? SERVICE_HEADERS : ANON_HEADERS
const STORAGE_HEADERS = SB_SERVICE ? SERVICE_HEADERS : ANON_HEADERS

const NORMALIZED_TABLES = [
  'companies', 'employees', 'records', 'vacaciones', 'notis', 'chats', 'cierres',
  'audit', 'obras', 'app_entities', 'sync_operations', 'legal_acknowledgements',
  'audit_events', 'denuncias', 'push_subs', 'employee_pin_archive',
]
const REQUIRED_TABLES = new Set(['companies', 'employees', 'records', 'cierres', 'app_entities', 'audit_events'])

async function readAllRows(table) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const response = await fetch(`${SB_URL}/rest/v1/${table}?select=*`, {
      headers:{ ...SERVICE_HEADERS, Range:`${from}-${from + 999}` },
    })
    if (!response.ok) {
      if (!REQUIRED_TABLES.has(table) && (response.status === 400 || response.status === 404)) return []
      throw new Error(`No se pudo respaldar ${table} (${response.status})`)
    }
    const batch = await response.json()
    rows.push(...batch)
    if (batch.length < 1000) return rows
  }
}

async function legacySnapshot(timestamp) {
  const [hotResponse, coldResponse] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data,updated_at`, { headers:LEGACY_READ_HEADERS }),
    fetch(`${SB_URL}/rest/v1/app_data?id=eq.3&select=data,updated_at`, { headers:LEGACY_READ_HEADERS }),
  ])
  const hot = hotResponse.ok ? (await hotResponse.json())[0] : null
  const cold = coldResponse.ok ? (await coldResponse.json())[0] : null
  if (!hot?.data || !Array.isArray(hot.data.records) || !Array.isArray(hot.data.employees)) {
    throw new Error('app_data principal no contiene records/employees válidos')
  }
  return { timestamp, hot:hot.data, cold:cold?.data ?? null }
}

async function normalizedSnapshot(timestamp) {
  const entries = await Promise.all(NORMALIZED_TABLES.map(async table => [table, await readAllRows(table)]))
  return { timestamp, source:'normalized', schemaVersion:2, tables:Object.fromEntries(entries) }
}

export default async function handler(req, res) {
  if (!CRON_SECRET) return res.status(500).json({ error:'CRON_SECRET no configurado' })
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '')
  const valid = token.length === CRON_SECRET.length && timingSafeEqual(Buffer.from(token), Buffer.from(CRON_SECRET))
  if (!valid) return res.status(401).json({ error:'Unauthorized' })
  if (!SB_URL || (!SB_ANON && !SB_SERVICE) || (AUTH_RLS_MODE && !SB_SERVICE)) {
    return res.status(500).json({ error:AUTH_RLS_MODE ? 'Supabase service role missing' : 'Supabase config missing' })
  }

  const startedAt = Date.now()
  const recordRun = async details => {
    try { await persistAutomationRun(createAutomationRun('backup', { startedAt, ...details })) }
    catch (error) { console.error('[backup] automation health:', error.message) }
  }

  try {
    const timestamp = new Date().toISOString()
    const snapshot = AUTH_RLS_MODE ? await normalizedSnapshot(timestamp) : await legacySnapshot(timestamp)
    const records = AUTH_RLS_MODE ? snapshot.tables.records.length : snapshot.hot.records.length
    const employees = AUTH_RLS_MODE ? snapshot.tables.employees.length : snapshot.hot.employees.length
    const bytes = Buffer.from(JSON.stringify(snapshot), 'utf8')
    const checksum = createHash('sha256').update(bytes).digest('hex')
    const filename = `backup-${timestamp.replace(/[:.]/g, '-')}.json`
    const upload = await fetch(`${SB_URL}/storage/v1/object/backups/${filename}`, {
      method:'POST',
      headers:{ ...STORAGE_HEADERS, 'Content-Type':'application/json', 'Cache-Control':'no-store', 'x-upsert':'false',
        'x-metadata':JSON.stringify({ checksum, source:AUTH_RLS_MODE ? 'normalized' : 'legacy-blob', records, employees }) },
      body:bytes,
    })
    if (!upload.ok) throw new Error(`Storage upload failed ${upload.status}: ${(await upload.text()).slice(0, 200)}`)

    const download = await fetch(`${SB_URL}/storage/v1/object/backups/${filename}`, {
      headers:{ ...STORAGE_HEADERS, 'Cache-Control':'no-cache' },
    })
    if (!download.ok) throw new Error(`Backup verification download failed ${download.status}`)
    const inspection = inspectBackupSnapshot(Buffer.from(await download.arrayBuffer()), { expectedChecksum:checksum })
    if (!inspection.valid) throw new Error(`Backup verification failed: ${inspection.errors.join('; ')}`)
    const restorePlan = buildRestorePlan(inspection)
    const sizeKB = Math.round(bytes.byteLength / 1024)
    await recordRun({ checked:records, processed:1, delivered:1 })
    return res.status(200).json({
      ok:true, verified:true, restorable:true, filename, sizeKB, checksum, records, employees,
      restoreRows:restorePlan.targetRows.length, restoreTables:(restorePlan.targetTables || []).length,
    })
  } catch (error) {
    console.error('[backup] fatal:', error)
    await recordRun({ status:'error', error:error.message })
    return res.status(500).json({ error:error.message })
  }
}
