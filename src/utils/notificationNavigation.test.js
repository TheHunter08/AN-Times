import { describe, expect, it } from 'vitest'
import {
  parseNavigationTarget,
  resolveAdminNotificationDestination,
  resolveEmployeeNotificationDestination,
} from './notificationNavigation.js'

describe('navegación desde notificaciones', () => {
  it('interpreta enlaces admin directos, completos y codificados', () => {
    expect(parseNavigationTarget('/?go=admin:solicitudes')).toMatchObject({ role:'admin', target:'solicitudes' })
    expect(resolveAdminNotificationDestination({ target:'documentos' })).toBe('documentos')
    expect(resolveAdminNotificationDestination({ url:'https://app.test/?go=admin%3Avalidar' })).toBe('validar')
  })

  it('aplica alias y nunca devuelve una pantalla admin inexistente', () => {
    expect(resolveAdminNotificationDestination({ target:'vacaciones' })).toBe('solicitudes')
    expect(resolveAdminNotificationDestination({ target:'pantalla-inexistente', action:'Entrada registrada' })).toBe('fichajes')
  })

  it('abre pestañas y modales correctos para empleados', () => {
    expect(resolveEmployeeNotificationDestination({ url:'/?go=emp:vacaciones' })).toEqual({ tab:'vacaciones' })
    expect(resolveEmployeeNotificationDestination({ target:'documentos' })).toEqual({ tab:'perfil', modal:'documentos' })
    expect(resolveEmployeeNotificationDestination({ target:'chat' })).toEqual({ tab:'inicio', modal:'chat' })
  })
})
