export function canLinkAuthIdentity(employee, authUserId) {
  if (!employee || !authUserId) return false
  const existing = employee.authId || employee.auth_id || null
  return !existing || existing === authUserId
}

export function linkAuthIdentity(employee, authUserId, nowIso = new Date().toISOString()) {
  if (!canLinkAuthIdentity(employee, authUserId)) return null
  return { ...employee, authId:authUserId, _upd:nowIso }
}

export function linkEmployeeAuthIdentity(employees, employeeId, authUserId, nowIso = new Date().toISOString()) {
  const list = Array.isArray(employees) ? employees : []
  const index = list.findIndex(employee => employee?.id === employeeId)
  if (index < 0) return { ok:false, changed:false, employees:list, employee:null }
  const current = list[index]
  const identityAlreadyUsed = list.some((employee, employeeIndex) =>
    employeeIndex !== index && (employee?.authId || employee?.auth_id) === authUserId,
  )
  if (identityAlreadyUsed) {
    return { ok:false, changed:false, employees:list, employee:current, reason:'identity_in_use' }
  }
  const linked = linkAuthIdentity(current, authUserId, nowIso)
  if (!linked) return { ok:false, changed:false, employees:list, employee:current }
  if ((current.authId || current.auth_id) === authUserId) {
    return { ok:true, changed:false, employees:list, employee:current }
  }
  const updated = [...list]
  updated[index] = linked
  return { ok:true, changed:true, employees:updated, employee:linked }
}

export function relinkEmployeeAuthIdentity(employees, employeeId, expectedAuthUserId, nextAuthUserId, nowIso = new Date().toISOString()) {
  const list = Array.isArray(employees) ? employees : []
  if (!employeeId || !expectedAuthUserId || !nextAuthUserId || expectedAuthUserId === nextAuthUserId) {
    return { ok:false, changed:false, employees:list, employee:null }
  }
  const index = list.findIndex(employee => employee?.id === employeeId)
  if (index < 0) return { ok:false, changed:false, employees:list, employee:null }
  const current = list[index]
  const currentAuthId = current.authId || current.auth_id || null
  if (currentAuthId !== expectedAuthUserId) {
    return { ok:false, changed:false, employees:list, employee:current }
  }
  const identityAlreadyUsed = list.some((employee, employeeIndex) =>
    employeeIndex !== index && (employee?.authId || employee?.auth_id) === nextAuthUserId,
  )
  if (identityAlreadyUsed) {
    return { ok:false, changed:false, employees:list, employee:current }
  }
  const updated = [...list]
  updated[index] = { ...current, authId:nextAuthUserId, _upd:nowIso }
  return { ok:true, changed:true, employees:updated, employee:updated[index] }
}
