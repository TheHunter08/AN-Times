export const LEGAL_NOTICE_VERSION = '2.0-2026-08-11'

export function getLegalConfig(db) {
  const configured = db?.config?.legal || {}
  const companyName = configured.controllerName || db?.empresas?.[0]?.nombre || db?.empresas?.[0]?.name || ''
  return {
    controllerName: companyName,
    taxId: configured.taxId || '',
    address: configured.address || '',
    privacyEmail: configured.privacyEmail || '',
    dpoEmail: configured.dpoEmail || '',
  }
}

export function legalConfigIssues(db) {
  const legal = getLegalConfig(db)
  const issues = []
  if (!legal.controllerName) issues.push('Falta identificar al responsable del tratamiento')
  if (!legal.taxId) issues.push('Falta CIF/NIF de la empresa')
  if (!legal.address) issues.push('Falta domicilio del responsable')
  if (!legal.privacyEmail) issues.push('Falta contacto para derechos de protección de datos')
  return issues
}

export function hasCurrentLegalAcknowledgement(db, employeeId) {
  return Boolean((db?.legalAcknowledgements || []).some(item =>
    item?.empId === employeeId && item?.noticeVersion === LEGAL_NOTICE_VERSION
  ))
}

export function buildLegalAcknowledgement(employee, authId, now = new Date()) {
  const at = now.toISOString()
  return {
    id: `legal_${employee.id}_${LEGAL_NOTICE_VERSION}`,
    empId: employee.id,
    empName: employee.name || employee.id,
    authId: authId || employee.authId || employee.auth_id || null,
    noticeVersion: LEGAL_NOTICE_VERSION,
    eventType: 'information_received',
    acknowledgedAt: at,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    _upd: at,
    _rev: 1,
  }
}
