import { buildProductionHealth } from '../src/server/productionHealth.js'

const clean = value => String(value || '').replace(/^\uFEFF/, '').trim()

export default async function handler(_req, res) {
  const sbUrl = clean(process.env.VITE_SB_URL)
  const sbKey = clean(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SB_ANON)
  res.setHeader?.('Cache-Control', 'no-store')
  if (!sbUrl || !sbKey) return res.status(503).json({ status:'degraded', healthy:false, error:'service_configuration' })

  try {
    const response = await fetch(`${sbUrl}/rest/v1/app_data?id=eq.1&select=data`, {
      headers:{ apikey:sbKey, Authorization:`Bearer ${sbKey}`, 'Cache-Control':'no-cache' },
      signal:AbortSignal.timeout(8000),
    })
    if (!response.ok) return res.status(503).json({ status:'degraded', healthy:false, error:'data_unavailable' })
    const blob = (await response.json())?.[0]?.data
    const health = buildProductionHealth(blob)
    const redacted = {
      ...health,
      automations:{
        ...health.automations,
        jobs:health.automations.jobs.map(({ error:_, ...job }) => job),
      },
    }
    return res.status(health.healthy ? 200 : 503).json(redacted)
  } catch {
    return res.status(503).json({ status:'degraded', healthy:false, error:'dependency_unreachable' })
  }
}
