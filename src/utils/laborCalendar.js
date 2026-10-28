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

// Horario estándar de la empresa: lunes a jueves jornada completa (9h),
// viernes jornada reducida (4h) — siempre a partir de las 8:00. Sustituye al
// número de horas que marca el calendario oficial en un día laborable
// ordinario (el calendario puede decir 8h, jornada intensiva 6-7h, etc.,
// pero el acuerdo real de la empresa es este), sin perder por eso los días
// no laborables (festivos/fines de semana) que el calendario sí marca
// correctamente a 0.
const WEEKDAY_TARGET_MIN = { 1: 9 * 60, 2: 9 * 60, 3: 9 * 60, 4: 9 * 60, 5: 4 * 60 } // 1=lunes … 5=viernes

/** Minutos del horario estándar lunes-jueves/viernes para esa fecha, o null si cae en fin de semana o la fecha no es válida. */
export function defaultWeekdayTargetMin(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return WEEKDAY_TARGET_MIN[d.getDay()] ?? null
}

/**
 * Minutos esperados de trabajo para una fecha concreta:
 * 1) un `wdMin` configurado explícitamente por el admin (anula todo lo demás
 *    — p.ej. una jornada distinta pactada para toda la plantilla),
 * 2) 0 si el calendario oficial marca ese día como no laborable (festivo o
 *    fin de semana) — un día libre sigue siendo un día libre,
 * 3) el horario estándar de la empresa (lunes-jueves 9h, viernes 4h) en
 *    cualquier día laborable ordinario,
 * 4) si no es ninguno de los anteriores (fin de semana sin calendario
 *    cargado para ese año), el calendario oficial si existe, o 8h (WD) si no.
 */
export function effectiveDailyTargetMin(configWdMin, dateStr) {
  if (configWdMin) return configWdMin
  const calendarHours = calendarDayHours(dateStr)
  if (calendarHours === 0) return 0
  const weekdayMin = defaultWeekdayTargetMin(dateStr)
  if (weekdayMin !== null) return weekdayMin
  return calendarHours !== null ? calendarHours * 60 : WD
}
