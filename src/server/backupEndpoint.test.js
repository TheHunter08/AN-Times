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
    vi.stubEnv('SB_SERVICE_KEY', 'fake-service-key')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

    let uploadedBytes
    let uploadedUrl
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (String(url).includes('/rest/v1/app_data?id=eq.1')) {
        expect(options.headers.Authorization).toBe('Bearer fake-service-key')
        return new Response(JSON.stringify([{ data:{ records:[{ id:'r1' }], employees:[{ id:'e1' }] }, updated_at:'2026-08-09' }]))
      }
      if (String(url).includes('/rest/v1/app_data?id=eq.3')) {
        expect(options.headers.Authorization).toBe('Bearer fake-service-key')
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

  it('en Auth/RLS respalda tablas normalizadas con service role', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret')
    vi.stubEnv('VITE_SB_URL', 'https://fake.supabase.co')
    vi.stubEnv('VITE_SB_ANON', 'fake-anon-key')
    vi.stubEnv('SB_SERVICE_KEY', 'fake-service-key')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
    vi.stubEnv('VITE_SECURITY_MODE', 'auth_rls')
    vi.stubEnv('VITE_SECURITY_ACTIVATION_SEAL', 'TIMES_INC_AUTH_RLS_2026_08_11')

    let uploadedBytes
    const fetchMock = vi.fn(async (url, options = {}) => {
      const value = String(url)
      if (value.includes('/rest/v1/')) {
        const table = value.split('/rest/v1/')[1].split('?')[0]
        const rows = table === 'employees' ? [{ id:'e1' }]
          : table === 'records' ? [{ id:'r1' }]
            : table === 'companies' ? [{ id:'c1' }] : []
        expect(options.headers.Authorization).toBe('Bearer fake-service-key')
        return new Response(JSON.stringify(rows), { status:200 })
      }
      if (options.method === 'POST') {
        uploadedBytes = Buffer.from(options.body)
        return new Response('{}', { status:200 })
      }
      return new Response(uploadedBytes, { status:200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { default:handler } = await import('../../api/backup.js')
    const { res, result } = response()
    await handler({ headers:{ authorization:'Bearer test-secret' } }, res)

    expect(result.statusCode).toBe(200)
    expect(result.payload).toMatchObject({ ok:true, records:1, employees:1, restoreTables:16 })
    expect(JSON.parse(uploadedBytes.toString('utf8'))).toMatchObject({ source:'normalized', schemaVersion:2, tables:{ records:[{ id:'r1' }] } })
  })
})
