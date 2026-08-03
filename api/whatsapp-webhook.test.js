import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleMessage } from './whatsapp-webhook.js'

const employee = { id: 'emp-1', name: 'Empleado', centroTrabajo: 'Centro' }

afterEach(() => vi.useRealTimers())

describe('fichaje por WhatsApp', () => {
  it('marca cada mutación con _upd y devuelve el registro persistible', async () => {
    vi.useFakeTimers()
    const db = { records: [] }

    vi.setSystemTime(new Date('2026-08-03T06:00:00.000Z'))
    const entry = await handleMessage(db, employee, 'entrada')
    expect(entry.record).toMatchObject({ empId: employee.id, _upd: '2026-08-03T06:00:00.000Z' })
    expect(db.records).toEqual([entry.record])

    vi.setSystemTime(new Date('2026-08-03T08:00:00.000Z'))
    const pause = await handleMessage(db, employee, 'pausa')
    expect(pause.record).toMatchObject({ enDescanso: true, _upd: '2026-08-03T08:00:00.000Z' })

    vi.setSystemTime(new Date('2026-08-03T08:15:00.000Z'))
    const resume = await handleMessage(db, employee, 'reanudar')
    expect(resume.record).toMatchObject({ enDescanso: false, breakSecs: 900, _upd: '2026-08-03T08:15:00.000Z' })

    vi.setSystemTime(new Date('2026-08-03T14:00:00.000Z'))
    const exit = await handleMessage(db, employee, 'salida')
    expect(exit.record).toMatchObject({ closed: true, fin: '2026-08-03T14:00:00.000Z', _upd: '2026-08-03T14:00:00.000Z' })
    expect(exit.record.workSecs).toBe(27_900)
    expect(db.records).toEqual([exit.record])
  })

  it('no altera _upd cuando solo consulta el estado', async () => {
    const db = { records: [{ id: 'r1', empId: employee.id, inicio: '2026-08-03T06:00:00.000Z', fin: null, _upd: 'original' }] }
    const result = await handleMessage(db, employee, 'estado')
    expect(result.changed).toBe(false)
    expect(db.records[0]._upd).toBe('original')
  })
})
