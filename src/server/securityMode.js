export const AUTH_RLS_ACTIVATION_SEAL = 'TIMES_INC_AUTH_RLS_2026_08_11'

export function isAuthRlsServerMode(env = process.env) {
  return String(env?.VITE_SECURITY_MODE || '').trim().toLowerCase() === 'auth_rls'
    && String(env?.VITE_SECURITY_ACTIVATION_SEAL || '').trim() === AUTH_RLS_ACTIVATION_SEAL
}
