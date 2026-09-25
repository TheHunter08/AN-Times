import { describe, expect, it } from 'vitest'
import { employeeFromRow } from './employeeTableRow.js'

describe('employeeFromRow', () => {
  it('marca isAdmin cuando la columna role dice admin', () => {
    const emp = employeeFromRow({ id:'e1', name:'Ana', role:'admin', baja:false, data:{} })
    expect(emp.isAdmin).toBe(true)
  })

  it('marca isAdmin a partir de data.isAdmin aunque la columna role no esté sincronizada', () => {
    // Ficha de administrador antigua: role nunca se sincronizó (columna
    // vacía o en 'empleado'), pero el objeto local sí tiene isAdmin:true.
    const emp = employeeFromRow({ id:'admin1', name:'Jefa', role:null, baja:false, data:{ isAdmin:true } })
    expect(emp.isAdmin).toBe(true)
  })

  it('no marca isAdmin para un empleado normal', () => {
    const emp = employeeFromRow({ id:'e2', name:'Bea', role:'empleado', baja:false, data:{} })
    expect(emp.isAdmin).toBe(false)
  })

  it('conserva los campos propios de la tabla junto a los del blob local', () => {
    const emp = employeeFromRow({
      id:'e3', name:'Cari', role:'encargado', baja:false, telefono:'600111222',
      reminder_time:'08:30', salida_time:'17:00',
      data:{ email:'cari@example.com', obrasAsignadas:['obra-1'] },
    })
    expect(emp).toMatchObject({
      id:'e3', name:'Cari', role:'encargado', telefono:'600111222',
      reminderTime:'08:30', salidaTime:'17:00',
      email:'cari@example.com', obrasAsignadas:['obra-1'],
      isAdmin:false,
    })
  })
})
