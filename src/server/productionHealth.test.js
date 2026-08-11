import { describe, expect, it } from 'vitest'
import { createAutomationRun } from './automationHealth.js'
import { buildProductionHealth } from './productionHealth.js'

const jobs = ['reminders', 'autoclose', 'sync', 'reports', 'monthlyClose', 'backup', 'migration']

describe('productionHealth', () => {
  it('solo declara saludable una fuente válida con todas las automatizaciones al día', () => {
    const now = Date.parse('2026-08-09T12:00:00.000Z')
    const automationHealth = Object.fromEntries(jobs.map(job => [job, createAutomationRun(job, { startedAt:now - 1000, finishedAt:now })]))
    expect(buildProductionHealth({ records:[], employees:[], config:{ automationHealth } }, { now }).status).toBe('healthy')
  })

  it('se degrada si los datos son inválidos, aunque las automatizaciones estén al día', () => {
    const now = Date.parse('2026-08-09T12:00:00.000Z')
    const automationHealth = { backup:createAutomationRun('backup', { finishedAt:now - 30 * 3600000 }) }
    const result = buildProductionHealth({ records:[], config:{ automationHealth } }, { now })
    expect(result.status).toBe('degraded')
    expect(result.data.healthy).toBe(false)
    expect(result.automations.jobs.find(job => job.job === 'backup')?.state).toBe('stale')
  })

  it('una tarea atrasada no tumba el estado global si los datos son válidos', () => {
    const now = Date.parse('2026-08-09T12:00:00.000Z')
    const automationHealth = { backup:createAutomationRun('backup', { finishedAt:now - 30 * 3600000 }) }
    const result = buildProductionHealth({ records:[], employees:[], config:{ automationHealth } }, { now })
    expect(result.status).toBe('healthy')
    expect(result.healthy).toBe(true)
    expect(result.automations.unhealthy).toBe(7)
    expect(result.automations.jobs.find(job => job.job === 'backup')?.state).toBe('stale')
  })
})
