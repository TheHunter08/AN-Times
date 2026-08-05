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
    // 2026 tiene calendario laboral oficial cargado (ver laborCalendar.js):
    // monthlyTargetMinutes usa su total mensual exacto (junio 176h, julio
    // 153h — jornada intensiva) en vez de la aproximación "semanas que
    // empiezan en el mes × 40h" (que solo se usa para años sin calendario).
    expect(monthlyTargetMinutes({}, '2026-06')).toBe(176 * 60)
    expect(monthlyTargetMinutes({}, '2026-07')).toBe(153 * 60)
  })

  it('cae a la aproximación de 40h/semana para años sin calendario cargado', () => {
    const weeks = workWeekStartsInMonth('2030-06').length
    expect(monthlyTargetMinutes({}, '2030-06')).toBe(weeks * 40 * 60)
  })
})
