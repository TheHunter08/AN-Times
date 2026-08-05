import { WK } from '../config/workRules.js'
import { calendarMonthlyHours } from './laborCalendar.js'

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
//
// Cuando el mes tiene calendario laboral oficial cargado (ver
// laborCalendar.js), se usa su total exacto de horas estipuladas — ya
// contempla festivos y la jornada intensiva de julio-agosto, así que es más
// preciso que la aproximación genérica de "semanas que empiezan en el mes ×
// 40h". Solo se cae a la aproximación para meses sin calendario cargado.
export function monthlyTargetMinutes(_employee, monthKey) {
  const calendarHours = calendarMonthlyHours(monthKey)
  if (calendarHours !== null) return calendarHours * 60
  return workWeekStartsInMonth(monthKey).length * WK
}
