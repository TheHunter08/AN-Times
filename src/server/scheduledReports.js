function madridDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit', weekday:'short',
  }).formatToParts(value)
  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}

const iso = date => date.toISOString().slice(0, 10)
const utcDate = (year, month, day) => new Date(Date.UTC(year, month - 1, day))

export function reportPeriod(frequency, now = new Date()) {
  const p = madridDateParts(now)
  const year = Number(p.year), month = Number(p.month), day = Number(p.day)
  const localToday = utcDate(year, month, day)
  if (frequency === 'weekly') {
    const weekday = localToday.getUTCDay() || 7
    const currentMonday = new Date(localToday)
    currentMonday.setUTCDate(currentMonday.getUTCDate() - weekday + 1)
    const start = new Date(currentMonday)
    start.setUTCDate(start.getUTCDate() - 7)
    const end = new Date(currentMonday)
    end.setUTCDate(end.getUTCDate() - 1)
    return { key:`week_${iso(start)}`, start:iso(start), end:iso(end), label:`${iso(start)} a ${iso(end)}` }
  }
  const end = utcDate(year, month, 0)
  const start = utcDate(end.getUTCFullYear(), end.getUTCMonth() + 1, 1)
  return { key:`month_${iso(start).slice(0, 7)}`, start:iso(start), end:iso(end), label:iso(start).slice(0, 7) }
}

export function isScheduleDue(schedule, now = new Date()) {
  if (!schedule?.enabled) return false
  return schedule.lastRunKey !== reportPeriod(schedule.frequency, now).key
}

function localDateKey(value) {
  const parts = madridDateParts(new Date(value))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function buildScheduledReportRows(db, period) {
  const employees = new Map((db?.employees || []).map(employee => [employee.id, employee]))
  return (db?.records || [])
    .filter(record => record.inicio && record.fin)
    .filter(record => {
      const key = localDateKey(record.inicio)
      return key >= period.start && key <= period.end
    })
    .sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)))
    .map(record => {
      const start = new Date(record.inicio), end = new Date(record.fin)
      const workSecs = Number.isFinite(Number(record.workSecs))
        ? Math.max(0, Number(record.workSecs))
        : Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000) - (Number(record.breakSecs) || 0))
      return {
        date:localDateKey(record.inicio),
        employee:employees.get(record.empId)?.name || record.empName || record.empId,
        start:start.toLocaleTimeString('es-ES', { timeZone:'Europe/Madrid', hour:'2-digit', minute:'2-digit' }),
        end:end.toLocaleTimeString('es-ES', { timeZone:'Europe/Madrid', hour:'2-digit', minute:'2-digit' }),
        hours:Math.round(workSecs / 36) / 100,
        center:record.centro || record.obra || employees.get(record.empId)?.centroTrabajo || '',
        status:record.validado === false ? 'Pendiente' : 'Validado',
      }
    })
}

export function parseReportRecipients(value) {
  return [...new Set(String(value || '').split(/[;,\s]+/).map(item => item.trim().toLowerCase()).filter(item => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(item)))]
}
