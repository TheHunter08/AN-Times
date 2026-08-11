import { summarizeAutomationHealth } from './automationHealth.js'

export function buildProductionHealth(blob, { now = Date.now() } = {}) {
  const automations = summarizeAutomationHealth(blob?.config?.automationHealth, { now })
  const collections = {
    records:Array.isArray(blob?.records),
    employees:Array.isArray(blob?.employees),
  }
  const dataHealthy = Object.values(collections).every(Boolean)
  // El estado global (y el código HTTP) refleja si el servicio en sí
  // responde con datos válidos. Una automatización atrasada es una señal
  // operativa (visible en `automations`), no una caída del servicio, así
  // que no debe tumbar los healthchecks que dependen del código HTTP.
  const healthy = dataHealthy
  return {
    status:healthy ? 'healthy' : 'degraded',
    healthy,
    checkedAt:new Date(now).toISOString(),
    data:{ healthy:dataHealthy, collections },
    automations,
  }
}
