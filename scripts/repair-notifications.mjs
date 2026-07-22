import { readFileSync } from 'node:fs'
import { dedupeNotifications } from '../src/utils/notifications.js'

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

async function request(path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers:{ ...headers, ...options.headers } })
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path.split('?')[0]} respondió ${response.status}`)
  if (response.status === 204) return null
  return response.json().catch(() => null)
}

const [blobRows, entityRows] = await Promise.all([
  request('app_data?select=data,updated_at&id=eq.1'),
  request('app_entities?select=id,entity_id,data,deleted,updated_at&collection=eq.notis'),
])
const blobRow = blobRows[0]
if (!blobRow) throw new Error('No existe app_data id=1')
const blobItems = blobRow.data?.notis || []
// Un tombstone granular es una eliminación ya confirmada. No volver a tratar
// como activa la copia antigua que todavía pueda quedar en el blob de respaldo.
const tombstonedIds = new Set(entityRows
  .filter(item => item.deleted || item.data?.deleted)
  .map(item => String(item.entity_id || item.data?.id || ''))
  .filter(Boolean))
const activeBlob = blobItems.filter(item => !item?.deleted && !tombstonedIds.has(String(item?.id || '')))
const activeEntities = entityRows.filter(item => !item.deleted && !item.data?.deleted).map(item => ({
  ...(item.data || {}), id:item.entity_id || item.data?.id, _upd:item.data?._upd || item.updated_at,
}))
const cleaned = dedupeNotifications([...activeBlob, ...activeEntities])
const retainedIds = new Set(cleaned.map(item => item.id))
const rowsToDelete = entityRows.filter(item => !retainedIds.has(item.entity_id || item.data?.id) || item.deleted || item.data?.deleted)

console.log(JSON.stringify({
  mode:apply ? 'apply' : 'dry-run',
  blobBefore:blobItems.length,
  activeBefore:activeBlob.length,
  activeAfter:cleaned.length,
  removedByTombstone:blobItems.filter(item => tombstonedIds.has(String(item?.id || ''))).length,
  tableRowsToMarkDeleted:rowsToDelete.length,
}, null, 2))
if (!apply) process.exit(0)

// Solo sustituye el blob si nadie lo cambió desde la lectura inicial.
const updatedFilter = encodeURIComponent(blobRow.updated_at)
const patched = await request(`app_data?id=eq.1&updated_at=eq.${updatedFilter}`, {
  method:'PATCH',
  headers:{ Prefer:'return=representation' },
  body:JSON.stringify({ data:{ ...blobRow.data, notis:cleaned }, updated_at:new Date().toISOString() }),
})
if (!patched?.length) throw new Error('app_data cambió durante la limpieza; vuelve a ejecutar el comando')

const deletedAt = new Date().toISOString()
for (const row of rowsToDelete) {
  await request(`app_entities?id=eq.${encodeURIComponent(row.id)}`, {
    method:'PATCH', headers:{ Prefer:'return=minimal' },
    body:JSON.stringify({ deleted:true, updated_at:deletedAt, data:{ ...(row.data || {}), deleted:true, _upd:deletedAt } }),
  })
}
console.log(JSON.stringify({ ok:true, activeNotifications:cleaned.length, rowsMarkedDeleted:rowsToDelete.length }, null, 2))
