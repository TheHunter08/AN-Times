export const p2 = n => String(n).padStart(2, '0')

export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`
}

export const mhm = m => `${Math.floor(m/60)}h ${p2(m%60)}m`
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
  let elapsed = Math.floor((e - s) / 1000), brk = 0
  ;(o.breaks || []).forEach(b => {
    if (b.start && b.end) brk += Math.floor((new Date(b.end) - new Date(b.start)) / 1000)
  })
  if (o.enDescanso && o.bStartTs) brk += Math.floor((Date.now() - new Date(o.bStartTs).getTime()) / 1000)
  return { work: Math.max(0, elapsed - brk), brk }
}

export const calcMin = r => {
  if (!r || !r.fin) return 0
  if (r.workSecs > 0) return Math.floor(r.workSecs / 60)
  return Math.floor(calcSecs(r).work / 60)
}

export const gid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

export const vacData = (empId, db) => {
  const VPM = 2.5
  const emp = (db.employees || []).find(e => e.id === empId)
  if (!emp) return { months: 0, generated: 0, used: 0, pending: 0, available: 0 }
  const sd = emp.startDate ? new Date(emp.startDate) : new Date()
  const n = new Date()
  let m = (n.getFullYear() - sd.getFullYear()) * 12 + (n.getMonth() - sd.getMonth())
  if (n.getDate() < sd.getDate()) m--
  m = Math.max(0, m)
  const gen = parseFloat((m * VPM).toFixed(1))
  const used = (db.vacaciones || []).filter(v => v.empId === empId && v.estado === 'aprobada').reduce((s, v) => s + v.dias, 0)
  const pend = (db.vacaciones || []).filter(v => v.empId === empId && v.estado === 'pendiente').reduce((s, v) => s + v.dias, 0)
  return { months: m, generated: gen, used, pending: pend, available: Math.max(0, parseFloat((gen - used).toFixed(1))) }
}

export const recWorkSecs = r => {
  if (!r) return 0
  if (r.workSecs && r.workSecs > 0) return r.workSecs
  if (r.fin) return Math.max(0, calcSecs(r).work)
  return 0
}

export const sortedEmps = db =>
  (db.employees || []).filter(e => !e.isAdmin).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
