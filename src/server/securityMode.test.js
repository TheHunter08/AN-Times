import { describe, expect, it } from 'vitest'
import { AUTH_RLS_ACTIVATION_SEAL, isAuthRlsServerMode } from './securityMode.js'

describe('isAuthRlsServerMode', () => {
  it('exige modo y sello exactos para evitar un corte parcial', () => {
    expect(isAuthRlsServerMode({ VITE_SECURITY_MODE:'auth_rls' })).toBe(false)
    expect(isAuthRlsServerMode({ VITE_SECURITY_MODE:'auth_rls', VITE_SECURITY_ACTIVATION_SEAL:'incorrecto' })).toBe(false)
    expect(isAuthRlsServerMode({ VITE_SECURITY_MODE:'auth_rls', VITE_SECURITY_ACTIVATION_SEAL:AUTH_RLS_ACTIVATION_SEAL })).toBe(true)
  })
})
