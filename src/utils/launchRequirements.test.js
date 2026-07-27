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
        { id:'emp1', name:'Ana', email:'ana@empresa.com', authId:'auth-1', role:'empleado', pin:'pbkdf2:salt:hash:600000' },
        { id:'emp2', name:'Luis', email:'', role:'empleado', pin:'pbkdf2:salt:hash:600000' },
        { id:'admin', name:'Admin', email:'admin@empresa.com', role:'admin', isAdmin:true },
      ],
      firmas: db.firmas,
    }
    expect(getLaunchBlockers(readinessDb, ['emp2'])).toEqual([
      { employeeId:'emp2', employeeName:'Luis', issues:['Falta email', 'Falta crear acceso', 'Falta firma', 'Falta activar notificaciones'] },
      { employeeId:'admin', employeeName:'Admin', issues:['Falta crear acceso'] },
    ])
  })

  it('señala empleados sin PIN porque no pueden fichar ni vincular su cuenta', () => {
    const blockers = getLaunchBlockers({
      employees:[{ id:'emp1', name:'Ana', email:'ana@empresa.com', authId:'auth-1', role:'empleado' }],
      firmas:db.firmas,
    })
    expect(blockers[0].issues).toContain('Falta PIN')
  })

  it('pide un login para migrar hashes heredados sin conocer el PIN', () => {
    const blockers = getLaunchBlockers({
      employees:[{ id:'emp1', name:'Ana', email:'ana@empresa.com', authId:'auth-1', role:'empleado', pin:'a'.repeat(64) }],
      firmas:db.firmas,
    })
    expect(blockers[0].issues).toContain('PIN heredado: iniciar sesión')
  })
})
