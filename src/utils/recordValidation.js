export function recordValidationState(record) {
  if (!record?.fin) return 'open'
  if (record.rechazado) return 'rejected'
  if (record.aceptada || record.validado) return 'approved'
  return 'pending'
}

export function isRecordPendingValidation(record) {
  return recordValidationState(record) === 'pending'
}

export function selectValidationRecords(records, now = Date.now(), reviewedDays = 14, reviewedLimit = 60) {
  const completed = (records || [])
    .filter(record => record?.fin && record?.inicio && Number.isFinite(new Date(record.inicio).getTime()))
    .sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)))

  const pending = completed.filter(isRecordPendingValidation)
  const reviewed = completed
    .filter(record => !isRecordPendingValidation(record))
    .filter(record => {
      const age = now - new Date(record.inicio).getTime()
      return age >= 0 && age <= reviewedDays * 86400000
    })
    .slice(0, reviewedLimit)

  return [...pending, ...reviewed]
    .sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)))
}
