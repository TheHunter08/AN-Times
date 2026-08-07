export function isMissingStorageBucketResponse(status, body = '') {
  if (status === 404) return true
  if (status !== 400) return false
  const message = String(body).toLowerCase()
  return message.includes('bucket') && (message.includes('not found') || message.includes('does not exist'))
}
