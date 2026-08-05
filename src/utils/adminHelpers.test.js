import { describe, expect, it } from 'vitest'
import { buildRecordSnapshot, canCloseMonth, isRecordMonthLocked, recordTimesFromClock, refreshUnsignedClosures } from './adminHelpers.js'

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

describe('canCloseMonth', () => {
  it('bloquea mientras no haya terminado el viernes de la última semana asignada', () => {
    expect(canCloseMonth('2026-07', new Date(2026, 6, 30))).toBe(false)
    expect(canCloseMonth('2026-07', new Date(2026, 6, 1))).toBe(false)
  })

  it('permite firmar desde el sábado posterior al último viernes', () => {
    expect(canCloseMonth('2026-07', new Date(2026, 6, 31, 23, 59, 59))).toBe(false)
    expect(canCloseMonth('2026-07', new Date(2026, 7, 1))).toBe(true)
    expect(canCloseMonth('2026-07', new Date(2026, 7, 5))).toBe(true)
  })

  it('respeta semanas que cruzan el límite entre meses', () => {
    expect(canCloseMonth('2026-04', new Date(2026, 3, 29))).toBe(false)
    expect(canCloseMonth('2026-04', new Date(2026, 3, 30))).toBe(false)
    expect(canCloseMonth('2026-04', new Date(2026, 4, 1))).toBe(false)
    expect(canCloseMonth('2026-04', new Date(2026, 4, 2))).toBe(true)
    expect(canCloseMonth('2026-02', new Date(2026, 1, 27))).toBe(false)
    expect(canCloseMonth('2026-02', new Date(2026, 1, 28))).toBe(true)
    expect(canCloseMonth('2026-02', new Date(2026, 2, 1))).toBe(true)
    // La última semana de febrero de 2024 termina el viernes 1 de marzo.
    expect(canCloseMonth('2024-02', new Date(2024, 1, 28))).toBe(false)
    expect(canCloseMonth('2024-02', new Date(2024, 1, 29))).toBe(false)
    expect(canCloseMonth('2024-02', new Date(2024, 2, 1))).toBe(false)
    expect(canCloseMonth('2024-02', new Date(2024, 2, 2))).toBe(true)
  })

  it('resuelve el cambio de año en diciembre', () => {
    expect(canCloseMonth('2026-12', new Date(2026, 11, 30))).toBe(false)
    expect(canCloseMonth('2026-12', new Date(2026, 11, 31))).toBe(false)
    expect(canCloseMonth('2026-12', new Date(2027, 0, 1))).toBe(false)
    expect(canCloseMonth('2026-12', new Date(2027, 0, 2))).toBe(true)
    expect(canCloseMonth('2026-12', new Date(2027, 0, 3))).toBe(true)
  })

  it('devuelve false para mes vacío o malformado', () => {
    expect(canCloseMonth('')).toBe(false)
    expect(canCloseMonth(null)).toBe(false)
    expect(canCloseMonth('2026-13')).toBe(false)
  })
})

describe('isRecordMonthLocked', () => {
  const inicio = '2026-07-13T08:00:00.000Z'

  it('bloquea el mes cuando existe una firma del empleado o administrador', () => {
    const inicioFinalizado = '2026-06-13T08:00:00.000Z'
    expect(isRecordMonthLocked([{ empId:'e1', mes:'2026-06', firmaEmp:true }], 'e1', inicioFinalizado)).toBe(true)
    expect(isRecordMonthLocked([{ empId:'e1', mes:'2026-06', firmaAdmin:true }], 'e1', inicioFinalizado)).toBe(true)
  })

  it('no bloquea otro empleado, otro mes ni un cierre pendiente', () => {
    expect(isRecordMonthLocked([{ empId:'e2', mes:'2026-07', firmaEmp:true }], 'e1', inicio)).toBe(false)
    expect(isRecordMonthLocked([{ empId:'e1', mes:'2026-06', firmaEmp:true }], 'e1', inicio)).toBe(false)
    expect(isRecordMonthLocked([{ empId:'e1', mes:'2026-07', estado:'pendiente' }], 'e1', inicio)).toBe(false)
  })

  it('un cierre prematuro heredado nunca bloquea el mes en curso', () => {
    expect(isRecordMonthLocked([{ empId:'e1', mes:'2999-07', firmaEmp:true, estado:'firmado' }], 'e1', '2999-07-13T08:00:00.000Z')).toBe(false)
  })
})

describe('refreshUnsignedClosures', () => {
  it('propaga una modificación al cierre pendiente y elimina su PDF antiguo', () => {
    const cierres = [{ id:'c1', empId:'e1', mes:'2026-07', estado:'pendiente', totalMin:720, pdfData:'data:old' }]
    const records = [{ id:'r1', empId:'e1', inicio:'2026-07-08T06:00:00', fin:'2026-07-08T15:00:00', breaks:[] }]
    const [updated] = refreshUnsignedClosures(cierres, records, 'e1', [records[0].inicio], '2026-07-15T12:00:00.000Z')
    expect(updated.totalMin).toBe(540)
    expect(updated.extraMin).toBe(0)
    // Semana del 6-10 jul: jornada intensiva (33h reales por calendario), no 40h.
    expect(updated.deficitMin).toBe(24 * 60)
    expect(updated.balanceMin).toBe(-24 * 60)
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

  it('recalcula el periodo anterior cuando una semana cruza de mes', () => {
    const cierres = [
      { id:'apr', empId:'e1', mes:'2026-04', estado:'pendiente' },
      { id:'may', empId:'e1', mes:'2026-05', estado:'pendiente' },
    ]
    const records = [
      { id:'r1', empId:'e1', inicio:'2026-05-01T08:00:00', fin:'2026-05-01T17:00:00', breaks:[] },
    ]
    const updated = refreshUnsignedClosures(cierres, records, 'e1', [records[0].inicio], '2026-05-04T12:00:00.000Z')
    expect(updated[0]).not.toBe(cierres[0])
    expect(updated[1]).not.toBe(cierres[1])
  })

  it('incorpora vacaciones aprobadas al recalcular un cierre pendiente', () => {
    const cierres = [{ id:'jun', empId:'e1', mes:'2026-06', estado:'pendiente' }]
    const records = Array.from({ length:4 }, (_, index) => ({
      id:`r${index}`,
      empId:'e1',
      inicio:`2026-06-0${index + 1}T08:00:00`,
      fin:`2026-06-0${index + 1}T16:00:00`,
      breaks:[],
    }))
    const db = {
      employees:[{ id:'e1' }],
      vacaciones:[{ empId:'e1', estado:'aprobada', fechaInicio:'2026-06-05', fechaFin:'2026-06-05' }],
    }
    const [updated] = refreshUnsignedClosures(cierres, records, 'e1', [records[0].inicio], '2026-07-15T12:00:00.000Z', db)
    expect(updated.justifiedMin).toBe(8 * 60)
    // Semana 1 jun (con vacaciones) queda a 0 déficit; semanas 8, 15 y 22 jun
    // son normales (40h cada una); la semana del 29 jun-3 jul ya cruza a
    // jornada intensiva (37h reales, no 40h) — 3*40h + 37h = 157h.
    expect(updated.deficitMin).toBe(3 * 40 * 60 + 37 * 60)
  })
})
