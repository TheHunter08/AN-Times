export const AUTH_RLS_ACTIVATION_SEAL = 'TIMES_INC_AUTH_RLS_2026_08_11'
// El runtime de tablas, cola offline autenticada, Storage y colecciones JSON
// con propietario ya está implementado. La activación sigue exigiendo modo +
// sello para que nunca ocurra por una variable incompleta.
export const AUTH_RLS_RUNTIME_IMPLEMENTED = true

function clean(value) {
  return String(value ?? '').trim()
}

/**
 * El modo Auth/RLS afecta simultaneamente a login, PostgREST y Realtime.
 * Exigir modo + sello evita activarlo por una variable copiada a medias.
 */
export function evaluateSecurityDeployment(env = {}) {
  const requested = clean(env.VITE_SECURITY_MODE).toLowerCase() === 'auth_rls'
  const sealed = clean(env.VITE_SECURITY_ACTIVATION_SEAL) === AUTH_RLS_ACTIVATION_SEAL
  const active = requested && sealed && AUTH_RLS_RUNTIME_IMPLEMENTED
  const issues = []
  if (requested && !sealed) issues.push('falta el sello de activacion Auth/RLS')
  if (requested && !AUTH_RLS_RUNTIME_IMPLEMENTED) issues.push('la migracion segura de datos y cola offline aun no esta cerrada')

  return Object.freeze({
    requested,
    sealed,
    active,
    authenticatedDataPath: active,
    requireOfficialAuth: active,
    allowPrimaryPinLogin: !active,
    allowPrimaryBiometricLogin: !active,
    issues:Object.freeze(issues),
  })
}

export const SECURITY_DEPLOYMENT = evaluateSecurityDeployment(import.meta.env)
