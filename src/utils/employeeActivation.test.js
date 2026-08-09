import { describe, expect, it } from 'vitest'
import { buildEmployeeActivation } from './employeeActivation.js'

const modernPin = 'pbkdf2:00112233445566778899aabbccddeeff:hash:600000'

describe('buildEmployeeActivation', () => {
  it('marca una cuenta totalmente preparada', () => {
    const employee = { id:'e1', email:'ana@empresa.com', authId:'auth-1', pin:modernPin }
    const result = buildEmployeeActivation({ firmas:{ e1:{ main:{ data:'firma' } } } }, employee, true)
    expect(result.ready).toBe(true)
    expect(result.progress).toBe(100)
    expect(result.next).toBeNull()
  })

  it('ordena el correo como primer paso cuando falta', () => {
    const result = buildEmployeeActivation({}, { id:'e1', email:'', pin:modernPin }, false)
    expect(result.next?.id).toBe('email')
    expect(result.next?.action).toBe('infoPersonal')
    expect(result.progress).toBe(20)
  })

  it('guía la vinculación desde el acceso cuando el correo ya existe', () => {
    const result = buildEmployeeActivation({}, { id:'e1', email:'ana@empresa.com', pin:modernPin }, false)
    const auth = result.steps.find(step => step.id === 'auth')
    expect(auth?.action).toBe('logout')
    expect(auth?.detail).toContain('Primera vez')
  })

  it('detecta un PIN heredado sin exponerlo', () => {
    const result = buildEmployeeActivation({}, { id:'e1', email:'ana@empresa.com', authId:'auth-1', pin:'a'.repeat(64) }, true)
    const pin = result.steps.find(step => step.id === 'pin')
    expect(pin?.complete).toBe(false)
    expect(pin?.detail).toContain('actualizarlo automáticamente')
    expect(JSON.stringify(result)).not.toContain('aaaaaa')
  })
})
