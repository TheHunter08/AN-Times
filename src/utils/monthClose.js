import { workWeekStartsInMonth } from './workTargets.js'

// Módulo deliberadamente independiente de navegador y capa de datos para que
// la misma regla pueda ejecutarse en la UI, scripts y funciones serverless.
export const canCloseMonth = (mes, now = new Date()) => {
  const starts = workWeekStartsInMonth(mes)
  if (!starts.length) return false
  const lastMonday = new Date(`${starts.at(-1)}T00:00:00`)
  const closeAt = new Date(lastMonday)
  closeAt.setDate(lastMonday.getDate() + 5)
  return now >= closeAt
}
