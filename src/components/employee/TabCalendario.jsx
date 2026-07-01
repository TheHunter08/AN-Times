import { useState, useMemo } from 'react'
import { today, p2, calcMin, mhm, ftime } from '../../utils/time.js'
import { WD, FESTIVOS_MADRID_2026 } from '../../config/constants.js'
import { PullToRefresh } from './PullToRefresh.jsx'

export function TabCalendario({ db, u, calMonth, setCalMonth }) {
  const [selDay, setSelDay] = useState(null)

  const y = calMonth.getFullYear(), m = calMonth.getMonth()
  const firstDay = new Date(y, m, 1)
  const lastDay  = new Date(y, m + 1, 0)
  const startDow = (firstDay.getDay() + 6) % 7
  const DAYS_ES  = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(y, m, d))

  const todayStr = today()
  const monthStr = `${y}-${p2(m+1)}`

  // Fecha local YYYY-MM-DD sin conversión UTC (evita el desfase de +1/-1 día en Madrid)
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
    (db.records || []).filter(r => r.empId === u.id && r.inicio?.startsWith(dateStr) && r.fin)

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

  return (
    <PullToRefresh>
      <div className="cal-wrap">
        <div className="cal-header">
          <div className="cal-month" style={{ textTransform:'capitalize' }}>
            {calMonth.toLocaleDateString('es-ES', { month:'long', year:'numeric' })}
          </div>
          <div className="cal-nav">
            <div className="cal-nav-btn" onClick={() => setCalMonth(new Date(y, m-1, 1))}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </div>
            <div className="cal-nav-btn" onClick={() => setCalMonth(new Date())}>Hoy</div>
            <div className="cal-nav-btn" onClick={() => setCalMonth(new Date(y, m+1, 1))}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </div>
        </div>

        {/* Month summary chips */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:4 }}>
          {[
            { n: monthStats.complete, label:'Completos', color:'var(--green)', bg:'var(--green-dim)' },
            { n: monthStats.pending,  label:'Parciales', color:'var(--orange)', bg:'rgba(245,158,11,.1)' },
            { n: monthStats.absence,  label:'Ausencias', color:'var(--red)', bg:'var(--red-dim)' },
            { n: monthStats.medical,  label:'Baja médica', color:'#f59e0b', bg:'rgba(245,158,11,.1)' },
            { n: monthStats.vacation, label:'Vacaciones', color:'var(--blue)', bg:'rgba(68,147,248,.1)' },
            { n: monthStats.festivo,  label:'Festivos', color:'#e879f9', bg:'rgba(232,121,249,.1)' },
          ].filter(c => c.n > 0).map(c => (
            <div key={c.label} style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, color:c.color, background:c.bg, border:`1px solid ${c.color}22` }}>
              <span>{c.n}</span><span style={{ fontWeight:500 }}>{c.label}</span>
            </div>
          ))}
        </div>

        <div className="cal-grid">
          {DAYS_ES.map(d => <div key={d} className="cal-day-header">{d}</div>)}
          {cells.map((date, i) => {
            if (!date) return <div key={i} />
            const ds = lds(date)
            const isToday = ds === todayStr
            const status = getDayStatus(ds, date)
            const mins = workedMap[ds] || 0
            const cls = ['cal-day',
              isToday ? 'today' : '',
              !isToday && status === 'complete' ? 'cal-complete' : '',
              !isToday && status === 'pending' ? 'cal-pending' : '',
              !isToday && status === 'absence' ? 'cal-absence' : '',
              !isToday && status === 'medical' ? 'cal-medical' : '',
              !isToday && status === 'vacation' ? 'vacation' : '',
              !isToday && status === 'weekend' ? 'weekend' : '',
              !isToday && status === 'missing' ? 'cal-missing' : '',
              !isToday && status === 'festivo' ? 'cal-festivo' : '',
              selDay === ds ? 'cal-selected' : '',
            ].filter(Boolean).join(' ')

            return (
              <div key={i} className={cls} onClick={() => setSelDay(selDay === ds ? null : ds)} title={(db.config?.festivosExtra || {})[ds] || (db.config?.usarFestivosMadrid !== false ? FESTIVOS_MADRID_2026[ds] : undefined) || undefined}>
                {date.getDate()}
                {mins > 0 && !isToday && <div className="cal-hrs">{Math.floor(mins/60)}h</div>}
                {status === 'absence' && !isToday && <div className="cal-hrs">✕</div>}
                {status === 'medical' && !isToday && <div className="cal-hrs">🏥</div>}
                {status === 'vacation' && !isToday && <div className="cal-hrs">🌴</div>}
                {status === 'festivo' && !isToday && <div className="cal-hrs">★</div>}
              </div>
            )
          })}
        </div>

        {/* Day detail */}
        {selDay && (() => {
          const recs = getDayRecs(selDay)
          const totMin = recs.reduce((s, r) => s + calcMin(r), 0)
          const selDate = new Date(selDay + 'T00:00:00')
          const status = getDayStatus(selDay, selDate)
          const festivoLabel = (db.config?.festivosExtra || {})[selDay] || (db.config?.usarFestivosMadrid !== false ? FESTIVOS_MADRID_2026[selDay] : undefined) || 'Festivo'
          const statusLabels = { complete:'Jornada completa', pending:'Jornada incompleta', absence:'Ausencia', medical:'Baja médica', vacation:'Vacaciones', missing:'Sin fichaje', weekend:'Fin de semana', festivo: festivoLabel, future:'' }
          const statusColors = { complete:'var(--green)', pending:'var(--orange)', absence:'var(--red)', medical:'#f59e0b', vacation:'var(--blue)', missing:'var(--text4)', weekend:'var(--text4)', festivo:'#e879f9', future:'var(--text4)' }
          return (
            <div className="card" style={{ borderLeft:`3px solid ${statusColors[status] || 'var(--border)'}` }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--text2)', textTransform:'capitalize' }}>
                  {selDate.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' })}
                </div>
                {statusLabels[status] && (
                  <div style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:12, color:statusColors[status], background:`${statusColors[status]}18`, textTransform:'uppercase', letterSpacing:'.5px' }}>
                    {statusLabels[status]}
                  </div>
                )}
              </div>
              {recs.length ? recs.map(r => (
                <div key={r.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ width:32, height:32, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, background:'var(--primary-dim)', flexShrink:0 }}>⏱️</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text2)' }}>{r.centro || 'Trabajo'}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{mhm(calcMin(r))} trabajadas</div>
                  </div>
                  <div style={{ fontSize:13, fontWeight:700, fontVariantNumeric:'tabular-nums', color:'var(--primary-light)' }}>{ftime(r.inicio)} → {ftime(r.fin)}</div>
                </div>
              )) : (
                <div className="empty-premium" style={{ padding:'20px 0' }}>
                  <div className="empty-premium-icon" style={{ width:44, height:44, borderRadius:12 }}>
                    <svg viewBox="0 0 24 24" style={{ width:20, height:20 }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>
                  </div>
                  <div style={{ fontSize:12, color:'var(--text4)' }}>
                    {status === 'absence' ? 'Día de ausencia registrado' : status === 'medical' ? 'Baja médica registrada' : status === 'vacation' ? 'Día de vacaciones' : 'Sin registros este día'}
                  </div>
                </div>
              )}
              {totMin > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:12, borderTop:'1px solid var(--border)', marginTop:4 }}>
                  <span style={{ fontSize:13, color:'var(--text3)' }}>Total trabajado</span>
                  <span style={{ fontSize:18, fontWeight:700 }}>{mhm(totMin)}</span>
                </div>
              )}
            </div>
          )
        })()}

        {/* Legend */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:14, padding:'12px 0' }}>
          {[['var(--green)','Completo'],['var(--orange)','Parcial'],['var(--red)','Ausencia'],['#f59e0b','Baja médica'],['var(--blue)','Vacaciones']].map(([c,l]) => (
            <div key={l} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--text2)' }}>
              <div style={{ width:10, height:10, borderRadius:3, background:c, flexShrink:0 }} />{l}
            </div>
          ))}
        </div>
      </div>
    </PullToRefresh>
  )
}
