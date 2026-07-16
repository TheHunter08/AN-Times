const EMPTY_SESSION = Object.freeze({ user: null, isAdmin: false, isEnc: false, isJO: false })

// La sesión local solo necesita identidad y permisos para restaurar la interfaz.
// PIN, teléfono, email y el resto de la ficha siguen en el almacenamiento
// principal de la app, pero no se duplican en una segunda clave persistente.
export function sanitizeSessionUser(user) {
  if (!user?.id) return null
  return {
    id: user.id,
    name: user.name || '',
    role: user.role || 'empleado',
    isAdmin: !!user.isAdmin,
    isEnc: !!user.isEnc,
    isJO: !!user.isJO,
  }
}

export function sanitizeSession(session) {
  if (!session || typeof session !== 'object') return { ...EMPTY_SESSION }
  return {
    user: sanitizeSessionUser(session.user),
    isAdmin: !!session.isAdmin,
    isEnc: !!session.isEnc,
    isJO: !!session.isJO,
    ...(session.authMethod ? { authMethod: session.authMethod } : {}),
    ...(Number.isFinite(session.authenticatedAt) ? { authenticatedAt: session.authenticatedAt } : {}),
  }
}
