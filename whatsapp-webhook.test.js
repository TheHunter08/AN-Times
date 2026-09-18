import { afterEach, describe, expect, it, vi } from 'vitest'

process.env.WHATSAPP_WEBHOOK_SECRET = 'test-secret'
process.env.WHATSAPP_VERIFY_TOKEN = 'verify-token'
process.env.WHATSAPP_TOKEN = 'wa-token'
process.env.WHATSAPP_PHONE_ID = 'phone-id'
process.env.VITE_SB_URL = 'https://fake.supabase.co'
process.env.VITE_SB_ANON = 'fake-anon-key'

const jsonResponse = (body, ok = true) => ({
  ok, status: ok ? 200 : 500,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

const res = () => {
  const r = {}
  r.status = code => { r.statusCode = code; return r }
  r.json = body => { r.body = body; return r }
  r.send = body => { r.body = body; return r }
  r.end = () => { return r }
  return r
}

const waRequest = (msgId, text) => ({
  method: 'POST',
  query: { secret: 'test-secret' },
  body: {
    entry: [{ changes: [{ value: { messages: [{ id: msgId, from: '34600111222', type: 'text', text: { body: text } }] } }] }],
  },
})

describe('whatsapp-webhook (dedupe persistente)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

  it('un reintento de Meta con el mismo id de mensaje no ficha dos veces la entrada', async () => {
    let appData = {
      employees: [{ id: 'emp1', name: 'Ana', telefono: '34600111222', baja: false, centroTrabajo: 'Obra A' }],
      records: [],
    }
    const dedupeClaims = new Set()
    const fetchMock = vi.fn(async (url, opts) => {
      const u = url.toString()
      if (u.includes('/rest/v1/app_data?id=eq.1') && opts?.method === 'PATCH') {
        appData = JSON.parse(opts.body).data
        return jsonResponse(null)
      }
      if (u.includes('/rest/v1/app_data?id=eq.1')) return jsonResponse([{ data: appData }])
      if (u.includes('/rest/v1/app_entities?on_conflict=id')) {
        const body = JSON.parse(opts.body)
        if (dedupeClaims.has(body.id)) return jsonResponse([]) // ignore-duplicates: ya reservado
        dedupeClaims.add(body.id)
        return jsonResponse([{ id: body.id }])
      }
      if (u.includes('graph.facebook.com')) return jsonResponse({ ok: true })
      throw new Error('fetch inesperado en el test: ' + u)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { default: handler1 } = await import('./api/whatsapp-webhook.js')
    const req1 = waRequest('wamid.SAME_ID', 'entrada')
    const response1 = res()
    await handler1(req1, response1)
    expect(response1.body.ok).toBe(true)
    expect(response1.body.changed).toBe(true)
    expect(appData.records).toHaveLength(1)

    // Meta reintenta el MISMO mensaje (mismo id) y la petición aterriza en
    // OTRA instancia serverless — se simula con vi.resetModules() + una
    // nueva importación, que resetea cualquier estado en memoria del módulo
    // (como el Map de dedupe que había antes) pero no el estado "persistido"
    // en fetchMock (dedupeClaims/appData), igual que en producción real.
    // Sin dedupe persistente, esto creaba una SEGUNDA entrada para el mismo
    // empleado.
    vi.resetModules()
    vi.stubGlobal('fetch', fetchMock)
    const { default: handler2 } = await import('./api/whatsapp-webhook.js')
    const req2 = waRequest('wamid.SAME_ID', 'entrada')
    const response2 = res()
    await handler2(req2, response2)
    expect(response2.body.deduped).toBe(true)
    expect(appData.records).toHaveLength(1)
  })
})
