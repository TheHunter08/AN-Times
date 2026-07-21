import { describe, expect, it } from 'vitest'
import { getScopedEmployees, getScopedOnlineRecords } from './supervisorScope.js'

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
  it('solo muestra fichajes abiertos de la misma obra y centro', () => {
    expect(getScopedOnlineRecords({ records, employees, obras, supervisor }).map(item => item.record.id)).toEqual(['ok'])
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

  it('limita el directorio del supervisor a su centro y obra', () => {
    expect(getScopedEmployees({ employees, supervisor }).map(item => item.id)).toEqual(['same'])
  })

  it('no incluye administradores ni bajas en el ámbito global', () => {
    const result = getScopedEmployees({
      employees:[...employees, { id:'admin', isAdmin:true }, { id:'inactive', baja:true }],
      supervisor:{}, unrestricted:true,
    })
    expect(result).toHaveLength(3)
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

  it('el comportamiento original (mismo centro y obra exigidos a la vez) se mantiene si la obra no está adscrita a ningún centro', () => {
    expect(getScopedOnlineRecords({ records, employees, obras, supervisor }).map(item => item.record.id)).toEqual(['ok'])
  })
})
