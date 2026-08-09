import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./persistAutomationHealth.js', () => ({
  persistAutomationRun: vi.fn().mockResolvedValue(true),
}))

const response = () => {
  const result = { statusCode: 0, payload: null }
  return {
    result,
    res: {
      status(code) { result.statusCode = code; return this },
      json(payload) { result.payload = payload; return this },
    },
  }
}

describe('backup endpoint', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('sube un snapshot inmutable y verifica exactamente los bytes guardados', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret')
    vi.stubEnv('VITE_SB_URL', 'https://fake.supabase.co')
    vi.stubEnv('VITE_SB_ANON', 'fake-anon-key')

    let uploadedBytes
    let uploadedUrl
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (String(url).includes('/rest/v1/app_data?id=eq.1')) {
        return new Response(JSON.stringify([{ data:{ records:[{ id:'r1' }], employees:[{ id:'e1' }] }, updated_at:'2026-08-09' }]))
      }
      if (String(url).includes('/rest/v1/app_data?id=eq.3')) {
        return new Response(JSON.stringify([{ data:{ records:[] }, updated_at:'2026-08-09' }]))
      }
      if (options.method === 'POST') {
        uploadedUrl = String(url)
        uploadedBytes = Buffer.from(options.body)
        expect(options.headers['x-upsert']).toBe('false')
        return new Response('{}', { status:200 })
      }
      return new Response(uploadedBytes, { status:200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { default: handler } = await import('../../api/backup.js')
    const { res, result } = response()
    await handler({ headers:{ authorization:'Bearer test-secret' } }, res)

    expect(result.statusCode).toBe(200)
    expect(result.payload).toMatchObject({ ok:true, verified:true, records:1, employees:1 })
    expect(result.payload.filename).toMatch(/^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/)
    expect(uploadedUrl.endsWith(`/backups/${result.payload.filename}`)).toBe(true)
    expect(JSON.parse(uploadedBytes.toString('utf8'))).toMatchObject({ hot:{ records:[{ id:'r1' }] } })
  })
})
