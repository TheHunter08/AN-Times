import { afterEach, describe, expect, it, vi } from 'vitest'

const response = () => {
  const result = { statusCode:0, payload:null, headers:{} }
  return { result, res:{ setHeader(key, value) { result.headers[key] = value }, status(code) { result.statusCode = code; return this }, json(payload) { result.payload = payload; return this } } }
}

describe('health endpoint', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules() })

  it('responde de forma redactada y falla cerrado si Supabase no está disponible', async () => {
    vi.stubEnv('VITE_SB_URL', 'https://fake.supabase.co')
    vi.stubEnv('VITE_SB_ANON', 'anon')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status:500 })))
    const { default:handler } = await import('../../api/health.js')
    const { result, res } = response()
    await handler({}, res)
    expect(result).toMatchObject({ statusCode:503, payload:{ status:'degraded', error:'data_unavailable' } })
    expect(JSON.stringify(result.payload)).not.toContain('anon')
    expect(result.headers['Cache-Control']).toBe('no-store')
  })
})
