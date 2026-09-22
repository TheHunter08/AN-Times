import { describe, expect, it } from 'vitest'
import { getScopedEmployees, getScopedOnlineRecords, isScopedSupervisor } from './supervisorScope.js'

const encargado = { id: 'boss', role: 'encargado', centroTrabajo: 'Centro Norte', obrasAsignadas: ['obra-a'] }
const jefeCentro = { id: 'chief', role: 'jefe_centro', centroTrabajo: 'Centro Norte', obrasAsignadas: [] }
const obras = [{ id: 'obra-a', nombre: 'Reforma A' }, { id: 'obra-b', nombre: 'Reforma B' }]
const records = [
  { id: 'ok', empId: 'same', inicio: '2026-07-13T08:00:00Z', centro: 'Centro Norte' },
  { id: 'other-work', empId: 'otherWork', inicio: '2026-07-13T08:00:00Z', centro: 'Centro Norte' },
  { id: 'other-center', empId: 'otherCenter', inicio: '2026-07-13T08:00:00Z', centro: 'Centro Sur' },
  { id: 'closed', empId: 'same', inicio: '2026-07-13T08:00:00Z', fin: '2026-07-13T16:00:00Z' },
]
const employees = [
  { id: 'same', name: 'Ana', centroTrabajo: 'Centro Norte', obrasAsignadas: ['obra-a'] },
  { id: 'otherWork', name: 'Bea', centroTrabajo: 'Centro Norte', obrasAsignadas: ['obra-b'] },
  { id: 'otherCenter', name: 'Carla', centroTrabajo: 'Centro Sur', obrasAsignadas: ['obra-a'] },
]

describe('getScopedOnlineRecords — encargado exige centro Y obra a la vez', () => {
  it('un encargado solo ve fichajes de empleados que coinciden en su centro Y su obra', () => {
    expect(getScopedOnlineRecords({ records, employees, obras, supervisor: encargado }).map(item => item.record.id).sort())
      .toEqual(['ok'])
  })

  it('acepta el nombre de la obra guardado como ubicación del fichaje', () => {
    const result = getScopedOnlineRecords({
      records: [{ id: 'by-name', empId: 'same', inicio: '2026-07-13T08:00:00Z', centro: 'Reforma A' }],
      employees, obras, supervisor: encargado,
    })
    expect(result).toHaveLength(1)
  })

  it('no concede acceso global a un supervisor sin asignaciones', () => {
    expect(getScopedOnlineRecords({ records, employees, obras, supervisor: { id: 'boss', role: 'encargado' } })).toEqual([])
  })

  it('un encargado con centro pero sin ninguna obra asignada no ve a nadie (le falta la segunda dimensión)', () => {
    const soloCentro = { id: 'boss', role: 'encargado', centroTrabajo: 'Centro Norte' }
    expect(getScopedOnlineRecords({ records, employees, obras, supervisor: soloCentro })).toEqual([])
  })

  it('permite a un administrador global ver todos los fichajes abiertos', () => {
    expect(getScopedOnlineRecords({ records, employees, obras, supervisor: {}, unrestricted: true })).toHaveLength(3)
  })

  it('el directorio del encargado solo incluye a quien coincide en centro Y obra a la vez', () => {
    expect(getScopedEmployees({ employees, supervisor: encargado }).map(item => item.id))
      .toEqual(['same'])
  })

  it('sigue sin incluir a un empleado que no comparte ni centro ni obra con el encargado', () => {
    const unrelated = { id: 'unrelated', name: 'Zoe', centroTrabajo: 'Centro Este', obrasAsignadas: ['obra-z'] }
    expect(getScopedEmployees({ employees: [...employees, unrelated], supervisor: encargado }).map(item => item.id))
      .not.toContain('unrelated')
  })

  it('no incluye administradores ni bajas en el ámbito global', () => {
    const result = getScopedEmployees({
      employees:[...employees, { id:'admin', isAdmin:true }, { id:'inactive', baja:true }],
      supervisor:{}, unrestricted:true,
    })
    expect(result).toHaveLength(3)
  })
})

describe('jefe de centro — sin obras propias, le basta con coincidir en centro', () => {
  it('ve fichajes de empleados de su centro aunque no compartan ninguna obra con él', () => {
    expect(getScopedOnlineRecords({ records, employees, obras, supervisor: jefeCentro }).map(item => item.record.id).sort())
      .toEqual(['ok', 'other-work'].sort())
  })

  it('ve en su directorio a todo empleado de su centro, sin exigir coincidencia de obra', () => {
    expect(getScopedEmployees({ employees, supervisor: jefeCentro }).map(item => item.id).sort())
      .toEqual(['otherWork', 'same'].sort())
  })

  it('no ve a un empleado de otro centro aunque comparta una obra con él (jefe de centro sin obrasAsignadas)', () => {
    expect(getScopedEmployees({ employees, supervisor: jefeCentro }).map(item => item.id))
      .not.toContain('otherCenter')
  })
})

describe('isScopedSupervisor', () => {
  it('reconoce al encargado por session.isEnc o por el rol del empleado', () => {
    expect(isScopedSupervisor({ isEnc: true, user: {} })).toBe(true)
    expect(isScopedSupervisor({ user: { role: 'encargado' } })).toBe(true)
  })

  it('no restringe a admin, empleado normal, ni jefe de obra (ya tiene acceso completo de administrador)', () => {
    expect(isScopedSupervisor({ user: { role: 'admin' } })).toBe(false)
    expect(isScopedSupervisor({ user: { role: 'empleado' } })).toBe(false)
    expect(isScopedSupervisor({ isJO: true, user: {} })).toBe(false)
    expect(isScopedSupervisor({ user: { role: 'jefe_obra' } })).toBe(false)
    expect(isScopedSupervisor(null)).toBe(false)
  })

  it('no restringe a un jefe de obra aunque conserve un isEnc heredado de antes de su ascenso', () => {
    // _roleFlagsFromProfile (appStore.js) calcula isEnc:role==='encargado'||!!profile?.isEnc
    // — un empleado ascendido de encargado a jefe de obra sin que se limpiara
    // ese booleano legacy llegaba aquí con isEnc:true e isJO:true a la vez.
    expect(isScopedSupervisor({ isEnc: true, isJO: true, user: { role: 'jefe_obra' } })).toBe(false)
    expect(isScopedSupervisor({ isEnc: true, user: { role: 'jefe_obra', isEnc: true } })).toBe(false)
  })

  // Un jefe de centro recibe isAdmin=true (mismo panel completo que jefe de
  // obra/admin), pero a diferencia de jefe de obra sí debe quedar acotado a
  // su centro — igual que un encargado.
  it('reconoce al jefe de centro por session.isJefeCentro o por el rol del empleado, y lo mantiene acotado', () => {
    expect(isScopedSupervisor({ isJefeCentro: true, user: {} })).toBe(true)
    expect(isScopedSupervisor({ user: { role: 'jefe_centro' } })).toBe(true)
  })
})

describe('vínculo obra→centro de trabajo (jefe de centro, sin obras propias)', () => {
  const linkedObras = [{ id: 'obra-c', nombre: 'Reforma C', centroTrabajo: 'Centro Norte' }]

  it('getScopedOnlineRecords: un jefe de centro ve a un empleado fichado en una obra adscrita a su centro', () => {
    const soloCentro = { id: 'boss2', role: 'jefe_centro', centroTrabajo: 'Centro Norte' }
    const employee = { id: 'dani', name: 'Dani', obrasAsignadas: ['obra-c'] }
    const records = [{ id: 'dani-rec', empId: 'dani', inicio: '2026-07-13T08:00:00Z', centro: 'Reforma C' }]
    const result = getScopedOnlineRecords({ records, employees: [employee], obras: linkedObras, supervisor: soloCentro })
    expect(result).toHaveLength(1)
  })

  it('getScopedOnlineRecords: sin el vínculo obra→centro, el mismo empleado no aparece (regresión del bug original)', () => {
    const soloCentro = { id: 'boss2', role: 'jefe_centro', centroTrabajo: 'Centro Norte' }
    const employee = { id: 'dani', name: 'Dani', obrasAsignadas: ['obra-c'] }
    const records = [{ id: 'dani-rec', empId: 'dani', inicio: '2026-07-13T08:00:00Z', centro: 'Reforma C' }]
    const obrasSinCentro = [{ id: 'obra-c', nombre: 'Reforma C' }]
    const result = getScopedOnlineRecords({ records, employees: [employee], obras: obrasSinCentro, supervisor: soloCentro })
    expect(result).toHaveLength(0)
  })

  it('getScopedEmployees: un jefe de centro ve a un empleado asignado a una obra adscrita a su centro', () => {
    const soloCentro = { id: 'boss2', role: 'jefe_centro', centroTrabajo: 'Centro Norte' }
    const employee = { id: 'dani', name: 'Dani', obrasAsignadas: ['obra-c'] }
    const result = getScopedEmployees({ employees: [employee], obras: linkedObras, supervisor: soloCentro })
    expect(result.map(item => item.id)).toEqual(['dani'])
  })

  it('getScopedOnlineRecords: jefe de centro con obra asignada por nombre ve fichaje cuyo centro coincide con el nombre (sin conversión a ID)', () => {
    const conObraPorNombre = { id: 'chief2', role: 'jefe_centro', obrasAsignadas: ['Reforma C'] }
    const emp = { id: 'emp1', name: 'Elena', centroTrabajo: 'Centro Norte', obrasAsignadas: [] }
    const recs = [{ id: 'rec1', empId: 'emp1', inicio: '2026-07-27T08:00:00Z', centro: 'Reforma C' }]
    const result = getScopedOnlineRecords({ records: recs, employees: [emp], obras: linkedObras, supervisor: conObraPorNombre })
    expect(result).toHaveLength(1)
  })

  it('getScopedEmployees: jefe de centro con obra ligada a un centro ve empleados con solo centroTrabajo, sin obrasAsignadas', () => {
    const conObraPorId = { id: 'chief2', role: 'jefe_centro', obrasAsignadas: ['obra-c'] }
    const empSoloCentro = { id: 'emp2', name: 'Fran', centroTrabajo: 'Centro Norte', obrasAsignadas: [] }
    const result = getScopedEmployees({ employees: [empSoloCentro], obras: linkedObras, supervisor: conObraPorId })
    expect(result.map(item => item.id)).toEqual(['emp2'])
  })
})
