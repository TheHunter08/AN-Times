import { LABOR_CALENDAR_2026, LABOR_CALENDAR_2026_MONTHLY_HOURS } from '../config/laborCalendar2026.js'
import { WD } from '../config/workRules.js'

// Copia local de time.js:p2 — evita un import circular (time.js importa de
// este módulo para el cálculo de horas extra).
const p2 = n => String(n).padStart(2, '0')

// Registro de calendarios laborales soportados, indexado por año. Si en el
// futuro se sube un calendario de otro año, solo hay que añadir su entrada
// aquí — el resto de funciones ya iteran sobre este mapa.
const CALENDARS_BY_YEAR = {
  2026: { days: LABOR_CALENDAR_2026, monthlyHours: LABOR_CALENDAR_2026_MONTHLY_HOURS },
}

/**
 * Horas laborables que el calendario oficial asigna a una fecha concreta, o
 * null si esa fecha no tiene calendario cargado (años distintos a los
 * disponibles arriba) — en ese caso el llamador debe usar su valor por
 * defecto (8h/día, 40h/semana) en vez de asumir 0.
 */
export function calendarDayHours(dateStr) {
  const [year, month, day] = String(dateStr || '').split('-').map(Number)
  const calendar = CALENDARS_BY_YEAR[year]
  if (!calendar) return null
  const entry = calendar.days[month]?.[day]
  if (entry === undefined) return null
  return typeof entry === 'number' ? entry : 0
}

/**
 * Total de horas laborables que el calendario estipula para un mes concreto
 * ("YYYY-MM"), o null si ese año no tiene calendario cargado.
 */
export function calendarMonthlyHours(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number)
  const calendar = CALENDARS_BY_YEAR[year]
  if (!calendar) return null
  const hours = calendar.monthlyHours[month]
  return typeof hours === 'number' ? hours : null
}

/**
 * Suma de horas laborables de lunes a viernes de la semana que empieza en
 * `mondayDateStr` ("YYYY-MM-DD"), o null si algún día de esa semana cae
 * fuera de un año con calendario cargado (evita mezclar un año con
 * calendario con otro sin él a mitad de semana).
 */
export function calendarWeeklyHours(mondayDateStr) {
  const monday = new Date(`${mondayDateStr}T00:00:00`)
  if (Number.isNaN(monday.getTime())) return null
  let total = 0
  for (let i = 0; i < 5; i++) {
    const day = new Date(monday)
    day.setDate(monday.getDate() + i)
    const dateStr = `${day.getFullYear()}-${p2(day.getMonth() + 1)}-${p2(day.getDate())}`
    const hours = calendarDayHours(dateStr)
    if (hours === null) return null
    total += hours
  }
  return total
}

/**
 * Minutos esperados de trabajo para una fecha concreta, resolviendo la misma
 * prioridad que ya usaban las distintas pantallas antes de tener calendario:
 * 1) un `wdMin` configurado explícitamente por el admin (anula el calendario
 *    — p.ej. una jornada distinta pactada para toda la plantilla),
 * 2) el calendario laboral oficial para esa fecha, si hay uno cargado,
 * 3) 8h por defecto (WD) si ninguna de las dos anteriores aplica.
 */
export function effectiveDailyTargetMin(configWdMin, dateStr) {
  if (configWdMin) return configWdMin
  const hours = calendarDayHours(dateStr)
  return hours !== null ? hours * 60 : WD
}
