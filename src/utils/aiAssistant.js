import { p2, wkStart, calcMin, monthlyExtras, vacData, today, mhm } from './time.js'
import { WD, WK } from '../config/constants.js'

export const AI_CHIPS = [
  '¿Por qué trabajé menos esta semana?',
  '¿Cuántas horas extra tengo?',
  '¿Quién olvidó fichar?',
  'Resumen semanal',
  '¿Cuándo cobro vacaciones?',
]

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
  const monthMin = fin.filter(r => r.inicio?.startsWith(mk)).reduce((s, r) => s + calcMin(r), 0)
  const mExt = monthlyExtras(db.records, u.id, mk)
  const vac = vacData(u.id, db)
  const todayStr = today()
  const emps = (db.employees || []).filter(e => !e.baja)
  const ficharonHoy = new Set((db.records || []).filter(r => r.inicio?.startsWith(todayStr)).map(r => r.empId))
  const sinFichar = emps.filter(e => !ficharonHoy.has(e.id)).map(e => e.name)
  return [
    `Empleado: ${u.name}`,
    `Horas trabajadas esta semana: ${mhm(weekMin)} (objetivo ${mhm(WK)})`,
    `Horas trabajadas este mes: ${mhm(monthMin)}`,
    `Horas extra netas este mes: ${mhm(mExt.netExtraMin || 0)}`,
    mExt.deficitMin > 0 ? `Déficit este mes: ${mhm(mExt.deficitMin)}` : null,
    `Vacaciones disponibles: ${vac.available} días (${vac.generated} generados, ${vac.used} usados)`,
    (u.role === 'encargado' || u.role === 'jefe_obra' || u.isAdmin)
      ? (sinFichar.length ? `Empleados sin fichar hoy: ${sinFichar.join(', ')}` : 'Todo el equipo ha fichado hoy')
      : null,
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

  const monthMin = fin.filter(r => r.inicio?.startsWith(mk)).reduce((s, r) => s + calcMin(r), 0)
  // Regla TIMES INC: extras = semanas >40h, descontando déficit hasta 160h/mes
  const mExt = u ? monthlyExtras(db.records, u.id, mk) : { netExtraMin: 0, deficitMin: 0, weeklyExtraMin: 0, shortfallMin: 0, workedMin: 0 }
  const vac = u ? vacData(u.id, db) : { available: 0, generated: 0, used: 0 }

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
    const { netExtraMin, deficitMin, weeklyExtraMin, shortfallMin } = mExt
    if (netExtraMin > 0) {
      const comp = shortfallMin > 0
        ? ` (${mhm(weeklyExtraMin)} semanales − ${mhm(shortfallMin)} de déficit mensual)`
        : ''
      return `⚡ Tienes **${mhm(netExtraMin)}** de horas extra netas este mes${comp}. Llevas **${mhm(monthMin)}** trabajados sobre el objetivo de 160h.`
    }
    if (deficitMin > 0) {
      return `⚠️ Este mes tienes un déficit de **${mhm(deficitMin)}** para llegar a 160h. Llevas **${mhm(monthMin)}** trabajados.${weeklyExtraMin > 0 ? ` Las ${mhm(weeklyExtraMin)} extra semanales ya se usaron para compensar.` : ''}`
    }
    return `✅ Este mes llevas **${mhm(monthMin)}** trabajados. ${monthMin >= 9600 ? '¡Ya has cubierto las 160h objetivo!' : `Te faltan ${mhm(9600 - monthMin)} para llegar a 160h.`} Sin horas extra acumuladas todavía.`
  }

  // ¿Quién olvidó fichar? (visión de equipo si eres admin/encargado)
  if (ql.includes('olvid') || ql.includes('quién') || ql.includes('quien') || ql.includes('sin fichar')) {
    const todayStr = today()
    const emps = (db.employees || []).filter(e => !e.baja)
    const ficharon = new Set((db.records || []).filter(r => r.inicio?.startsWith(todayStr)).map(r => r.empId))
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
    if (last.length) return `📋 Tus últimos registros:\n${last.map(r => `• ${r.inicio?.slice(0, 10) || '—'}: ${mhm(calcMin(r))}`).join('\n')}`
    return '📋 Aún no tienes registros completados.'
  }

  if (ql.includes('hola') || ql.includes('puedes') || ql.includes('ayuda')) {
    return `👋 ¡Hola ${u?.name.split(' ')[0]}! Soy Times AI. Puedo analizar tu jornada en tiempo real:\n• Horas trabajadas y extra\n• Comparar semanas\n• Balance de vacaciones\n• Quién olvidó fichar hoy`
  }

  return '🤖 Puedo ayudarte con tus horas, horas extra, comparar semanas, vacaciones, historial o quién olvidó fichar. ¿Qué necesitas?'
}
