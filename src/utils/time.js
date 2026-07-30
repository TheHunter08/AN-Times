import { WK } from '../config/workRules.js'
import { workWeekStartsInMonth } from './workTargets.js'

export const p2 = n => String(n).padStart(2, '0')

// Fecha LOCAL de un Date como "YYYY-MM-DD" — NO usar d.toISOString().slice(0,10)
// para esto: toISOString() convierte a UTC antes de formatear, así que una
// medianoche local (p.ej. wkStart(), que fija setHours(0,0,0,0) en hora local)
// cae en el día UTC anterior en España — desplaza cualquier "inicio de semana"
// o "hoy" calculado así un día entero hacia atrás, contaminando el cómputo de
// horas semanales/extra con el domingo anterior.
export const localDateStr = d => `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`

export const today = () => localDateStr(new Date())

export const localMonthKey = value => {
  const d = value instanceof Date ? value : new Date(value)
  return isNaN(d.getTime()) ? '' : localDateStr(d).slice(0, 7)
}

export const mhm = m => { m = Math.max(0, Math.floor(m || 0)); return `${Math.floor(m/60)}h ${p2(m%60)}m` }
export const s2t = s => `${p2(Math.floor(s/3600))}:${p2(Math.floor((s%3600)/60))}:${p2(s%60)}`

export const ftime = iso => {
  if (!iso) return '—'
  try { const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}` }
  catch { return '—' }
}

export const ftimeInput = iso => {
  if (!iso) return ''
  try { const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}` }
  catch { return '' }
}

// Convierte un ISO en UTC (como los que genera new Date().toISOString(), que es
// como se guardan inicio/fin en records) al formato local que espera
// <input type="datetime-local">. NO usar iso.slice(0,16): eso recorta la hora
// en UTC tal cual y el input la muestra como si fuera hora local — un
// desfase igual al huso horario (1-2h en España). Sin este helper, abrir el
// modal de "Modificar jornada" y guardar sin tocar nada desplazaba el
// fichaje real del empleado esas mismas horas.
export const toDatetimeLocal = iso => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
  } catch { return '' }
}

export const fdate = iso => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) }
  catch { return '—' }
}

export const fds = iso => {
  if (!iso) return '—'
  try {
    const d = iso.length <= 10 ? new Date(iso + 'T00:00:00') : new Date(iso)
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  catch { return iso }
}

export const wkStart = d => {
  const dt = new Date(d), day = dt.getDay(), diff = day === 0 ? -6 : 1 - day
  dt.setDate(dt.getDate() + diff)
  dt.setHours(0, 0, 0, 0)
  return dt
}

export const calcSecs = o => {
  if (!o) return { work: 0, brk: 0 }
  const s = new Date(o.inicio).getTime()
  const e = o.fin ? new Date(o.fin).getTime() : Date.now()
  if (isNaN(s) || isNaN(e) || e < s) return { work: 0, brk: 0 }
  const elapsed = Math.max(0, Math.floor((e - s) / 1000))
  const breakRanges = []
  ;(o.breaks || []).forEach(b => {
    if (b.start && b.end) {
      const bs = new Date(b.start).getTime(), be = new Date(b.end).getTime()
      if (!isNaN(bs) && !isNaN(be) && be > bs) {
        const clippedStart = Math.max(bs, s), clippedEnd = Math.min(be, e)
        if (clippedEnd > clippedStart) breakRanges.push([clippedStart, clippedEnd])
      }
    }
  })
  // Un registro cerrado puede conservar flags antiguos de descanso. Solo la
  // pausa activa de un fichaje abierto debe crecer hasta el momento actual.
  if (!o.fin && o.enDescanso && o.bStartTs) {
    const bStartMs = new Date(o.bStartTs).getTime()
    const clippedStart = Math.max(bStartMs, s)
    if (!isNaN(bStartMs) && clippedStart < e) breakRanges.push([clippedStart, e])
  }
  // Fusionar pausas solapadas evita descontar dos veces el mismo intervalo.
  breakRanges.sort((a, b) => a[0] - b[0])
  let brkMs = 0, rangeEnd = -Infinity
  breakRanges.forEach(([start, end]) => {
    if (start >= rangeEnd) brkMs += end - start
    else if (end > rangeEnd) brkMs += end - rangeEnd
    rangeEnd = Math.max(rangeEnd, end)
  })
  // Los snapshots históricos de cierres guardaban breakSecs pero no el array
  // de pausas. Mantener ese valor como respaldo evita inflar sus PDF.
  const cachedBreak = !Array.isArray(o.breaks) && Number(o.breakSecs) > 0
    ? Math.min(elapsed, Math.floor(Number(o.breakSecs)))
    : 0
  const brk = Math.max(0, breakRanges.length ? Math.floor(brkMs / 1000) : cachedBreak)
  return { work: Math.max(0, elapsed - brk), brk: Math.max(0, brk) }
}

export const calcMin = r => {
  if (!r || !r.fin) return 0
  const start = new Date(r.inicio).getTime(), end = new Date(r.fin).getTime()
  if (!isNaN(start) && !isNaN(end) && end >= start) return Math.floor(calcSecs(r).work / 60)
  return r.workSecs > 0 ? Math.floor(r.workSecs / 60) : 0
}

export const gid = () => {
  const arr = new Uint32Array(2)
  ;(typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto : { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.random() * 0xFFFFFFFF | 0; return a } }).getRandomValues(arr)
  return arr[0].toString(36).padStart(7,'0') + arr[1].toString(36).padStart(7,'0')
}

export const vacData = (empId, db) => {
  const emp = (db.employees || []).find(e => e.id === empId)
  if (!emp) return { months: 0, generated: 0, used: 0, pending: 0, available: 0, extra: 0 }
  // Días/mes: 2.5 para jornada completa (30 días/año). Ajuste proporcional para jornadas parciales.
  const jornadaH = emp.jornadaHoras || emp.weeklyHours || 40
  const VPM = parseFloat(((30 / 12) * Math.min(jornadaH, 40) / 40).toFixed(4))
  const sd = new Date(emp.fechaInicioContrato || emp.startDate || emp.fechaAlta || today())
  const n = new Date()
  let m = (n.getFullYear() - sd.getFullYear()) * 12 + (n.getMonth() - sd.getMonth())
  const sdDay = sd.getDate()
  const lastDayOfMonth = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()
  if (sdDay <= lastDayOfMonth && n.getDate() < sdDay) m--
  m = Math.max(0, m)
  const extra = emp.vacacionesExtra || 0
  const gen = parseFloat((m * VPM + extra).toFixed(1))
  const countDays = v => {
    if (v.fechaInicio && v.fechaFin) {
      const s = new Date(v.fechaInicio + 'T00:00:00'), e = new Date(v.fechaFin + 'T00:00:00')
      if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return v.dias || 0
      return Math.round((e - s) / 86400000) + 1
    }
    return v.dias || 0
  }
  const used = (db.vacaciones || []).filter(v => v.empId === empId && v.estado === 'aprobada').reduce((s, v) => s + countDays(v), 0)
  const pend = (db.vacaciones || []).filter(v => v.empId === empId && v.estado === 'pendiente').reduce((s, v) => s + countDays(v), 0)
  return { months: m, generated: gen, used, pending: pend, available: Math.max(0, parseFloat((gen - used - pend).toFixed(1))), extra }
}

export const recWorkSecs = r => {
  if (!r) return 0
  const start = new Date(r.inicio).getTime(), end = new Date(r.fin).getTime()
  // inicio/fin son la fuente de verdad. workSecs es una caché que puede quedar
  // obsoleta tras una corrección y solo sirve como respaldo para datos legacy.
  if (r.fin && !isNaN(start) && !isNaN(end) && end >= start) return Math.max(0, calcSecs(r).work)
  if (r.workSecs && r.workSecs > 0) return r.workSecs
  return 0
}

export const sortedEmps = db =>
  (db.employees || []).filter(e => !e.isAdmin).sort((a, b) => (a.name||'').localeCompare(b.name||'', 'es', { sensitivity: 'base' }))

// ── Balance semanal del periodo (regla TIMES INC) ─────────────────────────────
// • Cada semana laboral va de lunes a viernes y exige 40h.
// • Cada semana se liquida por separado: >40h es extra; <40h es déficit.
// • Una semana larga nunca compensa el déficit de otra semana.
// • El periodo agrupa las semanas cuyo lunes pertenece al mes seleccionado.
// • La semana en curso no genera déficit hasta que termina el viernes.
//
// Se conserva el nombre monthlyExtras por compatibilidad con sus consumidores.
export const monthlyExtras = (records, empId, monthKey, opts = {}) => {
  const weeklyTarget = Math.max(1, opts.weeklyH ? opts.weeklyH * 60 : WK)
  const now = opts.now instanceof Date ? opts.now : new Date()
  const todayKey = localDateStr(now)
  const weekStarts = workWeekStartsInMonth(monthKey)
  const byWeek = new Map(weekStarts.map(start => [start, 0]))

  for (const record of records || []) {
    if (!record || record.empId !== empId || !record.fin || !record.inicio) continue
    const date = new Date(record.inicio)
    if (Number.isNaN(date.getTime())) continue
    const weekday = date.getDay()
    if (weekday < 1 || weekday > 5) continue
    const startKey = localDateStr(wkStart(date))
    if (byWeek.has(startKey)) byWeek.set(startKey, byWeek.get(startKey) + calcMin(record))
  }

  let workedMin = 0
  let targetMin = 0
  let weeklyExtraMin = 0
  let deficitMin = 0
  let completedWeeks = 0
  const weekly = weekStarts.map(start => {
    const monday = new Date(`${start}T00:00:00`)
    const friday = new Date(monday)
    friday.setDate(monday.getDate() + 4)
    const fridayKey = localDateStr(friday)
    const minutes = byWeek.get(start) || 0
    const completed = fridayKey < todayKey
    const extraMin = Math.max(0, minutes - weeklyTarget)
    const weekDeficitMin = completed ? Math.max(0, weeklyTarget - minutes) : 0
    workedMin += minutes
    weeklyExtraMin += extraMin
    deficitMin += weekDeficitMin
    if (completed) {
      completedWeeks++
      targetMin += weeklyTarget
    }
    return { start, end:fridayKey, minutes, targetMin:weeklyTarget, extraMin, deficitMin:weekDeficitMin, completed }
  })

  return {
    workedMin,
    targetMin,
    scheduledTargetMin:weekStarts.length * weeklyTarget,
    completedWeeks,
    weeklyExtraMin,
    shortfallMin:deficitMin,
    netExtraMin:weeklyExtraMin,
    deficitMin,
    balanceMin:weeklyExtraMin - deficitMin,
    weekly,
  }
}
