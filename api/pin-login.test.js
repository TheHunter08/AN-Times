import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { b64url, signSupabaseJWT } from './pin-login.js'

// Reimplementación mínima e independiente de un verificador HS256 — no debe
// compartir código con signSupabaseJWT, para que un bug en la firma no quede
// enmascarado por un verificador con el mismo bug.
function verifyHS256(token, secret) {
  const [headerB64, payloadB64, sigB64] = token.split('.')
  const data = `${headerB64}.${payloadB64}`
  const expectedSig = createHmac('sha256', secret).update(data).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  if (sigB64 !== expectedSig) return null
  const header = JSON.parse(Buffer.from(headerB64, 'base64').toString('utf8'))
  const payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  return { header, payload }
}

describe('signSupabaseJWT: token compatible con la verificación HS256 de Postgres/PostgREST', () => {
  const SECRET = 'test-secret-not-the-real-one'

  it('produce un JWT de 3 partes que verifica con el mismo secreto', () => {
    const { token } = signSupabaseJWT({ sub: '11111111-1111-4111-8111-111111111111', role: 'authenticated' }, SECRET, 3600)
    expect(token.split('.')).toHaveLength(3)
    const verified = verifyHS256(token, SECRET)
    expect(verified).not.toBeNull()
    expect(verified.header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(verified.payload.sub).toBe('11111111-1111-4111-8111-111111111111')
    expect(verified.payload.role).toBe('authenticated')
  })

  it('un secreto distinto invalida la firma (nadie puede forjar el token sin él)', () => {
    const { token } = signSupabaseJWT({ sub: 'x' }, SECRET, 3600)
    expect(verifyHS256(token, 'otro-secreto-cualquiera')).toBeNull()
  })

  it('exp = iat + expiresInSec, coherente con lo que devuelve la función', () => {
    const before = Math.floor(Date.now() / 1000)
    const { token, exp } = signSupabaseJWT({ sub: 'x' }, SECRET, 43200)
    const { payload } = verifyHS256(token, SECRET)
    expect(payload.exp).toBe(exp)
    expect(payload.exp - payload.iat).toBe(43200)
    expect(payload.iat).toBeGreaterThanOrEqual(before)
  })

  it('b64url no lleva relleno "=" ni caracteres +/ (compatible con el formato JWT estándar)', () => {
    const encoded = b64url(JSON.stringify({ a: 1, b: '¿ñ?' }))
    expect(encoded).not.toMatch(/[+/=]/)
  })
})
