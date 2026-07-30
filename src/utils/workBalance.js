import { FESTIVOS_MADRID } from '../config/holidays.js'

const acceptedAbsence = item => {
  const state = String(item?.estado || item?.status || '').toLowerCase()
  return !['rechazada', 'rechazado', 'denegada', 'denegado', 'cancelada', 'cancelado'].includes(state)
}

const normalizedAbsence = (item, type) => {
  const start = item?.fechaInicio || item?.desde || item?.fecha
  const end = item?.fechaFin || item?.hasta || start
  if (!item?.empId || !start || !end || end < start) return null
  return { empId:item.empId, start, end, type, label:item.motivo || item.tipo || type }
}

export function workBalanceOptions(db, employee, extra = {}) {
  const vacations = (db?.vacaciones || [])
    .filter(item => item?.estado === 'aprobada')
    .map(item => normalizedAbsence(item, 'vacaciones'))
  const medical = (db?.medicos || [])
    .filter(acceptedAbsence)
    .map(item => normalizedAbsence(item, 'baja médica'))
  const absences = (db?.ausencias || [])
    .filter(acceptedAbsence)
    .map(item => normalizedAbsence(item, 'ausencia justificada'))

  const holidays = {
    ...(db?.config?.usarFestivosMadrid !== false ? FESTIVOS_MADRID : {}),
    ...(db?.config?.festivosExtra || {}),
  }

  return {
    employee,
    justifiedAbsences:[...vacations, ...medical, ...absences].filter(Boolean),
    holidays,
    ...extra,
  }
}
