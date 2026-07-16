import { describe, expect, it } from 'vitest'
import { buildRecordSnapshot, isRecordMonthLocked, recordTimesFromClock, refreshUnsignedClosures } from './adminHelpers.js'

describe('buildRecordSnapshot', () => {
  it('conserva una copia independiente del historial de modificaciones', () => {
    const record = {
      id:'r1', empId:'e1', inicio:'2026-07-08T06:00:00.000Z', fin:'2026-07-08T15:00:00.000Z', breaks:[], modificado:true,
      correcciones:[{ id:'x1', motivo:'Ajuste autorizado', by:'Admin', device:'Windows · Chrome' }],
    }
    const snapshot = buildRecordSnapshot(record)
    expect(snapshot.modificado).toBe(true)
    expect(snapshot.correcciones).toEqual(record.correcciones)
    expect(snapshot.correcciones).not.toBe(record.correcciones)
    expect(snapshot.correcciones[0]).not.toBe(record.correcciones[0])
  })
})

describe('recordTimesFromClock', () => {
  it('conserva la fecha local original al cambiar solo la hora', () => {
    const result = recordTimesFromClock({ inicio: '2026-07-13T06:00:00.000Z' }, '09:15', '17:45')
    expect(result.inicio.getFullYear()).toBe(2026)
    expect(result.inicio.getMonth()).toBe(6)
    expect(result.inicio.getDate()).toBe(13)
    expect(result.inicio.getHours()).toBe(9)
    expect(result.fin.getHours()).toBe(17)
  })

  it('sitúa la salida al día siguiente en jornadas nocturnas', () => {
    const result = recordTimesFromClock({ inicio: '2026-07-13T20:00:00.000Z' }, '22:00', '06:00')
    expect(result.fin.getTime() - result.inicio.getTime()).toBe(8 * 60 * 60 * 1000)
  })

  it('rechaza horas o fechas inválidas', () => {
    expect(recordTimesFromClock({ inicio: '2026-07-13T06:00:00.000Z' }, '25:00', '17:00')).toBeNull()
    expect(recordTimesFromClock({ inicio: 'fecha-invalida' }, '09:00', '17:00')).toBeNull()
  })
})

describe('isRecordMonthLocked', () => {
  const inicio = '2026-07-13T08:00:00.000Z'

  it('bloquea el mes cuando existe una firma del empleado o administrador', () => {
    expect(isRecordMonthLocked([{ empId:'e1', mes:'2026-07', firmaEmp:true }], 'e1', inicio)).toBe(true)
    expect(isRecordMonthLocked([{ empId:'e1', mes:'2026-07', firmaAdmin:true }], 'e1', inicio)).toBe(true)
  })

  it('no bloquea otro empleado, otro mes ni un cierre pendiente', () => {
    expect(isRecordMonthLocked([{ empId:'e2', mes:'2026-07', firmaEmp:true }], 'e1', inicio)).toBe(false)
    expect(isRecordMonthLocked([{ empId:'e1', mes:'2026-06', firmaEmp:true }], 'e1', inicio)).toBe(false)
    expect(isRecordMonthLocked([{ empId:'e1', mes:'2026-07', estado:'pendiente' }], 'e1', inicio)).toBe(false)
  })
})

describe('refreshUnsignedClosures', () => {
  it('propaga una modificación al cierre pendiente y elimina su PDF antiguo', () => {
    const cierres = [{ id:'c1', empId:'e1', mes:'2026-07', estado:'pendiente', totalMin:720, pdfData:'data:old' }]
    const records = [{ id:'r1', empId:'e1', inicio:'2026-07-08T06:00:00', fin:'2026-07-08T15:00:00', breaks:[] }]
    const [updated] = refreshUnsignedClosures(cierres, records, 'e1', [records[0].inicio], '2026-07-15T12:00:00.000Z')
    expect(updated.totalMin).toBe(540)
    expect(updated.extraMin).toBe(0)
    expect(updated.records_snapshot[0].workSecs).toBe(9 * 3600)
    expect(updated.pdfData).toBeNull()
    expect(updated.desactualizado).toBe(false)
  })

  it('no altera un cierre ya firmado', () => {
    const signed = { id:'c1', empId:'e1', mes:'2026-07', estado:'firmado', firmaEmp:true, totalMin:720, pdfData:'data:signed' }
    const records = [{ id:'r1', empId:'e1', inicio:'2026-07-08T06:00:00', fin:'2026-07-08T15:00:00', breaks:[] }]
    expect(refreshUnsignedClosures([signed], records, 'e1', [records[0].inicio], '2026-07-15T12:00:00.000Z')[0]).toBe(signed)
  })

  it('actualiza el mes de origen y el de destino al mover un fichaje', () => {
    const cierres = [
      { id:'jun', empId:'e1', mes:'2026-06', estado:'pendiente' },
      { id:'jul', empId:'e1', mes:'2026-07', estado:'pendiente' },
    ]
    const records = [{ id:'r1', empId:'e1', inicio:'2026-07-01T06:00:00', fin:'2026-07-01T14:00:00', breaks:[] }]
    const updated = refreshUnsignedClosures(cierres, records, 'e1', ['2026-06-30T06:00:00', records[0].inicio], '2026-07-15T12:00:00.000Z')
    expect(updated[0].totalMin).toBe(0)
    expect(updated[1].totalMin).toBe(480)
  })
})
