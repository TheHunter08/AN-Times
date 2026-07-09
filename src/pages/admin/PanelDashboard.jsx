import { useState, useMemo } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { today, wkStart, p2, calcMin, calcSecs, mhm, ftime, recWorkSecs, localDateStr } from '../../utils/time.js'
import { WD } from '../../config/constants.js'
import { buildHeatmap, Heatmap } from '../../components/admin/Heatmap.jsx'
import { ComunicadoWidget } from '../../components/admin/ComunicadoWidget.jsx'
import { PushNotifWidget } from '../../components/admin/PushNotifWidget.jsx'
import { SyncBadge } from '../../components/admin/SyncBadge.jsx'
import { ModalParteVoz } from '../../components/ModalParteVoz.jsx'

export default function PanelDashboard({ db, toast, saveDB, session }) {
  const { setAdminPage } = useAppStore()
  const [showAllLive, setShowAllLive] = useState(false)
  const [showAllToday, setShowAllToday] = useState(false)
  const [showParteVoz, setShowParteVoz] = useState(false)
  const now = new Date()
  const todayStr = today()
  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
  const recs = db.records || []

  const liveRecs = recs.filter(r => !r.fin)
  const todayRecs = recs.filter(r => r.inicio?.startsWith(todayStr))
  const checkedIn = new Set(liveRecs.map(r => r.empId)).size

  const ws = wkStart(now)
  // localDateStr (no toISOString().slice(0,10)): ws ya está en medianoche LOCAL
  // (wkStart hace setHours(0,0,0,0)) — toISOString() la convierte a UTC primero,
  // desplazando la fecha un día atrás en España. Al reconstruir con "T00:00:00"
  // (no como fecha-sola) se fuerza de nuevo el parseo en hora local, si no
  // new Date("YYYY-MM-DD") se interpreta como medianoche UTC.
  const wsStr = localDateStr(ws)
  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMk = `${prevDate.getFullYear()}-${p2(prevDate.getMonth()+1)}`
  const weekRecs = useMemo(() => {
    const wsDate = new Date(wsStr + 'T00:00:00')
    return recs.filter(r => r.fin && r.inicio && new Date(r.inicio) >= wsDate)
  }, [recs, wsStr])
  const weekMin = useMemo(() => weekRecs.reduce((s, r) => s + calcMin(r), 0), [weekRecs])
  const monthMin = useMemo(() => recs.filter(r => r.fin && r.inicio?.startsWith(mk)).reduce((s, r) => s + calcMin(r), 0), [recs, mk])
  const lastMonthMin = useMemo(() => recs.filter(r => r.fin && r.inicio?.startsWith(lastMk)).reduce((s, r) => s + calcMin(r), 0), [recs, lastMk])
  const monthTrend = lastMonthMin > 0 ? Math.round((monthMin - lastMonthMin) / lastMonthMin * 100) : null

  const vacPend = (db.vacaciones || []).filter(v => v.estado === 'pendiente').length
  const vacHoy = (db.vacaciones || []).filter(v => v.estado === 'aprobada' && todayStr >= v.fechaInicio && todayStr <= v.fechaFin).length

  const heat = useMemo(() => buildHeatmap(recs, emps.length), [recs, emps.length])
  const recentAudit = useMemo(() => (db.audit || []).slice(-5).reverse(), [db.audit])

  const obraHours = useMemo(() => {
    const map = {}
    recs.filter(r => r.fin && r.inicio?.startsWith(mk)).forEach(r => {
      const obra = r.centro || r.obra || 'Sin centro'
      map[obra] = (map[obra] || 0) + calcMin(r)
    })
    return Object.entries(map).sort((a,b) => b[1] - a[1]).slice(0,6)
  }, [recs, mk])

  const last7Hours = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() - (6 - i))
      const ds = d.toISOString().slice(0, 10)
      return recs.filter(r => r.fin && r.inicio?.startsWith(ds)).reduce((s, r) => s + calcMin(r), 0) / 60
    })
  }, [recs])

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Dashboard</h1>
          <div className="adm-panel-sub" style={{ marginTop:2, textTransform:'capitalize' }}>{now.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <SyncBadge />
        </div>
      </div>

      {vacPend > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--orange-dim)', border:'1px solid rgba(245,158,11,.25)', borderRadius:'var(--r)', marginBottom:16, cursor:'pointer' }} onClick={() => setAdminPage('solicitudes')}>
          <span style={{ fontSize:18 }}>🌴</span>
          <span style={{ fontSize:13, fontWeight:600, color:'var(--orange)' }}>{vacPend} solicitud{vacPend>1?'es':''} de vacaciones pendiente{vacPend>1?'s':''} de revisión</span>
          <span style={{ marginLeft:'auto', fontSize:11, color:'var(--text3)', fontWeight:600 }}>→ Solicitudes</span>
        </div>
      )}

      <div className="adm-kpi-grid stagger-in">
        {(() => {
          // Absentismo hoy: % de empleados (no de baja, no de vacaciones) sin fichaje hoy
          const enVacacionesHoy = new Set((db.vacaciones || []).filter(v => v.estado === 'aprobada' && todayStr >= v.fechaInicio && todayStr <= v.fechaFin).map(v => v.empId))
          const esperados = emps.filter(e => !enVacacionesHoy.has(e.id))
          const ficharonHoy = new Set(todayRecs.map(r => r.empId))
          const ausentes = esperados.filter(e => !ficharonHoy.has(e.id)).length
          const absentismo = esperados.length ? Math.round(ausentes / esperados.length * 100) : 0
          // Productividad: horas reales del mes vs objetivo (jornada diaria configurable * 20 días por empleado activo)
          const wdEfectivo = db.config?.wdMin || WD
          const objetivoMes = emps.length * wdEfectivo * 20
          const productividad = objetivoMes ? Math.round(monthMin / objetivoMes * 100) : 0
          const docsPend = (db.documentos || []).filter(d => !d.firma).length
          return [
          { label:'Activos ahora',     val: `${checkedIn}/${emps.length}`, ico:'👥', glowColor:'#4ade80', trend: checkedIn > 0 ? `${checkedIn} trabajando` : 'Nadie activo', trendDir: checkedIn > 0 ? 'up' : 'neu' },
          { label:'Horas hoy',         val: mhm(todayRecs.reduce((s,r)=>s+(r.fin?calcMin(r):calcSecs(r).work/60),0)|0), ico:'⏱️', glowColor:'#60a5fa', trend: `${todayRecs.length} fichaje${todayRecs.length!==1?'s':''}`, trendDir:'neu', spark: last7Hours },
          { label:'Horas este mes',    val: mhm(monthMin),                 ico:'📅', glowColor:'#fbbf24', trend: monthTrend != null ? (monthTrend >= 0 ? `↑ +${monthTrend}% vs mes ant.` : `↓ ${monthTrend}% vs mes ant.`) : 'Mes en curso', trendDir: monthTrend >= 0 ? 'up' : 'down', spark: last7Hours },
          { label:'Absentismo hoy',    val: `${absentismo}%`,              ico:'📉', glowColor:'#f87171', trend: ausentes > 0 ? `${ausentes} sin fichar` : 'Todos presentes', trendDir: absentismo > 0 ? 'down' : 'up' },
          { label:'Productividad',     val: `${productividad}%`,           ico: productividad > 100 ? '🔥' : '⚡', glowColor: productividad > 100 ? '#f59e0b' : '#a78bfa', trend: productividad > 100 ? `+${productividad - 100}% extra` : productividad >= 90 ? 'En objetivo' : 'Bajo objetivo', trendDir: productividad > 100 ? 'up' : productividad >= 90 ? 'up' : 'down' },
          { label:'Docs. pendientes',  val: String(docsPend),              ico:'✍️', glowColor:'#22d3ee', trend: vacPend > 0 ? `🌴 ${vacPend} vac. pend.` : (docsPend > 0 ? 'Por firmar' : 'Al día'), trendDir: docsPend > 0 ? 'down' : 'up' },
          ]
        })().map(({ label, val, ico, glowColor, trend, trendDir, spark }) => (
          <div key={label} className="adm-kpi-card">
            <div className="adm-kpi-glow" style={{ background: glowColor }} />
            <div className="adm-kpi-icon">{ico}</div>
            <div className="adm-kpi-val">{val}</div>
            <div className="adm-kpi-label">{label}</div>
            {spark && (() => {
              const mx = Math.max(...spark, 0.1)
              return (
                <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:20, marginTop:4, marginBottom:2 }}>
                  {spark.map((v, i) => (
                    <div key={i} style={{ flex:1, borderRadius:2, background: i === 6 ? glowColor : 'rgba(255,255,255,.18)', height: Math.max(3, Math.round((v / mx) * 20)), transition:'height .3s' }} />
                  ))}
                </div>
              )
            })()}
            <div className={`adm-kpi-trend ${trendDir}`}>{trend}</div>
          </div>
        ))}
      </div>

      {/* Geo-fencing alerts today */}
      {(() => {
        const geoRecs = todayRecs.filter(r => r.geoAlert)
        if (!geoRecs.length) return null
        return (
          <div className="geo-alerts-panel stagger-in">
            <div className="geo-alerts-header">
              <span style={{ fontSize:16 }}>⚠️</span>
              <span>Alertas de ubicación hoy</span>
              <span className="geo-alerts-count">{geoRecs.length}</span>
            </div>
            {geoRecs.map(r => {
              const emp = emps.find(e => e.id === r.empId)
              const severity = r.geoAlert.dist > r.geoAlert.radio * 2 ? 'high' : 'med'
              return (
                <div key={r.id} className={`geo-alert-row geo-alert-${severity}`}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
                    <div style={{ width:32, height:32, borderRadius:'50%', background: severity==='high' ? 'rgba(239,68,68,.15)' : 'rgba(245,158,11,.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                      {severity === 'high' ? '🔴' : '🟠'}
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{emp?.name || r.empName}</div>
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{r.centro} · {new Date(r.inicio).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })}</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                    <span style={{ fontSize:12, fontWeight:700, color: severity==='high' ? 'var(--red)' : 'var(--orange)' }}>{r.geoAlert.dist}m fuera</span>
                    <span style={{ fontSize:10, color:'var(--text4)' }}>(radio {r.geoAlert.radio}m)</span>
                    {r.locInicio && (
                      <a href={`https://www.openstreetmap.org/?mlat=${r.locInicio.lat}&mlon=${r.locInicio.lng}&zoom=17`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontSize:11, color:'var(--primary-light)', textDecoration:'none', fontWeight:600, whiteSpace:'nowrap' }}>
                        Ver mapa ↗
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Anomaly detection panel */}
      {(() => {
        const allRecs = db.records || []
        const anomalies = []

        // 1. Jornadas abiertas de días anteriores
        allRecs.filter(r => !r.fin && r.inicio && r.inicio.slice(0,10) < todayStr).forEach(r => {
          const emp = emps.find(e => e.id === r.empId)
          if (!emp) return
          const elMin = Math.floor((Date.now() - new Date(r.inicio).getTime()) / 60000)
          anomalies.push({ id: r.id + '_open', tipo: 'open', emp, rec: r, label: 'Jornada abierta', sub: `${emp.name} · iniciada ${r.inicio.slice(0,10)} · ${mhm(elMin)} sin cerrar`, severity: 'high' })
        })

        // 2. Jornadas muy cortas (< 15 min) en últimos 3 días
        const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0,10)
        allRecs.filter(r => r.fin && r.inicio >= threeDaysAgo).forEach(r => {
          const mins = calcMin(r)
          if (mins > 0 && mins < 15) {
            const emp = emps.find(e => e.id === r.empId)
            if (!emp) return
            anomalies.push({ id: r.id + '_short', tipo: 'short', emp, rec: r, label: 'Jornada muy corta', sub: `${emp.name} · ${r.inicio.slice(0,10)} · solo ${mhm(mins)}`, severity: 'med' })
          }
        })

        // 3. Fichaje a hora inusual hoy (antes de 05:30 o después de 23:00)
        todayRecs.forEach(r => {
          const h = new Date(r.inicio).getHours()
          if (h < 5 || h >= 23) {
            const emp = emps.find(e => e.id === r.empId)
            if (!emp) return
            anomalies.push({ id: r.id + '_hour', tipo: 'hour', emp, rec: r, label: 'Hora inusual', sub: `${emp.name} fichó a las ${new Date(r.inicio).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })}`, severity: 'med' })
          }
        })

        // 4. Doble fichaje mismo día
        const todayEmpCounts = {}
        todayRecs.forEach(r => { todayEmpCounts[r.empId] = (todayEmpCounts[r.empId] || 0) + 1 })
        Object.entries(todayEmpCounts).filter(([, c]) => c > 1).forEach(([empId, count]) => {
          const emp = emps.find(e => e.id === empId)
          if (!emp) return
          anomalies.push({ id: empId + '_double', tipo: 'double', emp, rec: null, label: 'Doble fichaje', sub: `${emp.name} · ${count} entradas hoy`, severity: 'med' })
        })

        if (!anomalies.length) return null
        const sevColor = { high: 'var(--red)', med: 'var(--orange)' }
        const sevBg    = { high: 'rgba(239,68,68,.1)', med: 'rgba(245,158,11,.08)' }
        return (
          <div className="geo-alerts-panel stagger-in" style={{ borderLeftColor:'var(--primary-light)' }}>
            <div className="geo-alerts-header">
              <span style={{ fontSize:16 }}>🤖</span>
              <span>Anomalías detectadas</span>
              <span className="geo-alerts-count" style={{ background:'var(--primary-dim)', color:'var(--primary-light)' }}>{anomalies.length}</span>
            </div>
            {anomalies.map(a => (
              <div key={a.id} className="geo-alert-row" style={{ background: sevBg[a.severity] }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', background: a.emp?.color || 'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>
                    {(a.emp?.initials || a.emp?.name?.slice(0,2) || '?').toUpperCase()}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color: sevColor[a.severity] }}>{a.label}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.sub}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Live workers + Today activity */}
      <div className="dash-2col stagger-in">
        {/* Working now */}
        <div className="dash-widget card-lift">
          <div className="dash-widget-header">
            <div className="dash-widget-title" style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span className="live-indicator" />
              Trabajando ahora
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              {vacHoy > 0 && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'rgba(0,212,255,.1)', color:'var(--teal)' }}>🌴 {vacHoy} vac.</span>}
              <span className="dash-widget-badge" style={{ background:'var(--green-dim)', color:'var(--green)' }}>{liveRecs.length}</span>
            </div>
          </div>
          {!liveRecs.length ? (
            <div className="empty-premium" style={{ padding:'20px 0' }}>
              <div className="empty-premium-icon" style={{ width:44, height:44, borderRadius:12 }}>
                <svg viewBox="0 0 24 24" style={{ width:20, height:20 }}><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </div>
              <div style={{ fontSize:12, color:'var(--text4)' }}>Nadie trabajando ahora</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {(showAllLive ? liveRecs : liveRecs.slice(0,5)).map(r => {
                const emp = emps.find(e => e.id === r.empId)
                const t = calcSecs(r)
                return (
                  <div key={r.id} style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:32, height:32, borderRadius:'50%', background: emp?.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>
                      {(emp?.initials||emp?.name?.slice(0,2)||'?').toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{emp?.name?.split(' ')[0] || r.empName}</div>
                      <div style={{ fontSize:10, color:'var(--text3)', marginTop:1 }}>{r.centro || '—'}</div>
                    </div>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--green)', fontVariantNumeric:'tabular-nums', flexShrink:0 }}>{mhm(Math.floor(t.work/60))}</div>
                  </div>
                )
              })}
              {liveRecs.length > 5 && (
                <button onClick={() => setShowAllLive(v => !v)}
                  style={{ fontSize:11, color:'var(--primary-light)', background:'none', border:'none', cursor:'pointer', padding:'4px 0', fontFamily:'inherit', textAlign:'left', fontWeight:600 }}>
                  {showAllLive ? 'Ver menos' : `Ver todos (${liveRecs.length})`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Recent fichajes */}
        <div className="dash-widget card-lift">
          <div className="dash-widget-header">
            <div className="dash-widget-title">Fichajes de hoy</div>
            <span className="dash-widget-badge" style={{ background:'var(--primary-dim)', color:'var(--primary-light)' }}>{todayRecs.length}</span>
          </div>
          {!todayRecs.length ? (
            <div className="empty-premium" style={{ padding:'20px 0' }}>
              <div className="empty-premium-icon" style={{ width:44, height:44, borderRadius:12 }}>
                <svg viewBox="0 0 24 24" style={{ width:20, height:20 }}><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
              </div>
              <div style={{ fontSize:12, color:'var(--text4)' }}>Sin fichajes hoy</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {[...todayRecs].sort((a,b) => b.inicio.localeCompare(a.inicio)).slice(0, showAllToday ? undefined : 5).map(r => {
                const emp = emps.find(e => e.id === r.empId)
                const isLive = !r.fin
                const wm = r.fin ? Math.floor(recWorkSecs(r)/60) : null
                return (
                  <div key={r.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'var(--bg-600)', borderRadius:8, border:'1px solid var(--border)' }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background: emp?.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'#fff', flexShrink:0 }}>
                      {(emp?.initials||emp?.name?.slice(0,2)||'?').toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.empName?.split(' ')[0]}</div>
                      <div style={{ fontSize:10, color:'var(--text3)', fontVariantNumeric:'tabular-nums' }}>{ftime(r.inicio)}{r.fin ? ` → ${ftime(r.fin)}` : ''}</div>
                    </div>
                    {isLive ? (
                      <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--green)', flexShrink:0, boxShadow:'0 0 6px var(--green)' }} />
                    ) : (
                      <div style={{ fontSize:10, fontWeight:600, color:'var(--text3)', flexShrink:0 }}>{mhm(wm)}</div>
                    )}
                  </div>
                )
              })}
              {todayRecs.length > 5 && (
                <button onClick={() => setShowAllToday(v => !v)}
                  style={{ fontSize:11, color:'var(--primary-light)', background:'none', border:'none', cursor:'pointer', padding:'4px 0', fontFamily:'inherit', textAlign:'left', fontWeight:600 }}>
                  {showAllToday ? 'Ver menos' : `Ver todos (${todayRecs.length})`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {obraHours.length > 0 && (
        <div className="dash-widget card-lift" style={{ marginBottom:20 }}>
          <div className="dash-widget-header">
            <div className="dash-widget-title">Horas por obra este mes</div>
            <span className="dash-widget-badge" style={{ background:'var(--primary-dim)', color:'var(--primary-light)' }}>{obraHours.length}</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {(() => {
              const maxMin = obraHours[0]?.[1] || 1
              return obraHours.map(([obra, min]) => (
                <div key={obra} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ fontSize:11, fontWeight:600, minWidth:120, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--text2)' }}>{obra}</div>
                  <div style={{ flex:1, height:6, background:'var(--bg-400)', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:3, background:'linear-gradient(90deg, var(--primary), var(--accent2))', width:`${Math.round(min/maxMin*100)}%`, transition:'width .6s' }} />
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--primary-light)', minWidth:40, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{mhm(min)}</div>
                </div>
              ))
            })()}
          </div>
        </div>
      )}

      {/* Heatmap */}
      <div className="dash-widget card-lift" style={{ marginBottom:20 }}>
        <div className="dash-widget-header">
          <div className="dash-widget-title">Actividad (últimas 12 semanas)</div>
        </div>
        <Heatmap data={heat} />
      </div>

      {/* Month vs last month comparison */}
      {lastMonthMin > 0 && (
        <div className="dash-widget card-lift" style={{ marginBottom:20 }}>
          <div className="dash-widget-header">
            <div className="dash-widget-title">Comparativa mensual</div>
            {monthTrend !== null && (
              <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20,
                background: monthTrend >= 0 ? 'var(--green-dim)' : 'var(--red-dim)',
                color: monthTrend >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {monthTrend >= 0 ? '+' : ''}{monthTrend}% vs mes anterior
              </span>
            )}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[
              { label: prevDate.toLocaleDateString('es-ES', { month:'short', year:'numeric' }), val: lastMonthMin, color:'var(--text3)', bar:'var(--bg-400)' },
              { label: now.toLocaleDateString('es-ES', { month:'short', year:'numeric' }), val: monthMin, color:'var(--primary-light)', bar:'linear-gradient(90deg,var(--primary),var(--accent))' },
            ].map(({ label, val, color, bar }) => {
              const pct = Math.round(val / Math.max(monthMin, lastMonthMin, 1) * 100)
              return (
                <div key={label}>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--text3)', marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:20, fontWeight:800, color, marginBottom:8, fontVariantNumeric:'tabular-nums' }}>{mhm(val)}</div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: pct + '%', background: bar }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Nuevo fichaje', ico:'⏱️', page:'fichajes', color:'var(--primary-dim)', accent:'var(--primary-light)' },
          { label:'Ver solicitudes', ico:'🌴', page:'solicitudes', color:'var(--orange-dim)', accent:'var(--orange)' },
          { label:'Generar informe', ico:'📊', page:'informes', color:'var(--green-dim)', accent:'var(--green)' },
          { label:'Parte de trabajo', ico:'🎙️', page:null, color:'rgba(239,68,68,.1)', accent:'#EF4444' },
        ].map(({ label, ico, page, color, accent }) => (
          <button key={label} onClick={() => page ? setAdminPage(page) : setShowParteVoz(true)} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'14px 8px', background:color, border:`1px solid ${accent}22`, borderRadius:'var(--r-lg)', cursor:'pointer', transition:'transform .15s, box-shadow .15s', WebkitTapHighlightColor:'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow=`0 6px 16px ${accent}33` }}
            onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='' }}>
            <span style={{ fontSize:22 }}>{ico}</span>
            <span style={{ fontSize:11, fontWeight:700, color: accent, textAlign:'center', lineHeight:1.2 }}>{label}</span>
          </button>
        ))}
      </div>

      <ModalParteVoz visible={showParteVoz} db={db} autor={session?.user?.name || 'Admin'} saveDB={saveDB} toast={toast} onClose={() => setShowParteVoz(false)} />

      {/* Últimos partes de trabajo */}
      {(db.partesTrabajo || []).length > 0 && (
        <div className="dash-widget card-lift" style={{ marginBottom:20 }}>
          <div className="dash-widget-header">
            <div className="dash-widget-title">🎙️ Últimos partes de trabajo</div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[...(db.partesTrabajo || [])].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,4).map(p => (
              <div key={p.id} style={{ background:'var(--bg-600)', borderRadius:10, padding:'10px 12px', border: p.discrepancias?.length ? '1px solid rgba(245,158,11,.3)' : '1px solid transparent' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11, color:'var(--text3)', marginBottom:4 }}>
                  <span>{p.autor} · {p.fecha}{p.obraNombre ? ` · ${p.obraNombre}` : ''}</span>
                  <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {p.discrepancias?.length > 0 && <span style={{ color:'var(--orange)', fontWeight:700 }}>⚠ {p.discrepancias.length}</span>}
                    <button
                      onClick={() => saveDB({ partesTrabajo: (db.partesTrabajo || []).filter(x => x.id !== p.id) })}
                      style={{ background:'none', border:'none', color:'var(--text4)', fontSize:14, cursor:'pointer', padding:0, lineHeight:1 }}
                      aria-label="Eliminar parte"
                      title="Eliminar parte"
                    >×</button>
                  </span>
                </div>
                <div style={{ fontSize:12, color:'var(--text2)' }}>
                  {p.resumen || p.textoOriginal.slice(0,140)}
                </div>
                {(p.ausencias?.length > 0 || p.incidencias?.length > 0) && (
                  <div style={{ fontSize:11, color:'var(--text4)', marginTop:4 }}>
                    {p.ausencias?.length > 0 && `${p.ausencias.length} ausencia${p.ausencias.length!==1?'s':''}`}
                    {p.ausencias?.length > 0 && p.incidencias?.length > 0 && ' · '}
                    {p.incidencias?.length > 0 && `${p.incidencias.length} incidencia${p.incidencias.length!==1?'s':''}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent audit */}
      {recentAudit.length > 0 && (
        <div className="dash-widget card-lift">
          <div className="dash-widget-header">
            <div className="dash-widget-title">Actividad reciente</div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {recentAudit.map((a, i) => (
              <div key={i} className="audit-row">
                <div className="audit-ico">📝</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600 }}>{a.action}</div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>{a.user} · {a.ts ? new Date(a.ts).toLocaleString('es-ES', { hour:'2-digit', minute:'2-digit', month:'short', day:'numeric' }) : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ComunicadoWidget db={db} toast={toast} saveDB={saveDB} />
      <PushNotifWidget db={db} toast={toast} />
    </div>
  )
}
