import { afterEach, describe, expect, it, vi } from 'vitest'

process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-secret'
process.env.VITE_SB_URL = process.env.VITE_SB_URL || 'https://fake.supabase.co'
process.env.VITE_SB_ANON = process.env.VITE_SB_ANON || 'fake-anon-key'
process.env.SB_SERVICE_KEY = process.env.SB_SERVICE_KEY || 'service-key'
// VAPID deliberadamente ausente: es justo el escenario que este test cubre.
delete process.env.VAPID_PUBLIC
delete process.env.VAPID_PRIVATE

const jsonResponse = (body, ok = true) => ({
  ok, status: ok ? 200 : 500,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

const authedReq = { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }
const res = () => {
  const r = {}
  r.status = code => { r.statusCode = code; return r }
  r.json = body => { r.body = body; return r }
  return r
}

describe('cron-autoclose (salud cuando falla la notificación)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

  it('si VAPID no está configurado, el run queda marcado como error aunque la jornada se cierre bien', async () => {
    // `configRow` es la fila app_entities `config:__singleton__` tal cual —
    // persistAutomationRun le anida `automationHealth.<job>` dentro.
    let configRow = {}
    const openRecord = {
      id: 'r1', emp_id: 'emp1', emp_name: 'Ana',
      inicio: new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString(),
      fin: null, breaks: [], work_secs: 0, break_secs: 0, closed: false, updated_at: new Date().toISOString(),
    }
    const fetchMock = vi.fn(async (url, opts) => {
      const u = url.toString()
      if (u.includes('/rest/v1/records?') && (!opts || opts.method === undefined)) {
        return jsonResponse([openRecord])
      }
      if (u.includes('/rest/v1/records?on_conflict=id')) {
        return jsonResponse([{ id: 'r1' }])
      }
      if (u.includes('/rest/v1/app_entities?id=eq.config%3A__singleton__&select=')) {
        return jsonResponse([{ data: configRow, updated_at: '2026-09-18T00:00:00Z' }])
      }
      if (u.includes('/rest/v1/app_entities?id=eq.config%3A__singleton__&updated_at=')) {
        configRow = JSON.parse(opts.body).data
        return jsonResponse([{ id: 'config:__singleton__' }])
      }
      throw new Error('fetch inesperado en el test: ' + u)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { default: handler } = await import('./api/cron-autoclose.js')
    const response = res()
    await handler(authedReq, response)

    expect(response.statusCode).toBe(200)
    expect(response.body.closed).toBe(1)
    expect(response.body.pushSent).toBe(0)
    const autocloseHealth = configRow.automationHealth?.autoclose
    expect(autocloseHealth?.status).toBe('error')
    expect(autocloseHealth?.error).toMatch(/VAPID/)
  })
})
