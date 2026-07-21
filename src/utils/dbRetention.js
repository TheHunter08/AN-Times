function removedIds(before, after) {
  const kept = new Set((after || []).map(item => item?.id).filter(Boolean))
  return (before || []).map(item => item?.id).filter(id => id && !kept.has(id))
}

export function pruneDbRetention(db, now = Date.now()) {
  let next = db
  const deleted = {}

  if (db.audit?.length > 300) {
    const cutoff = now - 30 * 24 * 60 * 60 * 1000
    const recent = db.audit.filter(item => new Date(item.ts).getTime() > cutoff)
    const audit = recent.length >= 50 ? recent : db.audit.slice(-300)
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
