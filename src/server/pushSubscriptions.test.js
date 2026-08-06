import { describe, expect, it } from 'vitest'
import { groupPushSubscriptions, pushSubscriptionDeleteFilter } from './pushSubscriptions.js'

describe('enrutado de suscripciones push', () => {
  it('conserva todos los dispositivos registrados por empleado', () => {
    const grouped = groupPushSubscriptions([
      { user_id:'emp-1', endpoint:'https://push.test/a' },
      { user_id:'emp-1', endpoint:'https://push.test/b' },
      { user_id:'emp-2', endpoint:'https://push.test/c' },
      { user_id:'emp-2', endpoint:'' },
    ])

    expect(grouped.get('emp-1')).toHaveLength(2)
    expect(grouped.get('emp-2')).toHaveLength(1)
  })

  it('elimina solo el endpoint caducado, no todos los dispositivos del empleado', () => {
    expect(pushSubscriptionDeleteFilter('emp 1', 'https://push.test/a?x=1')).toBe(
      'user_id=eq.emp%201&endpoint=eq.https%3A%2F%2Fpush.test%2Fa%3Fx%3D1'
    )
  })
})
