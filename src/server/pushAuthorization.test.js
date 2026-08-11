import { describe, expect, it } from 'vitest'
import { actorCanNotify } from './pushAuthorization.js'

describe('actorCanNotify', () => {
  it('limita al empleado a sí mismo y al canal de administración', () => {
    const employee = { id:'e1', role:'empleado' }
    expect(actorCanNotify(employee, 'e1')).toBe(true)
    expect(actorCanNotify(employee, '__admin__')).toBe(true)
    expect(actorCanNotify(employee, 'e2')).toBe(false)
    expect(actorCanNotify(employee, '__all__')).toBe(false)
  })

  it('permite objetivos individuales a responsables, pero no broadcast desde navegador', () => {
    for (const role of ['admin', 'jefe_obra', 'encargado']) {
      expect(actorCanNotify({ id:'boss', role }, 'e1')).toBe(true)
      expect(actorCanNotify({ id:'boss', role }, '__all__')).toBe(false)
    }
  })
})
