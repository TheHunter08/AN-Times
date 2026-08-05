import { describe, expect, it } from 'vitest'
import { calendarDayHours, calendarMonthlyHours, calendarWeeklyHours } from './laborCalendar.js'

describe('calendarDayHours', () => {
  it('devuelve las horas laborables de un día normal', () => {
    expect(calendarDayHours('2026-06-15')).toBe(8)
  })

  it('devuelve las horas reducidas de jornada intensiva en julio-agosto', () => {
    expect(calendarDayHours('2026-07-01')).toBe(7) // lun-mié: 7h
    expect(calendarDayHours('2026-07-03')).toBe(7)
    expect(calendarDayHours('2026-07-09')).toBe(6) // jue-vie: 6h
    expect(calendarDayHours('2026-08-14')).toBe(6)
  })

  it('devuelve 0 para festivos nacionales, locales, sábados y domingos', () => {
    expect(calendarDayHours('2026-01-01')).toBe(0) // F — Año Nuevo
    expect(calendarDayHours('2026-05-15')).toBe(0) // FL — San Isidro
    expect(calendarDayHours('2026-06-06')).toBe(0) // S
    expect(calendarDayHours('2026-06-07')).toBe(0) // D
  })

  it('devuelve null para años sin calendario cargado', () => {
    expect(calendarDayHours('2027-06-15')).toBeNull()
    expect(calendarDayHours('2025-06-15')).toBeNull()
  })

  it('devuelve null para una fecha vacía o inválida', () => {
    expect(calendarDayHours('')).toBeNull()
    expect(calendarDayHours(undefined)).toBeNull()
  })
})

describe('calendarMonthlyHours', () => {
  it('devuelve el total mensual exacto estipulado por el calendario 2026', () => {
    expect(calendarMonthlyHours('2026-01')).toBe(160)
    expect(calendarMonthlyHours('2026-06')).toBe(176)
    expect(calendarMonthlyHours('2026-07')).toBe(153) // jornada intensiva
    expect(calendarMonthlyHours('2026-08')).toBe(139) // jornada intensiva
    expect(calendarMonthlyHours('2026-12')).toBe(160)
  })

  it('suma 1932h brutas anuales entre los 12 meses', () => {
    const total = Array.from({ length:12 }, (_, i) => calendarMonthlyHours(`2026-${String(i + 1).padStart(2, '0')}`))
      .reduce((sum, h) => sum + h, 0)
    expect(total).toBe(1932)
  })

  it('devuelve null para años sin calendario cargado', () => {
    expect(calendarMonthlyHours('2027-06')).toBeNull()
  })
})

describe('calendarWeeklyHours', () => {
  it('suma 40h en una semana normal sin festivos', () => {
    expect(calendarWeeklyHours('2026-06-15')).toBe(40)
  })

  it('suma 33h en una semana de jornada intensiva completa', () => {
    expect(calendarWeeklyHours('2026-07-06')).toBe(33) // 7+7+7+6+6
    expect(calendarWeeklyHours('2026-08-03')).toBe(33)
  })

  it('reduce la semana cuando contiene un festivo entre semana', () => {
    // Lunes de Pascua/Semana Santa: jueves 2 y viernes 3 de abril son festivo.
    expect(calendarWeeklyHours('2026-03-30')).toBe(24) // lun,mar 8h + mié 8h + jue/vie festivo(0)
  })

  it('calcula correctamente una semana que cruza de junio (8h) a julio (jornada intensiva)', () => {
    expect(calendarWeeklyHours('2026-06-29')).toBe(37) // lun,mar 8h + mié,jue,vie 7h
  })

  it('devuelve null si algún día de la semana cae fuera de un año con calendario cargado', () => {
    expect(calendarWeeklyHours('2027-06-14')).toBeNull()
  })
})
