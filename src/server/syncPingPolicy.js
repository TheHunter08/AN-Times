export const PUSH_ACTIVE_WINDOW_MS = 24 * 60 * 60_000

export function isSyncCandidate(subscription, now = Date.now()) {
  const lastOnline = Date.parse(subscription?.last_online || '')
  if (!Number.isFinite(lastOnline) || lastOnline < now - PUSH_ACTIVE_WINDOW_MS) return false
  const lastSync = Date.parse(subscription?.last_sync || '')
  return !Number.isFinite(lastSync) || lastOnline > lastSync
}
