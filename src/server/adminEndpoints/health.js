import { buildProductionHealth } from '../productionHealth.js'
import { isAuthRlsServerMode } from '../securityMode.js'

const clean = value => String(value || '').replace(/^\uFEFF/, '').trim()

export default async function health(_req, res) {
  const sbUrl = clean(process.env.VITE_SB_URL)
  const serviceKey = clean(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  const secureMode = isAuthRlsServerMode()
  const sbKey = serviceKey || clean(process.env.VITE_SB_ANON)
  res.setHeader?.('Cache-Control', 'no-store')
  if (!sbUrl || !sbKey || (secureMode && !serviceKey)) return res.status(503).json({ status:'degraded', healthy:false, error:'service_configuration' })

  try {
    const sourceUrl = secureMode
      ? `${sbUrl}/rest/v1/app_entities?id=eq.config%3A__singleton__&select=data`
      : `${sbUrl}/rest/v1/app_data?id=eq.1&select=data`
    const response = await fetch(sourceUrl, {
      headers:{ apikey:sbKey, Authorization:`Bearer ${sbKey}`, 'Cache-Control':'no-cache' },
      signal:AbortSignal.timeout(8000),
    })
    if (!response.ok) return res.status(503).json({ status:'degraded', healthy:false, error:'data_unavailable' })
    const source = (await response.json())?.[0]?.data
    const blob = secureMode ? { config:source || {} } : source
    const healthState = buildProductionHealth(blob)
    const redacted = {
      ...healthState,
      automations:{
        ...healthState.automations,
        jobs:healthState.automations.jobs.map(({ error:_, ...job }) => job),
      },
    }
    return res.status(healthState.healthy ? 200 : 503).json(redacted)
  } catch {
    return res.status(503).json({ status:'degraded', healthy:false, error:'dependency_unreachable' })
  }
}
