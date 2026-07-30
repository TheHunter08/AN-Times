import { describe, it, expect } from 'vitest'
import { calcSecs, calcMin, recWorkSecs, mhm, wkStart, monthlyExtras, vacData, localDateStr, localMonthKey } from './time.js'

describe('localMonthKey', () => {
  it('clasifica por el mes local y no por el mes UTC', () => {
    const local = new Date(2026, 6, 1, 0, 15)
    expect(localMonthKey(local)).toBe('2026-07')
  })

  it('devuelve vacío para fechas inválidas', () => {
    expect(localMonthKey('no-es-fecha')).toBe('')
  })
})

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

describe('localDateStr', () => {
  it('mantiene el día local al construir el calendario semanal', () => {
    const d = new Date(2026, 6, 6, 0, 0, 0) // lunes 6 de julio en hora local
    expect(localDateStr(d)).toBe('2026-07-06')
  })

  // Regresión: inicio se guarda siempre en UTC (new Date().toISOString()), pero
  // la app agrupa fichajes por día/mes/año local (RD, UTC-4, ver vitest.config.js).
  // Un fichaje nocturno cae en el día UTC siguiente aunque localmente sea "hoy" —
  // comparar con r.inicio?.startsWith(fecha) o r.inicio.slice(0,10) reproduce ese
  // bug; localDateStr(new Date(r.inicio)) es la única forma correcta de agrupar.
  it('agrupa un fichaje nocturno en el día local, no en el día UTC siguiente', () => {
    const inicio = '2026-07-14T02:00:00.000Z' // 22:00 del 13 de julio en RD (UTC-4)
    expect(inicio.slice(0, 10)).toBe('2026-07-14') // fecha UTC — NO es la fecha real del turno
    expect(localDateStr(new Date(inicio))).toBe('2026-07-13') // fecha local correcta
  })

  it('agrupa un fichaje nocturno en el mes/año local aunque cruce a otro mes en UTC', () => {
    const inicio = '2026-08-01T02:00:00.000Z' // 22:00 del 31 de julio en RD (UTC-4)
    expect(inicio.slice(0, 7)).toBe('2026-08') // mes UTC — NO es el mes real del turno
    expect(localDateStr(new Date(inicio)).slice(0, 7)).toBe('2026-07') // mes local correcto
  })
})

describe('monthlyExtras', () => {
  const historicalNow = new Date('2026-07-15T12:00:00')
  const week = (monday, dailyHours, empId = 'e1') => Array.from({ length:5 }, (_, index) => {
    const start = new Date(`${monday}T08:00:00`)
    start.setDate(start.getDate() + index)
    const end = new Date(start)
    end.setMinutes(end.getMinutes() + dailyHours * 60)
    return { empId, inicio:start.toISOString(), fin:end.toISOString() }
  })

  it('descuenta cada semana completa sin fichajes', () => {
    const r = monthlyExtras([], 'e1', '2026-06', { now:historicalNow })
    expect(r.completedWeeks).toBe(5)
    expect(r.weeklyExtraMin).toBe(0)
    expect(r.deficitMin).toBe(5 * 40 * 60)
    expect(r.balanceMin).toBe(-5 * 40 * 60)
  })

  it('detecta extras cuando una semana supera las 40h', () => {
    const r = monthlyExtras(week('2026-06-01', 9), 'e1', '2026-06', { now:historicalNow })
    expect(r.weeklyExtraMin).toBe(5 * 60)
  })

  it('40h exactas no son extra y el primer minuto adicional sí', () => {
    const records = week('2026-06-01', 8)
    expect(monthlyExtras(records, 'e1', '2026-06', { now:historicalNow }).weeklyExtraMin).toBe(0)
    const lastEnd = new Date(records[4].fin)
    lastEnd.setMinutes(lastEnd.getMinutes() + 1)
    records[4] = { ...records[4], fin:lastEnd.toISOString() }
    expect(monthlyExtras(records, 'e1', '2026-06', { now:historicalNow }).weeklyExtraMin).toBe(1)
  })

  it('no compensa una semana corta con otra semana larga', () => {
    const records = [
      ...week('2026-06-01', 9),
      ...week('2026-06-08', 7),
      ...week('2026-06-15', 8),
      ...week('2026-06-22', 8),
      ...week('2026-06-29', 8),
    ]
    const r = monthlyExtras(records, 'e1', '2026-06', { now:historicalNow })
    expect(r.workedMin).toBe(200 * 60)
    expect(r.weeklyExtraMin).toBe(5 * 60)
    expect(r.deficitMin).toBe(5 * 60)
    expect(r.balanceMin).toBe(0)
  })

  it('solo cuenta de lunes a viernes', () => {
    const records = [
      ...week('2026-06-01', 8),
      { empId:'e1', inicio:'2026-06-06T08:00:00', fin:'2026-06-06T18:00:00' },
    ]
    const r = monthlyExtras(records, 'e1', '2026-06', { now:historicalNow })
    expect(r.weekly[0].minutes).toBe(40 * 60)
    expect(r.weeklyExtraMin).toBe(0)
  })

  it('asigna una semana cruzada al periodo donde cae el lunes', () => {
    const records = week('2026-06-29', 8)
    const now = new Date('2026-08-01T12:00:00')
    expect(monthlyExtras(records, 'e1', '2026-06', { now }).workedMin).toBe(40 * 60)
    expect(monthlyExtras(records, 'e1', '2026-07', { now }).workedMin).toBe(0)
  })

  it('no descuenta la semana en curso antes de terminar el viernes', () => {
    const now = new Date('2026-07-30T12:00:00')
    const r = monthlyExtras([], 'e1', '2026-07', { now })
    expect(r.completedWeeks).toBe(3)
    expect(r.deficitMin).toBe(3 * 40 * 60)
    expect(r.weekly.at(-1).completed).toBe(false)
    expect(r.weekly.at(-1).deficitMin).toBe(0)
  })
})

describe('vacData', () => {
  it('devuelve ceros si el empleado no existe', () => {
    const db = { employees: [], vacaciones: [] }
    expect(vacData('nope', db)).toEqual({ months: 0, generated: 0, used: 0, pending: 0, available: 0, extra: 0 })
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

describe('regresión del conteo tras modificar fichajes', () => {
  it('prioriza inicio y fin frente a un workSecs obsoleto', () => {
    const record = {
      inicio: '2026-07-08T06:00:00',
      fin: '2026-07-08T15:00:00',
      workSecs: 12 * 3600,
    }
    expect(calcMin(record)).toBe(9 * 60)
    expect(recWorkSecs(record)).toBe(9 * 3600)
  })

  it('limita las pausas a la jornada y fusiona solapamientos', () => {
    const record = {
      inicio: '2026-06-01T08:00:00', fin: '2026-06-01T12:00:00',
      breaks: [
        { start: '2026-06-01T07:30:00', end: '2026-06-01T08:15:00' },
        { start: '2026-06-01T10:00:00', end: '2026-06-01T10:30:00' },
        { start: '2026-06-01T10:15:00', end: '2026-06-01T10:45:00' },
        { start: '2026-06-01T13:00:00', end: '2026-06-01T13:30:00' },
      ],
    }
    expect(calcSecs(record)).toEqual({ work: 3 * 3600, brk: 60 * 60 })
  })

  it('mantiene workSecs como respaldo para datos legacy sin fechas válidas', () => {
    expect(recWorkSecs({ inicio: 'fecha-invalida', fin: 'x', workSecs: 7200 })).toBe(7200)
  })

  it('respeta breakSecs en snapshots históricos que no guardaban breaks', () => {
    const snapshot = {
      inicio: '2026-07-08T06:00:00',
      fin: '2026-07-08T15:00:00',
      workSecs: 12 * 3600,
      breakSecs: 15 * 60,
    }
    expect(recWorkSecs(snapshot)).toBe(8 * 3600 + 45 * 60)
  })
})
