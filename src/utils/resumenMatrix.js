// Matriz empleado × día para la pestaña "Resumen" del panel admin.
// Lógica pura (sin DOM/export) para poder testearla sin mockear PDF/Excel.
import { calcMin, localDateStr } from './time.js'

const ROLE_ORDER = { admin: 0, jefe_obra: 1, encargado: 2, empleado: 3 }
export const ROLE_LABEL = { admin: 'Administrador', jefe_obra: 'Jefe de obra', encargado: 'Encargado', empleado: 'Empleado' }

export function resolveRole(e) {
  return e?.role || (e?.isAdmin ? 'admin' : e?.isEnc ? 'encargado' : e?.isJO ? 'jefe_obra' : 'empleado')
}

function daysBetween(fromStr, toStr) {
  const days = []
  if (!fromStr || !toStr) return days
  const cursor = new Date(fromStr + 'T00:00:00')
  const end = new Date(toStr + 'T00:00:00')
  if (isNaN(cursor.getTime()) || isNaN(end.getTime()) || cursor > end) return days
  // Límite defensivo: un rango de años enteros no debe generar una matriz
  // inmanejable en pantalla/PDF por un error de fecha del usuario.
  let guard = 0
  while (cursor <= end && guard++ < 3660) {
    days.push(localDateStr(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

/**
 * period: { mode:'month', value:'YYYY-MM' } | { mode:'date', value:'YYYY-MM-DD' } | { mode:'range', from:'YYYY-MM-DD', to:'YYYY-MM-DD' }
 */
export function resolvePeriodDays(period) {
  if (!period) return []
  if (period.mode === 'month' && period.value) {
    const [y, m] = period.value.split('-').map(Number)
    if (!y || !m) return []
    const lastDay = new Date(y, m, 0).getDate()
    return daysBetween(`${period.value}-01`, `${period.value}-${String(lastDay).padStart(2, '0')}`)
  }
  if (period.mode === 'date' && period.value) return [period.value]
  if (period.mode === 'range') return daysBetween(period.from, period.to)
  return []
}

/** Etiqueta corta de columna: solo el día si todo el periodo cae en un mismo mes, si no dd/mm. */
export function dayColumnLabel(dateStr, sameMonth) {
  const [, m, d] = dateStr.split('-')
  return sameMonth ? String(Number(d)) : `${d}/${m}`
}

/**
 * @param {{ employees?: any[], records?: any[], vacaciones?: any[], period: any, employeeId?: string|null }} args
 */
export function buildResumenMatrix({ employees = [], records = [], vacaciones = [], period, employeeId = null }) {
  const days = resolvePeriodDays(period)
  const sameMonth = days.length > 0 && days.every(d => d.slice(0, 7) === days[0].slice(0, 7))

  const scoped = (employees || [])
    .filter(e => e && !e.baja && !e.isAdmin && e.role !== 'admin' && (!employeeId || e.id === employeeId))
    .map(e => ({ ...e, _role: resolveRole(e) }))
    .sort((a, b) =>
      (ROLE_ORDER[a._role] ?? 9) - (ROLE_ORDER[b._role] ?? 9) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'es'))

  const daySet = new Set(days)
  const minutesByKey = new Map()
  for (const r of (records || [])) {
    if (!r?.fin || !r?.inicio || !r?.empId) continue
    const d = localDateStr(new Date(r.inicio))
    if (!daySet.has(d)) continue
    const key = `${r.empId}|${d}`
    minutesByKey.set(key, (minutesByKey.get(key) || 0) + calcMin(r))
  }

  const vacKeys = new Set()
  for (const v of (vacaciones || [])) {
    if (v?.estado !== 'aprobada' || !v?.empId || !v?.fechaInicio || !v?.fechaFin) continue
    for (const d of days) {
      if (d >= v.fechaInicio && d <= v.fechaFin) vacKeys.add(`${v.empId}|${d}`)
    }
  }

  const todayStr = localDateStr(new Date())
  const rows = scoped.map(employee => {
    const cells = days.map(d => {
      const key = `${employee.id}|${d}`
      const minutes = minutesByKey.get(key) || 0
      const isVacation = vacKeys.has(key)
      const dow = new Date(d + 'T00:00:00').getDay()
      const isWeekend = dow === 0 || dow === 6
      // Sábado y domingo son descanso, no ausencia; los días futuros tampoco
      // cuentan como ausencia porque el empleado aún no ha podido fichar.
      const isAbsent = minutes === 0 && !isVacation && !isWeekend && d <= todayStr
      return { date: d, minutes, hours: minutes / 60, isVacation, isWeekend, isAbsent }
    })
    const totalMinutes = cells.reduce((sum, c) => sum + c.minutes, 0)
    return {
      employee,
      role: employee._role,
      roleLabel: ROLE_LABEL[employee._role] || employee._role,
      cells,
      totalMinutes,
      totalHours: totalMinutes / 60,
    }
  })

  return { days, sameMonth, rows }
}
