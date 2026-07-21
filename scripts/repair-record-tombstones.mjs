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

async function request(path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers:{ ...headers, ...options.headers } })
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path.split('?')[0]} respondió ${response.status}`)
  return response.status === 204 ? null : response.json().catch(() => null)
}

const [blobRows, deletedRows] = await Promise.all([
  request('app_data?select=data,updated_at&id=eq.1'),
  request('records?select=id&deleted=eq.true'),
])
const blobRow = blobRows[0]
if (!blobRow) throw new Error('No existe app_data id=1')
const deletedIds = new Set(deletedRows.map(row => row.id))
const records = blobRow.data?.records || []
const resurrected = records.filter(record => deletedIds.has(record.id))
const previousTombstones = blobRow.data?._deleted?.records || []
const tombstones = [...new Set([...previousTombstones, ...deletedIds])].slice(-5000)

console.log(JSON.stringify({
  mode:apply ? 'apply' : 'dry-run',
  blobRecords:records.length,
  deletedTableRows:deletedIds.size,
  resurrectedRecords:resurrected.length,
  persistentRecordTombstones:tombstones.length,
}, null, 2))
if (!apply || (!resurrected.length && tombstones.length === previousTombstones.length)) process.exit(0)

const patched = await request(`app_data?id=eq.1&updated_at=eq.${encodeURIComponent(blobRow.updated_at)}`, {
  method:'PATCH', headers:{ Prefer:'return=representation' },
  body:JSON.stringify({
    data:{
      ...blobRow.data,
      records:records.filter(record => !deletedIds.has(record.id)),
      _deleted:{ ...(blobRow.data?._deleted || {}), records:tombstones },
    },
    updated_at:new Date().toISOString(),
  }),
})
if (!patched?.length) throw new Error('app_data cambió durante la reparación; vuelve a ejecutar el comando')
console.log(JSON.stringify({ ok:true, removed:resurrected.length, persistentRecordTombstones:tombstones.length }, null, 2))
