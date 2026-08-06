// Estado real de la transición RLS. Estas capacidades solo deben cambiar a
// true cuando el flujo correspondiente esté implementado y probado de extremo
// a extremo. Tener todos los auth_id poblados es necesario, pero no suficiente.
export const RLS_RUNTIME_CAPABILITIES = Object.freeze({
  authenticatedDataPath:false,
  pinSupabaseSessions:false,
  authIdsVerifiedAgainstAuthUsers:false,
  legacyBlobRetired:false,
})

export function evaluateRlsTransition({
  authTotal = 0,
  authReady = 0,
  emailReady = 0,
  duplicatedAuthIds = 0,
  duplicatedEmails = 0,
  capabilities = RLS_RUNTIME_CAPABILITIES,
} = {}) {
  const authMissing = Math.max(0, authTotal - authReady)
  const emailMissing = Math.max(0, authTotal - emailReady)
  const identityBlockers = []
  if (authMissing) identityBlockers.push(`${authMissing} sin identidad vinculada`)
  if (emailMissing) identityBlockers.push(`${emailMissing} sin correo válido`)
  if (duplicatedEmails) identityBlockers.push(`${duplicatedEmails} correos duplicados`)
  if (duplicatedAuthIds) identityBlockers.push(`${duplicatedAuthIds} identidades duplicadas`)

  const runtimeBlockers = []
  if (!capabilities.authenticatedDataPath) runtimeBlockers.push('cliente de datos todavía anónimo')
  if (!capabilities.pinSupabaseSessions) {
    runtimeBlockers.push('el acceso PIN todavía no tiene una sesión oficial de Supabase Auth')
  }
  if (!capabilities.authIdsVerifiedAgainstAuthUsers) {
    runtimeBlockers.push('auth_id todavía no se ha contrastado con auth.users')
  }
  if (!capabilities.legacyBlobRetired) runtimeBlockers.push('blob legado todavía activo')

  const ready = authTotal > 0 && identityBlockers.length === 0 && runtimeBlockers.length === 0
  const state = ready
    ? 'LISTO_PARA_PRUEBA_CONTROLADA'
    : identityBlockers.length
      ? 'NO_ACTIVAR_RLS_AUTH'
      : 'NO_ACTIVAR_RLS_RUNTIME'

  return { ready, state, authMissing, emailMissing, identityBlockers, runtimeBlockers }
}

/** @param {any} options */
export function evaluateSafeMigration({
  rlsTransition = null,
  verification = null,
  now = Date.now(),
  minimumDays = 7,
  minimumChecks = 7,
} = {}) {
  if (!rlsTransition || rlsTransition.identityBlockers?.length) {
    return { stage:'IDENTITIES', ready:false, label:'Completar identidades de acceso' }
  }
  if (!verification?.consistent || Number(verification?.mismatchCount || 0) > 0) {
    return { stage:'PARITY', ready:false, label:'Verificar equivalencia blob ↔ tablas' }
  }
  const startedAt = Date.parse(verification.startedAt || '')
  const observedDays = Number.isFinite(startedAt) ? Math.max(0, Math.floor((now - startedAt) / 86400000)) : 0
  const checks = Math.max(0, Number(verification.consecutiveConsistentChecks) || 0)
  if (observedDays < minimumDays || checks < minimumChecks) {
    return { stage:'OBSERVATION', ready:false, observedDays, checks, label:`Observación segura: ${observedDays}/${minimumDays} días · ${checks}/${minimumChecks} controles` }
  }
  if (rlsTransition.runtimeBlockers?.length) {
    return { stage:'AUTH_RUNTIME', ready:false, observedDays, checks, label:'Preparar sesión Auth para todos los accesos' }
  }
  return { stage:'CONTROLLED_PILOT', ready:true, observedDays, checks, label:'Lista para piloto RLS controlado' }
}
