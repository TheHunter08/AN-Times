import { calcSecs } from './time.js'

export function finalizeRecord(record, { now = new Date().toISOString(), actor = null, reason = null } = {}) {
  const breaks = [...(record.breaks || [])]
  let enDescanso = record.enDescanso
  let bStartTs = record.bStartTs
  if (enDescanso && bStartTs) {
    breaks.push({ start: bStartTs, end: now })
    enDescanso = false
    bStartTs = null
  }

  const closed = {
    ...record,
    fin: now,
    enDescanso,
    bStartTs,
    breaks,
    closed: true,
    operationId: globalThis.crypto?.randomUUID?.() ?? record.operationId ?? null,
    _rev: (record._rev || 0) + 1,
    _upd: now,
  }
  if (actor) {
    closed.cerradoPor = actor.name
    closed.cerradoPorId = actor.id
    closed.cierreManual = true
    closed.motivoCierre = reason || 'Cierre mediante QR de empleado'
  }
  const totals = calcSecs(closed)
  closed.workSecs = totals.work
  closed.breakSecs = totals.brk
  return closed
}
