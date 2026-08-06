import { describe, expect, it } from 'vitest'
import handler from '../../api/pin-login.js'

function mockRes() {
  const res = { statusCode:200 }
  res.status = code => { res.statusCode = code; return res }
  res.json = body => { res.body = body; return res }
  res.end = () => res
  return res
}

describe('api/pin-login retirado', () => {
  it('rechaza clientes antiguos sin emitir un JWT ni modificar identidades', () => {
    const res = mockRes()
    handler({ method:'POST' }, res)
    expect(res.statusCode).toBe(410)
    expect(res.body).toEqual({
      error:'La sesión JWT personalizada por PIN está retirada',
      code:'PIN_JWT_RETIRED',
    })
    expect(res.body).not.toHaveProperty('token')
    expect(res.body).not.toHaveProperty('authId')
  })

  it('mantiene el contrato 405 para otros métodos', () => {
    const res = mockRes()
    handler({ method:'GET' }, res)
    expect(res.statusCode).toBe(405)
  })
})
