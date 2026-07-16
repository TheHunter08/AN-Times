import { describe, expect, it } from 'vitest'
import { employeeBelongsToObra, employeeObraOptions, resolveRecordObraId } from './obraAttribution.js'

const obras = [
  { id:'obra-a', nombre:'Reforma Centro' },
  { id:'obra-b', nombre:'Nave Norte' },
]

describe('atribución de fichajes a obras', () => {
  it('usa el centro real del fichaje cuando el empleado tiene varias obras', () => {
    const employee = { id:'e1', obrasAsignadas:['obra-a', 'obra-b'] }
    expect(resolveRecordObraId({ centro:'Nave Norte' }, employee, obras)).toBe('obra-b')
    expect(resolveRecordObraId({ centro:'Reforma Centro' }, employee, obras)).toBe('obra-a')
  })

  it('acepta referencias por id y por nombre', () => {
    expect(resolveRecordObraId({ obraId:'obra-a' }, {}, obras)).toBe('obra-a')
    expect(resolveRecordObraId({ obra:'nave norte' }, {}, obras)).toBe('obra-b')
  })

  it('no duplica un histórico ambiguo entre varias obras', () => {
    const employee = { id:'e1', obrasAsignadas:['obra-a', 'obra-b'] }
    expect(resolveRecordObraId({}, employee, obras)).toBeNull()
    expect(resolveRecordObraId({ centro:'Centro externo' }, employee, obras)).toBeNull()
  })

  it('recupera históricos sin centro cuando solo existe una asignación', () => {
    const employee = { id:'e1', obrasAsignadas:['obra-a'] }
    expect(resolveRecordObraId({}, employee, obras)).toBe('obra-a')
  })

  it('considera asignaciones legacy guardadas como centro de trabajo', () => {
    expect(employeeBelongsToObra({ centroTrabajo:'Reforma Centro' }, obras[0])).toBe(true)
    expect(employeeBelongsToObra({ obrasAsignadas:['obra-b'] }, obras[0])).toBe(false)
  })

  it('convierte las obras asignadas por id en opciones legibles para fichar', () => {
    expect(employeeObraOptions(
      { obrasAsignadas:['obra-b', 'obra-a'], centroTrabajo:'Nave Norte' },
      obras,
      ['Centro antiguo'],
    )).toEqual(['Nave Norte', 'Reforma Centro'])
  })

  it('mantiene los centros legacy cuando no hay obras asignadas', () => {
    expect(employeeObraOptions(
      { centroTrabajo:'Centro habitual' },
      obras,
      ['Centro habitual', 'Centro alternativo'],
    )).toEqual(['Centro habitual', 'Centro alternativo'])
  })
})
