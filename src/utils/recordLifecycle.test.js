import { describe, expect, it } from 'vitest'
import { finalizeRecord } from './recordLifecycle.js'

describe('finalizeRecord', () => {
  it('cierra una jornada abierta por QR y conserva la trazabilidad del encargado', () => {
    const closed = finalizeRecord({
      id: 'r1', empId: 'e1', inicio: '2026-07-21T08:00:00.000Z',
      breaks: [], enDescanso: false, _rev: 2,
    }, {
      now: '2026-07-21T16:00:00.000Z',
      actor: { id: 'manager-1', name: 'María' },
    })

    expect(closed).toMatchObject({
      fin: '2026-07-21T16:00:00.000Z', closed: true, _rev: 3,
      _upd: '2026-07-21T16:00:00.000Z', workSecs: 28800,
      cerradoPor: 'María', cerradoPorId: 'manager-1', cierreManual: true,
      motivoCierre: 'Cierre mediante QR de empleado',
    })
  })

  it('termina también el descanso que estaba abierto al cerrar', () => {
    const closed = finalizeRecord({
      id: 'r1', empId: 'e1', inicio: '2026-07-21T08:00:00.000Z',
      breaks: [], enDescanso: true, bStartTs: '2026-07-21T15:30:00.000Z',
    }, { now: '2026-07-21T16:00:00.000Z' })

    expect(closed.enDescanso).toBe(false)
    expect(closed.breaks).toEqual([{ start: '2026-07-21T15:30:00.000Z', end: '2026-07-21T16:00:00.000Z' }])
    expect(closed.workSecs).toBe(27000)
    expect(closed.breakSecs).toBe(1800)
  })

  // Sin maxOpenBreakMin, un descanso que nunca se cerró (se le olvidó al
  // empleado, perdió cobertura) se extiende hasta la hora del autocierre —
  // hasta 10h — y calcSecs (Math.max(0, elapsed - brk)) puede dejar la
  // jornada entera en (casi) 0h trabajadas aunque el empleado sí trabajara.
  it('sin tope, un descanso nunca cerrado se come casi toda la jornada al autocerrar a las 10h', () => {
    const inicio = '2026-09-16T06:00:00.000Z'
    const closeTime = new Date(new Date(inicio).getTime() + 10 * 60 * 60 * 1000).toISOString()
    const closed = finalizeRecord({
      id: 'r1', empId: 'e1', inicio,
      breaks: [], enDescanso: true, bStartTs: '2026-09-16T06:30:00.000Z', // 30 min tras fichar
    }, { now: closeTime })

    expect(closed.workSecs / 3600).toBeCloseTo(0.5, 5)
    expect(closed.breakSecs / 3600).toBeCloseTo(9.5, 5)
  })

  it('con maxOpenBreakMin, ese mismo descanso solo descuenta el tope y el resto se cuenta como trabajado', () => {
    const inicio = '2026-09-16T06:00:00.000Z'
    const closeTime = new Date(new Date(inicio).getTime() + 10 * 60 * 60 * 1000).toISOString()
    const closed = finalizeRecord({
      id: 'r1', empId: 'e1', inicio,
      breaks: [], enDescanso: true, bStartTs: '2026-09-16T06:30:00.000Z',
    }, { now: closeTime, maxOpenBreakMin: 60 })

    expect(closed.breaks).toEqual([{ start: '2026-09-16T06:30:00.000Z', end: '2026-09-16T07:30:00.000Z' }])
    expect(closed.breakSecs / 3600).toBeCloseTo(1, 5)
    expect(closed.workSecs / 3600).toBeCloseTo(9, 5)
  })

  it('con maxOpenBreakMin, un descanso corto (menor que el tope) no se alarga', () => {
    const closed = finalizeRecord({
      id: 'r1', empId: 'e1', inicio: '2026-07-21T08:00:00.000Z',
      breaks: [], enDescanso: true, bStartTs: '2026-07-21T15:30:00.000Z',
    }, { now: '2026-07-21T16:00:00.000Z', maxOpenBreakMin: 60 })

    // El descanso real duró 30 min, muy por debajo del tope de 60 — se
    // conserva tal cual, sin recortar ni alargar.
    expect(closed.breaks).toEqual([{ start: '2026-07-21T15:30:00.000Z', end: '2026-07-21T16:00:00.000Z' }])
    expect(closed.workSecs).toBe(27000)
    expect(closed.breakSecs).toBe(1800)
  })
})
