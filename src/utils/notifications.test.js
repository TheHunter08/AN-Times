import { describe, expect, it } from 'vitest'
import { createNotification, dedupeNotifications, stableNotificationId, updateNotification } from './notifications.js'

describe('notificaciones', () => {
  it('genera el mismo id para el mismo evento lógico', () => {
    expect(stableNotificationId('vac:e1:v1:aprobada')).toBe(stableNotificationId('vac:e1:v1:aprobada'))
  })

  it('fusiona duplicados concurrentes aunque tengan ids legacy distintos', () => {
    const result = dedupeNotifications([
      { id:'a', empId:'e1', action:'Vacaciones aprobadas', detail:'', ts:'2026-07-21T10:00:00Z' },
      { id:'b', empId:'e1', action:'Vacaciones aprobadas', detail:'', ts:'2026-07-21T10:01:00Z', leido:true },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].leido).toBe(true)
  })

  it('conserva avisos iguales de días distintos', () => {
    const result = dedupeNotifications([
      { id:'a', empId:'e1', action:'Recordatorio', detail:'Ficha', ts:'2026-07-20T10:00:00Z' },
      { id:'b', empId:'e1', action:'Recordatorio', detail:'Ficha', ts:'2026-07-21T10:00:00Z' },
    ])
    expect(result).toHaveLength(2)
  })

  it('incluye _upd al crear y modificar', () => {
    const item = createNotification({ empId:'e1', action:'Aviso', dedupeKey:'aviso:e1', ts:'2026-07-21T10:00:00Z' })
    expect(item._upd).toBe(item.ts)
    expect(updateNotification(item, { leido:true }, '2026-07-21T11:00:00Z')._upd).toBe('2026-07-21T11:00:00Z')
  })
})
