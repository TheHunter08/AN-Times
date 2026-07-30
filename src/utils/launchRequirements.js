import { isValidAccountEmail, normalizeAccountEmail } from './authRegistration.js'
import { needsRehash } from './pinSecurity.js'

export function hasEmployeeSignature(db, employeeId) {
  return Boolean(employeeId && db?.firmas?.[employeeId]?.main?.data)
}

export function getLaunchRequirements(db, employeeId, pushReady) {
  const signatureReady = hasEmployeeSignature(db, employeeId)
  const notificationsReady = pushReady === true
  return {
    signatureReady,
    notificationsReady,
    ready: signatureReady && notificationsReady,
  }
}

export function getLaunchBlockers(db, missingPushIds = []) {
  const missingPush = new Set(missingPushIds || [])
  const activeEmployees = (db?.employees || []).filter(employee => !employee?.baja)
  const emailCounts = new Map()
  const authIdentityCounts = new Map()
  activeEmployees.forEach(employee => {
    if (isValidAccountEmail(employee.email)) {
      const email = normalizeAccountEmail(employee.email)
      emailCounts.set(email, (emailCounts.get(email) || 0) + 1)
    }
    const authId = employee.authId || employee.auth_id
    if (authId) {
      const identity = String(authId)
      authIdentityCounts.set(identity, (authIdentityCounts.get(identity) || 0) + 1)
    }
  })

  return activeEmployees
    .map(employee => {
      const isWorker = employee.role !== 'admin' && !employee.isAdmin
      const issues = []
      if (!isValidAccountEmail(employee.email)) issues.push('Falta email')
      else if ((emailCounts.get(normalizeAccountEmail(employee.email)) || 0) > 1) issues.push('Correo compartido con otro perfil')
      if (!employee.authId && !employee.auth_id) issues.push('Falta crear acceso')
      else if ((authIdentityCounts.get(String(employee.authId || employee.auth_id)) || 0) > 1) issues.push('Identidad de acceso duplicada')
      if (isWorker && !employee.pin) issues.push('Falta PIN')
      if (isWorker && employee.pin && needsRehash(employee.pin)) issues.push('PIN heredado: iniciar sesión')
      if (isWorker && !hasEmployeeSignature(db, employee.id)) issues.push('Falta firma')
      if (isWorker && missingPush.has(employee.id)) issues.push('Falta activar notificaciones')
      return { employeeId:employee.id, employeeName:employee.name || 'Empleado', issues }
    })
    .filter(item => item.issues.length > 0)
}
