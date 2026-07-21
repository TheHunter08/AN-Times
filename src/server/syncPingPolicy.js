// Un cambio creado totalmente sin cobertura no puede avisar al servidor de que
// existe. Por eso cada dispositivo usado recientemente recibe una comprobación
// periódica aunque last_online no haya podido actualizarse.
export const PUSH_ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60_000
export const PUSH_RECHECK_INTERVAL_MS = 4 * 60_000

export function isSyncCandidate(subscription, now = Date.now()) {
  const timestamps = [subscription?.last_online, subscription?.updated_at]
    .map(value => Date.parse(value || ''))
    .filter(Number.isFinite)
  const lastSeen = timestamps.length ? Math.max(...timestamps) : NaN
  if (!Number.isFinite(lastSeen) || lastSeen < now - PUSH_ACTIVE_WINDOW_MS) return false
  const lastSync = Date.parse(subscription?.last_sync || '')
  if (!Number.isFinite(lastSync)) return true
  return lastSync <= now - PUSH_RECHECK_INTERVAL_MS
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

export function getLaunchCoverage(employees = [], subscriptions = [], signatures = {}) {
  const deviceCoverage = getDeviceCoverage(employees, subscriptions)
  const workers = employees.filter(employee => employee?.id && !employee.baja && employee.role !== 'admin')
  const registeredIds = new Set(subscriptions.map(subscription => String(subscription?.user_id || '')))
  const signedWorkerIds = workers
    .filter(employee => Boolean(signatures?.[employee.id]?.main?.data))
    .map(employee => String(employee.id))
  const fullyReadyIds = signedWorkerIds.filter(id => registeredIds.has(id))

  return {
    ...deviceCoverage,
    signatureReadyWorkers: signedWorkerIds.length,
    fullyReadyWorkers: fullyReadyIds.length,
    missingSignatureIds: workers.map(employee => String(employee.id)).filter(id => !signedWorkerIds.includes(id)),
  }
}
