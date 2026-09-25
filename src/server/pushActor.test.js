import { afterEach, describe, expect, it, vi } from 'vitest'

function configureEnv() {
  vi.stubEnv('VITE_SB_URL', 'https://fake.supabase.co')
  vi.stubEnv('VITE_SB_ANON', 'fake-anon')
  vi.stubEnv('SB_SERVICE_KEY', 'fake-service')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service')
}

describe('authenticatedBrowserActor', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('usa la columna role cuando está sincronizada', async () => {
    configureEnv()
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const value = String(url)
      if (value.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id:'auth-1' }))
      if (value.includes('/rest/v1/employees?auth_id=eq.auth-1')) return new Response(JSON.stringify([
        { id:'e1', role:'jefe_obra', company_id:'c1', data:{ role:'jefe_obra' } },
      ]))
      throw new Error(`Petición inesperada: ${value}`)
    }))
    const { authenticatedBrowserActor } = await import('./pushActor.js')
    const actor = await authenticatedBrowserActor('token-valido')
    expect(actor).toMatchObject({ id:'e1', role:'jefe_obra' })
  })

  it('recupera el rol de administrador desde data.isAdmin cuando la columna role no llegó sincronizada', async () => {
    configureEnv()
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const value = String(url)
      if (value.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id:'auth-admin' }))
      if (value.includes('/rest/v1/employees?auth_id=eq.auth-admin')) return new Response(JSON.stringify([
        // Ficha de administrador antigua: role nunca se sincronizó, solo
        // queda isAdmin:true dentro de `data` (ver accountActivation.js).
        { id:'admin1', role:null, company_id:'c1', data:{ isAdmin:true } },
      ]))
      throw new Error(`Petición inesperada: ${value}`)
    }))
    const { authenticatedBrowserActor } = await import('./pushActor.js')
    const actor = await authenticatedBrowserActor('token-valido')
    expect(actor).toMatchObject({ id:'admin1', role:'admin' })
  })

  it('devuelve null si no hay sesión Auth válida', async () => {
    configureEnv()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status:401 })))
    const { authenticatedBrowserActor } = await import('./pushActor.js')
    expect(await authenticatedBrowserActor('token-invalido')).toBeNull()
  })

  it('devuelve null sin token', async () => {
    configureEnv()
    const { authenticatedBrowserActor } = await import('./pushActor.js')
    expect(await authenticatedBrowserActor('')).toBeNull()
  })
})
