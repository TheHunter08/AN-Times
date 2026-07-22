import { readFileSync } from 'node:fs'

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
const key = String(process.env.VITE_SB_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I')
const headers = { apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json' }
const apply = process.argv.includes('--apply')
const collections = ['medicos','ausencias','mensajes','notis','documentos','audit','correccionesFichaje','chats','gastos','wellbeing','turnos','partesTrabajo']
const companyId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

async function request(path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers:{ ...headers, ...options.headers } })
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path.split('?')[0]} respondió ${response.status}: ${(await response.text()).slice(0, 180)}`)
  if (response.status === 204) return null
  return response.json().catch(() => null)
}

const [blobRows, entityRows] = await Promise.all([
  request('app_data?select=data,updated_at&id=eq.1'),
  request('app_entities?select=id,collection,entity_id,data,revision,deleted,updated_at'),
])
const blobRow = blobRows[0]
if (!blobRow) throw new Error('No existe app_data id=1')

const nextData = { ...(blobRow.data || {}) }
const rowsToUpsert = []
const report = {}

for (const collection of collections) {
  const tableRows = entityRows.filter(row => row.collection === collection)
  const activeIds = new Set(tableRows.filter(row => !row.deleted && !row.data?.deleted).map(row => String(row.entity_id)))
  const tombstonedIds = new Set(tableRows.filter(row => row.deleted || row.data?.deleted).map(row => String(row.entity_id)))
  const blobItems = Array.isArray(nextData[collection]) ? nextData[collection] : []
  const cleaned = blobItems.filter(item => item?.id != null && !item.deleted && !tombstonedIds.has(String(item.id)))
  const missing = cleaned.filter(item => !activeIds.has(String(item.id)))
  nextData[collection] = cleaned
  for (const item of missing) {
    const entityId = String(item.id)
    rowsToUpsert.push({
      id:`${collection}:${entityId}`,
      company_id:companyId,
      collection,
      entity_id:entityId,
      data:item,
      revision:Math.max(1, Number(item._rev) || 1),
      deleted:false,
      updated_at:item._upd || item.ts || new Date().toISOString(),
    })
  }
  report[collection] = {
    blobBefore:blobItems.length,
    blobAfter:cleaned.length,
    removedByTombstone:blobItems.length - cleaned.length,
    missingFromTable:missing.length,
    tableActive:activeIds.size,
    tableTombstones:tombstonedIds.size,
  }
}

const blobChanged = collections.some(collection =>
  JSON.stringify(blobRow.data?.[collection] || []) !== JSON.stringify(nextData[collection] || [])
)
console.log(JSON.stringify({ mode:apply ? 'apply' : 'dry-run', blobChanged, rowsToUpsert:rowsToUpsert.length, collections:report }, null, 2))
if (!apply) process.exit(0)

if (blobChanged) {
  const updatedFilter = encodeURIComponent(blobRow.updated_at)
  const patched = await request(`app_data?id=eq.1&updated_at=eq.${updatedFilter}`, {
    method:'PATCH',
    headers:{ Prefer:'return=representation' },
    body:JSON.stringify({ data:nextData, updated_at:new Date().toISOString() }),
  })
  if (!patched?.length) throw new Error('app_data cambió durante la reparación; vuelve a ejecutar el comando')
}

if (rowsToUpsert.length) {
  await request('app_entities?on_conflict=id', {
    method:'POST',
    headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
    body:JSON.stringify(rowsToUpsert),
  })
}
console.log(JSON.stringify({ ok:true, blobUpdated:blobChanged, rowsUpserted:rowsToUpsert.length }, null, 2))
