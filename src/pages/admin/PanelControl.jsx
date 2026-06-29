import { useState, useMemo, useEffect } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { today, mhm, ftime, calcSecs, calcMin, gid } from '../../utils/time.js'
import { WK } from '../../config/constants.js'
import { auditLog, queuePush } from '../../services/dataService.js'

// Celda de tiempo con tick propio (tabla de control live)
function LiveTimerCell({ rec }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!rec) return
    const iv = setInterval(() => setTick(t => t + 1), 5000)
    return () => clearInterval(iv)
  }, [rec?.id])
  if (!rec) return <>—</>
  const t = calcSecs(rec)
  return <>{mhm(Math.floor(t.work / 60))}</>
}

// Componente de tarjeta con su propio tick — evita re-render de toda la grid cada 5s
function CtrlCard({ e, live, todayMin, force, startJornada, toggleDescanso }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 5000)
    return () => clearInterval(iv)
  }, [])
  const t = live ? calcSecs(live) : null
  const isWorking = live && !live.enDescanso
  const isBreak = live && live.enDescanso
  const elapsedMin = live ? Math.floor((Date.now() - new Date(live.inicio).getTime()) / 60000) : 0
  const hasBreak = live?.breaks?.length > 0
  const fatiguaAlert = isWorking && elapsedMin >= 600 && !hasBreak
  const dailyTarget = (e.horasSemanales || WK) / 5 * 60
  const workedMin = t ? Math.floor(t.work / 60) : todayMin
  const pct = workedMin ? Math.min(100, Math.round(workedMin / dailyTarget * 100)) : 0
  const over = workedMin > dailyTarget

  return (
    <div className={`ctrl-card${isWorking ? ' working' : isBreak ? ' on-break' : ''}`}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
        <div className="ctrl-avatar" style={{ background:e.color||'var(--primary)' }}>
          {(e.initials||e.name.slice(0,2)).toUpperCase()}
          <div className="ctrl-dot" style={{ background: isWorking?'var(--green)':isBreak?'var(--orange)':'var(--bg-500)', boxShadow: isWorking?'0 0 8px var(--green)':isBreak?'0 0 8px var(--orange)':'none' }} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name}</div>
          <div style={{ fontSize:11, color:'var(--text3)', marginTop:1, display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{live?.centro || e.centroTrabajo || '—'}</span>
            {live?.locInicio && (
              <span title={`GPS: ${live.locInicio.lat?.toFixed(4)}, ${live.locInicio.lng?.toFixed(4)}`}
                style={{ flexShrink:0, fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:8, background:'rgba(6,182,212,.12)', color:'var(--teal)', border:'1px solid rgba(6,182,212,.25)' }}>
                GPS ✓
              </span>
            )}
            {fatiguaAlert && (
              <span style={{ flexShrink:0, fontSize:9, fontWeight:800, padding:'1px 5px', borderRadius:8, background:'rgba(239,68,68,.15)', color:'var(--danger)', border:'1px solid rgba(239,68,68,.3)' }}>
                ⚠️ +10h sin pausa
              </span>
            )}
          </div>
        </div>
      </div>
      <div style={{ textAlign:'center', marginBottom:12 }}>
        <div className="counter-val" style={{ fontSize:30, fontWeight:800, letterSpacing:'-1px', color: isWorking?'var(--green)':isBreak?'var(--orange)':'var(--text3)' }}>
          {t ? mhm(Math.floor(t.work/60)) : '—'}
        </div>
        <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
          {isWorking ? `Entrada: ${ftime(live.inicio)}` : isBreak ? 'En descanso' : todayMin>0 ? `Hoy: ${mhm(todayMin)}` : 'Sin jornada hoy'}
        </div>
        {workedMin > 0 && (
          <div style={{ marginTop:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'var(--text4)', marginBottom:3 }}>
              <span>Jornada diaria</span>
              <span style={{ color: over ? 'var(--orange)' : 'var(--text3)', fontWeight:700 }}>{pct}%{over ? ' ↑extra' : ''}</span>
            </div>
            <div style={{ height:4, background:'var(--bg-400)', borderRadius:2 }}>
              <div style={{ height:'100%', borderRadius:2, background: over ? 'var(--orange)' : 'var(--green)', width: pct + '%', transition:'width .6s' }} />
            </div>
          </div>
        )}
      </div>
      {live ? (
        <div style={{ display:'flex', gap:6 }}>
          <button className="btn btn-sm btn-secondary" style={{ flex:1, fontSize:11 }} onClick={() => toggleDescanso(live)}>
            {live.enDescanso ? '▶ Continuar' : '⏸ Pausa'}
          </button>
          <button className="btn btn-sm btn-danger" style={{ flex:1, fontSize:11 }} onClick={() => force(live)}>■ Fin</button>
        </div>
      ) : (
        <button className="btn btn-sm btn-primary" style={{ width:'100%', fontSize:11 }} onClick={() => startJornada(e)}>
          ▶ Iniciar jornada
        </button>
      )}
    </div>
  )
}

export default function PanelControl({ db, toast, saveDB, session }) {
  const { showConfirm } = useAppStore()
  const emps = (db.employees || []).filter(e => !e.baja)
  const recs = db.records || []
  const liveRecs = recs.filter(r => !r.fin)
  const [view, setView] = useState('cards')

  // Pre-compute todayMin per employee (avoids O(n²) filter inside render)
  const todayMinMap = useMemo(() => {
    const tod = today()
    const map = {}
    recs.filter(r => r.fin && r.inicio?.startsWith(tod)).forEach(r => {
      map[r.empId] = (map[r.empId] || 0) + calcMin(r)
    })
    return map
  }, [recs])

  const adminName = session?.user?.name || 'Admin'

  const startJornada = (e) => {
    if (liveRecs.find(r => r.empId === e.id)) { toast('Ya tiene jornada abierta', 3000, 'warn'); return }
    const newRec = { id: gid(), empId: e.id, empName: e.name, inicio: new Date().toISOString(), fin: null, centro: e.centroTrabajo || '', breaks: [], workSecs: 0, breakSecs: 0, creadoPor: adminName }
    const withAudit = auditLog(db, 'Jornada iniciada por admin', e.name, adminName)
    saveDB({ records: [...recs, newRec], audit: withAudit.audit })
    queuePush(e.id, '▶ Jornada iniciada', `${adminName} ha iniciado tu jornada laboral.`, 'jornada', '/?tab=inicio')
    toast(`Jornada iniciada — ${e.name.split(' ')[0]}`, 3000, 'ok')
  }

  const toggleDescanso = (rec) => {
    const now = new Date().toISOString()
    let updated
    if (rec.enDescanso) {
      const breaks = [...(rec.breaks || []), { start: rec.bStartTs, end: now }]
      updated = { ...rec, enDescanso: false, bStartTs: null, breaks, breakSecs: calcSecs({ ...rec, enDescanso: false, breaks }).brk }
      queuePush(rec.empId, '▶ Descanso finalizado', `${adminName} ha reanudado tu jornada.`, 'jornada', '/?tab=inicio')
      toast('Descanso finalizado', 3000, 'ok')
    } else {
      updated = { ...rec, enDescanso: true, bStartTs: now }
      queuePush(rec.empId, '⏸ Descanso iniciado', `${adminName} ha pausado tu jornada.`, 'jornada', '/?tab=inicio')
      toast('Descanso iniciado', 3000, 'ok')
    }
    saveDB({ records: recs.map(r => r.id === rec.id ? updated : r) })
  }

  const force = (rec) => {
    const workedMin = Math.floor((Date.now() - new Date(rec.inicio).getTime()) / 60000)
    const warnMsg = workedMin < 5 ? ` ⚠️ Solo lleva ${workedMin} min trabajando.` : ''
    showConfirm(`¿Forzar cierre de jornada de ${rec.empName}?${warnMsg}`, () => {
      const now = new Date().toISOString()
      const breaks = [...(rec.breaks || [])]
      if (rec.enDescanso && rec.bStartTs) breaks.push({ start: rec.bStartTs, end: now })
      const closed = { ...rec, fin: now, breaks, enDescanso: false, bStartTs: null, closed: true }
      const t = calcSecs(closed); closed.workSecs = t.work; closed.breakSecs = t.brk
      const withAudit = auditLog(db, 'Jornada cerrada forzosamente', rec.empName, adminName)
      saveDB({ records: recs.map(r => r.id === rec.id ? closed : r), audit: withAudit.audit })
      queuePush(rec.empId, '⏱️ Jornada cerrada', `${adminName} ha cerrado tu jornada (${mhm(Math.floor(t.work/60))}).`, 'jornada', '/?tab=jornada')
      toast('Jornada cerrada forzosamente', 3000, 'ok')
    })
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Control en tiempo real</h1>
          <div className="adm-panel-sub" style={{ marginTop:2 }}>
            <span className="live-indicator" style={{ display:'inline-block', verticalAlign:'middle', marginRight:6 }} />
            {liveRecs.length} activos / {emps.length} totales
          </div>
        </div>
        <div className="pill-tabs">
          {[['cards','Cards'],['tabla','Tabla']].map(([v,l]) => (
            <button key={v} className={`pill-tab${view===v?' active':''}`} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
      </div>

      {!liveRecs.length && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'rgba(96,116,138,.08)', border:'1px solid var(--border)', borderRadius:'var(--r)', marginBottom:16 }}>
          <span style={{ fontSize:16 }}>😴</span>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text2)' }}>Nadie activo ahora mismo</div>
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>Los fichajes aparecerán aquí en tiempo real cuando los empleados inicien jornada</div>
          </div>
        </div>
      )}

      {view === 'cards' && (
        <div className="stagger-in" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:14 }}>
          {emps.map(e => (
            <CtrlCard
              key={e.id}
              e={e}
              live={liveRecs.find(r => r.empId === e.id)}
              todayMin={todayMinMap[e.id] || 0}
              force={force}
              startJornada={startJornada}
              toggleDescanso={toggleDescanso}
            />
          ))}
        </div>
      )}

      {view === 'tabla' && (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Empleado</th><th>Centro</th><th>Entrada</th><th>Tiempo</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {emps.map(e => {
                const live = liveRecs.find(r => r.empId === e.id)
                const fichoHoy = !live && (todayMinMap[e.id] || 0) > 0
                return (
                  <tr key={e.id} style={{ opacity: live ? 1 : fichoHoy ? 0.7 : 0.4 }}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:28, height:28, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>
                          {(e.initials||e.name.slice(0,2)).toUpperCase()}
                        </div>
                        {e.name}
                      </div>
                    </td>
                    <td style={{ color:'var(--text3)', fontSize:12 }}>{live?.centro || e.centroTrabajo || '—'}</td>
                    <td style={{ fontVariantNumeric:'tabular-nums', fontSize:12 }}>{live ? ftime(live.inicio) : '—'}</td>
                    <td style={{ fontWeight:700, fontVariantNumeric:'tabular-nums' }}><LiveTimerCell rec={live} /></td>
                    <td>
                      {live ? <span className={`badge ${live.enDescanso?'badge-orange':'badge-green'}`}>{live.enDescanso?'⏸ Descanso':'▶ Trabajando'}</span>
                           : fichoHoy ? <span className="badge badge-blue">✓ Fichó hoy</span>
                           : <span className="badge">Sin fichar</span>}
                    </td>
                    <td>
                      {live ? (
                        <div style={{ display:'flex', gap:6 }}>
                          <button className="btn btn-sm btn-secondary" style={{ fontSize:11 }} onClick={() => toggleDescanso(live)}>{live.enDescanso ? '▶' : '⏸'}</button>
                          <button className="btn btn-sm btn-danger" style={{ fontSize:11 }} onClick={() => force(live)}>■ Fin</button>
                        </div>
                      ) : (
                        <button className="btn btn-sm btn-primary" style={{ fontSize:11 }} onClick={() => startJornada(e)}>▶ Iniciar</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
