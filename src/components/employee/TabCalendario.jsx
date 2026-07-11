import { useState, useMemo } from 'react'
import { today, p2, calcMin, mhm, ftime } from '../../utils/time.js'
import { WD, FESTIVOS_MADRID_2026 } from '../../config/constants.js'
import { PullToRefresh } from './PullToRefresh.jsx'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

const STATUS_COLORS = {
  complete: colors.semantic.green,
  pending:  colors.semantic.orange,
  absence:  colors.semantic.red,
  medical:  '#F59E0B',
  vacation: '#3B82F6',
  festivo:  '#E879F9',
  missing:  colors.semantic.red,
  weekend:  colors.text[300],
  future:   colors.text[500],
}

export function TabCalendario({ db, u, calMonth, setCalMonth }) {
  const [selDay, setSelDay] = useState(null)

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
      position: 'relative', borderRadius: radius.sm, padding: '6px 4px 4px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      cursor: 'pointer', fontSize: 13, fontWeight: 600, minHeight: 44,
      transition: 'all 0.12s ease', userSelect: 'none',
    }
    if (isToday) return { ...base, background: colors.primary.base, color: '#fff', fontWeight: 800, boxShadow: `0 2px 10px ${colors.primary.glow}` }
    const colorMap = {
      complete: { background: `${colors.semantic.green}20`, color: colors.semantic.green },
      pending:  { background: `${colors.semantic.orange}18`, color: colors.semantic.orange },
      absence:  { background: `${colors.semantic.red}18`, color: colors.semantic.red },
      medical:  { background: 'rgba(245,158,11,.15)', color: '#F59E0B' },
      vacation: { background: 'rgba(59,130,246,.15)', color: '#3B82F6' },
      festivo:  { background: 'rgba(232,121,249,.15)', color: '#E879F9' },
      missing:  { background: `${colors.semantic.red}08`, color: colors.semantic.red, opacity: .45 },
      weekend:  { color: colors.text[300], opacity: .55 },
      future:   { color: colors.text[500] },
    }
    const sStyle = colorMap[status] || {}
    const selStyle = isSelected ? { outline: `2px solid ${colors.primary.base}`, outlineOffset: '-2px' } : {}
    return { ...base, ...sStyle, ...selStyle }
  }

  return (
    <PullToRefresh>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 460, margin: '0 auto', paddingBottom: 100 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: colors.text[900], textTransform: 'capitalize', letterSpacing: '-.5px' }}>
            {calMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { label: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>, onClick: () => setCalMonth(new Date(y, m-1, 1)) },
              { label: 'Hoy', onClick: () => setCalMonth(new Date()) },
              { label: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>, onClick: () => setCalMonth(new Date(y, m+1, 1)) },
            ].map((btn, i) => (
              <button key={i} onClick={btn.onClick} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '6px 10px', borderRadius: radius.sm,
                background: colors.bg[500], border: `1px solid ${colors.border.default}`,
                color: colors.text[700], fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', minWidth: 32,
              }}>{btn.label}</button>
            ))}
          </div>
        </div>

        {/* Month summary chips */}
        {Object.values(monthStats).some(n => n > 0) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { n: monthStats.complete,  label: 'Completos',  color: colors.semantic.green },
              { n: monthStats.pending,   label: 'Parciales',  color: colors.semantic.orange },
              { n: monthStats.absence,   label: 'Ausencias',  color: colors.semantic.red },
              { n: monthStats.medical,   label: 'Baja médica', color: '#F59E0B' },
              { n: monthStats.vacation,  label: 'Vacaciones', color: '#3B82F6' },
              { n: monthStats.festivo,   label: 'Festivos',   color: '#E879F9' },
              { n: monthStats.missing,   label: 'Sin fichaje', color: colors.semantic.red },
            ].filter(c => c.n > 0).map(c => (
              <div key={c.label} style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px',
                borderRadius: 20, fontSize: 11, fontWeight: 700, color: c.color,
                background: `${c.color}15`, border: `1px solid ${c.color}22`,
              }}>
                <span>{c.n}</span><span style={{ fontWeight: 500 }}>{c.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Calendar grid */}
        <div style={{
          background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
          borderRadius: radius.xl, padding: '14px 12px', overflow: 'hidden',
        }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
            {DAYS_ES.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: colors.text[300], textTransform: 'uppercase', letterSpacing: '.5px', padding: '4px 0' }}>{d}</div>
            ))}
          </div>
          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
            {cells.map((date, i) => {
              if (!date) return <div key={i} />
              const ds = lds(date)
              const isToday = ds === todayStr
              const isSelected = selDay === ds
              const status = getDayStatus(ds, date)
              const mins = workedMap[ds] || 0
              const festLabel = (db.config?.festivosExtra || {})[ds] || (db.config?.usarFestivosMadrid !== false ? FESTIVOS_MADRID_2026[ds] : undefined)
              return (
                <div key={i} style={getDayStyle(ds, date, status, isToday, isSelected)} onClick={() => setSelDay(selDay === ds ? null : ds)} title={festLabel || undefined}>
                  <span>{date.getDate()}</span>
                  {mins > 0 && !isToday && (
                    <span style={{ fontSize: 8, fontWeight: 700, marginTop: 2, opacity: .85 }}>{Math.floor(mins/60)}h</span>
                  )}
                  {status === 'absence'  && !isToday && <span style={{ fontSize: 9, marginTop: 2 }}>✕</span>}
                  {status === 'medical'  && !isToday && <span style={{ fontSize: 9, marginTop: 2 }}>🏥</span>}
                  {status === 'vacation' && !isToday && <span style={{ fontSize: 9, marginTop: 2 }}>🌴</span>}
                  {status === 'festivo'  && !isToday && <span style={{ fontSize: 9, marginTop: 2 }}>★</span>}
                </div>
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
            ['#F59E0B',              'Baja médica'],
            ['#3B82F6',              'Vacaciones'],
            ['#E879F9',              'Festivo'],
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
                  <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, color: statusColor, background: `${statusColor}18`, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                    {statusLabels[status]}
                  </div>
                )}
              </div>
              {recs.length ? recs.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${colors.border.subtle}` }}>
                  <div style={{ width: 32, height: 32, borderRadius: radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: colors.primary.dim, flexShrink: 0 }}>⏱️</div>
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
