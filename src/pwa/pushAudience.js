export function shouldDisplayPush(activeUserId, recipientUserId) {
  if (!activeUserId) return false
  return !recipientUserId || recipientUserId === activeUserId
}
