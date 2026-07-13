import { describe, expect, it } from 'vitest'
import { isRecordMonthLocked, recordTimesFromClock } from './adminHelpers.js'

describe('recordTimesFromClock', () => {
  it('conserva la fecha local original al cambiar solo la hora', () => {
    const result = recordTimesFromClock({ inicio: '2026-07-13T06:00:00.000Z' }, '09:15', '17:45')
    expect(result.inicio.getFullYear()).toBe(2026)
    expect(result.inicio.getMonth()).toBe(6)
    expect(result.inicio.getDate()).toBe(13)
    expect(result.inicio.getHours()).toBe(9)
    expect(result.fin.getHours()).toBe(17)
  })

  it('sitúa la salida al día siguiente en jornadas nocturnas', () => {
    const result = recordTimesFromClock({ inicio: '2026-07-13T20:00:00.000Z' }, '22:00', '06:00')
    expect(result.fin.getTime() - result.inicio.getTime()).toBe(8 * 60 * 60 * 1000)
  })

  it('rechaza horas o fechas inválidas', () => {
    expect(recordTimesFromClock({ inicio: '2026-07-13T06:00:00.000Z' }, '25:00', '17:00')).toBeNull()
    expect(recordTimesFromClock({ inicio: 'fecha-invalida' }, '09:00', '17:00')).toBeNull()
  })
})

describe('isRecordMonthLocked', () => {
  const inicio = '2026-07-13T08:00:00.000Z'

  it('bloquea el mes cuando existe una firma del empleado o administrador', () => {
    expect(isRecordMonthLocked([{ empId:'e1', mes:'2026-07', firmaEmp:true }], 'e1', inicio)).toBe(true)
    expect(isRecordMonthLocked([{ empId:'e1', mes:'2026-07', firmaAdmin:true }], 'e1', inicio)).toBe(true)
  })

  it('no bloquea otro empleado, otro mes ni un cierre pendiente', () => {
    expect(isRecordMonthLocked([{ empId:'e2', mes:'2026-07', firmaEmp:true }], 'e1', inicio)).toBe(false)
    expect(isRecordMonthLocked([{ empId:'e1', mes:'2026-06', firmaEmp:true }], 'e1', inicio)).toBe(false)
    expect(isRecordMonthLocked([{ empId:'e1', mes:'2026-07', estado:'pendiente' }], 'e1', inicio)).toBe(false)
  })
})
