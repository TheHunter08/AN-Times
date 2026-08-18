import { mergeAutomationHealth } from './automationHealth.js'

const clean = value => String(value || '').replace(/^\uFEFF/, '').trim()

// El cliente escribe la colecci\u00F3n `config` en app_entities (fila
// config:__singleton__) tras cada guardado del blob (ver dataServiceV2.js:
// _syncToTables) \u2014 es la misma copia que cloudFetch() ya lee como fuente
// principal. Leer/escribir esa fila en vez de app_data.data completo evita
// descargar y reescribir el blob entero (decenas de MB, con historial de
// fichajes/gastos/chats/etc.) en cada ejecuci\u00F3n de cron, sin depender de si
// el sello Auth/RLS est\u00E1 activo.
export async function persistAutomationRun(run, {
  sbUrl = clean(process.env.VITE_SB_URL),
  sbKey = clean(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SB_ANON),
  fetchImpl = fetch,
  attempts = 3,
} = {}) {
  if (!sbUrl || !sbKey) throw new Error('Supabase automation health config missing')
  const headers = { apikey:sbKey, Authorization:`Bearer ${sbKey}`, 'Content-Type':'application/json' }

  for (let attempt = 0; attempt < attempts; attempt++) {
    const readUrl = `${sbUrl}/rest/v1/app_entities?id=eq.config%3A__singleton__&select=data,updated_at`
    const read = await fetchImpl(readUrl, { headers })
    if (!read.ok) throw new Error(`automation health read ${read.status}`)
    const row = (await read.json())?.[0]
    if (!row?.data || !row.updated_at) throw new Error('automation health state unavailable')

    const merged = mergeAutomationHealth({ config:row.data }, run)
    const writeUrl = `${sbUrl}/rest/v1/app_entities?id=eq.config%3A__singleton__&updated_at=eq.${encodeURIComponent(row.updated_at)}`
    const write = await fetchImpl(writeUrl, {
      method:'PATCH',
      headers:{ ...headers, Prefer:'return=representation' },
      body:JSON.stringify({ data:merged.config, updated_at:new Date().toISOString() }),
    })
    if (!write.ok) throw new Error(`automation health write ${write.status}`)
    if ((await write.json())?.length) return run
  }

  throw new Error('automation health state changed while recording run')
}
