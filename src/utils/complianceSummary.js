const FOUR_YEARS_MS = 4 * 365.25 * 24 * 60 * 60 * 1000
const STALE_OPEN_SHIFT_MS = 12 * 60 * 60 * 1000

function validTime(value) {
  const time = value ? new Date(value).getTime() : NaN
  return Number.isFinite(time) ? time : null
}

function correctionIsTraceable(correction) {
  return Boolean(correction?.ts && correction?.by && correction?.motivo)
}

export function buildComplianceSummary(db, now = Date.now()) {
  const records = (db?.records || []).filter(record => record?.inicio)
  const retentionCutoff = now - FOUR_YEARS_MS
  const retainedRecords = records.filter(record => {
    const time = validTime(record.inicio)
    return time !== null && time >= retentionCutoff
  })
  const completeRecords = retainedRecords.filter(record => record.fin)
  const incompleteRecords = retainedRecords.filter(record => {
    const startedAt = validTime(record.inicio)
    return !record.fin && startedAt !== null && startedAt <= now - STALE_OPEN_SHIFT_MS
  })
  const modifiedRecords = retainedRecords.filter(record => (record.correcciones || []).length > 0)
  const corrections = modifiedRecords.flatMap(record => record.correcciones || [])
  const untraceableCorrections = corrections.filter(correction => !correctionIsTraceable(correction))
  const validatedRecords = completeRecords.filter(record => record.validado || record.aceptada)
  const closures = db?.cierres || []
  const signedClosures = closures.filter(closure => closure.firmaAdmin && (closure.firmaEmp || closure.firma))
  const oldestTime = records.reduce((oldest, record) => {
    const time = validTime(record.inicio)
    return time === null ? oldest : Math.min(oldest, time)
  }, Number.POSITIVE_INFINITY)

  const completionBase = completeRecords.length + incompleteRecords.length
  const completionPct = completionBase
    ? Math.round((completeRecords.length / completionBase) * 100)
    : 100
  const traceabilityPct = corrections.length
    ? Math.round(((corrections.length - untraceableCorrections.length) / corrections.length) * 100)
    : 100
  const validationPct = completeRecords.length
    ? Math.round((validatedRecords.length / completeRecords.length) * 100)
    : 100
  const closurePct = closures.length
    ? Math.round((signedClosures.length / closures.length) * 100)
    : 100
  const score = Math.round(
    completionPct * .35 + traceabilityPct * .3 + validationPct * .2 + closurePct * .15,
  )

  const risks = []
  if (incompleteRecords.length) risks.push({
    id: 'incomplete', tone: 'orange', count: incompleteRecords.length,
    label: 'Jornadas sin finalizar', destination: 'anomalias',
  })
  if (untraceableCorrections.length) risks.push({
    id: 'traceability', tone: 'red', count: untraceableCorrections.length,
    label: 'Correcciones sin trazabilidad completa', destination: 'auditoria',
  })
  if (closures.length - signedClosures.length > 0) risks.push({
    id: 'closures', tone: 'orange', count: closures.length - signedClosures.length,
    label: 'Cierres pendientes de firma', destination: 'cierre',
  })
  if (!retainedRecords.length) risks.push({
    id: 'empty', tone: 'gray', count: 0,
    label: 'Aún no hay registros dentro del periodo legal', destination: 'fichajes',
  })

  return {
    score,
    retainedRecords: retainedRecords.length,
    completeRecords: completeRecords.length,
    incompleteRecords: incompleteRecords.length,
    modifiedRecords: modifiedRecords.length,
    corrections: corrections.length,
    untraceableCorrections: untraceableCorrections.length,
    validatedRecords: validatedRecords.length,
    signedClosures: signedClosures.length,
    closures: closures.length,
    completionPct,
    traceabilityPct,
    validationPct,
    closurePct,
    oldestRecord: Number.isFinite(oldestTime) ? new Date(oldestTime).toISOString() : null,
    retentionCutoff: new Date(retentionCutoff).toISOString(),
    risks,
  }
}
