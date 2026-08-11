function removedIds(before, after) {
  const kept = new Set((after || []).map(item => item?.id).filter(Boolean))
  return (before || []).map(item => item?.id).filter(id => id && !kept.has(id))
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000
export const LEGAL_AUDIT_RETENTION_MS = 4 * YEAR_MS
export const GENERAL_AUDIT_RETENTION_MS = YEAR_MS

function isLegalAuditEvent(item) {
  const category = String(item?.category || '').toLowerCase()
  const entityType = String(item?.entityType || '').toLowerCase()
  return category === 'jornada' || category === 'documento' ||
    ['record', 'record_batch', 'cierre', 'cierre_batch', 'document', 'legal_notice'].includes(entityType)
}

export function pruneDbRetention(db, now = Date.now()) {
  let next = db
  const deleted = {}

  if (db.audit?.length > 300) {
    const audit = db.audit.filter(item => {
      const time = new Date(item?.ts).getTime()
      if (!Number.isFinite(time)) return true
      const retention = isLegalAuditEvent(item) ? LEGAL_AUDIT_RETENTION_MS : GENERAL_AUDIT_RETENTION_MS
      return time > now - retention
    })
    const ids = removedIds(db.audit, audit)
    if (ids.length) deleted.audit = ids
    next = { ...next, audit }
  }

  if (db.notis?.length > 150) {
    const cutoff = now - 7 * 24 * 60 * 60 * 1000
    const notis = db.notis.filter(item =>
      !item.deleted || new Date(item.ts || 0).getTime() > cutoff
    )
    const ids = removedIds(db.notis, notis)
    if (ids.length) deleted.notis = ids
    next = { ...next, notis }
  }

  return { db:next, deleted:Object.keys(deleted).length ? deleted : null }
}
