import { describe, expect, it } from 'vitest'
import { automationHealthList, createAutomationRun, evaluateAutomationRun, mergeAutomationHealth } from './automationHealth.js'

describe('automationHealth', () => {
  it('crea una traza estable y la mezcla sin perder configuración', () => {
    const run = createAutomationRun('autoclose', { startedAt:1000, finishedAt:2500, checked:3, processed:1 })
    const next = mergeAutomationHealth({ config:{ salidaTime:'21:00' } }, run)
    expect(run).toMatchObject({ status:'ok', durationMs:1500, checked:3, processed:1 })
    expect(next.config.salidaTime).toBe('21:00')
    expect(next.config.automationHealth.autoclose).toEqual(run)
  })

  it('distingue ejecución sana, fallida y atrasada', () => {
    const now = Date.parse('2026-08-06T12:00:00Z')
    expect(evaluateAutomationRun({ job:'reminders', status:'ok', finishedAt:'2026-08-06T11:30:00Z' }, { now }).state).toBe('healthy')
    expect(evaluateAutomationRun({ job:'reminders', status:'error', finishedAt:'2026-08-06T11:30:00Z' }, { now }).state).toBe('error')
    expect(evaluateAutomationRun({ job:'reminders', status:'ok', finishedAt:'2026-08-06T08:00:00Z' }, { now }).state).toBe('stale')
    expect(automationHealthList({})).toHaveLength(4)
  })
})
