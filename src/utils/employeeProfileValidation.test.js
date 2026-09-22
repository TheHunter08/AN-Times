import { describe, expect, it } from 'vitest'
import { validateEmployeeProfile } from './employeeProfileValidation.js'

const employees = [
  { id: 'e1', name: 'Ana', email: 'ana@empresa.com' },
  { id: 'e2', name: 'Luis', email: 'luis@empresa.com', authId: 'auth-luis' },
]

describe('validación del perfil de empleado', () => {
  it('exige nombre, email válido y PIN al crear', () => {
    expect(validateEmployeeProfile({ name:'', email:'nuevo@empresa.com', pin:'1234', centroTrabajo:'Centro Norte' }, employees).error).toMatch(/nombre/)
    expect(validateEmployeeProfile({ name:'Nuevo', email:'incorrecto', pin:'1234', centroTrabajo:'Centro Norte' }, employees).error).toMatch(/email válido/)
    expect(validateEmployeeProfile({ name:'Nuevo', email:'nuevo@empresa.com', pin:'12', centroTrabajo:'Centro Norte' }, employees).error).toMatch(/4 y 6/)
  })

  it('exige centro de trabajo — sin él, un encargado nunca coincide con nadie y un empleado se queda sin obra que fichar', () => {
    expect(validateEmployeeProfile({ name:'Nuevo', email:'nuevo@empresa.com', pin:'1234', centroTrabajo:'' }, employees).error).toMatch(/centro de trabajo/)
    expect(validateEmployeeProfile({ name:'Nuevo', email:'nuevo@empresa.com', pin:'1234' }, employees).error).toMatch(/centro de trabajo/)
  })

  it('normaliza el email y acepta un alta completa', () => {
    expect(validateEmployeeProfile({ id:'e3', name:' Nuevo ', email:' NUEVO@EMPRESA.COM ', pin:'1234', centroTrabajo:'Centro Norte' }, employees)).toEqual({
      ok:true, name:'Nuevo', email:'nuevo@empresa.com',
    })
  })

  it('impide duplicados y protege el email de una identidad vinculada', () => {
    expect(validateEmployeeProfile({ id:'e3', name:'Otra', email:'ANA@empresa.com', pin:'1234', centroTrabajo:'Centro Norte' }, employees).error).toContain('Ana')
    expect(validateEmployeeProfile({ id:'e2', name:'Luis', email:'otro@empresa.com', pin:'', centroTrabajo:'Centro Norte' }, employees, true).error).toMatch(/Supabase Auth/)
    expect(validateEmployeeProfile({ id:'e2', name:'Luis', email:'LUIS@EMPRESA.COM', pin:'', centroTrabajo:'Centro Norte' }, employees, true).ok).toBe(true)
  })
})
