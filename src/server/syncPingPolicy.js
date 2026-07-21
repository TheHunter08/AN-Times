export const PUSH_ACTIVE_WINDOW_MS = 24 * 60 * 60_000

export function isSyncCandidate(subscription, now = Date.now()) {
  const lastOnline = Date.parse(subscription?.last_online || '')
  if (!Number.isFinite(lastOnline) || lastOnline < now - PUSH_ACTIVE_WINDOW_MS) return false
  const lastSync = Date.parse(subscription?.last_sync || '')
  return !Number.isFinite(lastSync) || lastOnline > lastSync
}

export function getDeviceCoverage(employees = [], subscriptions = []) {
  const activeEmployees = employees.filter(employee => employee?.id && !employee.baja)
  const workerIds = new Set(
    activeEmployees
      .filter(employee => employee.role !== 'admin')
      .map(employee => String(employee.id))
  )
  const activeIds = new Set(activeEmployees.map(employee => String(employee.id)))
  const isSystemSubscription = subscription => String(subscription?.user_id || '') === '__admin__'
  const subscriptionsByUser = new Map(
    subscriptions
      .filter(subscription => subscription?.user_id)
      .map(subscription => [String(subscription.user_id), subscription])
  )
  const registeredWorkerIds = [...workerIds].filter(id => subscriptionsByUser.has(id))
  const missingWorkerIds = [...workerIds].filter(id => !subscriptionsByUser.has(id))
  const orphanSubscriptions = subscriptions.filter(
    subscription => subscription?.user_id &&
      !isSystemSubscription(subscription) &&
      !activeIds.has(String(subscription.user_id))
  )

  return {
    expectedWorkers: workerIds.size,
    registeredWorkers: registeredWorkerIds.length,
    missingWorkerIds,
    orphanSubscriptions,
    activeSubscriptions: subscriptions.filter(
      subscription => subscription?.user_id &&
        (isSystemSubscription(subscription) || activeIds.has(String(subscription.user_id)))
    ),
  }
}
