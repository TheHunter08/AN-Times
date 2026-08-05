import { describe, expect, it } from 'vitest'
import { adminWeeklyDeficitBody, completedWeeklySummary, employeeWeeklySummaryBody } from './weeklySummary.js'

const saturday = new Date('2026-07-11T10:00:00')
const employee = { id:'e1', name:'Ana Pérez' }

describe('resumen semanal definitivo', () => {
  it('solo se genera el sábado, con el déficit de la semana ya cerrada', () => {
    const db = { records:[{
      id:'r1', empId:'e1', inicio:'2026-07-06T08:00:00', fin:'2026-07-06T16:00:00',
      workSecs:8 * 3600,
    }] }
    // Semana del 6-10 jul: jornada intensiva completa (7h lun-mié, 6h jue-vie
    // por calendario) → objetivo real 33h (1980min), no 40h.
    expect(completedWeeklySummary(db, employee, new Date('2026-07-10T18:00:00'))).toBeNull()
    const summary = completedWeeklySummary(db, employee, saturday)
    expect(summary).toMatchObject({ start:'2026-07-06', minutes:480, targetMin:1980, deficitMin:1500 })
    expect(completedWeeklySummary(db, employee, new Date('2026-07-12T10:00:00'))).toMatchObject({
      start:'2026-07-06',
      deficitMin:1500,
    })
    expect(employeeWeeklySummaryBody(employee, summary)).toContain('Déficit: -25h')
    expect(adminWeeklyDeficitBody(employee, summary)).toContain('Sin justificación')
  })

  it('descuenta vacaciones aprobadas', () => {
    const db = {
      records:[],
      vacaciones:[{ id:'v1', empId:'e1', fechaInicio:'2026-07-06', fechaFin:'2026-07-10', estado:'aprobada' }],
    }
    const summary = completedWeeklySummary(db, employee, saturday)
    // Semana completa de vacaciones en jornada intensiva (33h reales, no 40h).
    expect(summary).toMatchObject({ targetMin:0, justified:1980, deficitMin:0 })
    expect(employeeWeeklySummaryBody(employee, summary)).toContain('Justificadas/no exigibles: 33h')
  })

  it('explica el tiempo no exigible fuera del contrato sin llamarlo ausencia injustificada', () => {
    const summary = completedWeeklySummary(
      { records:[] },
      { ...employee, fechaInicioContrato:'2026-07-08' },
      saturday,
    )
    const body = adminWeeklyDeficitBody(employee, summary)
    // Contrato empieza el miércoles 8: lunes y martes (7h/día por jornada
    // intensiva) quedan fuera de contrato → 14h, no 16h. Objetivo real de la
    // semana (33h) menos esas 14h no exigibles = 19h (1140min).
    expect(summary).toMatchObject({ targetMin:1140, nonContractMin:840, deficitMin:1140 })
    expect(body).toContain('Tiempo no exigible fuera del contrato: 14h')
    expect(body).not.toContain('Sin justificación')
  })
})
