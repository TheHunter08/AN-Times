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
const url = String(process.env.VITE_SB_URL || 'https://eyyhlcvpyiorpdnvqsll.supabase.co').replace(/\/$/, '')
const key = String(process.env.VITE_SB_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I')
const headers = { apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json' }
const apply = process.argv.includes('--apply')

async function request(path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers:{ ...headers, ...options.headers } })
  if (!response.ok) throw new Error(`${options.method || 'GET'} falló con ${response.status}`)
  return response.status === 204 ? null : response.json()
}

const [employees, subscriptions] = await Promise.all([
  request('employees?select=id,baja'),
  request('push_subs?select=user_id,endpoint,updated_at'),
])
const activeIds = new Set(employees.filter(item => !item.baja).map(item => item.id))
const byEndpoint = new Map()
for (const item of subscriptions) {
  if (!byEndpoint.has(item.endpoint)) byEndpoint.set(item.endpoint, [])
  byEndpoint.get(item.endpoint).push(item)
}

const removals = []
for (const group of byEndpoint.values()) {
  if (group.length < 2) continue
  const ordered = [...group].sort((a, b) => {
    const activeDelta = Number(activeIds.has(b.user_id)) - Number(activeIds.has(a.user_id))
    return activeDelta || String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
  })
  removals.push(...ordered.slice(1))
}

console.log(JSON.stringify({ mode:apply ? 'apply' : 'dry-run', subscriptions:subscriptions.length, duplicatedEndpoints:[...byEndpoint.values()].filter(group => group.length > 1).length, associationsToRemove:removals.length }, null, 2))
if (!apply) process.exit(0)

for (const item of removals) {
  await request(`push_subs?user_id=eq.${encodeURIComponent(item.user_id)}&endpoint=eq.${encodeURIComponent(item.endpoint)}`, {
    method:'DELETE', headers:{ Prefer:'return=minimal' },
  })
}
console.log(JSON.stringify({ ok:true, removed:removals.length }, null, 2))
