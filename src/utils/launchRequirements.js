import { isValidAccountEmail } from './authRegistration.js'

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
  return (db?.employees || [])
    .filter(employee => !employee?.baja)
    .map(employee => {
      const isWorker = employee.role !== 'admin' && !employee.isAdmin
      const issues = []
      if (!isValidAccountEmail(employee.email)) issues.push('Falta email')
      if (!employee.authId && !employee.auth_id) issues.push('Falta crear acceso')
      if (isWorker && !hasEmployeeSignature(db, employee.id)) issues.push('Falta firma')
      if (isWorker && missingPush.has(employee.id)) issues.push('Falta activar notificaciones')
      return { employeeId:employee.id, employeeName:employee.name || 'Empleado', issues }
    })
    .filter(item => item.issues.length > 0)
}
