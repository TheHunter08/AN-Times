import { buildProductionHealth } from '../productionHealth.js'

const clean = value => String(value || '').replace(/^\uFEFF/, '').trim()

export default async function health(_req, res) {
  const sbUrl = clean(process.env.VITE_SB_URL)
  const serviceKey = clean(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  const sbKey = serviceKey || clean(process.env.VITE_SB_ANON)
  res.setHeader?.('Cache-Control', 'no-store')
  if (!sbUrl || !sbKey) return res.status(503).json({ status:'degraded', healthy:false, error:'service_configuration' })

  try {
    // Este healthcheck lo dispara el workflow operativo cada 30 min (48
    // veces al d\u00EDa). Antes descargaba el blob `app_data` completo solo para
    // comprobar que `records`/`employees` son arrays y leer
    // config.automationHealth \u2014 igual que en los crons de recordatorios y
    // autocierre, eso pesaba decenas de MB por ejecuci\u00F3n. `employees` y
    // `records` ya son tablas normalizadas: basta pedir 1 fila de cada para
    // confirmar que responden con forma de array, sin traer el hist\u00F3rico.
    const headers = { apikey:sbKey, Authorization:`Bearer ${sbKey}`, 'Cache-Control':'no-cache' }
    const timeoutSignal = () => AbortSignal.timeout(8000)
    const [configResponse, employeesResponse, recordsResponse] = await Promise.all([
      fetch(`${sbUrl}/rest/v1/app_entities?id=eq.config%3A__singleton__&select=data`, { headers, signal:timeoutSignal() }),
      fetch(`${sbUrl}/rest/v1/employees?select=id&limit=1`, { headers, signal:timeoutSignal() }),
      fetch(`${sbUrl}/rest/v1/records?select=id&limit=1`, { headers, signal:timeoutSignal() }),
    ])
    if (![configResponse, employeesResponse, recordsResponse].every(response => response.ok)) {
      return res.status(503).json({ status:'degraded', healthy:false, error:'data_unavailable' })
    }
    const config = (await configResponse.json())?.[0]?.data || {}
    const employees = await employeesResponse.json()
    const records = await recordsResponse.json()
    const blob = { config, employees, records }
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
