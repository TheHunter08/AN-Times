const LEGACY_DUPLICATE_WINDOW_MS = 5 * 60 * 1000

function notificationMs(item) {
  return Date.parse(item?._upd || item?.ts || item?.updatedAt || '') || 0
}

function legacyFingerprint(item) {
  return [item?.empId || '', item?.action || item?.title || '', item?.detail || item?.body || '']
    .map(value => String(value).trim().toLowerCase())
    .join('|')
}

export function stableNotificationId(key) {
  let hash = 2166136261
  const value = String(key || '')
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `noti_${(hash >>> 0).toString(36)}`
}

/**
 * @param {{ id?: string, empId: string, action: string, detail?: string, ts?: string, dedupeKey?: string }} input
 */
export function createNotification({ id, empId, action, detail = '', ts, dedupeKey }) {
  const nowIso = ts || new Date().toISOString()
  const semanticKey = dedupeKey || null
  return {
    id:id || stableNotificationId(semanticKey || `${empId}|${action}|${detail}|${nowIso}`),
    empId, action, detail, ts:nowIso, leido:false, _upd:nowIso,
    ...(semanticKey ? { dedupeKey:semanticKey } : {}),
  }
}

export function updateNotification(item, changes, nowIso = new Date().toISOString()) {
  return { ...item, ...changes, _upd:nowIso }
}

export function dedupeNotifications(items) {
  const ordered = [...(items || [])]
    .filter(item => item?.id)
    .sort((a, b) => notificationMs(a) - notificationMs(b))
  const byId = new Map()
  for (const item of ordered) {
    const current = byId.get(item.id)
    if (!current || notificationMs(item) >= notificationMs(current)) {
      byId.set(item.id, current ? { ...current, ...item, leido:!!(current.leido || item.leido) } : item)
    }
  }

  const result = []
  const semanticIndex = new Map()
  for (const item of byId.values()) {
    const explicit = item.dedupeKey ? `key:${item.dedupeKey}` : null
    const fingerprint = legacyFingerprint(item)
    const previousIndex = explicit ? semanticIndex.get(explicit) : semanticIndex.get(`legacy:${fingerprint}`)
    const previous = previousIndex == null ? null : result[previousIndex]
    const withinLegacyWindow = previous && Math.abs(notificationMs(item) - notificationMs(previous)) <= LEGACY_DUPLICATE_WINDOW_MS
    if (previous && (explicit || withinLegacyWindow)) {
      result[previousIndex] = {
        ...previous, ...item,
        leido:!!(previous.leido || item.leido),
        _upd:new Date(Math.max(notificationMs(previous), notificationMs(item))).toISOString(),
      }
      continue
    }
    const index = result.push(item) - 1
    if (explicit) semanticIndex.set(explicit, index)
    semanticIndex.set(`legacy:${fingerprint}`, index)
  }
  return result
}
