import { describe, expect, it } from 'vitest'
import { getScopedEmployees, getScopedOnlineRecords, isScopedSupervisor } from './supervisorScope.js'

const supervisor = { id: 'boss', centroTrabajo: 'Centro Norte', obrasAsignadas: ['obra-a'] }
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

describe('getScopedOnlineRecords', () => {
  // El supervisor tiene centro Y obra asignados. Antes se exigían los dos a
  // la vez, así que un empleado que solo compartía la obra (otro centro) o
  // solo el centro (otra obra) desaparecía aunque perteneciera a su equipo —
  // esto era precisamente el bug reportado ("no salen todos los empleados").
  it('muestra fichajes de empleados que coinciden en el centro o en la obra del supervisor', () => {
    expect(getScopedOnlineRecords({ records, employees, obras, supervisor }).map(item => item.record.id).sort())
      .toEqual(['ok', 'other-center', 'other-work'].sort())
  })

  it('acepta el nombre de la obra guardado como ubicación del fichaje', () => {
    const result = getScopedOnlineRecords({
      records: [{ id: 'by-name', empId: 'same', inicio: '2026-07-13T08:00:00Z', centro: 'Reforma A' }],
      employees, obras, supervisor,
    })
    expect(result).toHaveLength(1)
  })

  it('no concede acceso global a un supervisor sin asignaciones', () => {
    expect(getScopedOnlineRecords({ records, employees, obras, supervisor: { id: 'boss' } })).toEqual([])
  })

  it('permite a un administrador global ver todos los fichajes abiertos', () => {
    expect(getScopedOnlineRecords({ records, employees, obras, supervisor: {}, unrestricted: true })).toHaveLength(3)
  })

  it('el directorio del supervisor incluye a quien coincide en centro o en obra (no exige las dos)', () => {
    expect(getScopedEmployees({ employees, supervisor }).map(item => item.id).sort())
      .toEqual(['otherCenter', 'otherWork', 'same'].sort())
  })

  it('sigue sin incluir a un empleado que no comparte ni centro ni obra con el supervisor', () => {
    const unrelated = { id: 'unrelated', name: 'Zoe', centroTrabajo: 'Centro Este', obrasAsignadas: ['obra-z'] }
    expect(getScopedEmployees({ employees: [...employees, unrelated], supervisor }).map(item => item.id))
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
})

describe('vínculo obra→centro de trabajo', () => {
  const linkedObras = [{ id: 'obra-c', nombre: 'Reforma C', centroTrabajo: 'Centro Norte' }]

  it('getScopedOnlineRecords: un supervisor con solo centro ve a un empleado fichado en una obra adscrita a ese centro', () => {
    const supervisorSoloCentro = { id: 'boss2', centroTrabajo: 'Centro Norte' }
    const employee = { id: 'dani', name: 'Dani', obrasAsignadas: ['obra-c'] }
    const records = [{ id: 'dani-rec', empId: 'dani', inicio: '2026-07-13T08:00:00Z', centro: 'Reforma C' }]
    const result = getScopedOnlineRecords({ records, employees: [employee], obras: linkedObras, supervisor: supervisorSoloCentro })
    expect(result).toHaveLength(1)
  })

  it('getScopedOnlineRecords: sin el vínculo obra→centro, el mismo empleado no aparece (regresión del bug original)', () => {
    const supervisorSoloCentro = { id: 'boss2', centroTrabajo: 'Centro Norte' }
    const employee = { id: 'dani', name: 'Dani', obrasAsignadas: ['obra-c'] }
    const records = [{ id: 'dani-rec', empId: 'dani', inicio: '2026-07-13T08:00:00Z', centro: 'Reforma C' }]
    const obrasSinCentro = [{ id: 'obra-c', nombre: 'Reforma C' }]
    const result = getScopedOnlineRecords({ records, employees: [employee], obras: obrasSinCentro, supervisor: supervisorSoloCentro })
    expect(result).toHaveLength(0)
  })

  it('getScopedEmployees: un supervisor con solo centro ve a un empleado asignado a una obra adscrita a ese centro', () => {
    const supervisorSoloCentro = { id: 'boss2', centroTrabajo: 'Centro Norte' }
    const employee = { id: 'dani', name: 'Dani', obrasAsignadas: ['obra-c'] }
    const result = getScopedEmployees({ employees: [employee], obras: linkedObras, supervisor: supervisorSoloCentro })
    expect(result.map(item => item.id)).toEqual(['dani'])
  })

  it('sin vínculo obra→centro, coincidir en cualquiera de las dos dimensiones sigue bastando', () => {
    expect(getScopedOnlineRecords({ records, employees, obras, supervisor }).map(item => item.record.id).sort())
      .toEqual(['ok', 'other-center', 'other-work'].sort())
  })

  it('getScopedOnlineRecords: jefe de obra con obra asignada por nombre ve fichaje cuyo centro coincide con el nombre (sin conversión a ID)', () => {
    const supervisorNombre = { id: 'jefe', obrasAsignadas: ['Reforma C'] }
    const emp = { id: 'emp1', name: 'Elena', centroTrabajo: 'Centro Norte', obrasAsignadas: [] }
    const recs = [{ id: 'rec1', empId: 'emp1', inicio: '2026-07-27T08:00:00Z', centro: 'Reforma C' }]
    const result = getScopedOnlineRecords({ records: recs, employees: [emp], obras: linkedObras, supervisor: supervisorNombre })
    expect(result).toHaveLength(1)
  })

  it('getScopedEmployees: jefe de obra con obra ligada a un centro ve empleados con solo centroTrabajo, sin obrasAsignadas', () => {
    const supervisorNombre = { id: 'jefe', obrasAsignadas: ['obra-c'] }
    const empSoloCentro = { id: 'emp2', name: 'Fran', centroTrabajo: 'Centro Norte', obrasAsignadas: [] }
    const result = getScopedEmployees({ employees: [empSoloCentro], obras: linkedObras, supervisor: supervisorNombre })
    expect(result.map(item => item.id)).toEqual(['emp2'])
  })
})
