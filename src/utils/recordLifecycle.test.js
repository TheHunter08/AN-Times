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
})
