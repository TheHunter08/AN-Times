import { describe, it, expect } from 'vitest'
import { calcSecs, calcMin, mhm, wkStart, monthlyExtras, vacData } from './time.js'

describe('calcSecs', () => {
  it('calcula trabajo sin descansos', () => {
    const r = { inicio: '2026-06-01T08:00:00', fin: '2026-06-01T12:00:00' }
    expect(calcSecs(r).work).toBe(4 * 3600)
    expect(calcSecs(r).brk).toBe(0)
  })

  it('descuenta descansos cerrados', () => {
    const r = {
      inicio: '2026-06-01T08:00:00', fin: '2026-06-01T12:00:00',
      breaks: [{ start: '2026-06-01T10:00:00', end: '2026-06-01T10:30:00' }],
    }
    expect(calcSecs(r).work).toBe(3.5 * 3600)
    expect(calcSecs(r).brk).toBe(30 * 60)
  })

  it('devuelve 0 si fin es anterior a inicio', () => {
    const r = { inicio: '2026-06-01T12:00:00', fin: '2026-06-01T08:00:00' }
    expect(calcSecs(r)).toEqual({ work: 0, brk: 0 })
  })

  it('devuelve 0 con objeto vacío', () => {
    expect(calcSecs(null)).toEqual({ work: 0, brk: 0 })
  })

  it('ignora descansos con fechas inválidas', () => {
    const r = {
      inicio: '2026-06-01T08:00:00', fin: '2026-06-01T12:00:00',
      breaks: [{ start: 'no-es-fecha', end: '2026-06-01T10:30:00' }],
    }
    expect(calcSecs(r).work).toBe(4 * 3600)
  })
})

describe('calcMin', () => {
  it('usa workSecs si está disponible', () => {
    expect(calcMin({ fin: 'x', workSecs: 7200 })).toBe(120)
  })

  it('devuelve 0 si el registro no tiene fin', () => {
    expect(calcMin({ inicio: '2026-06-01T08:00:00' })).toBe(0)
  })

  it('calcula desde inicio/fin cuando no hay workSecs', () => {
    const r = { inicio: '2026-06-01T08:00:00', fin: '2026-06-01T10:00:00' }
    expect(calcMin(r)).toBe(120)
  })
})

describe('mhm', () => {
  it('formatea minutos como Xh Ym', () => {
    expect(mhm(125)).toBe('2h 05m')
    expect(mhm(0)).toBe('0h 00m')
    expect(mhm(59)).toBe('0h 59m')
  })

  it('nunca es negativo', () => {
    expect(mhm(-30)).toBe('0h 00m')
  })
})

describe('wkStart', () => {
  it('devuelve el lunes de la semana para un día entre semana', () => {
    const d = wkStart(new Date('2026-07-01T15:00:00')) // miércoles
    expect(d.getDay()).toBe(1)
    expect(d.getDate()).toBe(29) // lunes 29 de junio
  })

  it('devuelve el lunes anterior cuando el día es domingo', () => {
    const d = wkStart(new Date('2026-07-05T10:00:00')) // domingo
    expect(d.getDay()).toBe(1)
    expect(d.getDate()).toBe(29)
  })
})

describe('monthlyExtras', () => {
  const mk = (inicio, fin, empId = 'e1') => ({ empId, inicio, fin, fin: fin })

  it('sin registros no hay extras ni déficit', () => {
    const r = monthlyExtras([], 'e1', '2026-06')
    expect(r).toEqual({ workedMin: 0, weeklyExtraMin: 0, shortfallMin: 160 * 60, netExtraMin: 0, deficitMin: 160 * 60 })
  })

  it('detecta extras cuando una semana supera las 40h', () => {
    // Semana del 1-5 junio 2026 (lunes 1 a viernes 5): 9h/día = 45h esa semana
    const records = Array.from({ length: 5 }, (_, i) => ({
      empId: 'e1',
      inicio: `2026-06-0${i + 1}T08:00:00`,
      fin: `2026-06-0${i + 1}T17:00:00`, // 9h
    }))
    const r = monthlyExtras(records, 'e1', '2026-06', { weeklyH: 40, monthlyH: 160 })
    expect(r.weeklyExtraMin).toBe(5 * 60) // 5h extra esa semana
  })

  it('compensa déficit con extras acumuladas antes de marcar déficit real', () => {
    // Una semana con 45h de extra (5h) pero el mes completo se queda corto
    const records = Array.from({ length: 5 }, (_, i) => ({
      empId: 'e1',
      inicio: `2026-06-0${i + 1}T08:00:00`,
      fin: `2026-06-0${i + 1}T17:00:00`, // 9h x5 = 45h
    }))
    const r = monthlyExtras(records, 'e1', '2026-06', { weeklyH: 40, monthlyH: 160 })
    // workedMin = 45h, shortfall = 160-45=115h, weeklyExtra=5h → deficit real = 110h, netExtra=0
    expect(r.workedMin).toBe(45 * 60)
    expect(r.netExtraMin).toBe(0)
    expect(r.deficitMin).toBe(110 * 60)
  })

  it('ignora registros de otro empleado o mes', () => {
    const records = [
      { empId: 'otro', inicio: '2026-06-01T08:00:00', fin: '2026-06-01T17:00:00' },
      { empId: 'e1', inicio: '2026-05-01T08:00:00', fin: '2026-05-01T17:00:00' },
    ]
    const r = monthlyExtras(records, 'e1', '2026-06')
    expect(r.workedMin).toBe(0)
  })
})

describe('vacData', () => {
  it('devuelve ceros si el empleado no existe', () => {
    const db = { employees: [], vacaciones: [] }
    expect(vacData('nope', db)).toEqual({ months: 0, generated: 0, used: 0, pending: 0, available: 0 })
  })

  it('resta vacaciones usadas y pendientes de las disponibles', () => {
    const db = {
      employees: [{ id: 'e1', startDate: '2020-01-01', jornadaHoras: 40 }],
      vacaciones: [
        { empId: 'e1', estado: 'aprobada', fechaInicio: '2026-06-01', fechaFin: '2026-06-05' }, // 5 días
        { empId: 'e1', estado: 'pendiente', fechaInicio: '2026-07-01', fechaFin: '2026-07-02' }, // 2 días
      ],
    }
    const r = vacData('e1', db)
    expect(r.used).toBe(5)
    expect(r.pending).toBe(2)
    expect(r.available).toBe(parseFloat((r.generated - 7).toFixed(1)))
  })
})
