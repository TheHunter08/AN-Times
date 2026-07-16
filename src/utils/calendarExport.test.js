import { describe, expect, it } from 'vitest'
import { buildEmployeeCalendarICS, buildReportScheduleICS } from './calendarExport.js'

describe('integración de calendario ICS', () => {
  it('exporta jornadas y ausencias del empleado sin mezclar otros usuarios', () => {
    const ics = buildEmployeeCalendarICS({
      records:[
        { id:'r1', empId:'e1', inicio:'2026-07-15T06:00:00Z', fin:'2026-07-15T14:00:00Z', centro:'Obra Centro' },
        { id:'r2', empId:'e2', inicio:'2026-07-15T06:00:00Z', fin:'2026-07-15T14:00:00Z' },
      ],
      vacaciones:[{ id:'v1', empId:'e1', fechaInicio:'2026-07-20', fechaFin:'2026-07-22', estado:'aprobada' }],
    }, { id:'e1', name:'Ana' })

    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:Jornada · Obra Centro')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260720')
    expect(ics).toContain('DTEND;VALUE=DATE:20260723')
    expect(ics).not.toContain('record-r2')
  })

  it('crea recordatorios recurrentes semanales y mensuales', () => {
    const now = new Date('2026-07-16T12:00:00Z')
    const weekly = buildReportScheduleICS({ id:'weekly', name:'Nóminas', frequency:'weekly', format:'excel', recipients:'rrhh@example.com' }, now)
    const monthly = buildReportScheduleICS({ id:'monthly', name:'Inspección', frequency:'monthly', format:'pdf', recipients:'admin@example.com' }, now)
    const unfoldedMonthly = monthly.replace(/\r\n /g, '')

    expect(weekly).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO')
    expect(weekly).toContain('TRIGGER:-PT15M')
    expect(monthly).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=1')
    expect(unfoldedMonthly).toContain('Destinatarios: admin@example.com')
  })
})
