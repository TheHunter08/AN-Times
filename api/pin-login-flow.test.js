import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'
import { hashPin } from '../src/utils/pinSecurity.js'
import handler from './pin-login.js'

// Flujo completo con fetch simulado — no toca Supabase real. Complementa
// pin-login.test.js (que solo prueba la firma) verificando el handler entero:
// verificación del PIN contra un pin_hash real generado por pinSecurity.js,
// asignación de auth_id, y respuestas de error sin filtrar información.
function mockRes() {
  const res = { statusCode: 200 }
  res.status = c => { res.statusCode = c; return res }
  res.json = body => { res.body = body; return res }
  res.end = () => res
  return res
}

const EMP_ID = 'emp-test-1'
const PIN = '4821'
// Debe coincidir con vitest.config.js `test.env.SUPABASE_JWT_SECRET` — pin-login.js
// lee esa variable como constante de módulo al importarse, así que no se puede
// cambiar desde beforeEach (los imports ya se resolvieron antes de que corra).
const SECRET = 'unit-test-secret'

describe('api/pin-login handler (fetch simulado)', () => {
  let pinHash
  let fetchMock

  beforeEach(async () => {
    pinHash = await hashPin(PIN, EMP_ID)
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('PIN correcto: verifica contra pin_hash real, asigna auth_id y firma un JWT válido', async () => {
    fetchMock
      // 1) lookup del empleado
      .mockResolvedValueOnce({ ok: true, json: async () => ([{ id: EMP_ID, pin_hash: pinHash, baja: false, auth_id: null, role: 'empleado' }]) })
      // 2) PATCH asignando auth_id (auth_id=is.null coincide)
      .mockResolvedValueOnce({ ok: true, json: async () => ([{ id: EMP_ID, auth_id: 'will-be-overwritten' }]) })

    const req = { method: 'POST', headers: {}, body: { empId: EMP_ID, pin: PIN } }
    const res = mockRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.ok).toBe(true)
    const [h64, p64, sig] = res.body.token.split('.')
    const expectedSig = createHmac('sha256', SECRET).update(`${h64}.${p64}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(sig).toBe(expectedSig)
    const payload = JSON.parse(Buffer.from(p64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    expect(payload.role).toBe('authenticated')
    expect(payload.emp_id).toBe(EMP_ID)
    expect(payload.sub).toMatch(/^[0-9a-f-]{36}$/)

    // El PATCH de asignación de auth_id se llamó con el UUID recién generado
    const patchCall = fetchMock.mock.calls[1]
    expect(patchCall[0]).toContain('auth_id=is.null')
    const patchBody = JSON.parse(patchCall[1].body)
    expect(patchBody.auth_id).toBe(payload.sub)
  })

  it('un empleado que ya tiene auth_id lo reutiliza sin volver a escribir', async () => {
    const existingAuthId = '99999999-9999-4999-8999-999999999999'
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ([{ id: EMP_ID, pin_hash: pinHash, baja: false, auth_id: existingAuthId, role: 'empleado' }]) })

    const req = { method: 'POST', headers: {}, body: { empId: EMP_ID, pin: PIN } }
    const res = mockRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1) // solo el lookup — nunca escribe si ya hay auth_id
    const [, p64] = res.body.token.split('.')
    const payload = JSON.parse(Buffer.from(p64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    expect(payload.sub).toBe(existingAuthId)
  })

  it('PIN incorrecto y empleado inexistente devuelven el mismo error (sin filtrar cuáles ids existen)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ([{ id: EMP_ID, pin_hash: pinHash, baja: false, auth_id: null }]) })
    const wrongPinRes = mockRes()
    await handler({ method: 'POST', headers: {}, body: { empId: EMP_ID, pin: '0000' } }, wrongPinRes)

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ([]) })
    const noEmpRes = mockRes()
    await handler({ method: 'POST', headers: {}, body: { empId: 'no-existe', pin: PIN } }, noEmpRes)

    expect(wrongPinRes.statusCode).toBe(401)
    expect(noEmpRes.statusCode).toBe(401)
    expect(wrongPinRes.body.error).toBe(noEmpRes.body.error)
  })

  it('un empleado dado de baja no puede iniciar sesión aunque el PIN sea correcto', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ([{ id: EMP_ID, pin_hash: pinHash, baja: true, auth_id: null }]) })
    const res = mockRes()
    await handler({ method: 'POST', headers: {}, body: { empId: EMP_ID, pin: PIN } }, res)
    expect(res.statusCode).toBe(401)
  })

  it('rechaza métodos distintos de POST y peticiones sin empId/pin', async () => {
    const getRes = mockRes()
    await handler({ method: 'GET', headers: {} }, getRes)
    expect(getRes.statusCode).toBe(405)

    const missingRes = mockRes()
    await handler({ method: 'POST', headers: {}, body: {} }, missingRes)
    expect(missingRes.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

})
