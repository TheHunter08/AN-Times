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
// Son los mismos identificadores públicos de respaldo que usa la PWA.
const url = String(process.env.VITE_SB_URL || 'https://eyyhlcvpyiorpdnvqsll.supabase.co').replace(/\/$/, '')
const key = String(process.env.VITE_SB_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I')
const headers = { apikey:key, Authorization:`Bearer ${key}` }

async function rows(path) {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers })
  if (!response.ok) throw new Error(`${path.split('?')[0]} respondió ${response.status}`)
  return response.json()
}

const [blobRows, entityRows] = await Promise.all([
  rows('app_data?select=data&id=eq.1'),
  rows('app_entities?select=id,entity_id,data,deleted,updated_at&collection=eq.notis'),
])
const blobItems = blobRows[0]?.data?.notis || []
const tombstonedIds = new Set(entityRows
  .filter(item => item.deleted || item.data?.deleted)
  .map(item => String(item.entity_id || item.data?.id || ''))
  .filter(Boolean))
const activeBlob = blobItems.filter(item => !item?.deleted && !tombstonedIds.has(String(item?.id || '')))
const activeEntities = entityRows.filter(item => !item.deleted && !item.data?.deleted).map(item => ({
  ...(item.data || {}),
  id:item.entity_id || item.data?.id,
  _upd:item.data?._upd || item.updated_at,
}))
const combined = dedupeNotifications([...activeBlob, ...activeEntities])
const sourceIds = new Set([...activeBlob, ...activeEntities].map(item => item?.id).filter(Boolean))
const retainedIds = new Set(combined.map(item => item.id))

console.log(JSON.stringify({
  blobNotifications:blobItems.length,
  blobSoftDeleted:blobItems.length - activeBlob.length,
  blobItemsOverriddenByTombstone:blobItems.filter(item => tombstonedIds.has(String(item?.id || ''))).length,
  tableNotifications:entityRows.length,
  tableSoftDeleted:entityRows.filter(item => item.deleted || item.data?.deleted).length,
  uniqueActiveNotifications:combined.length,
  duplicateActiveNotifications:[...sourceIds].filter(id => !retainedIds.has(id)).length,
}, null, 2))
