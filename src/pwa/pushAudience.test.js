import { describe, expect, it } from 'vitest'
import { shouldDisplayPush } from './pushAudience.js'

describe('shouldDisplayPush', () => {
  it('no muestra avisos privados después de cerrar sesión', () => {
    expect(shouldDisplayPush(null, 'emp-1')).toBe(false)
  })

  it('rechaza un aviso atrasado del usuario anterior', () => {
    expect(shouldDisplayPush('emp-2', 'emp-1')).toBe(false)
  })

  it('acepta el destinatario activo y emisiones legacy/broadcast', () => {
    expect(shouldDisplayPush('emp-1', 'emp-1')).toBe(true)
    expect(shouldDisplayPush('emp-1', undefined)).toBe(true)
  })
})
