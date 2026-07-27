import { beforeEach, describe, expect, it } from 'vitest'
import { clearPinToken } from './pinAuthToken.js'

describe('limpieza del JWT PIN heredado', () => {
  beforeEach(() => localStorage.clear())

  it('borra cualquier token que dejara una versión anterior', () => {
    localStorage.setItem('an_times_pin_jwt', JSON.stringify({
      token:'header.payload.signature',
      expiresAt:Date.now() + 3_600_000,
      empId:'e1',
    }))
    clearPinToken()
    expect(localStorage.getItem('an_times_pin_jwt')).toBeNull()
  })

  it('es segura aunque no exista ningún token', () => {
    expect(() => clearPinToken()).not.toThrow()
  })
})
