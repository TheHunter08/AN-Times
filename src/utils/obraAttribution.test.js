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
    )).toEqual(['Nave Norte', 'Reforma Centro'])
  })

  it('nunca ofrece el centro de trabajo como opción, aunque no coincida con ninguna obra asignada', () => {
    expect(employeeObraOptions(
      { obrasAsignadas:['obra-a'], centroTrabajo:'Centro que no es una obra' },
      obras,
    )).toEqual(['Reforma Centro'])
  })

  it('sin obras asignadas, ofrece las obras adscritas al centro de trabajo del empleado (nunca el centro en sí)', () => {
    const obrasConCentro = [
      { id:'obra-a', nombre:'Reforma Centro', centroTrabajo:'Centro habitual' },
      { id:'obra-b', nombre:'Nave Norte', centroTrabajo:'Otro centro' },
    ]
    expect(employeeObraOptions({ centroTrabajo:'Centro habitual' }, obrasConCentro))
      .toEqual(['Reforma Centro'])
  })

  it('sin obras asignadas ni obra adscrita a su centro, no hay ninguna opción para fichar', () => {
    expect(employeeObraOptions({ centroTrabajo:'Centro sin obras' }, obras)).toEqual([])
    expect(employeeObraOptions({}, obras)).toEqual([])
  })

  it('nunca imprime una referencia obsoleta (obra renombrada/eliminada) como si fuera una obra real', () => {
    // Bug real: un empleado con 'Gecama' u otro nombre antiguo en
    // obrasAsignadas (de antes de renombrar/eliminar esa obra) hacía que
    // employeeObraOptions devolviera ese texto en bruto, apareciendo como
    // una obra fantasma seleccionable en el selector de "Iniciar jornada".
    expect(employeeObraOptions({ obrasAsignadas:['obra-fantasma-vieja'] }, obras)).toEqual([])
  })

  it('con una referencia obsoleta, cae al centro de trabajo en vez de no ofrecer nada', () => {
    const obrasConCentro = [{ id:'obra-a', nombre:'Reforma Centro', centroTrabajo:'Centro habitual' }]
    expect(employeeObraOptions({ obrasAsignadas:['obra-fantasma-vieja'], centroTrabajo:'Centro habitual' }, obrasConCentro))
      .toEqual(['Reforma Centro'])
  })
})
