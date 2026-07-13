import { describe, expect, it } from 'vitest'
import { getScopedOnlineRecords } from './supervisorScope.js'

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
})

