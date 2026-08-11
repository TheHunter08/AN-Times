import { describe, expect, it } from 'vitest'
import { buildLaunchBlockerInstructions, buildLaunchPlanSummary, getLaunchBlockerActions, getLaunchBlockers, getLaunchRequirements, hasEmployeeEmail, hasEmployeeSignature } from './launchRequirements.js'

describe('requisitos obligatorios de lanzamiento', () => {
  const db = {
    employees: [{ id:'emp1', email:'ana@empresa.com' }],
    firmas: { emp1: { main: { data: 'data:image/jpeg;base64,firma' } } },
  }

  it('solo acepta una firma con datos reales', () => {
    expect(hasEmployeeSignature(db, 'emp1')).toBe(true)
    expect(hasEmployeeSignature({ firmas: { emp1: { main: {} } } }, 'emp1')).toBe(false)
  })

  it('solo acepta un email con formato válido', () => {
    expect(hasEmployeeEmail(db, 'emp1')).toBe(true)
    expect(hasEmployeeEmail({ employees: [{ id:'emp1', email:'' }] }, 'emp1')).toBe(false)
    expect(hasEmployeeEmail({ employees: [{ id:'emp1' }] }, 'emp1')).toBe(false)
  })

  it('exige simultáneamente email, firma y registro push confirmado', () => {
    expect(getLaunchRequirements(db, 'emp1', true).ready).toBe(true)
    expect(getLaunchRequirements(db, 'emp1', false).ready).toBe(false)
    expect(getLaunchRequirements({ firmas: db.firmas }, 'emp1', true).ready).toBe(false)
    expect(getLaunchRequirements({ employees: db.employees }, 'emp1', true).ready).toBe(false)
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

  it('identifica todos los perfiles implicados en correos e identidades duplicadas', () => {
    const blockers = getLaunchBlockers({
      employees:[
        { id:'emp1', name:'Ana', email:'Equipo@empresa.com', authId:'auth-shared', role:'empleado', pin:'pbkdf2:salt:hash:600000' },
        { id:'emp2', name:'Luis', email:'equipo@empresa.com', authId:'auth-shared', role:'empleado', pin:'pbkdf2:salt:hash:600000' },
      ],
      firmas:{
        emp1:{ main:{ data:'data:image/png;base64,firma1' } },
        emp2:{ main:{ data:'data:image/png;base64,firma2' } },
      },
    })
    expect(blockers).toEqual([
      { employeeId:'emp1', employeeName:'Ana', issues:['Correo compartido con otro perfil', 'Identidad de acceso duplicada'] },
      { employeeId:'emp2', employeeName:'Luis', issues:['Correo compartido con otro perfil', 'Identidad de acceso duplicada'] },
    ])
  })

  it('genera instrucciones compartibles sin revelar credenciales', () => {
    const text = buildLaunchBlockerInstructions({
      employeeName:'Ana',
      issues:['Falta crear acceso', 'PIN heredado: iniciar sesión', 'Falta activar notificaciones'],
    })

    expect(text).toContain('Hola Ana')
    expect(text).toContain('Primera vez: vincular mi cuenta')
    expect(text).toContain('actualizará su protección automáticamente')
    expect(text).toContain('no envíes tu contraseña ni tu PIN')
    expect(text).not.toContain('pbkdf2')
  })

  it('conserva acciones de perfil y del empleado en bloqueos mixtos', () => {
    expect(getLaunchBlockerActions(['Falta email', 'Falta activar notificaciones'])).toEqual({
      profileFixable:true,
      employeeActionRequired:true,
    })
    expect(getLaunchBlockerActions(['Falta PIN'])).toEqual({ profileFixable:true, employeeActionRequired:false })
    expect(getLaunchBlockerActions(['Falta firma'])).toEqual({ profileFixable:false, employeeActionRequired:true })
  })

  it('genera un plan consolidado ordenado y sin credenciales', () => {
    const summary = buildLaunchPlanSummary([
      { employeeName:'Luis', issues:['Falta crear acceso', 'Falta email'] },
      { employeeName:'Ana', issues:['Falta crear acceso'] },
    ])

    expect(summary).toContain('Personas pendientes: 2')
    expect(summary).toContain('- Falta crear acceso: 2')
    expect(summary).toContain('- Falta email: 1')
    expect(summary).toContain('- Luis: Falta crear acceso; Falta email')
    expect(summary).toContain('no recopilar ni compartir contraseñas o PIN')
  })
})
