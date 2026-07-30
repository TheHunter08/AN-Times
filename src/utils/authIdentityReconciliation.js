const normalizeEmail = value => String(value || '').trim().toLowerCase()

const countByEmail = items => {
  const counts = new Map()
  for (const item of items || []) {
    const email = normalizeEmail(item?.email)
    if (email) counts.set(email, (counts.get(email) || 0) + 1)
  }
  return counts
}

export function planAuthIdentityLinks(employees, authUsers) {
  const employeeEmailCounts = countByEmail(employees)
  const authEmailCounts = countByEmail(authUsers)
  const authByEmail = new Map((authUsers || []).map(user => [normalizeEmail(user?.email), user]))
  const linkedAuthIds = new Set((employees || []).map(employee => employee?.auth_id || employee?.authId).filter(Boolean))
  const candidates = []
  const conflicts = []

  for (const employee of employees || []) {
    if (!employee || employee.baja || employee.auth_id || employee.authId) continue
    const email = normalizeEmail(employee.email)
    if (!email) continue
    if (employeeEmailCounts.get(email) !== 1 || authEmailCounts.get(email) !== 1) {
      if (authEmailCounts.has(email)) conflicts.push({ employeeId:employee.id, reason:'email_duplicado' })
      continue
    }
    const authUser = authByEmail.get(email)
    if (!authUser || linkedAuthIds.has(authUser.id)) {
      if (authUser) conflicts.push({ employeeId:employee.id, reason:'identidad_ya_vinculada' })
      continue
    }
    const metadataEmployeeId = authUser.user_metadata?.employeeId || authUser.user_metadata?.employee_id
    if (metadataEmployeeId && String(metadataEmployeeId) !== String(employee.id)) {
      conflicts.push({ employeeId:employee.id, reason:'metadata_incompatible' })
      continue
    }
    candidates.push({ employeeId:employee.id, authId:authUser.id })
    linkedAuthIds.add(authUser.id)
  }

  return { candidates, conflicts }
}
