import { readFileSync } from 'node:fs'
import { createAutomationRun, mergeAutomationHealth } from '../src/server/automationHealth.js'
import { buildMigrationCheckpoint, evaluateMigrationParity } from '../src/server/migrationParity.js'

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
const key = String(process.env.VITE_SB_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I')
const headers = { apikey:key, Authorization:`Bearer ${key}` }

async function readAll(table, select) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const response = await fetch(`${url}/rest/v1/${table}?select=${select}`, { headers:{ ...headers, Range:`${from}-${from + 999}` } })
    if (!response.ok) throw new Error(`${table} respondió ${response.status}`)
    const batch = await response.json()
    rows.push(...batch)
    if (batch.length < 1000) return rows
  }
}

const [blobRows, employees, records, vacaciones, cierres, obras, entities] = await Promise.all([
  readAll('app_data', 'data,updated_at'),
  readAll('employees', 'id,updated_at'),
  readAll('records', 'id,updated_at,deleted'),
  readAll('vacaciones', 'id,updated_at,deleted'),
  readAll('cierres', 'id,updated_at,deleted'),
  readAll('obras', 'id,updated_at,deleted'),
  readAll('app_entities', 'id,updated_at,deleted'),
])
const blob = blobRows[0]?.data
if (!blob) throw new Error('app_data no disponible')
const parity = evaluateMigrationParity(blob, { employees, records, vacaciones, cierres, obras, app_entities:entities })
console.log(JSON.stringify(parity, null, 2))
if (process.argv.includes('--record')) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const latestRows = await readAll('app_data', 'data,updated_at')
    const latest = latestRows[0]
    if (!latest?.data) throw new Error('app_data no disponible para guardar checkpoint')
    const nowIso = new Date().toISOString()
    const checkpoint = buildMigrationCheckpoint(latest.data.config?.migrationVerification || {}, parity, nowIso)
    const run = createAutomationRun('migration', { checked:parity.expected, processed:parity.actual, status:parity.consistent ? 'ok' : 'error', error:parity.consistent ? null : `${parity.missingCount} faltantes · ${parity.staleCount} obsoletos` })
    const next = mergeAutomationHealth(latest.data, run)
    next.config = { ...(next.config || {}), migrationVerification:checkpoint }
    next._ts = Date.now()
    const response = await fetch(`${url}/rest/v1/app_data?id=eq.1&updated_at=eq.${encodeURIComponent(latest.updated_at)}`, {
      method:'PATCH',
      headers:{ ...headers, 'Content-Type':'application/json', Prefer:'return=representation' },
      body:JSON.stringify({ data:next, updated_at:nowIso }),
    })
    if (!response.ok) throw new Error(`checkpoint respondió ${response.status}: ${(await response.text()).slice(0, 180)}`)
    if ((await response.json())?.length) {
      console.log(JSON.stringify({ recorded:true, checkpoint }, null, 2))
      break
    }
    if (attempt === 2) throw new Error('app_data cambió durante el checkpoint')
  }
}
if (process.argv.includes('--strict') && !parity.consistent) process.exitCode = 1
