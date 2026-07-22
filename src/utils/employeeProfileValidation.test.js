import { describe, expect, it } from 'vitest'
import { validateEmployeeProfile } from './employeeProfileValidation.js'

const employees = [
  { id: 'e1', name: 'Ana', email: 'ana@empresa.com' },
  { id: 'e2', name: 'Luis', email: 'luis@empresa.com', authId: 'auth-luis' },
]

describe('validación del perfil de empleado', () => {
  it('exige nombre, email válido y PIN al crear', () => {
    expect(validateEmployeeProfile({ name:'', email:'nuevo@empresa.com', pin:'1234' }, employees).error).toMatch(/nombre/)
    expect(validateEmployeeProfile({ name:'Nuevo', email:'incorrecto', pin:'1234' }, employees).error).toMatch(/email válido/)
    expect(validateEmployeeProfile({ name:'Nuevo', email:'nuevo@empresa.com', pin:'12' }, employees).error).toMatch(/4 y 6/)
  })

  it('normaliza el email y acepta un alta completa', () => {
    expect(validateEmployeeProfile({ id:'e3', name:' Nuevo ', email:' NUEVO@EMPRESA.COM ', pin:'1234' }, employees)).toEqual({
      ok:true, name:'Nuevo', email:'nuevo@empresa.com',
    })
  })

  it('impide duplicados y protege el email de una identidad vinculada', () => {
    expect(validateEmployeeProfile({ id:'e3', name:'Otra', email:'ANA@empresa.com', pin:'1234' }, employees).error).toContain('Ana')
    expect(validateEmployeeProfile({ id:'e2', name:'Luis', email:'otro@empresa.com', pin:'' }, employees, true).error).toMatch(/Supabase Auth/)
    expect(validateEmployeeProfile({ id:'e2', name:'Luis', email:'LUIS@EMPRESA.COM', pin:'' }, employees, true).ok).toBe(true)
  })
})
