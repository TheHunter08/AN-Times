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
    expect(completedWeeklySummary(db, employee, new Date('2026-07-10T18:00:00'))).toBeNull()
    const summary = completedWeeklySummary(db, employee, saturday)
    expect(summary).toMatchObject({ start:'2026-07-06', minutes:480, targetMin:2400, deficitMin:1920 })
    expect(completedWeeklySummary(db, employee, new Date('2026-07-12T10:00:00'))).toMatchObject({
      start:'2026-07-06',
      deficitMin:1920,
    })
    expect(employeeWeeklySummaryBody(employee, summary)).toContain('Déficit: -32h')
    expect(adminWeeklyDeficitBody(employee, summary)).toContain('Sin justificación')
  })

  it('descuenta vacaciones aprobadas', () => {
    const db = {
      records:[],
      vacaciones:[{ id:'v1', empId:'e1', fechaInicio:'2026-07-06', fechaFin:'2026-07-10', estado:'aprobada' }],
    }
    const summary = completedWeeklySummary(db, employee, saturday)
    expect(summary).toMatchObject({ targetMin:0, justified:2400, deficitMin:0 })
    expect(employeeWeeklySummaryBody(employee, summary)).toContain('Justificadas/no exigibles: 40h')
  })

  it('explica el tiempo no exigible fuera del contrato sin llamarlo ausencia injustificada', () => {
    const summary = completedWeeklySummary(
      { records:[] },
      { ...employee, fechaInicioContrato:'2026-07-08' },
      saturday,
    )
    const body = adminWeeklyDeficitBody(employee, summary)
    expect(summary).toMatchObject({ targetMin:1440, nonContractMin:960, deficitMin:1440 })
    expect(body).toContain('Tiempo no exigible fuera del contrato: 16h')
    expect(body).not.toContain('Sin justificación')
  })
})
