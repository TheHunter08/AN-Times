import { mergeAutomationHealth } from './automationHealth.js'

const clean = value => String(value || '').replace(/^\uFEFF/, '').trim()

export async function persistAutomationRun(run, {
  sbUrl = clean(process.env.VITE_SB_URL),
  sbKey = clean(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SB_ANON),
  fetchImpl = fetch,
  attempts = 3,
} = {}) {
  if (!sbUrl || !sbKey) throw new Error('Supabase automation health config missing')
  const headers = { apikey:sbKey, Authorization:`Bearer ${sbKey}`, 'Content-Type':'application/json' }

  for (let attempt = 0; attempt < attempts; attempt++) {
    const read = await fetchImpl(`${sbUrl}/rest/v1/app_data?id=eq.1&select=data,updated_at`, { headers })
    if (!read.ok) throw new Error(`automation health read ${read.status}`)
    const row = (await read.json())?.[0]
    if (!row?.data || !row.updated_at) throw new Error('app_data unavailable while recording automation health')

    const next = { ...mergeAutomationHealth(row.data, run), _ts:Date.now() }
    const write = await fetchImpl(`${sbUrl}/rest/v1/app_data?id=eq.1&updated_at=eq.${encodeURIComponent(row.updated_at)}`, {
      method:'PATCH',
      headers:{ ...headers, Prefer:'return=representation' },
      body:JSON.stringify({ data:next, updated_at:new Date().toISOString() }),
    })
    if (!write.ok) throw new Error(`automation health write ${write.status}`)
    if ((await write.json())?.length) return run
  }

  throw new Error('app_data changed while recording automation health')
}
