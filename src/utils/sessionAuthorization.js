export function isOfficialAuthMethod(authMethod) {
  return authMethod === 'email' || authMethod === 'oauth'
}

// Comprueba que la sesión local de la aplicación y la identidad oficial de
// Supabase siguen representando a la misma persona. La mera existencia de un
// JWT válido no autoriza a entrar como cualquier empleado o administrador.
export function isOfficialSessionAuthorized(appSession, authSession, db) {
  if (!isOfficialAuthMethod(appSession?.authMethod)) return true

  const authUser = authSession?.user
  if (!authUser?.id) return false

  if (appSession?.user?.id) {
    const employee = (db?.employees || []).find(item => item.id === appSession.user.id)
    if (!employee || employee.baja) return false
    const linkedAuthId = employee.authId || employee.auth_id
    if (!linkedAuthId || linkedAuthId !== authUser.id) return false

    // Los indicadores de privilegio guardados en localStorage nunca pueden
    // conceder más acceso que el rol actual de la ficha enlazada. Esto revoca
    // sesiones manipuladas y sesiones antiguas creadas antes de Auth/RLS.
    const role = employee.role || 'empleado'
    const mayAdmin = role === 'admin' || role === 'jefe_obra' || employee.isAdmin === true
    const mayManageSite = role === 'jefe_obra'
    const maySupervise = role === 'encargado'
    if (appSession.isAdmin && !mayAdmin) return false
    if (appSession.isJO && !mayManageSite) return false
    if (appSession.isEnc && !maySupervise) return false
    return true
  }

  // El antiguo administrador por alias de correo no estaba enlazado a una
  // fila de employees y, por tanto, quedaría sin permisos al activar RLS.
  // Una identidad oficial siempre debe tener una ficha activa y auth_id.
  return false
}
