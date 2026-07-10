import { useState, useMemo } from 'react'
import { localDateStr, mhm, calcMin } from '../../utils/time.js'

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function p2(n) { return String(n).padStart(2, '0') }

function isoDate(d) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

function getMondayOf(d) {
  const dt = new Date(d); dt.setHours(0, 0, 0, 0)
  const day = dt.getDay()
  dt.setDate(dt.getDate() - (day === 0 ? 6 : day - 1))
  return dt
}

function addDays(d, n) {
  const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt
}

function getCellData({ empId, dateStr, records, vacaciones, turnos, todayStr, isWeekend }) {
  const dayRecs = records.filter(r => r.empId === empId && typeof r.inicio === 'string' && r.inicio.slice(0, 10) === dateStr)
  const vac = vacaciones.find(v => v.empId === empId && v.estado === 'aprobada' && v.fechaInicio <= dateStr && dateStr <= v.fechaFin)
  const turno = (turnos || []).find(t => t.empId === empId && t.fecha === dateStr)

  if (vac)           return { tipo: 'vac',    label: 'Vac.' }
  if (dayRecs.length) {
    const totalMin = dayRecs.reduce((s, r) => s + calcMin(r), 0)
    const open = dayRecs.some(r => !r.fin)
    return { tipo: open ? 'live' : 'ok', label: mhm(totalMin) }
  }
  if (turno)         return { tipo: 'turno', label: `${turno.horaInicio}–${turno.horaFin}` }
  if (isWeekend)     return { tipo: 'weekend', label: '' }
  if (dateStr > todayStr) return { tipo: 'future', label: '' }
  return { tipo: 'absent', label: 'Ausente' }
}

const CELL_STYLES = {
  ok:      { bg: 'rgba(34,197,94,.14)',    color: 'var(--green)',         icon: '✓' },
  live:    { bg: 'rgba(34,197,94,.3)',     color: 'var(--green)',         icon: '●' },
  vac:     { bg: 'rgba(0,212,255,.14)',    color: 'var(--teal)',          icon: '🌴' },
  turno:   { bg: 'rgba(99,102,241,.14)',   color: 'var(--primary-light)', icon: '📋' },
  absent:  { bg: 'rgba(239,68,68,.12)',    color: 'var(--red)',           icon: '✗' },
  weekend: { bg: 'var(--bg-600)',          color: 'var(--text4)',         icon: '' },
  future:  { bg: 'transparent',           color: 'var(--text4)',         icon: '' },
}

export default function PanelPlanning({ db, toast }) {
  const [weekOffset, setWeekOffset] = useState(0)

  const todayStr = localDateStr(new Date())

  const monday = useMemo(() => {
    const base = getMondayOf(new Date())
    return addDays(base, weekOffset * 7)
  }, [weekOffset])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i)
    return { date: d, dateStr: isoDate(d), dayName: DAY_NAMES[i], isWeekend: i >= 5 }
  }), [monday])

  const emps = useMemo(() =>
    (db.employees || []).filter(e => !e.baja && !e.isAdmin).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
  , [db.employees])

  const records    = db.records    || []
  const vacaciones = db.vacaciones || []
  const turnos     = db.turnos     || []

  const weekLabel = useMemo(() => {
    const from = days[0].date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    const to   = days[6].date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    return `${from} – ${to}`
  }, [days])

  // Summary stats per day
  const daySummary = useMemo(() => days.map(({ dateStr, isWeekend }) => {
    if (isWeekend) return { worked: 0, absent: 0, vac: 0 }
    let worked = 0, absent = 0, vac = 0
    for (const emp of emps) {
      const cell = getCellData({ empId: emp.id, dateStr, records, vacaciones, turnos, todayStr, isWeekend })
      if (cell.tipo === 'ok' || cell.tipo === 'live') worked++
      else if (cell.tipo === 'vac') vac++
      else if (cell.tipo === 'absent') absent++
    }
    return { worked, absent, vac }
  }), [days, emps, records, vacaciones, turnos, todayStr])

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Planning semanal</h1>
          <div className="adm-panel-sub" style={{ marginTop: 2 }}>{weekLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setWeekOffset(0)}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, background: weekOffset === 0 ? 'var(--primary-dim)' : 'var(--bg-400)', color: weekOffset === 0 ? 'var(--primary-light)' : 'var(--text3)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            Hoy
          </button>
          <button onClick={() => setWeekOffset(v => v - 1)}
            style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg-400)', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ‹
          </button>
          <button onClick={() => setWeekOffset(v => v + 1)}
            style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg-400)', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ›
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { tipo: 'ok',     label: 'Trabajó' },
          { tipo: 'live',   label: 'Activo' },
          { tipo: 'vac',    label: 'Vacaciones' },
          { tipo: 'turno',  label: 'Turno asignado' },
          { tipo: 'absent', label: 'Ausente' },
        ].map(({ tipo, label }) => {
          const s = CELL_STYLES[tipo]
          return (
            <div key={tipo} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text3)' }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: s.bg, border: `1px solid ${s.color}44` }} />
              {label}
            </div>
          )
        })}
      </div>

      {!emps.length ? (
        <div className="empty-premium" style={{ padding: '40px 0' }}>
          <div className="empty-premium-icon"><svg viewBox="0 0 24 24" style={{ width: 22, height: 22 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
          <div style={{ fontSize: 13, color: 'var(--text4)' }}>Sin empleados activos</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', background: 'var(--bg-600)', borderRadius: '8px 0 0 0', width: 140, borderBottom: '1px solid var(--border)' }}>
                  Empleado
                </th>
                {days.map(({ dateStr, dayName, date, isWeekend }, i) => {
                  const isToday = dateStr === todayStr
                  const summ = daySummary[i]
                  return (
                    <th key={dateStr} style={{ padding: '6px 4px', textAlign: 'center', background: isToday ? 'var(--primary-dim)' : 'var(--bg-600)', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', minWidth: 80 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: isToday ? 'var(--primary-light)' : isWeekend ? 'var(--text4)' : 'var(--text2)' }}>
                        {dayName}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: isToday ? 'var(--primary-light)' : isWeekend ? 'var(--text4)' : 'var(--text1)' }}>
                        {date.getDate()}
                      </div>
                      {!isWeekend && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginTop: 2 }}>
                          {summ.worked > 0 && <span style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700 }}>{summ.worked}✓</span>}
                          {summ.absent > 0 && <span style={{ fontSize: 9, color: 'var(--red)',   fontWeight: 700 }}>{summ.absent}✗</span>}
                          {summ.vac    > 0 && <span style={{ fontSize: 9, color: 'var(--teal)',  fontWeight: 700 }}>{summ.vac}🌴</span>}
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {emps.map((emp, ei) => (
                <tr key={emp.id} style={{ background: ei % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)' }}>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: emp.color || 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {(emp.initials || emp.name?.slice(0, 2) || '?').toUpperCase()}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name}</span>
                    </div>
                  </td>
                  {days.map(({ dateStr, isWeekend }) => {
                    const cell = getCellData({ empId: emp.id, dateStr, records, vacaciones, turnos, todayStr, isWeekend })
                    const s = CELL_STYLES[cell.tipo]
                    return (
                      <td key={dateStr} style={{ padding: '6px 4px', textAlign: 'center', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', background: s.bg }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: s.color }}>
                          {s.icon && <span style={{ marginRight: cell.label ? 2 : 0 }}>{s.icon}</span>}
                          {cell.label && <span style={{ fontSize: 9, fontWeight: 600 }}>{cell.label}</span>}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Weekly totals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 20 }}>
        {[
          { label: 'Trabajaron esta semana', val: daySummary.reduce((s, d) => s + d.worked, 0), color: 'var(--green)', bg: 'var(--green-dim)' },
          { label: 'Ausencias esta semana',  val: daySummary.reduce((s, d) => s + d.absent, 0), color: 'var(--red)',   bg: 'rgba(239,68,68,.1)' },
          { label: 'Vacaciones esta semana', val: daySummary.reduce((s, d) => s + d.vac, 0),    color: 'var(--teal)',  bg: 'rgba(0,212,255,.1)' },
        ].map(({ label, val, color, bg }) => (
          <div key={label} style={{ background: bg, borderRadius: 'var(--r)', padding: '12px 16px', border: `1px solid ${color}22` }}>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
