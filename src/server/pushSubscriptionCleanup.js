// Huérfanas (sin empleado) y duplicadas (mismo endpoint en más de un
// usuario — ya no debería poder ocurrir con push_subs_endpoint_uidx, pero
// quedan filas de antes de ese índice) se acumulan sin que nada las borre:
// claim_push_subscription() limpia al suscribirse, no al darse de baja o
// borrarse un empleado. Puro y sin IO para poder testear sin red real —
// scripts/repair-push-subscriptions.mjs y api/cron-cleanup-push-subs.js
// comparten esta misma lógica.
export function findPushSubscriptionCleanup({ employees = [], subscriptions = [] }) {
  const employeeIds = new Set(employees.map(e => e.id))
  const activeIds = new Set(employees.filter(e => !e.baja).map(e => e.id))

  const orphaned = subscriptions.filter(sub => !employeeIds.has(sub.user_id))

  const byEndpoint = new Map()
  for (const sub of subscriptions) {
    if (!employeeIds.has(sub.user_id)) continue // ya está en `orphaned`
    if (!byEndpoint.has(sub.endpoint)) byEndpoint.set(sub.endpoint, [])
    byEndpoint.get(sub.endpoint).push(sub)
  }
  const duplicated = []
  for (const group of byEndpoint.values()) {
    if (group.length < 2) continue
    const ordered = [...group].sort((a, b) => {
      const activeDelta = Number(activeIds.has(b.user_id)) - Number(activeIds.has(a.user_id))
      return activeDelta || String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
    })
    duplicated.push(...ordered.slice(1))
  }

  return { orphaned, duplicated, removals: [...orphaned, ...duplicated] }
}
