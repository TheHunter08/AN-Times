import { afterEach, describe, expect, it, vi } from 'vitest'

process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-secret'
process.env.VITE_SB_URL = process.env.VITE_SB_URL || 'https://fake.supabase.co'
process.env.VITE_SB_ANON = process.env.VITE_SB_ANON || 'fake-anon-key'
process.env.SB_SERVICE_KEY = process.env.SB_SERVICE_KEY || 'service-key'

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

describe('cron-cleanup-push-subs', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

  it('rechaza sin el secreto correcto', async () => {
    const { default: handler } = await import('./api/cron-cleanup-push-subs.js')
    const response = res()
    await handler({ headers: { authorization: 'Bearer nope' } }, response)
    expect(response.statusCode).toBe(401)
  })

  it('borra huérfanas y duplicadas, y registra la ejecución en la salud de automatización', async () => {
    let configRow = {}
    const deletedFilters = []
    const fetchMock = vi.fn(async (url, opts) => {
      const u = url.toString()
      if (u.includes('/rest/v1/employees?select=')) {
        return jsonResponse([{ id: 'active', baja: false }])
      }
      if (u.includes('/rest/v1/push_subs?select=')) {
        return jsonResponse([
          { user_id: 'active', endpoint: 'a', updated_at: '2026-01-01' },
          { user_id: 'ghost', endpoint: 'b', updated_at: '2026-01-01' },
        ])
      }
      if (opts?.method === 'DELETE' && u.includes('/rest/v1/push_subs?')) {
        deletedFilters.push(u)
        return jsonResponse(null)
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

    const { default: handler } = await import('./api/cron-cleanup-push-subs.js')
    const response = res()
    await handler(authedReq, response)

    expect(response.statusCode).toBe(200)
    expect(response.body.orphaned).toBe(1)
    expect(response.body.duplicated).toBe(0)
    expect(response.body.removed).toBe(1)
    expect(deletedFilters).toHaveLength(1)
    expect(deletedFilters[0]).toContain('user_id=eq.ghost')
    const health = configRow.automationHealth?.pushCleanup
    expect(health?.status).toBe('ok')
    expect(health?.processed).toBe(1)
  })
})
