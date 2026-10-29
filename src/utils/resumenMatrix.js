// Matriz empleado × día para la pestaña "Resumen" del panel admin.
// Lógica pura (sin DOM/export) para poder testearla sin mockear PDF/Excel.
import { calcMin, localDateStr } from './time.js'

const ROLE_ORDER = { admin: 0, jefe_obra: 1, jefe_centro: 2, encargado: 3, empleado: 4 }
export const ROLE_LABEL = { admin: 'Administrador', jefe_obra: 'Jefe de obra', jefe_centro: 'Jefe de centro', encargado: 'Encargado', empleado: 'Empleado' }

export function resolveRole(e) {
  return e?.role || (e?.isAdmin ? 'admin' : e?.isEnc ? 'encargado' : e?.isJO ? 'jefe_obra' : e?.isJefeCentro ? 'jefe_centro' : 'empleado')
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
 * @param {{ employees?: any[], records?: any[], vacaciones?: any[], period: any, employeeId?: string|null, obraNames?: string[]|null, obras?: any[], holidays?: Record<string,string> }} args
 */
export function buildResumenMatrix({ employees = [], records = [], vacaciones = [], period, employeeId = null, obraNames = null, obras = [], holidays = {} }) {
  const days = resolvePeriodDays(period)
  const sameMonth = days.length > 0 && days.every(d => d.slice(0, 7) === days[0].slice(0, 7))
  const daySet = new Set(days)

  // Filtro por obra: compara contra record.centro (la obra fichada, ver
  // toWorksiteRow/employeeObraOptions), no contra el centro de trabajo
  // habitual del empleado — un mismo empleado puede ficharse en obras
  // distintas según el día.
  const obraFilter = obraNames && obraNames.length ? new Set(obraNames) : null
  const matchesObra = r => !obraFilter || obraFilter.has(r?.centro)

  // obrasAsignadas guarda ids; record.centro guarda el nombre de la obra
  // fichada — hace falta resolver uno a otro para comparar "¿sigue
  // asignado hoy a la obra que se está filtrando?".
  const obraNameById = new Map((obras || []).map(o => [o?.id, o?.nombre || o?.name || o?.id]))
  const employeeObraNames = e => new Set((e?.obrasAsignadas || []).map(id => obraNameById.get(id)).filter(Boolean))
  // Sin filtro de obra, todo el mundo está "esperado" (comportamiento de
  // siempre). Con filtro activo: solo si el empleado sigue asignado HOY a
  // alguna de las obras elegidas — sin histórico de fechas, es la mejor
  // aproximación a "a partir de que se le desasigna, deja de contar como
  // ausencia en esa obra". Si ya no está asignado ahí, sus días sin fichar
  // bajo el filtro quedan en blanco (ni Ausente ni Otra obra) en vez de
  // marcarse como ausencia — solo se señala "Otra obra" el día que sí fichó
  // en otro sitio (ver isElsewhere más abajo).
  const stillExpectedUnderFilter = e => !obraFilter || [...obraFilter].some(name => employeeObraNames(e).has(name))

  // Fichajes cerrados del periodo, indexados por empleado+día — sin resumir
  // aún en minutos: hace falta el record.centro de cada uno para distinguir
  // "fichó en la obra esperada" de "fichó en otra".
  const recordsByKey = new Map()
  const empHasAnyRecordInPeriod = new Set()
  for (const r of (records || [])) {
    if (!r?.fin || !r?.inicio || !r?.empId) continue
    const d = localDateStr(new Date(r.inicio))
    if (!daySet.has(d)) continue
    const key = `${r.empId}|${d}`
    if (!recordsByKey.has(key)) recordsByKey.set(key, [])
    recordsByKey.get(key).push(r)
    empHasAnyRecordInPeriod.add(r.empId)
  }
  const empHasMatchingObraRecord = new Set(
    [...recordsByKey.entries()].filter(([, recs]) => recs.some(matchesObra)).map(([key]) => key.split('|')[0])
  )

  const scoped = (employees || [])
    .filter(e => e && !e.isAdmin && e.role !== 'admin')
    .filter(e => !employeeId || e.id === employeeId)
    // Sin seleccionar un empleado concreto: fuera los de baja (se puede
    // seguir pidiendo su informe eligiéndolos explícitamente en el filtro)
    // y fuera quien no tenga ningún fichaje ese periodo, en ninguna obra —
    // un listado lleno de filas "Ausente" de gente que ya no trabaja aquí o
    // que simplemente no tiene nada que reportar ese mes no aporta nada.
    .filter(e => employeeId || (!e.baja && empHasAnyRecordInPeriod.has(e.id)))
    .filter(e => !obraFilter || empHasMatchingObraRecord.has(e.id))
    .map(e => ({ ...e, _role: resolveRole(e), _expectedUnderFilter: stillExpectedUnderFilter(e) }))
    .sort((a, b) =>
      (ROLE_ORDER[a._role] ?? 9) - (ROLE_ORDER[b._role] ?? 9) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'es'))

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
      const dayRecords = recordsByKey.get(key) || []
      const allMinutes = dayRecords.reduce((s, r) => s + calcMin(r), 0)
      const minutes = dayRecords.filter(matchesObra).reduce((s, r) => s + calcMin(r), 0)
      const isVacation = vacKeys.has(key)
      const dow = new Date(d + 'T00:00:00').getDay()
      const isWeekend = dow === 0 || dow === 6
      const isHoliday = Boolean(holidays[d])
      // Con filtro de obra activo: si no hay minutos en la obra elegida pero
      // sí los hay en otra (allMinutes), no es una ausencia real, es que ese
      // día se trabajó en otra obra — se distingue para no pintarlo rojo.
      const isElsewhere = Boolean(obraFilter) && minutes === 0 && allMinutes > 0
      // Sábado y domingo son descanso, no ausencia; los festivos tampoco; los
      // días futuros tampoco cuentan como ausencia porque el empleado aún no
      // ha podido fichar; y si ya no está asignado a la obra que se está
      // filtrando, tampoco (ver stillExpectedUnderFilter) — un día vacío ahí
      // es simplemente que ya no se le espera, no una ausencia.
      const isAbsent = employee._expectedUnderFilter && minutes === 0 && allMinutes === 0
        && !isVacation && !isWeekend && !isHoliday && d <= todayStr
      return { date: d, minutes, hours: minutes / 60, isVacation, isWeekend, isHoliday, isAbsent, isElsewhere }
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
