export function hasEmployeeSignature(db, employeeId) {
  return Boolean(employeeId && db?.firmas?.[employeeId]?.main?.data)
}

export function getLaunchRequirements(db, employeeId, pushReady) {
  const signatureReady = hasEmployeeSignature(db, employeeId)
  const notificationsReady = pushReady === true
  return {
    signatureReady,
    notificationsReady,
    ready: signatureReady && notificationsReady,
  }
}
