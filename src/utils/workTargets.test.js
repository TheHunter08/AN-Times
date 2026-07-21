import { describe, expect, it } from 'vitest'
import { contractWeeklyMinutes, monthlyTargetMinutes, workingDaysInMonth } from './workTargets.js'

describe('objetivos contractuales', () => {
  it('respeta las horas semanales del empleado', () => {
    expect(contractWeeklyMinutes({ horasSemanales:20 })).toBe(1200)
    expect(contractWeeklyMinutes({})).toBe(2400)
  })

  it('calcula el objetivo con los laborables reales del mes', () => {
    expect(workingDaysInMonth('2026-07')).toBe(23)
    expect(monthlyTargetMinutes({ horasSemanales:40 }, '2026-07')).toBe(23 * 8 * 60)
    expect(monthlyTargetMinutes({ horasSemanales:20 }, '2026-07')).toBe(23 * 4 * 60)
  })
})
