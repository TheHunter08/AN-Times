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

const PROFILE_FIXABLE_ISSUES = new Set([
  'Falta email',
  'Falta PIN',
  'Correo compartido con otro perfil',
])

export function getLaunchBlockerActions(issues = []) {
  const profileFixable = issues.some(issue => PROFILE_FIXABLE_ISSUES.has(issue))
  return {
    profileFixable,
    employeeActionRequired:issues.some(issue => !PROFILE_FIXABLE_ISSUES.has(issue)),
  }
}

const ISSUE_INSTRUCTIONS = {
  'Falta email': 'Pide a Administración que añada un correo personal y único a tu perfil.',
  'Correo compartido con otro perfil': 'Pide a Administración que sustituya el correo compartido por uno personal y único.',
  'Falta crear acceso': 'En la pantalla de acceso, elige “Acceso con email” y después “Primera vez: vincular mi cuenta”. Usa el correo de tu perfil, crea una contraseña e introduce tu PIN habitual cuando se solicite.',
  'Identidad de acceso duplicada': 'Contacta con Administración para revisar qué perfil debe conservar la identidad antes de volver a vincular la cuenta.',
  'Falta PIN': 'Pide a Administración que configure un PIN de fichaje antes de intentar vincular la cuenta.',
  'PIN heredado: iniciar sesión': 'Cierra sesión y entra una vez con tu PIN habitual. Times INC actualizará su protección automáticamente; no necesitas cambiarlo.',
  'Falta firma': 'Entra en Times INC y completa el paso “Tu firma” de la configuración obligatoria.',
  'Falta activar notificaciones': 'Abre Times INC en tu móvil, inicia sesión y pulsa “Activar notificaciones” cuando aparezca el paso correspondiente.',
}

export function buildLaunchBlockerInstructions(blocker) {
  const name = blocker?.employeeName || 'Empleado'
  const steps = (blocker?.issues || [])
    .map(issue => ISSUE_INSTRUCTIONS[issue])
    .filter(Boolean)

  return [
    `Hola ${name}, para terminar de preparar tu acceso a Times INC:`,
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    'Por seguridad, no envíes tu contraseña ni tu PIN a nadie.',
  ].join('\n')
}
