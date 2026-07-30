import { localDateStr, mhm, monthlyExtras } from './time.js'
import { workBalanceOptions } from './workBalance.js'

export function completedWeeklySummary(db, employee, now = new Date()) {
  if (now.getDay() !== 6) return null
  const monday = new Date(now)
  monday.setHours(12, 0, 0, 0)
  monday.setDate(now.getDate() - 5)
  const weekStart = localDateStr(monday)
  const balance = monthlyExtras(
    db.records || [],
    employee.id,
    weekStart.slice(0, 7),
    workBalanceOptions(db, employee, { now }),
  )
  const week = balance.weekly.find(item => item.start === weekStart)
  if (!week?.completed) return null

  const justified = (week.justifiedMin || 0) + (week.nonContractMin || 0)
  return {
    ...week,
    justified,
    balanceMin: week.extraMin - week.deficitMin,
    employeeKey: `an_weekly_${employee.id}_${week.start}`,
  }
}

export function employeeWeeklySummaryBody(employee, summary) {
  const name = String(employee?.name || '').split(' ')[0] || 'Hola'
  const result = summary.deficitMin > 0
    ? `Déficit: -${mhm(summary.deficitMin)}.`
    : summary.extraMin > 0
      ? `Horas extra: +${mhm(summary.extraMin)}.`
      : 'Objetivo semanal cumplido.'
  const excused = summary.justified > 0 ? ` Justificadas/no exigibles: ${mhm(summary.justified)}.` : ''
  return `${name}, trabajadas: ${mhm(summary.minutes)}; exigibles: ${mhm(summary.targetMin)}.${excused} ${result}`
}

export function adminWeeklyDeficitBody(employee, summary) {
  const reasons = [...new Set((summary.justifiedDays || []).map(item => item.reason).filter(Boolean))]
  const context = reasons.length
    ? ` Justificaciones registradas: ${reasons.join(', ')} (${mhm(summary.justified)}).`
    : ' Sin justificación registrada para el déficit.'
  return `${employee.name}: -${mhm(summary.deficitMin)} en la semana ${summary.start}–${summary.end}; trabajadas ${mhm(summary.minutes)} de ${mhm(summary.targetMin)} exigibles.${context}`
}
