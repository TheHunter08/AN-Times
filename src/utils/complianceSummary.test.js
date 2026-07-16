import { describe, expect, it } from 'vitest'
import { buildComplianceSummary } from './complianceSummary.js'

const NOW = new Date('2026-07-16T12:00:00Z').getTime()

describe('buildComplianceSummary', () => {
  it('resume registros, correcciones y cierres dentro de los cuatro años', () => {
    const summary = buildComplianceSummary({
      records: [
        { id:'ok', inicio:'2026-07-15T08:00:00Z', fin:'2026-07-15T16:00:00Z', validado:true },
        { id:'open', inicio:'2026-07-14T08:00:00Z', fin:null },
        { id:'edited', inicio:'2025-02-01T08:00:00Z', fin:'2025-02-01T16:00:00Z', correcciones:[{ ts:'2025-02-02', by:'Admin', motivo:'Olvido' }] },
        { id:'old', inicio:'2020-01-01T08:00:00Z', fin:'2020-01-01T16:00:00Z' },
      ],
      cierres: [{ id:'c1', firmaAdmin:true, firmaEmp:true }, { id:'c2', firmaAdmin:false }],
    }, NOW)

    expect(summary.retainedRecords).toBe(3)
    expect(summary.incompleteRecords).toBe(1)
    expect(summary.modifiedRecords).toBe(1)
    expect(summary.traceabilityPct).toBe(100)
    expect(summary.signedClosures).toBe(1)
    expect(summary.risks.map(risk => risk.id)).toEqual(['incomplete', 'closures'])
  })

  it('detecta correcciones sin autor, fecha o motivo', () => {
    const summary = buildComplianceSummary({
      records: [{
        id:'edited', inicio:'2026-01-01T08:00:00Z', fin:'2026-01-01T16:00:00Z',
        correcciones:[{ ts:'2026-01-02', by:'', motivo:'' }],
      }],
    }, NOW)

    expect(summary.untraceableCorrections).toBe(1)
    expect(summary.traceabilityPct).toBe(0)
    expect(summary.risks[0].destination).toBe('auditoria')
  })

  it('no confunde una jornada activa normal con una incidencia', () => {
    const summary = buildComplianceSummary({
      records: [{ id:'active', inicio:'2026-07-16T08:00:00Z', fin:null }],
    }, NOW)

    expect(summary.incompleteRecords).toBe(0)
    expect(summary.completionPct).toBe(100)
    expect(summary.risks.some(risk => risk.id === 'incomplete')).toBe(false)
  })

  it('considera saludable una base todavía vacía', () => {
    const summary = buildComplianceSummary({}, NOW)
    expect(summary.score).toBe(100)
    expect(summary.risks[0].id).toBe('empty')
  })
})
