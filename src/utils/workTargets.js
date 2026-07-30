import { WK } from '../config/workRules.js'

export function contractWeeklyMinutes() {
  return WK
}

export function workWeekStartsInMonth(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number)
  if (!year || month < 1 || month > 12) return []
  const lastDay = new Date(year, month, 0).getDate()
  const starts = []
  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(year, month - 1, day)
    if (date.getDay() === 1) {
      starts.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
    }
  }
  return starts
}

// Referencia acumulada de las semanas laborales que empiezan en el mes.
// No decide las extras: cada lunes-viernes se evalúa por separado.
export function monthlyTargetMinutes(_employee, monthKey) {
  return workWeekStartsInMonth(monthKey).length * WK
}
