import { describe, it, expect } from 'vitest'
import { mondayOf, weekStartIso, isWeekClosed, shiftMonthValue } from './planningWeeks.js'

describe('mondayOf', () => {
  it('un miércoles devuelve el lunes de esa misma semana', () => {
    expect(localDateOf(mondayOf('2026-07-15T10:00:00'))).toBe('2026-07-13')
  })
  it('un lunes se devuelve a sí mismo', () => {
    expect(localDateOf(mondayOf('2026-07-13T23:00:00'))).toBe('2026-07-13')
  })
  it('un domingo pertenece a la semana que empezó el lunes anterior', () => {
    expect(localDateOf(mondayOf('2026-07-19T00:30:00'))).toBe('2026-07-13')
  })
})

function localDateOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('weekStartIso', () => {
  it('formatea el lunes de la semana en YYYY-MM-DD', () => {
    expect(weekStartIso('2026-07-15T10:00:00')).toBe('2026-07-13')
  })
})

describe('isWeekClosed', () => {
  const closures = [{ id: 'c1', weekStart: '2026-07-13' }]
  it('true cuando hay un cierre con ese weekStart', () => {
    expect(isWeekClosed(closures, '2026-07-13')).toBe(true)
  })
  it('false cuando no coincide ningún cierre', () => {
    expect(isWeekClosed(closures, '2026-07-20')).toBe(false)
  })
  it('false con lista vacía, nula o indefinida, sin lanzar', () => {
    expect(isWeekClosed([], '2026-07-13')).toBe(false)
    expect(isWeekClosed(null, '2026-07-13')).toBe(false)
    expect(isWeekClosed(undefined, '2026-07-13')).toBe(false)
  })
})

describe('shiftMonthValue', () => {
  it('suma meses dentro del mismo año', () => {
    expect(shiftMonthValue('2026-07', 1)).toBe('2026-08')
  })
  it('resta meses cruzando a diciembre del año anterior', () => {
    expect(shiftMonthValue('2026-01', -1)).toBe('2025-12')
  })
  it('suma meses cruzando a enero del año siguiente', () => {
    expect(shiftMonthValue('2026-12', 1)).toBe('2027-01')
  })
})
