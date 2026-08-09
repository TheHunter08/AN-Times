import { isValidAccountEmail } from './authRegistration.js'
import { hasEmployeeSignature } from './launchRequirements.js'
import { needsRehash } from './pinSecurity.js'

export function buildEmployeeActivation(db = {}, employee = {}, pushReady = false) {
  const emailReady = isValidAccountEmail(employee.email)
  const authReady = Boolean(employee.authId || employee.auth_id)
  const pinReady = Boolean(employee.pin) && !needsRehash(employee.pin)
  const signatureReady = hasEmployeeSignature(db, employee.id)
  const notificationsReady = pushReady === true

  const steps = [
    {
      id:'email', title:'Correo personal', complete:emailReady, action:'infoPersonal',
      detail:emailReady ? employee.email : 'Añade un correo único para recuperar y vincular tu acceso.',
    },
    {
      id:'auth', title:'Cuenta vinculada', complete:authReady, action:emailReady ? 'logout' : 'infoPersonal',
      detail:authReady ? 'Tu identidad segura está conectada.' : emailReady ? 'Sal al acceso y elige “Primera vez: vincular mi cuenta”.' : 'Primero necesitas completar tu correo personal.',
    },
    {
      id:'pin', title:'PIN protegido', complete:pinReady, action:employee.pin ? 'logout' : null,
      detail:pinReady ? 'Tu PIN usa la protección moderna.' : employee.pin ? 'Inicia sesión una vez con tu PIN para actualizarlo automáticamente.' : 'Administración debe asignarte un PIN.',
    },
    {
      id:'signature', title:'Firma digital', complete:signatureReady, action:'sign',
      detail:signatureReady ? 'Firma principal registrada.' : 'Registra tu firma para documentos y cierres.',
    },
    {
      id:'notifications', title:'Este dispositivo', complete:notificationsReady, action:'notifications',
      detail:notificationsReady ? 'Notificaciones verificadas en este dispositivo.' : 'Activa y verifica las notificaciones del móvil.',
    },
  ]

  const completed = steps.filter(step => step.complete).length
  const total = steps.length
  const progress = Math.round(completed / total * 100)
  const next = steps.find(step => !step.complete) || null

  return {
    steps,
    completed,
    total,
    progress,
    ready:completed === total,
    next,
    summary:completed === total ? 'Cuenta preparada y protegida' : `${total - completed} paso${total - completed === 1 ? '' : 's'} para completar tu cuenta`,
  }
}
