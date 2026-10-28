// Semana de planning: siempre lunes a domingo, igual que la cuadrícula de
// PlanningPage — usado para poder cerrar/reabrir una semana como "revisada"
// sin tocar el cierre mensual de nóminas (concepto distinto, con su propia
// firma admin/empleado).
import { localDateStr } from './time.js'

export function mondayOf(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() === 0 ? 6 : d.getDay() - 1 // 0 = lunes
  d.setDate(d.getDate() - dow)
  return d
}

export function weekStartIso(date) {
  return localDateStr(mondayOf(date))
}

export function isWeekClosed(planningClosures, weekStart) {
  return (planningClosures || []).some(c => c?.weekStart === weekStart)
}

export function shiftMonthValue(value, delta) {
  const [y, m] = String(value).split('-').map(Number)
  const d = new Date(y, (m - 1) + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
