import { afterEach, describe, expect, it, vi } from 'vitest'

function response() {
  const result = { statusCode:0, payload:null, headers:{} }
  return {
    result,
    res:{
      setHeader(name, value) { result.headers[name] = value },
      status(code) { result.statusCode = code; return this },
      json(payload) { result.payload = payload; return this },
    },
  }
}

function configureEnv() {
  vi.stubEnv('VITE_SB_URL', 'https://fake.supabase.co')
  vi.stubEnv('VITE_SB_ANON', 'fake-anon')
  vi.stubEnv('SB_SERVICE_KEY', 'fake-service')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service')
}

describe('activación oficial de cuenta', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('rechaza entradas inválidas antes de consultar Supabase', async () => {
    configureEnv()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { default:handler } = await import('./accountActivation.js')
    const { res, result } = response()
    await handler({ method:'POST', body:{ employeeId:'e1', pin:'12', email:'mal', password:'corta' } }, res)
    expect(result.statusCode).toBe(400)
    expect(result.headers['Cache-Control']).toBe('no-store')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('registra el fallo de PIN sin crear usuarios', async () => {
    configureEnv()
    const fetchMock = vi.fn(async (url, options = {}) => {
      const value = String(url)
      if (value.includes('account_activation_attempts?')) return new Response('[]')
      if (value.includes('/employees?id=eq.e1')) return new Response(JSON.stringify([{
        id:'e1', company_id:'c1', name:'Empleado', pin_hash:'1234', data:{}, updated_at:'2026-08-11T10:00:00Z',
      }]))
      if (value.includes('/employees?email=eq.')) return new Response('[]')
      if (value.includes('/rpc/register_account_activation_failure')) {
        expect(options.method).toBe('POST')
        return new Response(JSON.stringify([{ failed_attempts:1, locked_until:null }]))
      }
      throw new Error(`Petición inesperada: ${value}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const { default:handler } = await import('./accountActivation.js')
    const { res, result } = response()
    await handler({ method:'POST', body:{ employeeId:'e1', pin:'9999', email:'empleado@example.com', password:'segura123' } }, res)
    expect(result.statusCode).toBe(401)
    expect(result.payload).toMatchObject({ error:'PIN incorrecto', remaining:4 })
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/v1/admin/users'))).toBe(false)
  })

  it('crea una identidad confirmada y actualiza tabla, blob y auditoría', async () => {
    configureEnv()
    let blobUpdated = false
    const fetchMock = vi.fn(async (url, options = {}) => {
      const value = String(url)
      if (value.includes('account_activation_attempts?')) return new Response('[]')
      if (value.includes('/rest/v1/employees?id=eq.e1') && options.method !== 'PATCH') return new Response(JSON.stringify([{
        id:'e1', company_id:'c1', name:'Empleado', pin_hash:'1234', data:{ role:'empleado' }, updated_at:'2026-08-11T10:00:00Z',
      }]))
      if (value.includes('/rest/v1/employees?email=eq.')) return new Response('[]')
      if (value.endsWith('/auth/v1/admin/users')) {
        const body = JSON.parse(options.body)
        expect(body).toMatchObject({ email:'empleado@example.com', password:'segura123', email_confirm:true })
        return new Response(JSON.stringify({ id:'auth-1' }))
      }
      if (value.includes('/rest/v1/employees?id=eq.e1') && options.method === 'PATCH') {
        const body = JSON.parse(options.body)
        expect(body).toMatchObject({ email:'empleado@example.com', auth_id:'auth-1' })
        return new Response(JSON.stringify([{ id:'e1' }]))
      }
      if (value.includes('/rest/v1/app_data?id=eq.1&select=')) return new Response(JSON.stringify([{
        data:{ employees:[{ id:'e1', name:'Empleado', pin:'1234' }] }, updated_at:'2026-08-11T10:00:00Z',
      }]))
      if (value.includes('/rest/v1/app_data?id=eq.1&updated_at=eq.') && options.method === 'PATCH') {
        blobUpdated = true
        const body = JSON.parse(options.body)
        expect(body.data.employees[0]).toMatchObject({ email:'empleado@example.com', authId:'auth-1', authActivationPending:false })
        return new Response(JSON.stringify([{ id:1 }]))
      }
      if (value.includes('/rpc/clear_account_activation_failures')) return new Response('null')
      if (value.endsWith('/rest/v1/audit_events')) return new Response(null, { status:204 })
      throw new Error(`Petición inesperada: ${value}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const { default:handler } = await import('./accountActivation.js')
    const { res, result } = response()
    await handler({ method:'POST', body:{ employeeId:'e1', pin:'1234', email:'Empleado@Example.com', password:'segura123' } }, res)
    expect(result.statusCode).toBe(200)
    expect(result.payload).toMatchObject({ ok:true, employeeId:'e1', authId:'auth-1', email:'empleado@example.com', created:true })
    expect(blobUpdated).toBe(true)
  })

  it('usa el PIN archivado después del corte RLS', async () => {
    configureEnv()
    const fetchMock = vi.fn(async (url, options = {}) => {
      const value = String(url)
      if (value.includes('account_activation_attempts?')) return new Response('[]')
      if (value.includes('/rest/v1/employees?id=eq.e1') && options.method !== 'PATCH') return new Response(JSON.stringify([{
        id:'e1', company_id:'c1', name:'Empleado', pin_hash:null, data:{}, updated_at:'2026-08-11T10:00:00Z',
      }]))
      if (value.includes('/rest/v1/employees?email=eq.')) return new Response('[]')
      if (value.includes('/rest/v1/employee_pin_archive?')) return new Response(JSON.stringify([{ pin_hash:'1234', pin_len:4 }]))
      if (value.includes('/rpc/register_account_activation_failure')) return new Response(JSON.stringify([{ failed_attempts:1, locked_until:null }]))
      throw new Error(`Petición inesperada: ${value}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const { default:handler } = await import('./accountActivation.js')
    const { res, result } = response()
    await handler({ method:'POST', body:{ employeeId:'e1', pin:'9999', email:'empleado@example.com', password:'segura123' } }, res)
    expect(result.statusCode).toBe(401)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('employee_pin_archive'))).toBe(true)
  })

  it('expone solo un directorio mínimo para la activación', async () => {
    configureEnv()
    const fetchMock = vi.fn(async url => {
      expect(String(url)).toContain('/rest/v1/employees?baja=eq.false')
      return new Response(JSON.stringify([{
        id:'e1', name:'Ana García', centro_trabajo:'Obra Norte', pin_len:4,
        email:'privado@example.com', auth_id:'auth-1', pin_hash:'secreto', data:{ dept:'Obra Norte' },
      }]))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { accountBootstrap } = await import('./accountActivation.js')
    const { res, result } = response()
    await accountBootstrap({ method:'GET', query:{ q:'gar' } }, res)
    expect(result.statusCode).toBe(200)
    expect(result.payload).toEqual({ employees:[{ id:'e1', name:'Ana García', dept:'Obra Norte', pinLen:4 }] })
    expect(JSON.stringify(result.payload)).not.toContain('privado@example.com')
    expect(JSON.stringify(result.payload)).not.toContain('secreto')
    expect(JSON.stringify(result.payload)).not.toContain('auth-1')
  })
})
