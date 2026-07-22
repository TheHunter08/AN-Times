import { describe, expect, it } from 'vitest'
import { getLaunchBlockers, getLaunchRequirements, hasEmployeeSignature } from './launchRequirements.js'

describe('requisitos obligatorios de lanzamiento', () => {
  const db = { firmas: { emp1: { main: { data: 'data:image/jpeg;base64,firma' } } } }

  it('solo acepta una firma con datos reales', () => {
    expect(hasEmployeeSignature(db, 'emp1')).toBe(true)
    expect(hasEmployeeSignature({ firmas: { emp1: { main: {} } } }, 'emp1')).toBe(false)
  })

  it('exige simultáneamente firma y registro push confirmado', () => {
    expect(getLaunchRequirements(db, 'emp1', true).ready).toBe(true)
    expect(getLaunchRequirements(db, 'emp1', false).ready).toBe(false)
    expect(getLaunchRequirements({}, 'emp1', true).ready).toBe(false)
  })
  it('explica por empleado los bloqueos operativos pendientes', () => {
    const readinessDb = {
      employees: [
        { id:'emp1', name:'Ana', email:'ana@empresa.com', authId:'auth-1', role:'empleado' },
        { id:'emp2', name:'Luis', email:'', role:'empleado' },
        { id:'admin', name:'Admin', email:'admin@empresa.com', role:'admin', isAdmin:true },
      ],
      firmas: db.firmas,
    }
    expect(getLaunchBlockers(readinessDb, ['emp2'])).toEqual([
      { employeeId:'emp2', employeeName:'Luis', issues:['Falta email', 'Falta crear acceso', 'Falta firma', 'Falta activar notificaciones'] },
      { employeeId:'admin', employeeName:'Admin', issues:['Falta crear acceso'] },
    ])
  })
})
