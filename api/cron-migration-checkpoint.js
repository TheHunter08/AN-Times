import { timingSafeEqual } from 'crypto'
import { createAutomationRun, mergeAutomationHealth } from '../src/server/automationHealth.js'
import { buildMigrationCheckpoint, evaluateMigrationParity } from '../src/server/migrationParity.js'

const clean = value => String(value || '').replace(/^\uFEFF/, '').trim()
const SB_URL = clean(process.env.VITE_SB_URL)
const SB_ANON = clean(process.env.VITE_SB_ANON)
const SB_SERVICE = clean(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
const CRON_SECRET = process.env.CRON_SECRET
const headers = { apikey:SB_SERVICE || SB_ANON, Authorization:`Bearer ${SB_SERVICE || SB_ANON}` }

async function readAll(table, select) {
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const response = await fetch(`${SB_URL}/rest/v1/${table}?select=${select}`, {
      headers:{ ...headers, Range:`${from}-${from + pageSize - 1}` },
    })
    if (!response.ok) throw new Error(`${table} read ${response.status}`)
    const batch = await response.json()
    rows.push(...batch)
    if (batch.length < pageSize) return rows
  }
}

async function readBlob() {
  const response = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data,updated_at`, { headers })
  if (!response.ok) throw new Error(`app_data read ${response.status}`)
  return (await response.json())?.[0] || null
}

async function writeCheckpoint(parity, startedAt) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await readBlob()
    if (!row?.data) throw new Error('app_data no disponible')
    const previous = row.data.config?.migrationVerification || {}
    const nowIso = new Date().toISOString()
    const checkpoint = buildMigrationCheckpoint(previous, parity, nowIso)
    const run = createAutomationRun('migration', { startedAt, checked:parity.expected, processed:parity.actual, status:parity.consistent ? 'ok' : 'error', error:parity.consistent ? null : `${parity.missingCount} faltantes · ${parity.staleCount} obsoletos` })
    const next = mergeAutomationHealth(row.data, run)
    next.config = { ...(next.config || {}), migrationVerification:checkpoint }
    next._ts = Date.now()
    const response = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&updated_at=eq.${encodeURIComponent(row.updated_at)}`, {
      method:'PATCH',
      headers:{ ...headers, 'Content-Type':'application/json', Prefer:'return=representation' },
      body:JSON.stringify({ data:next, updated_at:nowIso }),
    })
    if (!response.ok) throw new Error(`checkpoint write ${response.status}`)
    if ((await response.json())?.length) return checkpoint
  }
  throw new Error('app_data cambió durante el checkpoint')
}

export default async function handler(req, res) {
  if (!CRON_SECRET) return res.status(500).json({ error:'CRON_SECRET no configurado' })
  const token = String(req.headers.authorization || '').replace('Bearer ', '')
  const valid = token.length === CRON_SECRET.length && timingSafeEqual(Buffer.from(token), Buffer.from(CRON_SECRET))
  if (!valid) return res.status(401).json({ error:'Unauthorized' })
  if (!SB_URL || !SB_ANON || !SB_SERVICE) return res.status(500).json({ error:'Supabase service config missing' })
  const startedAt = Date.now()
  try {
    const [blob, employees, records, vacaciones, cierres, obras, entities] = await Promise.all([
      readBlob(),
      readAll('employees', 'id,updated_at'),
      readAll('records', 'id,updated_at,deleted'),
      readAll('vacaciones', 'id,updated_at,deleted'),
      readAll('cierres', 'id,updated_at,deleted'),
      readAll('obras', 'id,updated_at,deleted'),
      readAll('app_entities', 'id,updated_at,deleted'),
    ])
    if (!blob?.data) throw new Error('app_data no disponible')
    const parity = evaluateMigrationParity(blob.data, { employees, records, vacaciones, cierres, obras, app_entities:entities })
    const checkpoint = await writeCheckpoint(parity, startedAt)
    return res.status(200).json({ ok:true, checkpoint })
  } catch (error) {
    console.error('[cron-migration-checkpoint]', error)
    return res.status(500).json({ error:'Migration checkpoint failed' })
  }
}
