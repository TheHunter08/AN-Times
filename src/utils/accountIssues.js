import { isEmployeeOfficialAccountReady, isValidAccountEmail, normalizeAccountEmail } from './authRegistration.js'

// Mismos cuatro "identityBlockers" que evaluateRlsTransition (ver
// securityReadiness.js) y los mismos contadores que ya se mostraban en
// Operaciones (OperationsContainer.tsx) — antes solo como un número
// ("3 correos duplicados"), sin forma de saber QUIÉN en el panel, solo
// con un script CLI. Se excluye al admin: cuando ninguna fila tiene
// isAdmin, dataService.js (_mergeDb) sintetiza una ("Administrador", sin
// correo ni auth_id, id fijo 'admin') solo para no romper el resto del
// blob — listarla aquí sería una incidencia permanente e imposible de
// resolver desde "Editar empleado", no una cuenta real.
export function findAccountIssues(employees = []) {
  const scoped = (employees || []).filter(e => e && !e.isAdmin && e.role !== 'admin')
  const emailCounts = new Map()
  const authCounts = new Map()
  scoped.forEach(e => {
    if (isValidAccountEmail(e.email)) {
      const email = normalizeAccountEmail(e.email)
      emailCounts.set(email, (emailCounts.get(email) || 0) + 1)
    }
    const authId = e.authId || e.auth_id
    if (authId) authCounts.set(String(authId), (authCounts.get(String(authId)) || 0) + 1)
  })

  const items = []
  scoped.forEach(e => {
    const issues = []
    if (!isValidAccountEmail(e.email)) issues.push('sin_correo')
    else if ((emailCounts.get(normalizeAccountEmail(e.email)) || 0) > 1) issues.push('correo_duplicado')
    if (!isEmployeeOfficialAccountReady(e)) issues.push('sin_identidad')
    const authId = e.authId || e.auth_id
    if (authId && (authCounts.get(String(authId)) || 0) > 1) issues.push('identidad_duplicada')
    if (issues.length) items.push({ id: e.id, name: e.name || e.id, dept: e.centroTrabajo || e.dept || '', baja: !!e.baja, issues })
  })

  const summary = {
    authTotal: scoped.length,
    authReady: scoped.filter(e => isEmployeeOfficialAccountReady(e)).length,
    emailReady: scoped.filter(e => isValidAccountEmail(e.email)).length,
    duplicatedEmails: [...emailCounts.values()].filter(count => count > 1).length,
    duplicatedAuthIds: [...authCounts.values()].filter(count => count > 1).length,
  }

  return { items, summary }
}
