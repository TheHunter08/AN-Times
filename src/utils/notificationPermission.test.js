import { describe, expect, it } from 'vitest'
import { getNotificationPermissionGuide, notificationGuideText } from './notificationPermission.js'

describe('guía de permisos de notificaciones', () => {
  it('da instrucciones específicas para Android', () => {
    const guide = getNotificationPermissionGuide('Mozilla/5.0 (Linux; Android 15)', true)
    expect(guide.platform).toBe('android')
    expect(notificationGuideText(guide)).toContain('Información de la aplicación')
  })

  it('explica que iOS necesita la PWA instalada', () => {
    const guide = getNotificationPermissionGuide('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', false)
    expect(guide.platform).toBe('ios')
    expect(guide.steps.join(' ')).toContain('Añadir a pantalla de inicio')
  })
})
