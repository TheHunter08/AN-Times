import { describe, expect, it } from 'vitest'
import { evaluateRlsTransition, evaluateSafeMigration, RLS_RUNTIME_CAPABILITIES } from './securityReadiness.js'

describe('preparación real de RLS', () => {
  it('no confunde identidades completas con una ruta de datos preparada', () => {
    const result = evaluateRlsTransition({
      authTotal:2, authReady:2, emailReady:2, duplicatedAuthIds:0,
    })
    expect(result.ready).toBe(false)
    expect(result.state).toBe('NO_ACTIVAR_RLS_RUNTIME')
    expect(result.runtimeBlockers).toEqual([
      'cliente de datos todavía anónimo',
      'el acceso PIN todavía no tiene una sesión oficial de Supabase Auth',
      'auth_id todavía no se ha contrastado con auth.users',
      'blob legado todavía activo',
    ])
    expect(RLS_RUNTIME_CAPABILITIES.authenticatedDataPath).toBe(false)
  })

  it('prioriza los bloqueos de identidad que impedirían entrar', () => {
    const result = evaluateRlsTransition({
      authTotal:3, authReady:1, emailReady:2, duplicatedAuthIds:1, duplicatedEmails:1,
    })
    expect(result.state).toBe('NO_ACTIVAR_RLS_AUTH')
    expect(result.identityBlockers).toEqual([
      '2 sin identidad vinculada',
      '1 sin correo válido',
      '1 correos duplicados',
      '1 identidades duplicadas',
    ])
  })

  it('solo permite una prueba cuando identidades y runtime están completos', () => {
    const result = evaluateRlsTransition({
      authTotal:2,
      authReady:2,
      emailReady:2,
      duplicatedAuthIds:0,
      capabilities:{
        authenticatedDataPath:true,
        pinSupabaseSessions:true,
        authIdsVerifiedAgainstAuthUsers:true,
        legacyBlobRetired:true,
      },
    })
    expect(result).toMatchObject({ ready:true, state:'LISTO_PARA_PRUEBA_CONTROLADA' })
  })

  it('exige equivalencia sostenida antes del piloto controlado', () => {
    const transition = { identityBlockers:[], runtimeBlockers:[] }
    const now = Date.parse('2026-08-10T00:00:00Z')
    expect(evaluateSafeMigration({ rlsTransition:transition, verification:{ consistent:false }, now }).stage).toBe('PARITY')
    expect(evaluateSafeMigration({ rlsTransition:transition, verification:{ consistent:true, startedAt:'2026-08-06T00:00:00Z', consecutiveConsistentChecks:4 }, now }).stage).toBe('OBSERVATION')
    expect(evaluateSafeMigration({ rlsTransition:transition, verification:{ consistent:true, startedAt:'2026-08-01T00:00:00Z', consecutiveConsistentChecks:8 }, now }).ready).toBe(true)
  })
})
