import { describe, expect, it } from 'vitest'
import { buildScheduledReportRows, isScheduleDue, parseReportRecipients, reportPeriod } from './scheduledReports.js'

describe('scheduledReports', () => {
  const now = new Date('2026-08-06T10:00:00Z')
  it('calcula periodos completos e idempotencia', () => {
    expect(reportPeriod('monthly', now)).toMatchObject({ key:'month_2026-07', start:'2026-07-01', end:'2026-07-31' })
    expect(reportPeriod('weekly', now)).toMatchObject({ key:'week_2026-07-27', start:'2026-07-27', end:'2026-08-02' })
    expect(isScheduleDue({ enabled:true, frequency:'monthly', lastRunKey:'month_2026-07' }, now)).toBe(false)
  })

  it('normaliza destinatarios y filas cerradas del periodo', () => {
    expect(parseReportRecipients('ADMIN@EXAMPLE.COM; admin@example.com, rrhh@example.com')).toEqual(['admin@example.com', 'rrhh@example.com'])
    const rows = buildScheduledReportRows({
      employees:[{ id:'e1', name:'Ana' }],
      records:[{ id:'r1', empId:'e1', inicio:'2026-07-02T06:00:00Z', fin:'2026-07-02T14:00:00Z', breakSecs:1800 }],
    }, reportPeriod('monthly', now))
    expect(rows).toEqual([expect.objectContaining({ employee:'Ana', hours:7.5 })])
  })
})
