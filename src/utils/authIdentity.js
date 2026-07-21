export function canLinkAuthIdentity(employee, authUserId) {
  if (!employee || !authUserId) return false
  const existing = employee.authId || employee.auth_id || null
  return !existing || existing === authUserId
}

export function linkAuthIdentity(employee, authUserId, nowIso = new Date().toISOString()) {
  if (!canLinkAuthIdentity(employee, authUserId)) return null
  return { ...employee, authId:authUserId, _upd:nowIso }
}
