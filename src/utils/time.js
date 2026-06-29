export const p2 = n => String(n).padStart(2, '0')

export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`
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
  let elapsed = Math.max(0, Math.floor((e - s) / 1000)), brk = 0
  ;(o.breaks || []).forEach(b => {
    if (b.start && b.end) {
      const bs = new Date(b.start).getTime(), be = new Date(b.end).getTime()
      if (!isNaN(bs) && !isNaN(be) && be > bs) brk += Math.floor((be - bs) / 1000)
    }
  })
  if (o.enDescanso && o.bStartTs) {
    const bStartMs = new Date(o.bStartTs).getTime()
    if (!isNaN(bStartMs) && bStartMs > 0 && bStartMs <= Date.now()) {
      brk += Math.max(0, Math.floor((Date.now() - bStartMs) / 1000))
    }
  }
  return { work: Math.max(0, elapsed - brk), brk: Math.max(0, brk) }
}

export const calcMin = r => {
  if (!r || !r.fin) return 0
  if (r.workSecs > 0) return Math.floor(r.workSecs / 60)
  return Math.floor(calcSecs(r).work / 60)
}

export const gid = () => {
  const arr = new Uint32Array(2)
  ;(typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto : { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.random() * 0xFFFFFFFF | 0; return a } }).getRandomValues(arr)
  return arr[0].toString(36).padStart(7,'0') + arr[1].toString(36).padStart(7,'0')
}

export const vacData = (empId, db) => {
  const emp = (db.employees || []).find(e => e.id === empId)
  if (!emp) return { months: 0, generated: 0, used: 0, pending: 0, available: 0 }
  // Días/mes: 2.5 para jornada completa (30 días/año). Ajuste proporcional para jornadas parciales.
  const jornadaH = emp.jornadaHoras || emp.weeklyHours || 40
  const VPM = parseFloat(((30 / 12) * Math.min(jornadaH, 40) / 40).toFixed(4))
  const sd = new Date(emp.startDate || emp.fechaAlta || new Date().toISOString().slice(0, 10))
  const n = new Date()
  let m = (n.getFullYear() - sd.getFullYear()) * 12 + (n.getMonth() - sd.getMonth())
  if (n.getDate() < sd.getDate()) m--
  m = Math.max(0, m)
  const gen = parseFloat((m * VPM).toFixed(1))
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
  return { months: m, generated: gen, used, pending: pend, available: Math.max(0, parseFloat((gen - used - pend).toFixed(1))) }
}

export const recWorkSecs = r => {
  if (!r) return 0
  if (r.workSecs && r.workSecs > 0) return r.workSecs
  if (r.fin) return Math.max(0, calcSecs(r).work)
  return 0
}

export const sortedEmps = db =>
  (db.employees || []).filter(e => !e.isAdmin).sort((a, b) => (a.name||'').localeCompare(b.name||'', 'es', { sensitivity: 'base' }))

// ── Horas extra del mes (regla TIMES INC) ─────────────────────────────────────
// • Las extras se acumulan por semana: cualquier minuto por encima de 40h/sem
//   (o `weeklyH`/sem si el empleado tiene jornada parcial) cuenta como extra.
// • El mes tiene un objetivo de 160h (o `monthlyH`).
// • Si al final del mes el total trabajado no llega al objetivo, el déficit se
//   resta primero del banco de extras semanales. Solo si las extras no cubren
//   el déficit aparece como "Déficit" real en el informe.
//
// Devuelve: { workedMin, weeklyExtraMin, shortfallMin, netExtraMin, deficitMin }
//   workedMin       — total minutos trabajados ese mes
//   weeklyExtraMin  — suma de minutos por encima de 40h en cada semana
//   shortfallMin    — minutos que faltan para el objetivo mensual (0 si llega)
//   netExtraMin     — extras finales tras compensar déficit (≥0)
//   deficitMin      — déficit real tras agotar el banco de extras (≥0)
export const monthlyExtras = (records, empId, monthKey, opts = {}) => {
  const weeklyH  = Math.max(1, opts.weeklyH  || 40)
  const monthlyH = Math.max(1, opts.monthlyH || 160)
  const weeklyTarget  = weeklyH  * 60
  const monthlyTarget = monthlyH * 60

  const recs = (records || []).filter(r =>
    r && r.empId === empId && r.fin && typeof r.inicio === 'string' && r.inicio.startsWith(monthKey)
  )

  // Agrupar por semana ISO (lunes como inicio — wkStart ya gestiona domingos)
  const byWeek = new Map()
  for (const r of recs) {
    const ws = wkStart(r.inicio).toISOString().slice(0, 10)
    byWeek.set(ws, (byWeek.get(ws) || 0) + calcMin(r))
  }

  let workedMin = 0
  let weeklyExtraMin = 0
  for (const wkMin of byWeek.values()) {
    workedMin += wkMin
    if (wkMin > weeklyTarget) weeklyExtraMin += wkMin - weeklyTarget
  }

  const shortfallMin = Math.max(0, monthlyTarget - workedMin)
  const netExtraMin  = Math.max(0, weeklyExtraMin - shortfallMin)
  const deficitMin   = Math.max(0, shortfallMin - weeklyExtraMin)

  return { workedMin, weeklyExtraMin, shortfallMin, netExtraMin, deficitMin }
}
