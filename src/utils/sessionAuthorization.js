import { normalizeAccountEmail } from './authRegistration.js'

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
    return Boolean(linkedAuthId && linkedAuthId === authUser.id)
  }

  if (appSession?.isAdmin) {
    const email = normalizeAccountEmail(authUser.email)
    if (!email) return false
    const allowedEmails = (db?.config?.adminEmails || []).map(normalizeAccountEmail)
    return allowedEmails.includes(email)
  }

  return false
}
