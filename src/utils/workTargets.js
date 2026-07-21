import { WK } from '../config/workRules.js'

export function contractWeeklyMinutes(employee) {
  const hours = Number(employee?.horasSemanales ?? employee?.weeklyHours)
  return Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : WK
}

export function workingDaysInMonth(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number)
  if (!year || month < 1 || month > 12) return 0
  const lastDay = new Date(year, month, 0).getDate()
  let days = 0
  for (let day = 1; day <= lastDay; day++) {
    const weekday = new Date(year, month - 1, day).getDay()
    if (weekday >= 1 && weekday <= 5) days++
  }
  return days
}

// Objetivo contractual proporcional a los días laborables reales del mes.
// Los festivos/convenios se podrán restar cuando exista un calendario laboral
// de empresa; nunca vuelve a asumir 160 h para todas las personas y meses.
export function monthlyTargetMinutes(employee, monthKey) {
  return Math.round(contractWeeklyMinutes(employee) / 5 * workingDaysInMonth(monthKey))
}
