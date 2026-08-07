import { describe, expect, it } from 'vitest'
import { automationHealthList, createAutomationRun, evaluateAutomationRun, mergeAutomationHealth, summarizeAutomationHealth } from './automationHealth.js'

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
    expect(evaluateAutomationRun({ job:'reminders', status:'ok', finishedAt:'2026-08-05T20:00:00Z' }, { now }).state).toBe('stale')
    expect(automationHealthList({})).toHaveLength(7)
  })

  it('respeta la ventana nocturna y la frecuencia diaria de los cron reales', () => {
    const now = Date.parse('2026-08-07T07:55:00Z')
    expect(evaluateAutomationRun({ job:'reminders', status:'ok', finishedAt:'2026-08-06T20:05:00Z' }, { now }).state).toBe('healthy')
    expect(evaluateAutomationRun({ job:'autoclose', status:'ok', finishedAt:'2026-08-06T22:10:00Z' }, { now }).state).toBe('healthy')
    expect(evaluateAutomationRun({ job:'autoclose', status:'ok', finishedAt:'2026-08-05T22:10:00Z' }, { now }).state).toBe('stale')
  })

  it('resume procesos sanos, fallidos y pendientes para la auditorÃ­a operativa', () => {
    const now = Date.parse('2026-08-07T01:30:00Z')
    const summary = summarizeAutomationHealth({
      reminders:createAutomationRun('reminders', { startedAt:now - 1000, finishedAt:now }),
      autoclose:createAutomationRun('autoclose', { status:'error', startedAt:now - 1000, finishedAt:now, error:'write failed' }),
    }, { now })

    expect(summary.healthy).toBe(1)
    expect(summary.unhealthy).toBe(6)
    expect(summary.jobs.find(job => job.job === 'reminders')).toMatchObject({ state:'healthy', status:'ok' })
    expect(summary.jobs.find(job => job.job === 'autoclose')).toMatchObject({ state:'error', error:'write failed' })
    expect(summary.jobs.find(job => job.job === 'backup')).toMatchObject({ state:'unknown', finishedAt:null })
  })
})
