import { useState, useMemo } from 'react'
import { today, p2, calcMin, mhm, ftime } from '../../utils/time.js'
import { useRef } from 'react'
import { WD, FESTIVOS_MADRID_2026 } from '../../config/constants.js'
import { PullToRefresh } from './PullToRefresh.jsx'

const colors = {
  bg: { 400: 'var(--bg-card-hover)', 500: 'var(--bg-elevated)', 600: 'var(--bg-card)' },
  primary: {
    base: 'var(--brand-500)', light: 'var(--brand-400)',
    dim: 'color-mix(in srgb, var(--brand-500) 13%, transparent)',
    glow: 'rgba(53, 104, 255, 0.25)',
  },
  semantic: { green: 'var(--success-400)', orange: 'var(--warning-400)', red: 'var(--danger-400)' },
  text: { 900: 'var(--text-primary)', 700: 'var(--text-secondary)', 500: 'var(--text-tertiary)', 300: 'var(--text-disabled)' },
  border: { subtle: 'var(--border-subtle)', default: 'var(--border-default)' },
}

const radius = { sm: 'var(--radius-sm)', md: 'var(--radius-md)', xl: 'var(--radius-xl)', pill: 'var(--radius-pill)' }
const toneSoft = (color, amount = 14) => `color-mix(in srgb, ${color} ${amount}%, transparent)`

const STATUS_COLORS = {
  complete: colors.semantic.green,
  pending:  colors.semantic.orange,
  absence:  colors.semantic.red,
  medical:  'var(--warning-400)',
  vacation: 'var(--brand-400)',
  festivo:  'var(--accent-400)',
  missing:  colors.semantic.red,
  weekend:  colors.text[300],
  future:   colors.text[500],
}

export function TabCalendario({ db, u, calMonth, setCalMonth }) {
  const [selDay, setSelDay] = useState(null)
  const gesture = useRef({ id: null, x: 0, y: 0, t: 0, axis: null, moved: false })
  const calendarRef = useRef(null)

  const y = calMonth.getFullYear(), m = calMonth.getMonth()
  const firstDay = new Date(y, m, 1)
  const lastDay  = new Date(y, m + 1, 0)
  const startDow = (firstDay.getDay() + 6) % 7
  const DAYS_ES  = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(y, m, d))

  const todayStr = today()
  const monthStr = `${y}-${p2(m+1)}`

  const lds = d => `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`

  const workedMap = useMemo(() => {
    const map = {}
    ;(db.records || []).filter(r => r.empId === u.id && r.fin).forEach(r => {
      const ds = lds(new Date(r.inicio))
      if (!ds.startsWith(monthStr)) return
      map[ds] = (map[ds] || 0) + calcMin(r)
    })
    return map
  }, [db.records, u.id, monthStr])

  const vacDays = useMemo(() => new Set(
    (db.vacaciones || []).filter(v => v.empId === u.id && v.estado === 'aprobada').flatMap(v => {
      const days = []
      const s = new Date(v.fechaInicio + 'T00:00:00'), e = new Date(v.fechaFin + 'T00:00:00')
      const d = new Date(s)
      while (d <= e) { days.push(lds(d)); d.setDate(d.getDate()+1) }
      return days
    })
  ), [db.vacaciones, u.id])

  const absDays = useMemo(() => new Set(
    (db.ausencias || []).filter(a => a.empId === u.id).flatMap(a => {
      const days = []
      const s = new Date((a.fechaInicio || a.fecha || '') + 'T00:00:00')
      const e = new Date((a.fechaFin   || a.fechaInicio || a.fecha || '') + 'T00:00:00')
      if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return []
      const d = new Date(s)
      while (d <= e) { days.push(lds(d)); d.setDate(d.getDate()+1) }
      return days
    })
  ), [db.ausencias, u.id])

  const medDays = useMemo(() => new Set(
    (db.medicos || []).filter(a => a.empId === u.id).flatMap(a => {
      const days = []
      const s = new Date((a.fechaInicio || a.fecha || '') + 'T00:00:00')
      const e = new Date((a.fechaFin   || a.fechaInicio || a.fecha || '') + 'T00:00:00')
      if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return []
      const d = new Date(s)
      while (d <= e) { days.push(lds(d)); d.setDate(d.getDate()+1) }
      return days
    })
  ), [db.medicos, u.id])

  const getDayRecs = dateStr =>
    (db.records || []).filter(r => r.empId === u.id && r.inicio && lds(new Date(r.inicio)) === dateStr && r.fin)

  const getDayStatus = (ds, date) => {
    const dow = date.getDay()
    if (dow === 0 || dow === 6) return 'weekend'
    if (vacDays.has(ds)) return 'vacation'
    const usaMadrid = db.config?.usarFestivosMadrid !== false
    const festivoNombre = (db.config?.festivosExtra || {})[ds] || (usaMadrid ? FESTIVOS_MADRID_2026[ds] : undefined)
    if (festivoNombre) return 'festivo'
    if (medDays.has(ds)) return 'medical'
    if (absDays.has(ds)) return 'absence'
    const mins = workedMap[ds] || 0
    const wdEfectivo = db.config?.wdMin || WD
    if (mins >= wdEfectivo * 0.9) return 'complete'
    if (mins > 0) return 'pending'
    if (ds < todayStr) return 'missing'
    return 'future'
  }

  const monthStats = { complete: 0, pending: 0, absence: 0, medical: 0, vacation: 0, missing: 0, festivo: 0 }
  cells.forEach(date => {
    if (!date) return
    const ds = lds(date)
    const st = getDayStatus(ds, date)
    if (st in monthStats) monthStats[st]++
  })

  const getDayStyle = (ds, date, status, isToday, isSelected) => {
    const base = {
      position: 'relative', borderRadius: radius.sm, padding: '6px 4px 5px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', cursor: 'pointer', fontSize: 13, fontWeight: 600, minHeight: 48,
      border: '1px solid transparent', fontFamily: 'inherit',
      transition: 'background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard)',
      userSelect: 'none',
    }
    if (isToday) return { ...base, background: colors.primary.base, color: 'var(--brand-50)', fontWeight: 700, boxShadow: 'var(--shadow-brand)' }
    const colorMap = {
      complete: { background: 'var(--success-soft)', color: colors.semantic.green },
      pending:  { background: 'var(--warning-soft)', color: colors.semantic.orange },
      absence:  { background: 'var(--danger-soft)', color: colors.semantic.red },
      medical:  { background: 'var(--warning-soft)', color: 'var(--warning-400)' },
      vacation: { background: 'var(--info-soft)', color: 'var(--brand-400)' },
      festivo:  { background: toneSoft('var(--accent-400)', 14), color: 'var(--accent-400)' },
      missing:  { background: toneSoft(colors.semantic.red, 6), color: colors.semantic.red, opacity: .62 },
      weekend:  { color: colors.text[300], opacity: .55 },
      future:   { color: colors.text[500] },
    }
    const sStyle = colorMap[status] || {}
    const selStyle = isSelected && !isToday ? { borderColor: 'var(--border-focus)', background: colors.bg[400] } : {}
    return { ...base, ...sStyle, ...selStyle }
  }

  const moveMonth = delta => {
    setSelDay(null)
    setCalMonth(new Date(y, m + delta, 1))
  }

  const onPointerDown = e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), axis: null, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = e => {
    const g = gesture.current
    if (g.id !== e.pointerId) return
    const dx = e.clientX - g.x, dy = e.clientY - g.y
    if (!g.axis && (Math.abs(dx) > 7 || Math.abs(dy) > 7)) g.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'x' : 'y'
    if (g.axis !== 'x') return
    g.moved = true
    calendarRef.current?.style.setProperty('--cal-drag-x', `${Math.max(-90, Math.min(90, dx * .55))}px`)
    calendarRef.current?.classList.add('is-dragging')
    e.preventDefault()
  }
  const onPointerEnd = e => {
    const g = gesture.current
    if (g.id !== e.pointerId) return
    const dx = e.clientX - g.x
    const velocity = Math.abs(dx) / Math.max(1, performance.now() - g.t)
    try { if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    calendarRef.current?.classList.remove('is-dragging')
    calendarRef.current?.style.removeProperty('--cal-drag-x')
    if (g.axis === 'x' && (Math.abs(dx) > 58 || (Math.abs(dx) > 28 && velocity > .5))) {
      try { navigator.vibrate?.(7) } catch {}
      moveMonth(dx < 0 ? 1 : -1)
    }
    gesture.current = { id: null, x: 0, y: 0, t: 0, axis: null, moved: g.moved }
    setTimeout(() => { gesture.current.moved = false }, 0)
  }
  const onPointerCancel = e => {
    try { if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    calendarRef.current?.classList.remove('is-dragging')
    calendarRef.current?.style.removeProperty('--cal-drag-x')
    gesture.current = { id:null, x:0, y:0, t:0, axis:null, moved:false }
  }

  return (
    <PullToRefresh>
      <div ref={calendarRef} data-gesture-scope="local" className="employee-calendar-v2 employee-calendar-v8"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerCancel} onLostPointerCapture={onPointerCancel}
        style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 760, margin: '0 auto', paddingBottom: 'calc(100px + env(safe-area-inset-bottom))' }}>

        {/* Header */}
        <header style={{ display: 'grid', gap: 'var(--space-1)', padding: 'var(--space-2) 2px var(--space-1)' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--font-heading-xl)', fontWeight: 'var(--font-semibold)', color: colors.text[900], letterSpacing: '-.035em', lineHeight: 'var(--leading-heading)' }}>Calendario</h1>
          <p style={{ margin: 0, fontSize: 'var(--font-body-sm)', color: colors.text[500], lineHeight: 'var(--leading-body)' }}>Jornadas, ausencias y vacaciones en una sola vista.</p>
        </header>

        <section className="employee-calendar-v8__monthbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
          <div style={{ fontSize: 'var(--font-heading-sm)', fontWeight: 'var(--font-semibold)', color: colors.text[900], textTransform: 'capitalize', letterSpacing: '-.02em' }}>
            {calMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { label: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>, onClick: () => moveMonth(-1) },
              { label: 'Hoy', onClick: () => setCalMonth(new Date()) },
              { label: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>, onClick: () => moveMonth(1) },
            ].map((btn, i) => (
              <button key={i} onClick={btn.onClick} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minWidth: i === 1 ? 52 : 40, minHeight: 40, padding: '6px 10px', borderRadius: radius.sm,
                background: colors.bg[500], border: `1px solid ${colors.border.default}`,
                color: colors.text[700], fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit',
              }}>{btn.label}</button>
            ))}
          </div>
        </section>

        {/* Month summary chips */}
        {Object.values(monthStats).some(n => n > 0) && (
          <div className="employee-calendar-v8__stats" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { n: monthStats.complete,  label: 'Completos',  color: colors.semantic.green },
              { n: monthStats.pending,   label: 'Parciales',  color: colors.semantic.orange },
              { n: monthStats.absence,   label: 'Ausencias',  color: colors.semantic.red },
                { n: monthStats.medical,   label: 'Baja médica', color: 'var(--warning-400)' },
                { n: monthStats.vacation,  label: 'Vacaciones', color: 'var(--brand-400)' },
                { n: monthStats.festivo,   label: 'Festivos',   color: 'var(--accent-400)' },
              { n: monthStats.missing,   label: 'Sin fichaje', color: colors.semantic.red },
            ].filter(c => c.n > 0).map(c => (
              <div key={c.label} style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px',
                borderRadius: radius.pill, fontSize: 11, fontWeight: 600, color: c.color,
                background: toneSoft(c.color, 10), border: `1px solid ${toneSoft(c.color, 22)}`,
              }}>
                <span>{c.n}</span><span style={{ fontWeight: 500 }}>{c.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Calendar grid */}
        <div className="employee-calendar-v8__grid" style={{
          background: 'var(--gradient-card), var(--bg-card)', border: `1px solid ${colors.border.subtle}`,
          borderRadius: radius.xl, padding: 'var(--space-4) var(--space-3)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
        }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
            {DAYS_ES.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: colors.text[300], textTransform: 'uppercase', letterSpacing: '.5px', padding: '4px 0' }}>{d}</div>
            ))}
          </div>
          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
            {cells.map((date, i) => {
              if (!date) return <div key={i} />
              const ds = lds(date)
              const isToday = ds === todayStr
              const isSelected = selDay === ds
              const status = getDayStatus(ds, date)
              const mins = workedMap[ds] || 0
              const festLabel = (db.config?.festivosExtra || {})[ds] || (db.config?.usarFestivosMadrid !== false ? FESTIVOS_MADRID_2026[ds] : undefined)
              return (
                <button
                  key={i}
                  type="button"
                  style={getDayStyle(ds, date, status, isToday, isSelected)}
                  onClick={() => { if (!gesture.current.moved) setSelDay(selDay === ds ? null : ds) }}
                  title={festLabel || undefined}
                  aria-pressed={isSelected}
                  aria-label={`${date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}: ${status === 'complete' ? 'jornada completa' : status === 'pending' ? 'jornada parcial' : status === 'absence' ? 'ausencia' : status === 'medical' ? 'baja médica' : status === 'vacation' ? 'vacaciones' : status === 'festivo' ? festLabel : status === 'missing' ? 'sin fichaje' : status === 'weekend' ? 'fin de semana' : 'sin actividad'}`}
                >
                  <span>{date.getDate()}</span>
                  {mins > 0 && !isToday && (
                    <span style={{ fontSize: 8, fontWeight: 700, marginTop: 2, opacity: .85 }}>{Math.floor(mins/60)}h</span>
                  )}
                  {['absence', 'medical', 'vacation', 'festivo'].includes(status) && !isToday && (
                    <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', marginTop: 4, background: STATUS_COLORS[status], boxShadow: `0 0 0 2px ${toneSoft(STATUS_COLORS[status], 18)}` }} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '4px 0' }}>
          {[
            [colors.semantic.green,  'Completo'],
            [colors.semantic.orange, 'Parcial'],
            [colors.semantic.red,    'Ausencia'],
            ['var(--warning-400)',    'Baja médica'],
            ['var(--brand-400)',      'Vacaciones'],
            ['var(--accent-400)',     'Festivo'],
          ].map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.text[700] }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: c, flexShrink: 0 }} />{l}
            </div>
          ))}
        </div>

        {/* Day detail */}
        {selDay && (() => {
          const recs = getDayRecs(selDay)
          const totMin = recs.reduce((s, r) => s + calcMin(r), 0)
          const selDate = new Date(selDay + 'T00:00:00')
          const status = getDayStatus(selDay, selDate)
          const festLabel = (db.config?.festivosExtra || {})[selDay] || (db.config?.usarFestivosMadrid !== false ? FESTIVOS_MADRID_2026[selDay] : undefined) || 'Festivo'
          const statusLabels = { complete: 'Jornada completa', pending: 'Jornada incompleta', absence: 'Ausencia', medical: 'Baja médica', vacation: 'Vacaciones', missing: 'Sin fichaje', weekend: 'Fin de semana', festivo: festLabel, future: '' }
          const statusColor = STATUS_COLORS[status] || colors.border.default
          return (
            <div style={{
              background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
              borderLeft: `3px solid ${statusColor}`, borderRadius: radius.xl, padding: '16px 18px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.text[700], textTransform: 'capitalize' }}>
                  {selDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
                {statusLabels[status] && (
                  <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: radius.pill, color: statusColor, background: toneSoft(statusColor, 12), textTransform: 'uppercase', letterSpacing: '.5px' }}>
                    {statusLabels[status]}
                  </div>
                )}
              </div>
              {recs.length ? recs.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${colors.border.subtle}` }}>
                  <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.primary.dim, color: colors.primary.light, flexShrink: 0 }}>
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6"/></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.text[900] }}>{r.centro || 'Trabajo'}</div>
                    <div style={{ fontSize: 11, color: colors.text[500], marginTop: 2 }}>{mhm(calcMin(r))} trabajadas</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: colors.primary.light }}>
                    {ftime(r.inicio)} → {ftime(r.fin)}
                  </div>
                </div>
              )) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: 8 }}>
                  <div style={{ width: 44, height: 44, borderRadius: radius.md, background: colors.bg[400], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={colors.text[500]} strokeWidth="1.5">
                      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: 12, color: colors.text[500] }}>
                    {status === 'absence' ? 'Día de ausencia registrado' : status === 'medical' ? 'Baja médica registrada' : status === 'vacation' ? 'Día de vacaciones' : 'Sin registros este día'}
                  </div>
                </div>
              )}
              {totMin > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: `1px solid ${colors.border.subtle}`, marginTop: 4 }}>
                  <span style={{ fontSize: 13, color: colors.text[500] }}>Total trabajado</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: colors.text[900] }}>{mhm(totMin)}</span>
                </div>
              )}
            </div>
          )
        })()}

      </div>
    </PullToRefresh>
  )
}
