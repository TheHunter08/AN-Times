import { summarizeAutomationHealth } from './automationHealth.js'

export function buildProductionHealth(blob, { now = Date.now() } = {}) {
  const automations = summarizeAutomationHealth(blob?.config?.automationHealth, { now })
  const collections = {
    records:Array.isArray(blob?.records),
    employees:Array.isArray(blob?.employees),
  }
  const dataHealthy = Object.values(collections).every(Boolean)
  const healthy = dataHealthy && automations.unhealthy === 0
  return {
    status:healthy ? 'healthy' : 'degraded',
    healthy,
    checkedAt:new Date(now).toISOString(),
    data:{ healthy:dataHealthy, collections },
    automations,
  }
}
