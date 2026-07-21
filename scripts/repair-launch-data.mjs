import { readFileSync } from 'node:fs'

function loadEnvFile(path) {
  try {
    for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = raw.trim().replace(/^\uFEFF/, '')
      const index = line.indexOf('=')
      if (!line || line.startsWith('#') || index < 1) continue
      const key = line.slice(0, index).trim()
      if (process.env[key] == null) process.env[key] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    }
  } catch {}
}

loadEnvFile('.env')
const url = String(process.env.VITE_SB_URL || 'https://eyyhlcvpyiorpdnvqsll.supabase.co').replace(/\/$/, '')
const key = String(process.env.VITE_SB_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I')
const headers = { apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json' }
const apply = process.argv.includes('--apply')

async function request(path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers:{ ...headers, ...options.headers } })
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path.split('?')[0]} respondió ${response.status}: ${(await response.text()).slice(0, 200)}`)
  return response.status === 204 ? null : response.json()
}

const [blobRow] = await request('app_data?select=data,updated_at&id=eq.1')
const tableClosures = await request('cierres?select=id,mes,firma_admin,firma_emp,deleted')
if (!blobRow) throw new Error('No existe app_data id=1')

const currentMonth = new Date().toLocaleDateString('en-CA', { timeZone:'Europe/Madrid', year:'numeric', month:'2-digit' }).slice(0, 7)
const invalidTable = tableClosures.filter(item => item.mes >= currentMonth && !item.firma_admin && !item.firma_emp && !item.deleted)
const invalidBlob = (blobRow.data?.cierres || []).filter(item =>
  item.mes >= currentMonth && !item.firmaAdmin && !item.firmaEmp && !item.firma
)
const ids = new Set([...invalidTable, ...invalidBlob].map(item => item.id))

console.log(JSON.stringify({ mode:apply ? 'apply' : 'dry-run', currentMonth, invalidClosures:ids.size }, null, 2))
if (!apply || !ids.size) process.exit(0)

const now = new Date().toISOString()
for (const id of ids) {
  await request(`cierres?id=eq.${encodeURIComponent(id)}`, {
    method:'PATCH',
    headers:{ Prefer:'return=minimal' },
    body:JSON.stringify({ deleted:true, deleted_at:now, updated_at:now }),
  })
}

const nextData = {
  ...blobRow.data,
  cierres:(blobRow.data?.cierres || []).filter(item => !ids.has(item.id)),
  _ts:Date.now(),
}
const updated = await request(`app_data?id=eq.1&updated_at=eq.${encodeURIComponent(blobRow.updated_at)}`, {
  method:'PATCH',
  headers:{ Prefer:'return=representation' },
  body:JSON.stringify({ data:nextData, updated_at:now }),
})
if (!updated?.length) throw new Error('app_data cambió durante la reparación; vuelve a ejecutar para completar la limpieza')
console.log(JSON.stringify({ ok:true, removedInvalidClosures:ids.size }, null, 2))
