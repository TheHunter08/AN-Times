import { p2, wkStart, calcMin, monthlyExtras, vacData, today, mhm, localDateStr } from './time.js'
import { WD, WK, WM } from '../config/constants.js'
import { buildComplianceSummary } from './complianceSummary.js'
import { employeeBelongsToObra, resolveRecordObraId } from './obraAttribution.js'
import { getScopedEmployees } from './supervisorScope.js'

const PERSONAL_CHIPS = [
  '¿Mis datos están sincronizados?',
  '¿Por qué trabajé menos esta semana?',
  '¿Cuántas horas extra tengo?',
  'Resumen semanal',
  '¿Cuándo cobro vacaciones?',
]

const TEAM_CHIPS = ['Riesgos de cumplimiento', 'Estado de las obras', '¿Quién olvidó fichar?']

export const AI_CHIPS = PERSONAL_CHIPS

const isGlobalAdmin = user => Boolean(user?.isAdmin || user?.role === 'admin')
const canSeeTeamData = user => Boolean(isGlobalAdmin(user) || user?.role === 'encargado' || user?.role === 'jefe_obra' || user?.isEnc || user?.isJO)

export function getAIChips(user) {
  return canSeeTeamData(user) ? [...TEAM_CHIPS, ...PERSONAL_CHIPS] : PERSONAL_CHIPS
}

function scopedEmployees(db, user) {
  return getScopedEmployees({
    employees:db.employees || [],
    supervisor:user,
    unrestricted:isGlobalAdmin(user),
  })
}

function scopedComplianceDb(db, user, employees) {
  if (isGlobalAdmin(user)) return db
  const ids = new Set(employees.map(employee => employee.id))
  const scoped = { ...db, employees }
  for (const key of ['records', 'vacaciones', 'gastos', 'cierres', 'documentos']) {
    scoped[key] = (db[key] || []).filter(item => ids.has(item.empId))
  }
  return scoped
}

export function buildWorksiteInsights(db, user, now = new Date()) {
  if (!canSeeTeamData(user)) return { works:[], unattributedToday:0 }
  const employees = scopedEmployees(db, user)
  const employeeIds = new Set(employees.map(employee => employee.id))
  const employeesById = new Map(employees.map(employee => [employee.id, employee]))
  const allWorks = db.obras || []
  const works = (isGlobalAdmin(user) ? allWorks : allWorks.filter(work => employeeBelongsToObra(user, work)))
  const date = localDateStr(now)
  const todayRecords = (db.records || []).filter(record =>
    employeeIds.has(record.empId) && record.inicio && localDateStr(new Date(record.inicio)) === date
  )

  const summaries = works.map(work => {
    const records = todayRecords.filter(record =>
      resolveRecordObraId(record, employeesById.get(record.empId), allWorks) === work.id
    )
    const assigned = employees.filter(employee => employeeBelongsToObra(employee, work)).length
    const activeNow = records.filter(record => !record.fin).length
    const workedMin = records.filter(record => record.fin).reduce((sum, record) => sum + calcMin(record), 0)
    return { id:work.id, name:work.nombre || work.name || work.id, assigned, activeNow, workedMin }
  })

  const unattributedToday = todayRecords.filter(record =>
    !resolveRecordObraId(record, employeesById.get(record.empId), allWorks)
  ).length
  return { works:summaries, unattributedToday }
}

// Resumen en texto plano de los datos reales del empleado — usado como contexto
// "grounding" para el modelo IA local (localAI.js), para que no invente cifras.
export function buildAIContext(db, u) {
  if (!u) return 'Sin sesión de empleado activa.'
  const now = new Date()
  const mk = `${now.getFullYear()}-${p2(now.getMonth() + 1)}`
  const mine = (db.records || []).filter(r => r.empId === u.id)
  const fin = mine.filter(r => r.fin)
  const ws = wkStart(now)
  const weekMin = fin.filter(r => new Date(r.inicio) >= ws).reduce((s, r) => s + calcMin(r), 0)
  // localDateStr (no r.inicio?.startsWith(mk)): inicio se guarda en UTC, mk es
  // local — un fichaje de madrugada del día 1 del mes se quedaba fuera de
  // "horas trabajadas este mes" y además desincronizaba monthMin de
  // mExt/monthlyExtras (que sí calcula el mes en hora local correctamente).
  const monthMin = fin.filter(r => r.inicio && localDateStr(new Date(r.inicio)).startsWith(mk)).reduce((s, r) => s + calcMin(r), 0)
  const mExt = monthlyExtras(db.records, u.id, mk)
  const vac = vacData(u.id, db)
  const todayStr = today()
  const teamEmployees = canSeeTeamData(u) ? scopedEmployees(db, u) : []
  // localDateStr(new Date(r.inicio)) (no r.inicio?.startsWith(todayStr)): inicio se
  // guarda en UTC, todayStr es local — un fichaje nocturno no contaba como "hoy".
  const ficharonHoy = new Set((db.records || []).filter(r => r.inicio && localDateStr(new Date(r.inicio)) === todayStr).map(r => r.empId))
  const sinFichar = teamEmployees.filter(e => !ficharonHoy.has(e.id)).map(e => e.name)
  const canSeeTeam = canSeeTeamData(u)
  const compliance = canSeeTeam ? buildComplianceSummary(scopedComplianceDb(db, u, teamEmployees)) : null
  const worksite = canSeeTeam ? buildWorksiteInsights(db, u, now) : null
  const runtimeSync = db._runtimeSync
  return [
    `Empleado: ${u.name}`,
    `Horas trabajadas esta semana: ${mhm(weekMin)} (objetivo ${mhm(WK)})`,
    `Horas trabajadas este mes: ${mhm(monthMin)}`,
    `Horas extra este mes (exceso sobre 160h): ${mhm(mExt.netExtraMin || 0)}`,
    mExt.deficitMin > 0 ? `Déficit este mes: ${mhm(mExt.deficitMin)}` : null,
    `Vacaciones disponibles: ${vac.available} días (${vac.generated} generados, ${vac.used} usados)`,
    canSeeTeam
      ? (sinFichar.length ? `Empleados sin fichar hoy: ${sinFichar.join(', ')}` : 'Todo el equipo ha fichado hoy')
      : null,
    compliance ? `Cumplimiento documental: ${compliance.score}%` : null,
    compliance?.risks?.length ? `Riesgos activos: ${compliance.risks.map(risk => `${risk.label} (${risk.count})`).join('; ')}` : null,
    worksite?.works?.length ? `Obras hoy: ${worksite.works.map(work => `${work.name}: ${work.activeNow} trabajando, ${mhm(work.workedMin)} cerradas`).join('; ')}` : null,
    worksite?.unattributedToday ? `Fichajes de hoy sin obra atribuida: ${worksite.unattributedToday}` : null,
    runtimeSync ? `Sincronización: ${runtimeSync.offlinePending ? 'cambios pendientes' : runtimeSync.syncStatus || 'desconocida'}${runtimeSync.syncError ? `; error ${runtimeSync.syncError}` : ''}` : null,
    `Fecha de hoy: ${todayStr}`,
  ].filter(Boolean).join('\n')
}

export function aiAnswer(q, db, u) {
  const ql = q.toLowerCase()
  const now = new Date()
  const mk = `${now.getFullYear()}-${p2(now.getMonth() + 1)}`
  const mine = (db.records || []).filter(r => r.empId === u?.id)
  const fin = mine.filter(r => r.fin)

  // Semana actual y anterior
  const ws = wkStart(now)
  const prevWs = new Date(ws); prevWs.setDate(prevWs.getDate() - 7)
  const weekMin = fin.filter(r => new Date(r.inicio) >= ws).reduce((s, r) => s + calcMin(r), 0)
  const prevWeekMin = fin.filter(r => { const d = new Date(r.inicio); return d >= prevWs && d < ws }).reduce((s, r) => s + calcMin(r), 0)

  // localDateStr (no r.inicio?.startsWith(mk)): inicio se guarda en UTC, mk es
  // local — un fichaje de madrugada del día 1 del mes se quedaba fuera de
  // "horas trabajadas este mes" y además desincronizaba monthMin de
  // mExt/monthlyExtras (que sí calcula el mes en hora local correctamente).
  const monthMin = fin.filter(r => r.inicio && localDateStr(new Date(r.inicio)).startsWith(mk)).reduce((s, r) => s + calcMin(r), 0)
  // Regla TIMES INC: >40h en semana; en el resumen mensual, >160h en el mes.
  const mExt = u ? monthlyExtras(db.records, u.id, mk) : { netExtraMin: 0, deficitMin: 0, weeklyExtraMin: 0, shortfallMin: 0, workedMin: 0 }
  const vac = u ? vacData(u.id, db) : { available: 0, generated: 0, used: 0 }
  const canSeeTeam = canSeeTeamData(u)

  if (canSeeTeam && (ql.includes('cumpl') || ql.includes('riesgo') || ql.includes('anom'))) {
    const team = scopedEmployees(db, u)
    const compliance = buildComplianceSummary(scopedComplianceDb(db, u, team))
    if (!compliance.risks.length) return `✅ El índice documental está en **${compliance.score}%** y no hay excepciones activas.`
    return `🛡️ Índice documental: **${compliance.score}%**. Prioridades:\n${compliance.risks.slice(0, 4).map(risk => `• ${risk.label}: ${risk.count}`).join('\n')}`
  }

  if (ql.includes('sincron') || ql.includes('guardad') || ql.includes('pendiente') || ql.includes('conexión') || ql.includes('conexion')) {
    const sync = db._runtimeSync
    if (!sync) return 'ℹ️ El estado de sincronización no está disponible en esta vista. Tus cambios siguen guardándose primero en el dispositivo.'
    if (sync.offlinePending) return '⏳ Hay **cambios pendientes de subir**. Están guardados en este dispositivo y TIMES INC volverá a intentarlo al recuperar conexión.'
    if (sync.syncStatus === 'offline') return '📴 TIMES INC está **sin conexión**. Puedes seguir trabajando; cualquier cambio nuevo quedará guardado en este dispositivo hasta reconectar.'
    if (sync.syncStatus === 'error') return `⚠️ La última sincronización falló${sync.syncError ? ` (${sync.syncError})` : ''}. Usa “Sincronizar ahora”; los cambios locales no se han descartado.`
    if (sync.syncStatus === 'syncing') return '🔄 TIMES INC está sincronizando ahora. Los cambios ya están guardados localmente.'
    const confirmed = sync.lastSyncTime ? ` Última confirmación: ${new Date(sync.lastSyncTime).toLocaleString('es-ES')}.` : ''
    return `✅ Los datos están **sincronizados**.${confirmed}`
  }

  if (ql.includes('obra') || ql.includes('proyecto') || ql.includes('geovalla')) {
    if (!canSeeTeam) return '🔒 El estado operativo de las obras solo está disponible para administradores y responsables de equipo.'
    const insights = buildWorksiteInsights(db, u, now)
    if (!insights.works.length) return '🏗️ No hay obras asignadas en tu ámbito operativo.'
    const lines = insights.works
      .sort((a, b) => b.activeNow - a.activeNow || b.workedMin - a.workedMin)
      .map(work => `• ${work.name}: ${work.activeNow} trabajando · ${mhm(work.workedMin)} cerradas hoy · ${work.assigned} asignados`)
    if (insights.unattributedToday) lines.push(`⚠️ ${insights.unattributedToday} fichaje(s) de hoy no tienen una obra inequívoca.`)
    return `🏗️ **Estado operativo de obras**\n${lines.join('\n')}`
  }

  // ¿Por qué trabajé menos esta semana?
  if ((ql.includes('menos') || ql.includes('por qu') || ql.includes('porqu')) && ql.includes('semana')) {
    if (prevWeekMin === 0) return `📊 Esta semana llevas **${mhm(weekMin)}**. No tengo datos de la semana anterior para comparar todavía.`
    const diff = weekMin - prevWeekMin
    const pct = Math.round(Math.abs(diff) / prevWeekMin * 100)
    if (diff >= 0) return `📈 En realidad has trabajado **${mhm(weekMin)}** esta semana, ${pct}% **más** que la anterior (${mhm(prevWeekMin)}). ¡Buen ritmo!`
    return `📉 Esta semana acumulas **${mhm(weekMin)}**, un ${pct}% menos que la semana pasada (${mhm(prevWeekMin)}). La diferencia son ${mhm(Math.abs(diff))} — revisa si algún día saliste antes o faltó un fichaje.`
  }

  // ¿Cuántas horas extra tengo?
  if (ql.includes('extra')) {
    const { netExtraMin, deficitMin } = mExt
    if (netExtraMin > 0) {
      return `⚡ Tienes **${mhm(netExtraMin)}** de horas extra este mes. Llevas **${mhm(monthMin)}** trabajados; todo lo que supera 160h se considera extra.`
    }
    if (deficitMin > 0) {
      return `⚠️ Este mes te faltan **${mhm(deficitMin)}** para llegar a 160h. Llevas **${mhm(monthMin)}** trabajados y todavía no hay horas extra mensuales.`
    }
    return `✅ Este mes llevas **${mhm(monthMin)}** trabajados. ${monthMin >= WM ? '¡Ya has cubierto las 160h objetivo!' : `Te faltan ${mhm(WM - monthMin)} para llegar a 160h.`} Sin horas extra acumuladas todavía.`
  }

  // ¿Quién olvidó fichar? (visión de equipo si eres admin/encargado)
  if (ql.includes('olvid') || ql.includes('quién') || ql.includes('quien') || ql.includes('sin fichar')) {
    if (!canSeeTeam) return '🔒 Solo administradores y responsables de equipo pueden consultar quién no ha fichado. Sí puedo revisar tus propios registros.'
    const todayStr = today()
    const emps = scopedEmployees(db, u)
    // localDateStr(new Date(r.inicio)) (no r.inicio?.startsWith(todayStr)): inicio se
    // guarda en UTC, todayStr es local — un fichaje nocturno no contaba como "hoy".
    const ficharon = new Set((db.records || []).filter(r => r.inicio && localDateStr(new Date(r.inicio)) === todayStr).map(r => r.empId))
    const sinFichar = emps.filter(e => !ficharon.has(e.id))
    if (!sinFichar.length) return `✅ Hoy todo el equipo ha fichado (${emps.length} personas).`
    return `⚠️ Hoy aún no han fichado ${sinFichar.length} de ${emps.length}:\n${sinFichar.slice(0, 8).map(e => `• ${e.name}`).join('\n')}`
  }

  // Resumen semanal
  if (ql.includes('resumen') || (ql.includes('semana') && (ql.includes('cómo') || ql.includes('como') || ql.includes('va')))) {
    const dias = fin.filter(r => new Date(r.inicio) >= ws).length
    const trend = prevWeekMin > 0 ? (weekMin >= prevWeekMin ? '↑' : '↓') : ''
    return `📋 **Resumen de tu semana**\n• Trabajado: ${mhm(weekMin)} ${trend}\n• Jornadas: ${dias} día(s)\n• Media diaria: ${dias ? mhm(Math.round(weekMin / dias)) : '0h'}\n• Objetivo semanal: ${mhm(WK)}`
  }

  // Horas / trabajado
  if (ql.includes('hora') || ql.includes('trabaj')) {
    return `📊 Este mes llevas **${mhm(monthMin)}** trabajados (referencia: ${mhm(WD * 20)}). Esta semana: ${mhm(weekMin)}.`
  }

  // Vacaciones / cuándo cobro
  if (ql.includes('vac') || ql.includes('cobr')) {
    return `🌴 Tienes **${vac.available} días** de vacaciones disponibles (${vac.generated} generados, ${vac.used} usados este año).`
  }

  // Historial
  if (ql.includes('historial') || ql.includes('registro') || ql.includes('último') || ql.includes('ultimo')) {
    const last = fin.slice(-3).reverse()
    if (last.length) return `📋 Tus últimos registros:\n${last.map(r => `• ${r.inicio ? localDateStr(new Date(r.inicio)) : '—'}: ${mhm(calcMin(r))}`).join('\n')}`
    return '📋 Aún no tienes registros completados.'
  }

  if (ql.includes('hola') || ql.includes('puedes') || ql.includes('ayuda')) {
    const teamHelp = canSeeTeam ? '\n• Cumplimiento y estado de obras\n• Quién no ha fichado dentro de tu ámbito' : ''
    return `👋 ¡Hola ${u?.name.split(' ')[0]}! Soy Times AI. Puedo analizar datos reales de TIMES INC:\n• Horas trabajadas y extra\n• Comparar semanas\n• Balance de vacaciones${teamHelp}`
  }

  return '🤖 Puedo ayudarte con tus horas, horas extra, comparar semanas, vacaciones, historial o quién olvidó fichar. ¿Qué necesitas?'
}
