export const DATA_AUTH_MODES = Object.freeze({
  PHASE1_ANON: 'phase1-anon',
  AUTHENTICATED: 'authenticated',
})

export function resolveDataAuthMode(value) {
  return String(value || '').trim().toLowerCase() === DATA_AUTH_MODES.AUTHENTICATED
    ? DATA_AUTH_MODES.AUTHENTICATED
    : DATA_AUTH_MODES.PHASE1_ANON
}

const configuredMode = import.meta.env?.VITE_DATA_AUTH_MODE
  ?? globalThis.process?.env?.VITE_DATA_AUTH_MODE

// La transición es deliberadamente opt-in. Un valor ausente o mal escrito
// mantiene el cliente anónimo de Fase 1 para evitar bloquear fichajes por un
// error de configuración durante un despliegue.
export const DATA_AUTH_MODE = resolveDataAuthMode(configuredMode)

export function isAuthenticatedDataPathEnabled(mode = DATA_AUTH_MODE) {
  return mode === DATA_AUTH_MODES.AUTHENTICATED
}
