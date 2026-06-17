import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../store/appStore.js'
import { useTimer } from '../hooks/useTimer.js'
import { today, s2t, mhm, p2, ftime, fds, calcSecs, calcMin, gid, vacData, wkStart, recWorkSecs, sortedEmps } from '../utils/time.js'
import { WD, WK, VAPID_PUB } from '../config/constants.js'
import { pushSubscribe } from '../services/dataService.js'

export default function EmployeePage() {
  const { db, session, currentEmpTab, setEmpTab, saveDB, logout, toast, setScreen, openModal, closeModal, activeModal, modalData } = useAppStore()
  const timer = useTimer()
  const u = session.user
  const [pendingGPS, setPendingGPS] = useState(null)
  const [clockTime, setClockTime] = useState('')
  const [clockDate, setClockDate] = useState('')
  const [calMonth, setCalMonth] = useState(new Date())

  // Clock tick
  useEffect(() => {
    const tick = () => {
      const n = new Date()
      setClockTime(`${p2(n.getHours())}:${p2(n.getMinutes())}:${p2(n.getSeconds())}`)
      setClockDate(n.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' }))
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])

  // Push subscription on mount
  useEffect(() => {
    if (!u) return
    setTimeout(async () => {
      if ('Notification' in window && Notification.permission === 'granted') {
        await pushSubscribe('emp:' + u.id, VAPID_PUB)
      }
    }, 3000)
  }, [u])

  const openRec = () => (db.records || []).find(r => r.empId === u?.id && !r.fin)

  // === TIMER ACTIONS ===
  const doStart = () => {
    if (timer.state !== 'idle') return
    const cs = db.centrosTrabajo || []
    openModal('selCentro', { centros: cs, current: u?.centroTrabajo || '' })
    // Get GPS
    setPendingGPS(null)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setPendingGPS({ lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5), ts: new Date().toISOString() }),
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    }
  }

  const confirmarCentro = useCallback((centro) => {
    if (!centro) { toast('Selecciona un centro de trabajo'); return }
    closeModal()
    const rec = {
      id: gid(), empId: u.id, empName: u.name, empresa: u.empresa || '',
      centro, inicio: new Date().toISOString(), fin: null,
      workSecs: 0, breakSecs: 0, enDescanso: false, bStartTs: null, breaks: [], closed: false
    }
    if (pendingGPS) rec.locInicio = pendingGPS
    const newDB = { ...db, records: [...db.records, rec] }
    // Update employee's centroTrabajo
    const emps = newDB.employees.map(e => e.id === u.id ? { ...e, centroTrabajo: centro } : e)
    saveDB({ records: newDB.records, employees: emps })
    toast('✅ Jornada iniciada en ' + centro)
  }, [u, db, pendingGPS, closeModal, saveDB, toast])

  const doStop = useCallback(() => {
    const o = openRec()
    if (!o) return
    const now = new Date().toISOString()
    const breaks = [...(o.breaks || [])]
    let enDescanso = o.enDescanso
    let bStartTs = o.bStartTs
    if (enDescanso && bStartTs) { breaks.push({ start: bStartTs, end: now }); enDescanso = false; bStartTs = null }
    const closed = { ...o, fin: now, enDescanso, bStartTs, breaks, closed: true }
    const t = calcSecs(closed)
    closed.workSecs = t.work; closed.breakSecs = t.brk
    const records = db.records.map(r => r.id === o.id ? closed : r)
    saveDB({ records })
    toast('✅ Jornada finalizada — ' + mhm(Math.floor(t.work / 60)))
  }, [db, openRec, saveDB, toast])

  const doBreak = useCallback(() => {
    const o = openRec()
    if (!o) return
    const now = new Date().toISOString()
    let updated
    if (o.enDescanso) {
      const breaks = [...(o.breaks || []), { start: o.bStartTs, end: now }]
      updated = { ...o, breaks, breakSecs: calcSecs({ ...o, breaks }).brk, enDescanso: false, bStartTs: null }
      toast('▶️ Descanso finalizado')
    } else {
      updated = { ...o, enDescanso: true, bStartTs: now }
      toast('⏸️ Descanso iniciado')
    }
    const records = db.records.map(r => r.id === o.id ? updated : r)
    saveDB({ records })
  }, [db, openRec, saveDB, toast])

  const doLogout = () => {
    logout()
    try { if (window._fbSignOut) window._fbSignOut() } catch {}
  }

  if (!u) return null

  const initials = u.initials || u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const vac = vacData(u.id, db)
  const unread = (db.notis || []).filter(n => n.empId === u?.id && !n.leido).length

  return (
    <div className="screen active" id="sEmp">
      {/* Topbar */}
      <div className="emp-topbar">
        <div className="emp-top-left">
          <div className="emp-avatar" style={{ background: u.color || 'var(--primary)' }}>{initials}</div>
          <div style={{ minWidth:0 }}>
            <div className="emp-greeting">👋 {u.name.split(' ')[0]}</div>
            <div className="emp-subdate">{clockDate} · <span style={{color:'var(--primary-light)',fontWeight:600}}>{clockTime}</span></div>
          </div>
        </div>
        <div className="emp-top-right">
          {(session.isEnc || session.isJO) && (
            <button className="enc-chip" onClick={() => setScreen('admin')}>
              {session.isJO ? '🏗️ Panel' : '⭐ Panel'}
            </button>
          )}
          <button className="theme-toggle-btn" onClick={toggleTheme} title="Tema">🌙</button>
          <button className="icon-btn ai-btn" onClick={() => openModal('ai')} title="IA">
            <svg viewBox="0 0 24 24"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/></svg>
          </button>
          <button className="icon-btn" onClick={() => openModal('notis')} style={{ position:'relative' }}>
            <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span className={`noti-dot${unread > 0 ? ' show' : ''}`} />
          </button>
          <button className="icon-btn logout-btn" onClick={doLogout}>
            <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="emp-body">
        {currentEmpTab === 'inicio' && <TabInicio timer={timer} clockTime={clockTime} doStart={doStart} doStop={doStop} doBreak={doBreak} openRec={openRec} db={db} u={u} />}
        {currentEmpTab === 'jornada' && <TabJornada timer={timer} db={db} u={u} toast={toast} saveDB={saveDB} openModal={openModal} closeModal={closeModal} activeModal={activeModal} modalData={modalData} />}
        {currentEmpTab === 'vacaciones' && <TabVacaciones db={db} u={u} vac={vac} toast={toast} saveDB={saveDB} />}
        {currentEmpTab === 'calendario' && <TabCalendario db={db} u={u} calMonth={calMonth} setCalMonth={setCalMonth} />}
        {currentEmpTab === 'perfil' && <TabPerfil u={u} session={session} db={db} saveDB={saveDB} toast={toast} doLogout={doLogout} openModal={openModal} />}
      </div>

      {/* Bottom nav */}
      <div className="emp-nav">
        {[
          { id:'inicio',     label:'Inicio',     icon:<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>, extra:<polyline points="9 22 9 12 15 12 15 22"/> },
          { id:'jornada',    label:'Jornada',    icon:<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></> },
          { id:'vacaciones', label:'Vacaciones', icon:<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><path d="M12 3c0 0 4 4 4 8s-4 8-4 8"/><path d="M12 3c0 0-4 4-4 8s4 8 4 8"/></> },
          { id:'calendario', label:'Calendario', icon:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></> },
          { id:'perfil',     label:'Perfil',     icon:<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></> },
        ].map(({ id, label, icon, extra }) => (
          <div key={id} className={`emp-nav-item${currentEmpTab===id?' on':''}`} onClick={() => setEmpTab(id)}>
            <svg viewBox="0 0 24 24">{icon}{extra}</svg>
            {label}
          </div>
        ))}
      </div>

      {/* Modals */}
      <ModalSelCentro visible={activeModal==='selCentro'} data={modalData} onConfirm={confirmarCentro} onClose={closeModal} />
      <ModalNotis visible={activeModal==='notis'} db={db} onClose={closeModal} toast={toast} saveDB={saveDB} u={u} />
      <ModalAI visible={activeModal==='ai'} db={db} u={u} onClose={closeModal} />
      <ModalVacForm visible={activeModal==='vacForm'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalSign visible={activeModal==='sign'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalInfoPersonal visible={activeModal==='infoPersonal'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalDocumentos visible={activeModal==='documentos'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalConfiguracion visible={activeModal==='configuracion'} u={u} onClose={closeModal} toast={toast} />
    </div>
  )
}

// ─── TAB INICIO ────────────────────────────────────────────────────────────────
function TabInicio({ timer, clockTime, doStart, doStop, doBreak, openRec, db, u }) {
  const todayStr = today()
  const recs = (db.records || []).filter(r => r.empId === u.id && r.inicio.startsWith(todayStr))
  const realRecs = recs.filter(r => !r.fin || recWorkSecs(r) >= 30)
  const o = openRec()

  const completedSecs = realRecs.filter(r => r.fin && r.closed).reduce((a, r) => a + recWorkSecs(r), 0)
  const liveSecs = o ? calcSecs(o).work : 0
  const totSecs = completedSecs + liveSecs
  const totMin = Math.floor(totSecs / 60)
  const pct = Math.min(100, Math.round(totMin / WD * 100))

  const entradaRec = realRecs[0]
  const salidaRec = [...realRecs].reverse().find(r => r.fin && r.closed)

  const brkMin = recs.reduce((a, r) => a + Math.floor((r.breakSecs || 0) / 60), 0)

  const circleState = timer.state === 'idle' ? 'idle' : timer.state === 'break' ? 'break' : 'working'
  const circleClass = `jor-circle-btn${circleState !== 'idle' ? ' ' + circleState : ''}`

  const handleCircle = () => {
    if (timer.state === 'idle') doStart()
    else doStop()
  }

  return (
    <div className="emp-tab active">
      <div className="ini-wrap">
        {/* Main fichar card */}
        <div className="jor-main-card">
          <div style={{ margin:'14px 0' }}>
            <div className={`jor-mc-status${timer.state==='idle'?' idle':timer.state==='break'?' break':''}`}>
              <span className="sdot" />
              {timer.state==='idle' ? 'Sin jornada activa' : timer.state==='break' ? 'En descanso' : 'Trabajando'}
            </div>
          </div>
          <div className="jor-timer">{s2t(timer.ws)}</div>
          <div className="jor-timer-sub">
            {timer.state === 'idle' ? 'Pulsa para iniciar jornada' : `Descanso: ${s2t(timer.bs)}`}
          </div>
          <div className="jor-circle-wrap">
            <div className="jor-circle-glow" />
            <button className={circleClass} onClick={handleCircle}>
              {timer.state === 'idle' ? (
                <><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>INICIAR</span></>
              ) : (
                <><svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg><span>PARAR</span></>
              )}
            </button>
          </div>
          {timer.state !== 'idle' && (
            <div className="jor-break-row">
              <button className={`jor-break-chip${timer.state==='break'?' active':''}`} onClick={doBreak}>
                {timer.state === 'break' ? '▶️ Reanudar trabajo' : '⏸️ Iniciar descanso'}
              </button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
          {[
            { lbl:'Entrada', val: entradaRec ? ftime(entradaRec.inicio) : '--:--', color:'var(--primary-light)', bg:'rgba(94,106,210,.12)' },
            { lbl:'Salida',  val: o ? '--:--' : salidaRec ? ftime(salidaRec.fin) : '--:--', color:'var(--green)', bg:'var(--green-dim)' },
            { lbl:'Descanso',val: brkMin > 0 ? `${Math.floor(brkMin/60).toString().padStart(2,'0')}:${p2(brkMin%60)}` : '00:00', color:'var(--orange)', bg:'var(--orange-dim)' },
            { lbl:'Total',   val: totMin > 0 ? `${Math.floor(totMin/60)}h ${p2(totMin%60)}m` : '0h 00m', color:'var(--teal)', bg:'rgba(12,200,232,.1)' },
          ].map(({ lbl, val, color, bg }) => (
            <div key={lbl} className="stat-card-premium" style={{ textAlign:'center' }}>
              <div className="stat-lbl">{lbl}</div>
              <div className="stat-val" style={{ color, fontSize:16 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Progress */}
        {o && (
          <div className="jor-progress-wrap">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:12, fontWeight:600, color:'var(--text2)' }}>Progreso de jornada</span>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--primary-light)' }}>{pct}%</span>
            </div>
            <div className="jor-progress-bar"><div className="jor-progress-fill" style={{ width: pct + '%' }} /></div>
            <div className="jor-progress-txt">{pct === 0 ? 'Sin jornada activa' : `${pct}% completado — ${Math.round(totMin/60*10)/10}h de jornada`}</div>
          </div>
        )}

        {/* GPS card */}
        {o && (
          <div className="gps-card">
            <div className="gps-ico">
              <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            <div>
              <div className="gps-name">{o.centro || u.centroTrabajo || 'Sin centro'}</div>
              <div className={`gps-status${!o.locInicio ? ' pending' : ''}`}>
                {o.locInicio ? 'GPS verificado' : 'Sin GPS'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TAB JORNADA ───────────────────────────────────────────────────────────────
function TabJornada({ timer, db, u, toast, saveDB, openModal, closeModal, activeModal, modalData }) {
  const todayStr = today()
  const recs = (db.records || []).filter(r => r.empId === u.id && r.inicio.startsWith(todayStr)).sort((a,b) => a.inicio.localeCompare(b.inicio))
  const realRecs = recs.filter(r => !r.fin || recWorkSecs(r) >= 30)
  const o = recs.find(r => !r.fin)

  const completedSecs = realRecs.filter(r => r.fin && r.closed).reduce((a, r) => a + recWorkSecs(r), 0)
  const liveSecs = o ? calcSecs(o).work : 0
  const totSecs = completedSecs + liveSecs
  const totMin = Math.floor(totSecs / 60)
  const brkMin = recs.reduce((a, r) => a + Math.floor((r.breakSecs || 0) / 60), 0)
  const extraMin = Math.max(0, totMin - WD)
  const normMin = Math.min(totMin, WD)

  const now = new Date()
  const ws = wkStart(now)
  const weekRecs = (db.records || []).filter(r => r.empId === u.id && r.fin && new Date(r.inicio) >= ws)
  const weekMin = weekRecs.reduce((s, r) => s + calcMin(r), 0) + (timer.state !== 'idle' ? Math.floor(timer.ws / 60) : 0)

  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
  const monthMin = (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio.startsWith(mk)).reduce((s, r) => s + calcMin(r), 0)

  const tlItems = realRecs.map(r => {
    const isCurrent = !r.fin
    return { r, isCurrent }
  })

  return (
    <div className="emp-tab active" style={{ paddingBottom:20 }}>
      <div style={{ padding:'20px 16px 16px', background:'linear-gradient(160deg,rgba(94,106,210,.08) 0%,transparent 100%)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 }}>
          <div style={{ fontSize:22, fontWeight:800, letterSpacing:'-.5px' }}>Mi Jornada</div>
          <div style={{ fontSize:10, color:'var(--text3)', background:'var(--bg-500)', border:'1px solid var(--border)', borderRadius:20, padding:'4px 10px', fontWeight:600, textTransform:'uppercase', letterSpacing:'.4px' }}>
            Hoy
          </div>
        </div>
        <div style={{ fontSize:13, color:'var(--text3)', textTransform:'capitalize' }}>
          {now.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' })}
        </div>
      </div>

      {/* Stats 3-col */}
      <div className="jor-stats-row">
        <div className="jor-stat-card primary">
          <div className="jor-stat-ico">⏱️</div>
          <div className="jor-stat-val">{mhm(Math.floor(weekMin))}</div>
          <div className="jor-stat-lbl">Esta semana</div>
        </div>
        <div className="jor-stat-card">
          <div className="jor-stat-ico">✅</div>
          <div className="jor-stat-val">{mhm(normMin)}</div>
          <div className="jor-stat-lbl">Normal hoy</div>
        </div>
        <div className="jor-stat-card orange">
          <div className="jor-stat-ico">⚡</div>
          <div className="jor-stat-val">{mhm(extraMin)}</div>
          <div className="jor-stat-lbl">Extra</div>
        </div>
      </div>

      {/* Total card */}
      <div style={{ padding:'0 16px 12px' }}>
        <div className="card" style={{ marginBottom:0 }}>
          <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4, fontWeight:500 }}>Total trabajado hoy</div>
          <div style={{ fontSize:36, fontWeight:800, letterSpacing:'-1.5px', marginBottom:12 }}>{mhm(totMin)}</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6, paddingTop:10, borderTop:'1px solid var(--border)' }}>
            {[
              { lbl:'Descansos', val: mhm(brkMin), color:'var(--orange)' },
              { lbl:'Mes actual', val: mhm(monthMin), color:'var(--teal)' },
            ].map(({ lbl, val, color }) => (
              <div key={lbl} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:13 }}>
                <span style={{ color:'var(--text3)' }}>{lbl}</span>
                <span style={{ fontWeight:600, color }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div style={{ padding:'0 16px 12px' }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:12 }}>
          Actividad de hoy
        </div>
        {!tlItems.length ? (
          <div className="empty">Sin actividad registrada hoy</div>
        ) : (
          <div className="timeline">
            {tlItems.map(({ r, isCurrent }) => {
              const ws2 = isCurrent ? timer.ws : recWorkSecs(r)
              const bk = isCurrent ? timer.bs : (r.breakSecs || 0)
              return (
                <div key={r.id} className="tl-item">
                  <div className="tl-left">
                    <div className="tl-ico" style={{ background: isCurrent ? 'var(--primary-dim)' : r.fin ? 'var(--green-dim)' : 'var(--bg-500)', fontSize:18 }}>
                      {isCurrent ? '▶️' : r.fin ? '✅' : '⏸️'}
                    </div>
                    <div className="tl-line" />
                  </div>
                  <div className="tl-right">
                    <div>
                      <div className="tl-label">{isCurrent ? 'En progreso' : 'Completado'}</div>
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                        {ftime(r.inicio)} → {r.fin ? ftime(r.fin) : 'ahora'} · {r.centro}
                      </div>
                      {bk > 30 && <div style={{ fontSize:10, color:'var(--orange)', marginTop:2 }}>Descanso: {mhm(Math.floor(bk/60))}</div>}
                    </div>
                    <div className="tl-time">{isCurrent ? s2t(ws2) : mhm(Math.floor(ws2/60))}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ height: 20 }} />
    </div>
  )
}

// ─── TAB VACACIONES ────────────────────────────────────────────────────────────
function TabVacaciones({ db, u, vac, toast, saveDB }) {
  const { openModal } = useAppStore()
  const myVacs = (db.vacaciones || []).filter(v => v.empId === u.id).sort((a,b) => b.fechaInicio.localeCompare(a.fechaInicio))
  const pct = vac.generated > 0 ? Math.round((vac.used / vac.generated) * 100) : 0

  return (
    <div className="emp-tab active">
      <div className="vac-wrap2">
        <div className="vac-hero">
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.2)', borderRadius:20, padding:'5px 12px', fontSize:11, fontWeight:700, color:'rgba(255,255,255,.9)', letterSpacing:'.4px', textTransform:'uppercase', marginBottom:8, width:'fit-content' }}>
            Mis Vacaciones
          </div>
          <div className="vac-hero-title">Balance de días</div>
          <div className="vac-hero-sub">{new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
        </div>

        <div className="vac-stats-row">
          {[
            { val: vac.available, lbl:'Disponibles', color:'var(--primary-light)' },
            { val: vac.used,      lbl:'Disfrutadas', color:'var(--green)' },
            { val: vac.pending,   lbl:'Pendientes',  color:'var(--orange)' },
          ].map(({ val, lbl, color }) => (
            <div key={lbl} className="vac-stat">
              <div className="vac-stat-val" style={{ color }}>{val}</div>
              <div className="vac-stat-lbl">{lbl}</div>
            </div>
          ))}
        </div>

        <div className="vac-body">
          <div style={{ background:'var(--bg-600)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <span style={{ fontSize:13, fontWeight:700 }}>Progreso anual</span>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--primary-light)', background:'var(--primary-dim)', border:'1px solid var(--primary-glow)', padding:'2px 8px', borderRadius:12 }}>{vac.used} / {vac.generated} días</span>
            </div>
            <div style={{ height:8, background:'var(--bg-400)', borderRadius:4, overflow:'hidden', marginBottom:8 }}>
              <div style={{ height:'100%', borderRadius:4, background:'linear-gradient(90deg,#7c3aed,var(--primary))', width: pct + '%', transition:'width .6s ease' }} />
            </div>
            <div style={{ fontSize:11, color:'var(--text3)' }}>Generadas según antigüedad · {vac.months} meses</div>
          </div>

          <button className="vac-cta" onClick={() => openModal('vacForm')}>
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            Solicitar vacaciones
          </button>

          {myVacs.length > 0 && (
            <>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.6px', paddingTop:4 }}>Mis solicitudes</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {myVacs.map(v => (
                  <div key={v.id} className="vac-list-item">
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>{fds(v.fechaInicio)} → {fds(v.fechaFin)}</div>
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{v.dias} días · {v.motivo || 'Vacaciones'}</div>
                    </div>
                    <div className={`badge${v.estado==='aprobada' ? ' badge-green' : v.estado==='rechazada' ? ' badge-red' : ' badge-orange'}`}>
                      {v.estado === 'aprobada' ? '✓ Aprobada' : v.estado === 'rechazada' ? '✗ Rechazada' : '⏳ Pendiente'}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── TAB CALENDARIO ────────────────────────────────────────────────────────────
function TabCalendario({ db, u, calMonth, setCalMonth }) {
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

  const workedDays = new Set(
    (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio.startsWith(monthStr))
      .map(r => r.inicio.slice(0, 10))
  )

  const vacDays = new Set(
    (db.vacaciones || []).filter(v => v.empId === u.id && v.estado === 'aprobada').flatMap(v => {
      const days = []
      const s = new Date(v.fechaInicio + 'T00:00:00'), e = new Date(v.fechaFin + 'T00:00:00')
      const d = new Date(s)
      while (d <= e) { days.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1) }
      return days
    })
  )

  const getDayRecs = dateStr =>
    (db.records || []).filter(r => r.empId === u.id && r.inicio.startsWith(dateStr) && r.fin)

  return (
    <div className="emp-tab active">
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

        <div className="cal-grid">
          {DAYS_ES.map(d => <div key={d} className="cal-day-header">{d}</div>)}
          {cells.map((date, i) => {
            if (!date) return <div key={i} />
            const ds = date.toISOString().slice(0, 10)
            const isToday = ds === todayStr
            const isWorked = workedDays.has(ds)
            const isVac = vacDays.has(ds)
            const dow = date.getDay()
            const isWeekend = dow === 0 || dow === 6
            const cls = ['cal-day', isToday ? 'today' : '', isWorked && !isToday ? 'worked' : '', isVac && !isToday ? 'vacation' : '', isWeekend && !isToday ? 'weekend' : ''].filter(Boolean).join(' ')
            const recs = getDayRecs(ds)
            const hrs = recs.reduce((s, r) => s + calcMin(r), 0)

            return (
              <div key={i} className={cls} onClick={() => setSelDay(selDay === ds ? null : ds)}>
                {date.getDate()}
                {hrs > 0 && !isToday && <div className="cal-hrs">{Math.floor(hrs/60)}h</div>}
              </div>
            )
          })}
        </div>

        {/* Day detail */}
        {selDay && (() => {
          const recs = getDayRecs(selDay)
          const totMin = recs.reduce((s, r) => s + calcMin(r), 0)
          return (
            <div className="card">
              <div style={{ fontSize:14, fontWeight:600, marginBottom:12, color:'var(--text2)' }}>
                {new Date(selDay + 'T00:00:00').toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' })}
              </div>
              {recs.length ? recs.map(r => (
                <div key={r.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, background:'var(--bg-500)', flexShrink:0 }}>⏱️</div>
                  <div style={{ flex:1, fontSize:13, color:'var(--text2)' }}>{r.centro || 'Trabajo'}</div>
                  <div style={{ fontSize:14, fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{ftime(r.inicio)} → {ftime(r.fin)}</div>
                </div>
              )) : <div className="empty" style={{ padding:'16px 0' }}>Sin registros</div>}
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
          {[['var(--green)','Trabajado'],['var(--blue)','Vacaciones'],['var(--orange)','Festivo'],['var(--red)','Ausencia']].map(([c,l]) => (
            <div key={l} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--text2)' }}>
              <div style={{ width:10, height:10, borderRadius:3, background:c, flexShrink:0 }} />{l}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── TAB PERFIL ────────────────────────────────────────────────────────────────
function TabPerfil({ u, session, db, saveDB, toast, doLogout, openModal }) {
  const initials = u.initials || u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const vac = vacData(u.id, db)
  const now = new Date()
  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
  const monthMin = (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio.startsWith(mk)).reduce((s, r) => s + calcMin(r), 0)
  const pendingDocs = (db.documentos || []).filter(d => d.empId === u.id && !d.firma).length

  return (
    <div className="emp-tab active">
    <div className="prf-wrap">
      <div className="prf-hero">
        <div style={{ position:'relative', marginBottom:14 }}>
          <div className="prf-av" style={{ background: u.color || 'var(--primary)' }}>{initials}</div>
        </div>
        <div className="prf-name">{u.name}</div>
        <div className="prf-role">{u.role === 'encargado' ? '⭐ Encargado' : u.role === 'jefe_obra' ? '🏗️ Jefe de Obra' : '👷 Empleado'}</div>
        <div style={{ fontSize:12, color:'var(--text4)', textAlign:'center', marginBottom:10 }}>{u.empresa || u.centroTrabajo || '—'}</div>
        <div className="prf-status-pill"><span className="dot" />Activo</div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:0, margin:'0 16px 16px', background:'var(--bg-600)', border:'1px solid var(--border)', borderRadius:'var(--r)' }}>
        {[
          { val: mhm(monthMin), lbl:'Mes actual' },
          { val: vac.available, lbl:'Días vac.' },
          { val: vac.months, lbl:'Antigüedad (meses)' },
        ].map(({ val, lbl }, i) => (
          <div key={lbl} style={{ padding:'14px 8px', textAlign:'center', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize:18, fontWeight:800, letterSpacing:'-.4px' }}>{val}</div>
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.4px', fontWeight:600, marginTop:3 }}>{lbl}</div>
          </div>
        ))}
      </div>

      <div className="prf-menu">
        {[
          { icon:<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>, label:'Información personal', onClick:()=>openModal('infoPersonal') },
          { icon:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>, label:'Documentos', badge: pendingDocs, onClick:()=>openModal('documentos') },
          { icon:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>, label:'Configuración', onClick:()=>openModal('configuracion') },
          { icon:<><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></>, label:'Firma digital', color:'rgba(124,92,255,.12)', stroke:'#a78bfa', onClick:() => openModal('sign') },
        ].map(({ icon, label, color, stroke, onClick, badge }) => (
          <div key={label} className="prf-menu-item" onClick={onClick}>
            <div className="prf-menu-ico" style={color ? { background:color } : {}}>
              <svg viewBox="0 0 24 24" style={stroke ? { stroke } : {}}>{icon}</svg>
            </div>
            <span className="prf-menu-lbl">{label}</span>
            {badge > 0 && <span style={{ minWidth:18, height:18, borderRadius:9, background:'var(--orange)', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 5px', marginRight:4 }}>{badge}</span>}
            <svg className="prf-menu-arr" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        ))}
        <div className="prf-menu-item danger" onClick={doLogout}>
          <div className="prf-menu-ico">
            <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </div>
          <span className="prf-menu-lbl">Cerrar sesión</span>
          <svg className="prf-menu-arr" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    </div>
    </div>
  )
}

// ─── MODALS ────────────────────────────────────────────────────────────────────
function ModalSelCentro({ visible, data, onConfirm, onClose }) {
  const [sel, setSel] = useState('')
  useEffect(() => { if (data?.current) setSel(data.current) }, [data])
  if (!visible) return null
  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-drag" />
        <h2>📍 Seleccionar centro de trabajo</h2>
        <div className="field">
          <label>Centro</label>
          <select value={sel} onChange={e => setSel(e.target.value)}>
            <option value="">— Selecciona —</option>
            {(data?.centros || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="modal-btns">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onConfirm(sel)}>Iniciar jornada</button>
        </div>
      </div>
    </div>
  )
}

function ModalNotis({ visible, db, onClose, toast, saveDB, u }) {
  const notis = (db.notis || []).filter(n => n.empId === u?.id).slice(-20).reverse()
  if (!visible) return null
  const markRead = () => {
    const updated = (db.notis || []).map(n => ({ ...n, leido: true }))
    saveDB({ notis: updated })
  }
  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-drag" />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <h2 style={{ margin:0 }}>🔔 Notificaciones</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:22, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:'60vh', overflowY:'auto' }}>
          {!notis.length ? <div className="empty">Sin notificaciones</div> : notis.map(n => (
            <div key={n.id} className="nitem">
              <div className="nitem-ico" style={{ background:'rgba(94,106,210,.1)' }}>ℹ️</div>
              <div className="nitem-body">
                <div className="nitem-title">{n.action || n.title || 'Notificación'}</div>
                <div className="nitem-text">{n.detail || n.body || ''}</div>
                <div className="nitem-time">{n.ts ? new Date(n.ts).toLocaleString('es-ES') : ''}</div>
              </div>
            </div>
          ))}
        </div>
        <button className="btn btn-secondary btn-full btn-sm" style={{ marginTop:12 }} onClick={markRead}>Marcar como leídas</button>
      </div>
    </div>
  )
}

function ModalVacForm({ visible, db, u, onClose, toast, saveDB }) {
  const [fi, setFi] = useState('')
  const [ff, setFf] = useState('')
  const [motivo, setMotivo] = useState('')
  if (!visible) return null

  const submit = () => {
    if (!fi || !ff) { toast('Selecciona fechas'); return }
    const s = new Date(fi + 'T00:00:00'), e = new Date(ff + 'T00:00:00')
    if (s > e) { toast('Fecha fin debe ser posterior'); return }
    let days = 0
    const d = new Date(s)
    while (d <= e) { const dow = d.getDay(); if (dow !== 0 && dow !== 6) days++; d.setDate(d.getDate()+1) }
    const vac = { id: gid(), empId: u.id, empName: u.name, fechaInicio: fi, fechaFin: ff, dias: days, motivo: motivo || 'Vacaciones', estado: 'pendiente', ts: new Date().toISOString() }
    saveDB({ vacaciones: [...(db.vacaciones||[]), vac] })
    toast('✅ Solicitud enviada')
    onClose()
    setFi(''); setFf(''); setMotivo('')
  }

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-drag" />
        <h2>🌴 Solicitar vacaciones</h2>
        <div className="field-row">
          <div className="field"><label>Desde</label><input type="date" value={fi} onChange={e => setFi(e.target.value)} /></div>
          <div className="field"><label>Hasta</label><input type="date" value={ff} onChange={e => setFf(e.target.value)} /></div>
        </div>
        <div className="field"><label>Motivo (opcional)</label><input type="text" placeholder="Vacaciones, viaje..." value={motivo} onChange={e => setMotivo(e.target.value)} /></div>
        <div className="modal-btns">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit}>Solicitar</button>
        </div>
      </div>
    </div>
  )
}

function ModalSign({ visible, db, u, onClose, toast, saveDB }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPtRef = useRef(null)
  const [mode, setMode] = useState('view') // 'view' | 'draw'
  const [tick, setTick] = useState(0)

  const existingFirma = db.firmas?.[u?.id]?.main

  useEffect(() => {
    if (visible) setMode(existingFirma ? 'view' : 'draw')
  }, [visible])

  useEffect(() => {
    if (mode === 'draw' && canvasRef.current) {
      const c = canvasRef.current
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#0D1218'
      ctx.fillRect(0, 0, c.width, c.height)
    }
  }, [mode, tick])

  if (!visible) return null

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    return { x: (src.clientX - rect.left) * (canvas.width / rect.width), y: (src.clientY - rect.top) * (canvas.height / rect.height) }
  }

  const onDown = e => {
    e.preventDefault()
    const c = canvasRef.current; if (!c) return
    lastPtRef.current = getPos(e, c)
    drawingRef.current = true
  }
  const onMove = e => {
    if (!drawingRef.current) return
    e.preventDefault()
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d')
    const pt = getPos(e, c)
    ctx.beginPath(); ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y); ctx.lineTo(pt.x, pt.y)
    ctx.strokeStyle = '#c7d2fe'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke()
    lastPtRef.current = pt
  }
  const onUp = () => { drawingRef.current = false; lastPtRef.current = null }

  const clearSign = () => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#0D1218'; ctx.fillRect(0, 0, c.width, c.height)
  }

  const save = () => {
    const c = canvasRef.current; if (!c) return
    const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    const hasStroke = Array.from(pixels).some((v, i) => i % 4 !== 3 && v > 30)
    if (!hasStroke) { toast('Dibuja tu firma antes de guardar'); return }
    const small = document.createElement('canvas'); small.width = 320; small.height = 120
    const ctx2 = small.getContext('2d')
    ctx2.fillStyle = '#0D1218'; ctx2.fillRect(0, 0, 320, 120)
    ctx2.drawImage(c, 0, 0, 320, 120)
    const data = small.toDataURL('image/jpeg', 0.7)
    if (data.length > 200000) { toast('Firma muy grande, simplifica los trazos'); return }
    const firmas = { ...(db.firmas || {}), [u.id]: { ...(db.firmas?.[u.id] || {}), main: { data, updatedAt: new Date().toISOString(), empName: u.name } } }
    saveDB({ firmas })
    toast('✅ Firma guardada correctamente')
    onClose()
  }

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:480 }}>
        <div className="modal-drag" />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:18 }}>Firma digital</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:22, cursor:'pointer' }}>×</button>
        </div>

        {mode === 'view' && existingFirma ? (
          <>
            <div style={{ background:'var(--bg-500)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'6px', marginBottom:14 }}>
              <img src={existingFirma.data} alt="Firma guardada" style={{ width:'100%', height:120, objectFit:'contain', borderRadius:8, display:'block' }} />
            </div>
            <div style={{ fontSize:11, color:'var(--text3)', textAlign:'center', marginBottom:16 }}>
              Firma guardada — {existingFirma.updatedAt ? new Date(existingFirma.updatedAt).toLocaleDateString('es-ES') : ''}
            </div>
            <div style={{ background:'var(--green-dim)', border:'1px solid rgba(54,178,126,.2)', borderRadius:'var(--r-sm)', padding:'10px 14px', marginBottom:16, fontSize:12, color:'var(--green)' }}>
              Esta firma se aplicará automáticamente al firmar documentos y jornadas mensuales.
            </div>
            <div className="modal-btns">
              <button className="btn btn-secondary" onClick={() => { setMode('draw'); setTick(t=>t+1) }}>Actualizar firma</button>
              <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom:8 }}>
              <canvas ref={canvasRef} width={640} height={200}
                style={{ width:'100%', height:150, borderRadius:'var(--r)', background:'#0D1218', cursor:'crosshair', touchAction:'none', border:'1px solid var(--border2)', display:'block' }}
                onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
                onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp} />
            </div>
            <div style={{ fontSize:11, color:'var(--text3)', textAlign:'center', marginBottom:16 }}>Dibuja tu firma con el dedo o ratón</div>
            <div className="modal-btns">
              <button className="btn btn-secondary" onClick={clearSign}>Borrar</button>
              {existingFirma && <button className="btn btn-secondary" onClick={() => setMode('view')}>Cancelar</button>}
              <button className="btn btn-primary" onClick={save}>Guardar firma</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ModalAI({ visible, db, u, onClose }) {
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  if (!visible) return null

  const send = () => {
    if (!input.trim()) return
    const q = input.trim(); setInput('')
    setMsgs(m => [...m, { role:'user', text:q }])

    const now = new Date()
    const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
    const mine = (db.records || []).filter(r => r.empId === u?.id)
    const monthMin = mine.filter(r => r.fin && r.inicio.startsWith(mk)).reduce((s, r) => s + calcMin(r), 0)
    const vac = u ? vacData(u.id, db) : { available: 0 }
    const ql = q.toLowerCase()

    let ans = '🤖 No tengo datos suficientes para responder eso. Prueba con: horas, vacaciones, historial.'
    if (ql.includes('hora') || ql.includes('trabaj')) {
      ans = `📊 Este mes llevas **${mhm(monthMin)}** trabajados. La norma es ${mhm(WD * 20)} mensuales.`
    } else if (ql.includes('vac')) {
      ans = `🌴 Tienes **${vac.available} días** de vacaciones disponibles (de ${vac.generated} generados, usaste ${vac.used}).`
    } else if (ql.includes('historial') || ql.includes('registro')) {
      const last = mine.filter(r=>r.fin).slice(-3).reverse()
      if (last.length) {
        ans = `📋 Últimos registros:\n${last.map(r=>`• ${r.inicio.slice(0,10)}: ${mhm(calcMin(r))}`).join('\n')}`
      } else ans = '📋 No hay registros recientes.'
    } else if (ql.includes('hola') || ql.includes('que puedes')) {
      ans = `👋 ¡Hola ${u?.name.split(' ')[0]}! Puedo ayudarte con:\n• Tus horas trabajadas\n• Balance de vacaciones\n• Historial de registros`
    }

    setTimeout(() => setMsgs(m => [...m, { role:'bot', text:ans }]), 400)
  }

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-drag" />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <h2 style={{ margin:0 }}>🤖 Asistente IA</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:22, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>
        <div className="ai-chat">
          {!msgs.length && <div className="ai-msg-bot">👋 ¡Hola! Pregúntame sobre tus horas, vacaciones o registros.</div>}
          {msgs.map((m, i) => <div key={i} className={m.role==='user'?'ai-msg-user':'ai-msg-bot'} style={{ whiteSpace:'pre-line' }}>{m.text}</div>)}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <input type="text" placeholder="Pregunta algo..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==='Enter'&&send()} />
          <button className="btn btn-primary" onClick={send}>→</button>
        </div>
      </div>
    </div>
  )
}

function getCfg(key, def) {
  try {
    const v = localStorage.getItem('cfg_' + key)
    if (v === null) return def
    if (v === 'true') return true
    if (v === 'false') return false
    return v
  } catch { return def }
}

function setCfg(key, value) {
  try { localStorage.setItem('cfg_' + key, String(value)) } catch {}
}

function ModalInfoPersonal({ visible, db, u, onClose, toast, saveDB }) {
  const emp = (db.employees || []).find(e => e.id === u?.id) || u || {}
  const [nombre, setNombre] = useState(emp.name || '')
  const [email, setEmail] = useState(emp.email || '')
  const [tel, setTel] = useState(emp.tel || '')

  useEffect(() => {
    if (visible) {
      const e = (db.employees || []).find(e => e.id === u?.id) || u || {}
      setNombre(e.name || '')
      setEmail(e.email || '')
      setTel(e.tel || '')
    }
  }, [visible])

  if (!visible) return null

  const save = () => {
    const updated = db.employees.map(e =>
      e.id === u.id ? { ...e, name: nombre, email, tel } : e
    )
    saveDB({ employees: updated })
    toast('Datos actualizados')
    onClose()
  }

  const field = (label, value, onChange, readonly) => (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4, textTransform:'uppercase', letterSpacing:1 }}>{label}</div>
      <input
        value={value} onChange={e => onChange && onChange(e.target.value)}
        readOnly={readonly}
        style={{
          width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)',
          background: readonly ? 'var(--bg-700)' : 'var(--bg-800)', color:'var(--text1)',
          fontSize:14, boxSizing:'border-box', opacity: readonly ? 0.7 : 1
        }}
      />
    </div>
  )

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:400 }}>
        <div className="modal-drag" />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:18 }}>Información personal</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:22, cursor:'pointer' }}>×</button>
        </div>
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto', color:'#fff', fontWeight:700 }}>
            {(nombre||'?')[0].toUpperCase()}
          </div>
        </div>
        {field('Nombre', nombre, setNombre)}
        {field('Email', email, setEmail)}
        {field('Teléfono', tel, setTel)}
        {field('Empresa', emp.empresa || '—', null, true)}
        {field('Centro de trabajo', emp.centroTrabajo || '—', null, true)}
        {field('Rol', emp.role==='encargado'?'Encargado':emp.role==='jefe_obra'?'Jefe de Obra':'Empleado', null, true)}
        {field('Fecha de alta', emp.fechaAlta || '—', null, true)}
        {field('Días vacaciones/año', String(vacData(u.id, db).generated || 22) + ' días', null, true)}
        <button className="btn btn-primary" onClick={save} style={{ width:'100%', marginTop:8 }}>Guardar cambios</button>
      </div>
    </div>
  )
}

function ModalDocumentos({ visible, db, u, onClose, toast, saveDB }) {
  const [signing, setSigning] = useState(null) // doc being signed
  if (!visible) return null

  const myDocs = (db.documentos || []).filter(d => d.empId === u?.id)
  const pendientes = myDocs.filter(d => !d.firma)
  const firmados = myDocs.filter(d => d.firma)
  const myFirma = db.firmas?.[u?.id]?.main

  const TIPO_LABELS = { nomina:'Nómina', contrato:'Contrato', jornada:'Jornada mensual' }
  const TIPO_COLORS = { nomina:'var(--primary-light)', contrato:'var(--teal)', jornada:'var(--orange)' }

  const firmarDoc = (doc) => {
    if (!myFirma) { toast('Necesitas guardar tu firma primero en Perfil → Firma digital'); return }
    const firmadoAt = new Date().toISOString()
    const updated = (db.documentos || []).map(d => d.id === doc.id ? {
      ...d, firma: { firmadoAt, signatureData: myFirma.data, empName: u.name }
    } : d)
    const noti = { id: gid(), empId: '__admin__', action: 'Documento firmado', detail: `${u.name} firmó "${doc.titulo}"`, ts: firmadoAt, leido: false }
    saveDB({ documentos: updated, notis: [...(db.notis || []), noti] })
    toast('✅ Documento firmado correctamente')
    setSigning(null)
  }

  const DocCard = ({ d }) => (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)', marginBottom:8 }}>
      <div style={{ width:38, height:38, borderRadius:10, background:'var(--bg-500)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={TIPO_COLORS[d.tipo]||'var(--text3)'} strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:700 }}>{d.titulo}</div>
        <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
          <span style={{ color:TIPO_COLORS[d.tipo]||'var(--text3)', fontWeight:600 }}>{TIPO_LABELS[d.tipo]||d.tipo}</span>
          {d.mes && ` · ${d.mes}`}
          {d.firma && <span style={{ color:'var(--green)', marginLeft:6 }}>· Firmado {new Date(d.firma.firmadoAt).toLocaleDateString('es-ES')}</span>}
        </div>
      </div>
      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
        {(d.fileData || d.url) && (
          <a href={d.fileData || d.url} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary" style={{ textDecoration:'none' }}>
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:3 }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Ver
          </a>
        )}
        {!d.firma && <button className="btn btn-sm btn-primary" onClick={() => setSigning(d)}>Firmar</button>}
        {d.firma && d.firma.signatureData && <img src={d.firma.signatureData} alt="firma" style={{ height:28, borderRadius:4, border:'1px solid var(--border)', background:'var(--bg-500)' }} />}
      </div>
    </div>
  )

  return (
    <div className="modal-ov" onClick={signing ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:480 }}>
        <div className="modal-drag" />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:18 }}>Mis documentos</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:22, cursor:'pointer' }}>×</button>
        </div>

        {/* Confirm signing */}
        {signing && (
          <div style={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:16, marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>Confirmar firma: {signing.titulo}</div>
            {myFirma ? (
              <>
                <img src={myFirma.data} alt="tu firma" style={{ width:'100%', height:80, objectFit:'contain', background:'#0D1218', borderRadius:8, border:'1px solid var(--border)', marginBottom:12 }} />
                <div style={{ fontSize:11, color:'var(--text3)', marginBottom:12 }}>Al confirmar, esta firma se aplicará al documento de forma permanente.</div>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-secondary" onClick={() => setSigning(null)}>Cancelar</button>
                  <button className="btn btn-primary" onClick={() => firmarDoc(signing)}>Confirmar y firmar</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:12, color:'var(--orange)', marginBottom:12 }}>No tienes una firma guardada. Ve a Perfil → Firma digital para crearla.</div>
                <button className="btn btn-secondary" onClick={() => setSigning(null)}>Cerrar</button>
              </>
            )}
          </div>
        )}

        {/* Pending */}
        {pendientes.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--orange)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--orange)' }} />
              Pendientes de firma ({pendientes.length})
            </div>
            {pendientes.map(d => <DocCard key={d.id} d={d} />)}
          </div>
        )}

        {/* Signed */}
        {firmados.length > 0 && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--green)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--green)' }} />
              Firmados ({firmados.length})
            </div>
            {firmados.map(d => <DocCard key={d.id} d={d} />)}
          </div>
        )}

        {!myDocs.length && (
          <div style={{ textAlign:'center', padding:'30px 0', color:'var(--text3)' }}>
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ margin:'0 auto 12px', display:'block', opacity:.3 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Sin documentos pendientes
          </div>
        )}
      </div>
    </div>
  )
}

function ModalConfiguracion({ visible, u, onClose, toast }) {
  const [notiFichaje, setNotiFichaje] = useState(() => getCfg('notiFichaje', true))
  const [gpsAuto, setGpsAuto] = useState(() => getCfg('gpsAuto', true))
  const [reminderTime, setReminderTime] = useState(() => getCfg('reminderTime', '20:00'))
  const [idioma, setIdioma] = useState(() => getCfg('idioma', 'es'))
  const [formato, setFormato] = useState(() => getCfg('formato', '24h'))

  if (!visible) return null

  const save = () => {
    setCfg('notiFichaje', notiFichaje)
    setCfg('gpsAuto', gpsAuto)
    setCfg('reminderTime', reminderTime)
    setCfg('idioma', idioma)
    setCfg('formato', formato)
    toast('Configuración guardada')
    onClose()
  }

  const toggle = (label, value, onChange) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:14, color:'var(--text1)' }}>{label}</span>
      <div
        onClick={() => onChange(!value)}
        style={{ width:44, height:24, borderRadius:12, background: value ? 'var(--primary)' : 'var(--bg-600)', cursor:'pointer', position:'relative', transition:'background .2s' }}
      >
        <div style={{ position:'absolute', top:3, left: value ? 23 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s' }} />
      </div>
    </div>
  )

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:400 }}>
        <div className="modal-drag" />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:18 }}>Configuración</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:22, cursor:'pointer' }}>×</button>
        </div>
        {toggle('Notificaciones de fichaje', notiFichaje, setNotiFichaje)}
        {toggle('GPS automático', gpsAuto, setGpsAuto)}
        <div style={{ padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:14, color:'var(--text1)', marginBottom:8 }}>Recordatorio diario</div>
          <input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-700)', color:'var(--text1)', fontSize:14 }} />
        </div>
        <div style={{ padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:14, color:'var(--text1)', marginBottom:8 }}>Idioma</div>
          <select value={idioma} onChange={e => setIdioma(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-700)', color:'var(--text1)', fontSize:14, width:'100%' }}>
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
          </select>
        </div>
        <div style={{ padding:'14px 0' }}>
          <div style={{ fontSize:14, color:'var(--text1)', marginBottom:8 }}>Formato de hora</div>
          <select value={formato} onChange={e => setFormato(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-700)', color:'var(--text1)', fontSize:14, width:'100%' }}>
            <option value="24h">24 horas</option>
            <option value="12h">12 horas (AM/PM)</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={save} style={{ width:'100%', marginTop:8 }}>Guardar</button>
      </div>
    </div>
  )
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme')
  const next = current === 'light' ? 'dark' : 'light'
  if (next === 'dark') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', 'light')
  try { localStorage.setItem('theme', next) } catch {}
  document.querySelectorAll('.theme-toggle-btn').forEach(b => { b.textContent = next === 'light' ? '🌙' : '☀️' })
}
