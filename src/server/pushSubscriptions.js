export function groupPushSubscriptions(subscriptions = []) {
  const grouped = new Map()
  for (const sub of subscriptions) {
    if (!sub?.user_id || !sub?.endpoint) continue
    if (!grouped.has(sub.user_id)) grouped.set(sub.user_id, [])
    grouped.get(sub.user_id).push(sub)
  }
  return grouped
}

export function pushSubscriptionDeleteFilter(userId, endpoint) {
  return `user_id=eq.${encodeURIComponent(userId)}&endpoint=eq.${encodeURIComponent(endpoint)}`
}
