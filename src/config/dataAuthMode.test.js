import { describe, expect, it } from 'vitest'
import { DATA_AUTH_MODES, isAuthenticatedDataPathEnabled, resolveDataAuthMode } from './dataAuthMode.js'

describe('modo de autenticación del cliente de datos', () => {
  it('mantiene Fase 1 ante valores ausentes o desconocidos', () => {
    expect(resolveDataAuthMode()).toBe(DATA_AUTH_MODES.PHASE1_ANON)
    expect(resolveDataAuthMode('true')).toBe(DATA_AUTH_MODES.PHASE1_ANON)
    expect(resolveDataAuthMode('auth')).toBe(DATA_AUTH_MODES.PHASE1_ANON)
  })

  it('solo activa la ruta autenticada con el valor explícito', () => {
    expect(resolveDataAuthMode(' authenticated ')).toBe(DATA_AUTH_MODES.AUTHENTICATED)
    expect(isAuthenticatedDataPathEnabled(DATA_AUTH_MODES.AUTHENTICATED)).toBe(true)
    expect(isAuthenticatedDataPathEnabled(DATA_AUTH_MODES.PHASE1_ANON)).toBe(false)
  })
})
