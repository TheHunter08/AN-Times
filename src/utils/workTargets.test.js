import { describe, expect, it } from 'vitest'
import { contractWeeklyMinutes, monthlyTargetMinutes, workWeekStartsInMonth } from './workTargets.js'

describe('objetivos contractuales', () => {
  it('aplica 40 horas semanales obligatorias a todos los empleados', () => {
    expect(contractWeeklyMinutes({ horasSemanales:20 })).toBe(2400)
    expect(contractWeeklyMinutes({})).toBe(2400)
  })

  it('acumula 40 horas por cada semana que empieza en el mes', () => {
    expect(workWeekStartsInMonth('2026-06')).toEqual([
      '2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29',
    ])
    expect(monthlyTargetMinutes({}, '2026-06')).toBe(5 * 40 * 60)
    expect(monthlyTargetMinutes({}, '2026-07')).toBe(4 * 40 * 60)
  })
})
