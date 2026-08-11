import { mergeAutomationHealth } from './automationHealth.js'
import { isAuthRlsServerMode } from './securityMode.js'

const clean = value => String(value || '').replace(/^\uFEFF/, '').trim()

export async function persistAutomationRun(run, {
  sbUrl = clean(process.env.VITE_SB_URL),
  sbKey = clean(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SB_ANON),
  fetchImpl = fetch,
  attempts = 3,
} = {}) {
  if (!sbUrl || !sbKey) throw new Error('Supabase automation health config missing')
  const headers = { apikey:sbKey, Authorization:`Bearer ${sbKey}`, 'Content-Type':'application/json' }
  const secureMode = isAuthRlsServerMode()

  for (let attempt = 0; attempt < attempts; attempt++) {
    const readUrl = secureMode
      ? `${sbUrl}/rest/v1/app_entities?id=eq.config%3A__singleton__&select=data,updated_at`
      : `${sbUrl}/rest/v1/app_data?id=eq.1&select=data,updated_at`
    const read = await fetchImpl(readUrl, { headers })
    if (!read.ok) throw new Error(`automation health read ${read.status}`)
    const row = (await read.json())?.[0]
    if (!row?.data || !row.updated_at) throw new Error('automation health state unavailable')

    const merged = mergeAutomationHealth(secureMode ? { config:row.data } : row.data, run)
    const next = secureMode ? merged.config : { ...merged, _ts:Date.now() }
    const writeUrl = secureMode
      ? `${sbUrl}/rest/v1/app_entities?id=eq.config%3A__singleton__&updated_at=eq.${encodeURIComponent(row.updated_at)}`
      : `${sbUrl}/rest/v1/app_data?id=eq.1&updated_at=eq.${encodeURIComponent(row.updated_at)}`
    const write = await fetchImpl(writeUrl, {
      method:'PATCH',
      headers:{ ...headers, Prefer:'return=representation' },
      body:JSON.stringify({ data:next, updated_at:new Date().toISOString() }),
    })
    if (!write.ok) throw new Error(`automation health write ${write.status}`)
    if ((await write.json())?.length) return run
  }

  throw new Error('automation health state changed while recording run')
}
