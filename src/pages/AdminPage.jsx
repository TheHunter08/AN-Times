import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore.js'
import { today, mhm, p2, ftime, fds, calcSecs, calcMin, gid, vacData, wkStart, recWorkSecs, sortedEmps } from '../utils/time.js'
import { WD, WK, ADMIN_PIN } from '../config/constants.js'

const PAGES = [
  { id:'dashboard',   label:'Dashboard' },
  { id:'control',     label:'Control Live' },
  { id:'fichajes',    label:'Fichajes' },
  { id:'solicitudes', label:'Solicitudes' },
  { id:'empleados',   label:'Empleados' },
  { id:'informes',    label:'Informes' },
  { id:'obras',       label:'Obras' },
  { id:'documentos',  label:'Documentos' },
  { id:'auditoria',   label:'Auditoría' },
]

const NAV_ICONS = {
  dashboard:   <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  control:     <><circle cx="12" cy="12" r="9"/><polyline points="12 6 12 12 16 14"/></>,
  fichajes:    <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/></>,
  solicitudes: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
  empleados:   <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  informes:    <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></>,
  obras:       <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
  documentos:  <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></>,
  auditoria:   <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
}

function NavIcon({ id, size = 17 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {NAV_ICONS[id] || null}
    </svg>
  )
}

export default function AdminPage() {
  const { db, session, currentAdminPage, setAdminPage, saveDB, toast, setScreen, logout, openModal, closeModal, activeModal, modalData, syncStatus } = useAppStore()
  const [sideOpen, setSideOpen] = useState(false)
  const [mobilePage, setMobilePage] = useState(0)
  const isMobile = window.innerWidth < 768

  const doLogout = () => { logout(); try { if (window._fbSignOut) window._fbSignOut() } catch {} }

  const nav = (id) => { setAdminPage(id); setSideOpen(false) }

  const actPanel = PAGES.find(p => p.id === currentAdminPage) || PAGES[0]

  return (
    <div className="screen active" id="sAdmin">
      {/* Topbar */}
      <div className="adm-topbar">
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button className="adm-menu-btn" onClick={() => setSideOpen(s => !s)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="adm-logo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polygon points="12 2 2 7 12 12 22 7" fill="#5e6ad2"/><polyline points="2 17 12 22 22 17" stroke="#5e6ad2" strokeWidth="2" strokeLinejoin="round"/><polyline points="2 12 12 17 22 12" stroke="#8b97e8" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            TIMES INC
          </div>
          <div className="adm-page-title">{actPanel.ico} {actPanel.label}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <SyncBadge />
          {session.user && (
            <button className="btn btn-secondary btn-sm" onClick={() => setScreen('emp')}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Panel Emp.
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={doLogout}>Salir</button>
        </div>
      </div>

      <div style={{ display:'flex', flex:1, height:'calc(100vh - 56px)', overflow:'hidden', position:'relative' }}>
        {/* Sidebar */}
        <div className={`adm-sidebar${sideOpen ? ' open' : ''}`}>
          <div className="adm-sidebar-inner">
            <div className="adm-nav-section">MENÚ PRINCIPAL</div>
            {PAGES.map(p => (
              <div key={p.id} className={`adm-nav-item${currentAdminPage===p.id?' active':''}`} onClick={() => nav(p.id)}>
                <span className="adm-nav-ico"><NavIcon id={p.id} /></span>
                <span>{p.label}</span>
              </div>
            ))}
            <div className="adm-nav-divider" />
            <div className="adm-nav-item" onClick={doLogout} style={{ color:'var(--danger)' }}>
              <span className="adm-nav-ico">🚪</span><span>Cerrar sesión</span>
            </div>
          </div>
        </div>
        {sideOpen && <div className="adm-sidebar-ov" onClick={() => setSideOpen(false)} />}

        {/* Main content */}
        <div className="adm-main">
          {currentAdminPage === 'dashboard'   && <PanelDashboard   db={db} toast={toast} />}
          {currentAdminPage === 'control'     && <PanelControl     db={db} toast={toast} saveDB={saveDB} />}
          {currentAdminPage === 'fichajes'    && <PanelFichajes    db={db} toast={toast} saveDB={saveDB} />}
          {currentAdminPage === 'solicitudes' && <PanelSolicitudes db={db} toast={toast} saveDB={saveDB} />}
          {currentAdminPage === 'empleados'   && <PanelEmpleados   db={db} toast={toast} saveDB={saveDB} openModal={openModal} closeModal={closeModal} activeModal={activeModal} modalData={modalData} />}
          {currentAdminPage === 'informes'    && <PanelInformes    db={db} toast={toast} />}
          {currentAdminPage === 'obras'       && <PanelObras       db={db} toast={toast} saveDB={saveDB} />}
          {currentAdminPage === 'documentos'  && <PanelDocumentos  db={db} toast={toast} saveDB={saveDB} />}
          {currentAdminPage === 'auditoria'   && <PanelAuditoria   db={db} />}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="adm-mobile-nav">
        {PAGES.slice(0,5).map(p => (
          <div key={p.id} className={`adm-mobile-nav-item${currentAdminPage===p.id?' active':''}`} onClick={() => setAdminPage(p.id)}>
            <NavIcon id={p.id} size={20} />
            <span>{p.label.slice(0,8)}</span>
          </div>
        ))}
        <div className={`adm-mobile-nav-item${['informes','obras','documentos','auditoria'].includes(currentAdminPage)?' active':''}`} onClick={() => setSideOpen(true)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
          <span>Más</span>
        </div>
      </div>
    </div>
  )
}

function SyncBadge() {
  const syncStatus = useAppStore(s => s.syncStatus)
  return (
    <div style={{ fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:4, color: syncStatus==='synced'?'var(--green)':syncStatus==='syncing'?'var(--orange)':'var(--danger)' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:'currentColor', flexShrink:0 }} />
      {syncStatus==='synced'?'Sincronizado':syncStatus==='syncing'?'Guardando…':'Sin conexión'}
    </div>
  )
}

// ─── PANEL DASHBOARD ──────────────────────────────────────────────────────────
function PanelDashboard({ db }) {
  const now = new Date()
  const todayStr = today()
  const emps = (db.employees || []).filter(e => !e.baja)
  const recs = db.records || []

  const liveRecs = recs.filter(r => !r.fin)
  const todayRecs = recs.filter(r => r.inicio.startsWith(todayStr))
  const checkedIn = new Set(liveRecs.map(r => r.empId)).size

  const ws = wkStart(now)
  const weekRecs = recs.filter(r => r.fin && new Date(r.inicio) >= ws)
  const weekMin = weekRecs.reduce((s, r) => s + calcMin(r), 0)

  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
  const monthMin = recs.filter(r => r.fin && r.inicio.startsWith(mk)).reduce((s, r) => s + calcMin(r), 0)

  const vacPend = (db.vacaciones || []).filter(v => v.estado === 'pendiente').length

  const heat = buildHeatmap(recs, emps.length)
  const recentAudit = (db.audit || []).slice(-5).reverse()

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title">Dashboard</h1>
        <div className="adm-panel-sub">{now.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
      </div>

      <div className="adm-stats-grid">
        {[
          { label:'Fichados ahora', val: checkedIn, total: emps.length, color:'var(--green)', bg:'var(--green-dim)', ico:'▶️' },
          { label:'Horas esta semana', val: mhm(weekMin), color:'var(--primary-light)', bg:'var(--primary-dim)', ico:'⏱️' },
          { label:'Horas este mes', val: mhm(monthMin), color:'var(--teal)', bg:'rgba(12,200,232,.1)', ico:'📅' },
          { label:'Solicitudes pendientes', val: vacPend, color:'var(--orange)', bg:'var(--orange-dim)', ico:'📬' },
        ].map(({ label, val, total, color, bg, ico }) => (
          <div key={label} className="adm-stat-card">
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <div style={{ width:34, height:34, background:bg, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{ico}</div>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text3)' }}>{label}</div>
            </div>
            <div style={{ fontSize:28, fontWeight:800, letterSpacing:'-1px', color }}>
              {val}{total !== undefined ? <span style={{ fontSize:14, color:'var(--text3)', fontWeight:400 }}>/{total}</span> : ''}
            </div>
          </div>
        ))}
      </div>

      {/* Live workers + Today activity */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
        {/* Working now */}
        <div className="adm-section" style={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'16px', margin:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.7px' }}>Trabajando ahora</div>
            <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'var(--green-dim)', color:'var(--green)' }}>{liveRecs.length}</span>
          </div>
          {!liveRecs.length ? (
            <div style={{ fontSize:12, color:'var(--text4)', textAlign:'center', padding:'16px 0' }}>Nadie trabajando</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {liveRecs.slice(0,6).map(r => {
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
            </div>
          )}
        </div>

        {/* Recent fichajes */}
        <div className="adm-section" style={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'16px', margin:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.7px' }}>Fichajes de hoy</div>
            <span style={{ fontSize:11, fontWeight:600, color:'var(--text4)' }}>{todayRecs.length}</span>
          </div>
          {!todayRecs.length ? (
            <div style={{ fontSize:12, color:'var(--text4)', textAlign:'center', padding:'16px 0' }}>Sin fichajes hoy</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {[...todayRecs].sort((a,b) => b.inicio.localeCompare(a.inicio)).slice(0,6).map(r => {
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
            </div>
          )}
        </div>
      </div>

      {/* Heatmap */}
      <div className="adm-section">
        <div className="adm-section-title">📆 Actividad (últimas 12 semanas)</div>
        <Heatmap data={heat} />
      </div>

      {/* Recent audit */}
      {recentAudit.length > 0 && (
        <div className="adm-section">
          <div className="adm-section-title">🔍 Actividad reciente</div>
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
    </div>
  )
}

function buildHeatmap(recs, empCount) {
  const map = {}
  const now = new Date()
  for (let i = 83; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    const k = d.toISOString().slice(0,10)
    map[k] = { count: 0, min: 0 }
  }
  recs.filter(r => r.fin).forEach(r => {
    const k = r.inicio.slice(0,10)
    if (map[k]) { map[k].count++; map[k].min += calcMin(r) }
  })
  return Object.entries(map).map(([date, v]) => ({ date, ...v }))
}

function Heatmap({ data }) {
  const max = Math.max(1, ...data.map(d => d.count))
  const weeks = []
  for (let i = 0; i < data.length; i += 7) weeks.push(data.slice(i, i+7))

  return (
    <div style={{ overflowX:'auto', paddingBottom:4 }}>
      <div style={{ display:'flex', gap:3 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display:'flex', flexDirection:'column', gap:3 }}>
            {week.map(({ date, count, min }) => {
              const pct = count / max
              const alpha = pct < 0.01 ? 0 : Math.max(0.15, pct)
              return (
                <div key={date} title={`${date}: ${count} fichajes · ${mhm(Math.floor(min))}`}
                  style={{ width:12, height:12, borderRadius:2, flexShrink:0,
                    background: alpha < 0.01 ? 'var(--bg-500)' : `rgba(94,106,210,${alpha})`,
                    border: alpha > 0 ? '1px solid rgba(94,106,210,.2)' : '1px solid var(--border)' }} />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── PANEL CONTROL LIVE ───────────────────────────────────────────────────────
function PanelControl({ db, toast, saveDB }) {
  const emps = (db.employees || []).filter(e => !e.baja)
  const recs = db.records || []
  const liveRecs = recs.filter(r => !r.fin)
  const [tick, setTick] = useState(0)
  useEffect(() => { const iv = setInterval(() => setTick(t => t+1), 5000); return () => clearInterval(iv) }, [])

  const force = (rec) => {
    if (!window.confirm(`¿Forzar cierre de jornada de ${rec.empName}?`)) return
    const now = new Date().toISOString()
    const breaks = [...(rec.breaks || [])]
    if (rec.enDescanso && rec.bStartTs) breaks.push({ start: rec.bStartTs, end: now })
    const closed = { ...rec, fin: now, breaks, enDescanso: false, bStartTs: null, closed: true }
    const t = calcSecs(closed); closed.workSecs = t.work; closed.breakSecs = t.brk
    const records = recs.map(r => r.id === rec.id ? closed : r)
    saveDB({ records })
    toast('✅ Jornada cerrada forzosamente')
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title">Control en tiempo real</h1>
        <div className="adm-panel-sub">{liveRecs.length} empleados activos de {emps.length}</div>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Empleado</th><th>Centro</th><th>Entrada</th><th>Tiempo</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {emps.map(e => {
              const live = liveRecs.find(r => r.empId === e.id)
              const t = live ? calcSecs(live) : null
              return (
                <tr key={e.id} style={{ opacity: live ? 1 : 0.4 }}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background: e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>
                        {(e.initials||e.name.slice(0,2)).toUpperCase()}
                      </div>
                      {e.name}
                    </div>
                  </td>
                  <td style={{ color:'var(--text3)', fontSize:12 }}>{live?.centro || e.centroTrabajo || '—'}</td>
                  <td style={{ fontVariantNumeric:'tabular-nums', fontSize:12 }}>{live ? ftime(live.inicio) : '—'}</td>
                  <td style={{ fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{t ? mhm(Math.floor(t.work/60)) : '—'}</td>
                  <td>
                    {live ? (
                      <span className={`badge ${live.enDescanso?'badge-orange':'badge-green'}`}>
                        {live.enDescanso ? '⏸ Descanso' : '▶ Trabajando'}
                      </span>
                    ) : <span className="badge">Libre</span>}
                  </td>
                  <td>{live && <button className="btn btn-sm btn-danger" onClick={() => force(live)}>Cerrar</button>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── PANEL FICHAJES ───────────────────────────────────────────────────────────
function PanelFichajes({ db, toast, saveDB }) {
  const [search, setSearch] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [filterEmp, setFilterEmp] = useState('')
  const emps = db.employees || []
  const recs = (db.records || []).filter(r => r.fin)

  const filtered = recs.filter(r => {
    if (filterDate && !r.inicio.startsWith(filterDate)) return false
    if (filterEmp && r.empId !== filterEmp) return false
    if (search) {
      const q = search.toLowerCase()
      if (!r.empName?.toLowerCase().includes(q) && !r.centro?.toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a,b) => b.inicio.localeCompare(a.inicio)).slice(0, 200)

  const del = (id) => {
    if (!window.confirm('¿Eliminar este fichaje?')) return
    saveDB({ records: (db.records||[]).filter(r => r.id !== id) })
    toast('Fichaje eliminado')
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title">Fichajes</h1>
        <div className="adm-panel-sub">{recs.length} registros totales</div>
      </div>
      <div className="adm-filters">
        <input placeholder="Buscar empleado o centro…" value={search} onChange={e => setSearch(e.target.value)} />
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="">Todos los empleados</option>
          {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Empleado</th><th>Centro</th><th>Entrada</th><th>Salida</th><th>Trabajo</th><th>Descanso</th><th></th></tr></thead>
          <tbody>
            {filtered.map(r => {
              const wm = Math.floor(recWorkSecs(r)/60)
              const bm = Math.floor((r.breakSecs||0)/60)
              const over = wm > WD
              return (
                <tr key={r.id}>
                  <td>{r.empName}</td>
                  <td style={{ color:'var(--text3)', fontSize:12 }}>{r.centro || '—'}</td>
                  <td style={{ fontVariantNumeric:'tabular-nums', fontSize:12 }}>{ftime(r.inicio)}</td>
                  <td style={{ fontVariantNumeric:'tabular-nums', fontSize:12 }}>{ftime(r.fin)}</td>
                  <td style={{ fontWeight:700, color: over ? 'var(--orange)' : undefined }}>{mhm(wm)}</td>
                  <td style={{ color:'var(--text3)', fontSize:12 }}>{mhm(bm)}</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => del(r.id)}>✕</button></td>
                </tr>
              )
            })}
            {!filtered.length && <tr><td colSpan={7} className="empty">Sin resultados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── PANEL SOLICITUDES ────────────────────────────────────────────────────────
function PanelSolicitudes({ db, toast, saveDB }) {
  const vacs = (db.vacaciones || []).sort((a,b) => b.ts?.localeCompare(a.ts||'')||0)
  const pend = vacs.filter(v => v.estado === 'pendiente')
  const rest = vacs.filter(v => v.estado !== 'pendiente')

  const act = (id, estado) => {
    const updated = (db.vacaciones||[]).map(v => v.id === id ? { ...v, estado, resolvedAt: new Date().toISOString() } : v)
    saveDB({ vacaciones: updated })
    toast(estado === 'aprobada' ? '✅ Solicitud aprobada' : '❌ Solicitud rechazada')
  }

  const VacRow = ({ v }) => (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--bg-600)', borderRadius:'var(--r)', border:'1px solid var(--border)', marginBottom:8 }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:700 }}>{v.empName}</div>
        <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>{fds(v.fechaInicio)} → {fds(v.fechaFin)} · {v.dias} días</div>
        {v.motivo && <div style={{ fontSize:11, color:'var(--text4)', marginTop:2 }}>{v.motivo}</div>}
      </div>
      <div className={`badge${v.estado==='aprobada'?' badge-green':v.estado==='rechazada'?' badge-red':' badge-orange'}`}>
        {v.estado==='aprobada'?'✓ Aprobada':v.estado==='rechazada'?'✗ Rechazada':'⏳ Pendiente'}
      </div>
      {v.estado === 'pendiente' && (
        <div style={{ display:'flex', gap:6 }}>
          <button className="btn btn-sm btn-primary" onClick={() => act(v.id, 'aprobada')}>✓</button>
          <button className="btn btn-sm btn-danger" onClick={() => act(v.id, 'rechazada')}>✗</button>
        </div>
      )}
    </div>
  )

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title">Solicitudes</h1>
        <div className="adm-panel-sub">{pend.length} pendientes</div>
      </div>
      {pend.length > 0 && (
        <>
          <div className="adm-section-title" style={{ padding:'0 0 12px' }}>⏳ Pendientes de revisión</div>
          {pend.map(v => <VacRow key={v.id} v={v} />)}
        </>
      )}
      {rest.length > 0 && (
        <>
          <div className="adm-section-title" style={{ padding:'16px 0 12px' }}>Historial</div>
          {rest.slice(0, 30).map(v => <VacRow key={v.id} v={v} />)}
        </>
      )}
      {!vacs.length && <div className="empty">Sin solicitudes</div>}
    </div>
  )
}

// ─── PANEL EMPLEADOS ──────────────────────────────────────────────────────────
function PanelEmpleados({ db, toast, saveDB, openModal, closeModal, activeModal, modalData }) {
  const emps = sortedEmps(db)
  const [showForm, setShowForm] = useState(false)
  const [editEmp, setEditEmp] = useState(null)

  const EMPTY_EMP = { id: gid(), name:'', pin:'', email:'', role:'emp', empresa:'', centroTrabajo:'', color:'#5E6AD2', baja:false, fechaAlta: today() }
  const [form, setForm] = useState(EMPTY_EMP)

  const openNew = () => { setForm({ ...EMPTY_EMP, id: gid() }); setShowForm(true); setEditEmp(null) }
  const openEdit = (e) => { setForm({ ...e }); setShowForm(true); setEditEmp(e.id) }

  const saveEmp = () => {
    if (!form.name.trim()) { toast('Nombre requerido'); return }
    if (!form.pin || form.pin.length < 4) { toast('PIN de mínimo 4 dígitos'); return }
    const exists = (db.employees||[]).find(e => e.pin === form.pin && e.id !== form.id)
    if (exists) { toast('PIN ya está en uso'); return }
    const emps2 = editEmp
      ? (db.employees||[]).map(e => e.id === editEmp ? form : e)
      : [...(db.employees||[]), form]
    saveDB({ employees: emps2 })
    toast(editEmp ? '✅ Empleado actualizado' : '✅ Empleado creado')
    setShowForm(false)
  }

  const del = (id) => {
    if (!window.confirm('¿Dar de baja a este empleado?')) return
    const emps2 = (db.employees||[]).map(e => e.id === id ? { ...e, baja:true, fechaBaja: today() } : e)
    saveDB({ employees: emps2 })
    toast('Empleado dado de baja')
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title">Empleados</h1>
        <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nuevo</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>{editEmp ? 'Editar empleado' : 'Nuevo empleado'}</div>
          <div className="field-row">
            <div className="field"><label>Nombre completo *</label><input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} /></div>
            <div className="field"><label>PIN (4-6 dígitos) *</label><input value={form.pin} maxLength={6} onChange={e => setForm(f=>({...f,pin:e.target.value.replace(/\D/,'')}))} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Email</label><input type="email" value={form.email||''} onChange={e => setForm(f=>({...f,email:e.target.value}))} /></div>
            <div className="field"><label>Rol</label>
              <select value={form.role||'emp'} onChange={e => setForm(f=>({...f,role:e.target.value}))}>
                <option value="emp">Empleado</option>
                <option value="encargado">Encargado</option>
                <option value="jefe_obra">Jefe de Obra</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>Empresa</label><input value={form.empresa||''} onChange={e => setForm(f=>({...f,empresa:e.target.value}))} /></div>
            <div className="field"><label>Centro de trabajo</label><input value={form.centroTrabajo||''} onChange={e => setForm(f=>({...f,centroTrabajo:e.target.value}))} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Color avatar</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingTop:4 }}>
                {['#5E6AD2','#7C5CFF','#00D2FF','#00C48C','#FF6B6B','#FFB547','#E040FB'].map(c => (
                  <div key={c} onClick={() => setForm(f=>({...f,color:c}))} style={{ width:24, height:24, borderRadius:'50%', background:c, cursor:'pointer', border: form.color===c?'2px solid white':'2px solid transparent', transition:'.15s' }} />
                ))}
              </div>
            </div>
            <div className="field"><label>Fecha alta</label><input type="date" value={form.fechaAlta||''} onChange={e => setForm(f=>({...f,fechaAlta:e.target.value}))} /></div>
          </div>
          <div className="modal-btns">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveEmp}>Guardar</button>
          </div>
        </div>
      )}

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Empleado</th><th>PIN</th><th>Rol</th><th>Empresa</th><th>Alta</th><th></th></tr></thead>
          <tbody>
            {emps.map(e => (
              <tr key={e.id} style={{ opacity: e.baja ? 0.4 : 1 }}>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background: e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>
                      {(e.initials||e.name.slice(0,2)).toUpperCase()}
                    </div>
                    <span>{e.name}</span>
                  </div>
                </td>
                <td style={{ fontFamily:'monospace', letterSpacing:2 }}>{'•'.repeat(e.pin?.length||4)}</td>
                <td>
                  <span className={`badge${e.role==='encargado'?' badge-purple':e.role==='jefe_obra'?' badge-blue':''}`}>
                    {e.role==='encargado'?'⭐ Enc.':e.role==='jefe_obra'?'🏗️ JO':'👷 Emp'}
                  </span>
                </td>
                <td style={{ color:'var(--text3)', fontSize:12 }}>{e.empresa || '—'}</td>
                <td style={{ color:'var(--text3)', fontSize:12 }}>{e.fechaAlta || '—'}</td>
                <td>
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => openEdit(e)}>✏️</button>
                    {!e.baja && <button className="btn btn-sm btn-danger" onClick={() => del(e.id)}>Baja</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── PANEL INFORMES ───────────────────────────────────────────────────────────
function PanelInformes({ db, toast }) {
  const [tab, setTab] = useState('resumen')
  const [selEmp, setSelEmp] = useState('')
  const [selMonth, setSelMonth] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const recs = db.records || []
  const emps = (db.employees || []).filter(e => !e.baja)
  const now = new Date()

  const filterMonth = selMonth || `${now.getFullYear()}-${p2(now.getMonth()+1)}`

  const rows = sortedEmps(db).filter(e => !e.baja).map(e => {
    const eRecs = recs.filter(r => r.empId === e.id && r.fin && r.inicio.startsWith(filterMonth))
    const totalMin = eRecs.reduce((s, r) => s + calcMin(r), 0)
    const expected = WK * 4
    const diff = totalMin - expected
    const vac = vacData(e.id, db)
    return { e, totalMin, diff, days: eRecs.length, vac }
  })

  const exportCSV = () => {
    let filtered = recs.filter(r => r.fin)
    if (selEmp) filtered = filtered.filter(r => r.empId === selEmp)
    if (from) filtered = filtered.filter(r => r.inicio.slice(0,10) >= from)
    if (to)   filtered = filtered.filter(r => r.inicio.slice(0,10) <= to)
    if (!filtered.length) { toast('Sin datos para exportar'); return }
    const headers = ['Empleado','Centro','Empresa','Entrada','Salida','Horas trabajo','Horas descanso']
    const csvRows = filtered.map(r => {
      const wm = Math.floor(recWorkSecs(r)/60), bm = Math.floor((r.breakSecs||0)/60)
      return [r.empName, r.centro||'', r.empresa||'', new Date(r.inicio).toLocaleString('es-ES'), new Date(r.fin).toLocaleString('es-ES'), `${Math.floor(wm/60)}:${p2(wm%60)}`, `${Math.floor(bm/60)}:${p2(bm%60)}`]
    })
    const csv = '﻿' + [headers, ...csvRows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8;' }))
    a.download = `fichajes_${from||'todo'}_${to||'hoy'}.csv`
    a.click()
    toast('✅ CSV descargado')
  }

  const [y, mo] = filterMonth.split('-').map(Number)
  const daysInMonth = new Date(y, mo, 0).getDate()

  const exportDetalleCSV = () => {
    const empRows = sortedEmps(db).filter(e => !e.baja)
    const header = ['Empleado', ...Array.from({length:daysInMonth},(_,i)=>String(i+1)), 'Total']
    const csvRows = empRows.map(e => {
      const dayMap = {}
      recs.filter(r => r.empId===e.id && r.fin && r.inicio.startsWith(filterMonth)).forEach(r => {
        const day = parseInt(r.inicio.slice(8,10))
        dayMap[day] = (dayMap[day]||0) + calcMin(r)
      })
      const total = Object.values(dayMap).reduce((s,v)=>s+v,0)
      return [e.name, ...Array.from({length:daysInMonth},(_,i)=>dayMap[i+1]?`${Math.floor(dayMap[i+1]/60)}:${p2(dayMap[i+1]%60)}`:''), mhm(total)]
    })
    const csv = '﻿' + [header,...csvRows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})); a.download=`detalle_${filterMonth}.csv`; a.click()
    toast('✅ CSV descargado')
  }

  const TABS = [
    { id:'resumen',  label:'Resumen mensual' },
    { id:'detalle',  label:'Detalle diario' },
    { id:'ranking',  label:'Ranking horas' },
    { id:'analitica',label:'Analítica' },
    { id:'exportar', label:'Exportar' },
  ]

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title">Informes</h1>
        <div className="adm-panel-sub">{new Date(filterMonth + '-01').toLocaleDateString('es-ES', { month:'long', year:'numeric' })}</div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, background:'var(--bg-600)', borderRadius:'var(--r-sm)', padding:4, marginBottom:20, width:'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'7px 14px', borderRadius:6, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .15s',
              background: tab===t.id ? 'var(--bg-400)' : 'transparent',
              color: tab===t.id ? 'var(--text)' : 'var(--text3)',
              boxShadow: tab===t.id ? 'var(--shadow-sm)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Month selector */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
        <input type="month" value={filterMonth} onChange={e => setSelMonth(e.target.value)}
          style={{ width:'auto', padding:'7px 12px', fontSize:13, borderRadius:8 }} />
      </div>

      {/* Resumen tab */}
      {tab === 'resumen' && (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Empleado</th><th>Días</th><th>Total mes</th><th>Esperadas</th><th>Diferencia</th><th>Vac. disp.</th></tr></thead>
            <tbody>
              {rows.map(({ e, totalMin, diff, days, vac }) => (
                <tr key={e.id}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:26, height:26, borderRadius:'50%', background: e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>
                        {(e.initials||e.name.slice(0,2)).toUpperCase()}
                      </div>
                      {e.name}
                    </div>
                  </td>
                  <td>{days}</td>
                  <td style={{ fontWeight:700 }}>{mhm(totalMin)}</td>
                  <td style={{ color:'var(--text3)' }}>{mhm(WK * 4)}</td>
                  <td style={{ fontWeight:700, color: diff >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {diff >= 0 ? '+' : ''}{mhm(Math.abs(diff))}
                  </td>
                  <td>{vac.available}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detalle diario tab */}
      {tab === 'detalle' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button className="btn btn-secondary btn-sm" onClick={exportDetalleCSV}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar CSV
            </button>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="adm-table" style={{ fontSize:11, minWidth: 120 + daysInMonth*38 }}>
              <thead>
                <tr>
                  <th style={{ minWidth:120, textAlign:'left' }}>Empleado</th>
                  {Array.from({length:daysInMonth},(_,i) => {
                    const d = new Date(y, mo-1, i+1)
                    const isWknd = d.getDay()===0||d.getDay()===6
                    return <th key={i} style={{ minWidth:36, textAlign:'center', padding:'6px 4px', color: isWknd?'var(--text4)':'var(--text3)', fontWeight: isWknd?400:600 }}>{i+1}</th>
                  })}
                  <th style={{ minWidth:60, textAlign:'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {sortedEmps(db).filter(e=>!e.baja).map(e => {
                  const dayMap = {}
                  recs.filter(r=>r.empId===e.id&&r.fin&&r.inicio.startsWith(filterMonth)).forEach(r=>{
                    const day = parseInt(r.inicio.slice(8,10))
                    dayMap[day] = (dayMap[day]||0) + calcMin(r)
                  })
                  const totalMin = Object.values(dayMap).reduce((s,v)=>s+v,0)
                  return (
                    <tr key={e.id}>
                      <td style={{ fontWeight:600, whiteSpace:'nowrap' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ width:20, height:20, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, color:'#fff', flexShrink:0 }}>
                            {(e.initials||e.name.slice(0,2)).toUpperCase()}
                          </div>
                          {e.name.split(' ')[0]}
                        </div>
                      </td>
                      {Array.from({length:daysInMonth},(_,i) => {
                        const m2 = dayMap[i+1]
                        const d = new Date(y, mo-1, i+1)
                        const isWknd = d.getDay()===0||d.getDay()===6
                        return (
                          <td key={i} style={{ textAlign:'center', padding:'5px 2px', background: m2?'rgba(94,106,210,.12)':isWknd?'rgba(255,255,255,.02)':undefined, color: m2?'var(--primary-light)':'var(--text4)', fontWeight:m2?700:400, fontVariantNumeric:'tabular-nums' }}>
                            {m2 ? `${Math.floor(m2/60)}:${p2(m2%60)}` : isWknd?'·':'—'}
                          </td>
                        )
                      })}
                      <td style={{ textAlign:'right', fontWeight:700, fontVariantNumeric:'tabular-nums', color:'var(--text)' }}>{mhm(totalMin)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ranking tab */}
      {tab === 'ranking' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[...rows].sort((a,b) => b.totalMin - a.totalMin).map(({ e, totalMin, days }, idx) => {
            const maxMin = Math.max(...rows.map(r => r.totalMin), 1)
            const pct = Math.round(totalMin / maxMin * 100)
            const medals = ['🥇','🥈','🥉']
            return (
              <div key={e.id} style={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'14px 18px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                  <div style={{ fontSize:20, width:28, textAlign:'center' }}>{medals[idx] || `${idx+1}`}</div>
                  <div style={{ width:36, height:36, borderRadius:'50%', background: e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
                    {(e.initials||e.name.slice(0,2)).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{e.name}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{days} días trabajados</div>
                  </div>
                  <div style={{ fontSize:20, fontWeight:800, color: idx===0 ? 'var(--primary-light)' : 'var(--text)', fontVariantNumeric:'tabular-nums', flexShrink:0 }}>
                    {mhm(totalMin)}
                  </div>
                </div>
                <div style={{ height:6, background:'var(--bg-400)', borderRadius:3 }}>
                  <div style={{ height:'100%', borderRadius:3, background: idx===0 ? 'linear-gradient(90deg,var(--primary),var(--accent))' : 'var(--primary-dim)', width: pct + '%', transition:'width .6s ease' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Analítica tab */}
      {tab === 'analitica' && (
        <div>
          <div className="adm-stats-grid" style={{ marginBottom:20 }}>
            {(() => {
              const totalMin = rows.reduce((s, r) => s + r.totalMin, 0)
              const avgMin = rows.length ? Math.round(totalMin / rows.length) : 0
              const topEmp = [...rows].sort((a,b) => b.totalMin - a.totalMin)[0]
              const overExpected = rows.filter(r => r.diff > 0).length
              return [
                { label:'Total horas mes', val: mhm(totalMin), color:'var(--primary-light)', bg:'var(--primary-dim)', ico:<line x1="18" y1="20" x2="18" y2="10"/> },
                { label:'Promedio por empleado', val: mhm(avgMin), color:'var(--teal)', bg:'rgba(12,200,232,.1)', ico:<circle cx="12" cy="12" r="10"/> },
                { label:'Sobre objetivo', val: `${overExpected}/${rows.length}`, color:'var(--green)', bg:'var(--green-dim)', ico:<polyline points="20 6 9 17 4 12"/> },
                { label:'Lider del mes', val: topEmp?.e.name?.split(' ')[0] || '—', color:'var(--orange)', bg:'var(--orange-dim)', ico:<><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></> },
              ].map(({ label, val, color, bg, ico }) => (
                <div key={label} className="adm-stat-card">
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                    <div style={{ width:34, height:34, background:bg, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">{ico}</svg>
                    </div>
                    <div style={{ fontSize:11, fontWeight:600, color:'var(--text3)' }}>{label}</div>
                  </div>
                  <div style={{ fontSize:24, fontWeight:800, color }}>{val}</div>
                </div>
              ))
            })()}
          </div>
          <div className="adm-section">
            <div className="adm-section-title">Distribución por empleado</div>
            {[...rows].sort((a,b) => b.totalMin - a.totalMin).map(({ e, totalMin }) => {
              const maxMin = Math.max(...rows.map(r => r.totalMin), 1)
              const pct = Math.round(totalMin / maxMin * 100)
              return (
                <div key={e.id} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                  <div style={{ width:80, fontSize:11, fontWeight:600, color:'var(--text2)', textAlign:'right', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name.split(' ')[0]}</div>
                  <div style={{ flex:1, height:8, background:'var(--bg-400)', borderRadius:4 }}>
                    <div style={{ height:'100%', borderRadius:4, background:`linear-gradient(90deg,${e.color||'var(--primary)'},${e.color||'var(--primary)'}88)`, width: pct + '%', transition:'width .6s' }} />
                  </div>
                  <div style={{ width:60, fontSize:12, fontWeight:700, color:'var(--text)', fontVariantNumeric:'tabular-nums' }}>{mhm(totalMin)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Exportar tab */}
      {tab === 'exportar' && (
        <div style={{ maxWidth:500 }}>
          <div style={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Exportar fichajes a CSV</div>
            <div className="field">
              <label>Empleado</label>
              <select value={selEmp} onChange={e => setSelEmp(e.target.value)}>
                <option value="">Todos los empleados</option>
                {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="field-row">
              <div className="field"><label>Desde</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
              <div className="field"><label>Hasta</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
            </div>
            <button className="btn btn-primary" style={{ width:'100%' }} onClick={exportCSV}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Descargar CSV
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PANEL OBRAS ──────────────────────────────────────────────────────────────
function PanelObras({ db, toast, saveDB }) {
  const [tab, setTab] = useState('obras')
  const [newObra, setNewObra] = useState('')
  const [newCentro, setNewCentro] = useState('')
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')

  const obras = db.obras || []
  const centros = db.centrosTrabajo || []

  const addObra = () => {
    const n = newObra.trim()
    if (!n) { toast('Escribe un nombre'); return }
    if (obras.find(o => o.nombre === n)) { toast('Ya existe'); return }
    const obra = { id: gid(), nombre: n, direccion:'', estado:'activa', createdAt: today() }
    saveDB({ obras: [...obras, obra] })
    setNewObra('')
    toast('✅ Obra creada')
  }

  const delObra = (id) => {
    if (!window.confirm('¿Eliminar esta obra?')) return
    saveDB({ obras: obras.filter(o => o.id !== id) })
    toast('Obra eliminada')
  }

  const addCentro = () => {
    const n = newCentro.trim()
    if (!n) { toast('Escribe un nombre'); return }
    if (centros.includes(n)) { toast('Ya existe'); return }
    saveDB({ centrosTrabajo: [...centros, n] })
    setNewCentro('')
    toast('✅ Centro añadido')
  }

  const delCentro = (c) => {
    if (!window.confirm(`¿Eliminar "${c}"?`)) return
    saveDB({ centrosTrabajo: centros.filter(x => x !== c) })
    toast('Centro eliminado')
  }

  const TABS = [{ id:'obras', label:'Obras' }, { id:'centros', label:'Centros de trabajo' }]

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title">{tab === 'obras' ? 'Obras' : 'Centros de trabajo'}</h1>
      </div>

      {/* Subtabs */}
      <div style={{ display:'flex', gap:4, background:'var(--bg-600)', borderRadius:'var(--r-sm)', padding:4, marginBottom:20, width:'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'7px 16px', borderRadius:6, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .15s',
              background: tab===t.id ? 'var(--bg-400)' : 'transparent',
              color: tab===t.id ? 'var(--text)' : 'var(--text3)',
              boxShadow: tab===t.id ? 'var(--shadow-sm)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Obras */}
      {tab === 'obras' && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:20 }}>
            <input style={{ flex:1 }} placeholder="Nombre de la obra…" value={newObra} onChange={e => setNewObra(e.target.value)} onKeyDown={e => e.key==='Enter'&&addObra()} />
            <button className="btn btn-primary" onClick={addObra}>+ Crear</button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {!obras.length && <div className="empty">Sin obras creadas</div>}
            {obras.map(o => (
              <div key={o.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'var(--bg-700)', borderRadius:'var(--r)', border:'1px solid var(--border)', transition:'border-color .15s' }}>
                <div style={{ width:40, height:40, borderRadius:10, background:'var(--primary-dim)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--primary-light)" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700 }}>{o.nombre}</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                    {(db.records||[]).filter(r=>r.centro===o.nombre&&r.fin).length} fichajes · Creada {o.createdAt}
                  </div>
                </div>
                <span className={`badge ${o.estado==='activa'?'badge-green':'badge-gray'}`}>{o.estado}</span>
                <button className="btn btn-sm btn-danger" onClick={() => delObra(o.id)}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Centros */}
      {tab === 'centros' && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:20 }}>
            <input style={{ flex:1 }} placeholder="Nombre del centro de trabajo…" value={newCentro} onChange={e => setNewCentro(e.target.value)} onKeyDown={e => e.key==='Enter'&&addCentro()} />
            <button className="btn btn-primary" onClick={addCentro}>+ Añadir</button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {!centros.length && <div className="empty">Sin centros de trabajo</div>}
            {centros.map(c => (
              <div key={c} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'var(--bg-700)', borderRadius:'var(--r)', border:'1px solid var(--border)' }}>
                <div style={{ width:40, height:40, borderRadius:10, background:'rgba(12,200,232,.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700 }}>{c}</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                    {(db.records||[]).filter(r=>r.centro===c&&r.fin).length} fichajes registrados
                  </div>
                </div>
                <button className="btn btn-sm btn-danger" onClick={() => delCentro(c)}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── PANEL DOCUMENTOS ─────────────────────────────────────────────────────────
function PanelDocumentos({ db, toast, saveDB }) {
  const emps = (db.employees||[]).filter(e => !e.baja)
  const docs = db.documentos || []
  const [showForm, setShowForm] = useState(false)
  const [tab, setTab] = useState('todos')
  const EMPTY = { empId:'', tipo:'nomina', titulo:'', mes:'', url:'' }
  const [form, setForm] = useState(EMPTY)
  const [fileData, setFileData] = useState('')
  const [fileName, setFileName] = useState('')

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (!f) return
    if (f.size > 700000) { toast('Archivo muy grande (máx. 700KB). Comprime el PDF o usa una URL.'); return }
    const reader = new FileReader()
    reader.onload = ev => { setFileData(ev.target.result); setFileName(f.name) }
    reader.readAsDataURL(f)
  }

  const add = () => {
    if (!form.empId) { toast('Selecciona un empleado'); return }
    if (!form.titulo.trim()) { toast('Escribe un título'); return }
    const emp = emps.find(e => e.id === form.empId)
    const doc = { ...form, id: gid(), empName: emp?.name || '', createdAt: new Date().toISOString(), firma: null }
    if (fileData) { doc.fileData = fileData; doc.fileName = fileName }
    saveDB({ documentos: [...docs, doc] })
    toast('✅ Documento enviado al empleado')
    setShowForm(false)
    setForm(EMPTY)
    setFileData(''); setFileName('')
  }

  const addJornada = (empId) => {
    const now = new Date()
    const mes = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
    const emp = emps.find(e => e.id === empId)
    if (!emp) return
    const already = docs.find(d => d.empId === empId && d.tipo === 'jornada' && d.mes === mes)
    if (already) { toast('Ya existe jornada para ese mes'); return }
    const doc = { id: gid(), empId, empName: emp.name, tipo:'jornada', titulo:`Jornada mensual ${mes}`, mes, url:'', createdAt: new Date().toISOString(), firma: null }
    saveDB({ documentos: [...docs, doc] })
    toast('✅ Jornada enviada para firma')
  }

  const del = (id) => {
    if (!window.confirm('¿Eliminar este documento?')) return
    saveDB({ documentos: docs.filter(d => d.id !== id) })
    toast('Documento eliminado')
  }

  const filtered = tab === 'todos' ? docs
    : tab === 'pendientes' ? docs.filter(d => !d.firma)
    : tab === 'firmados' ? docs.filter(d => d.firma)
    : docs.filter(d => d.tipo === tab)

  const TIPO_LABELS = { nomina:'Nómina', contrato:'Contrato', jornada:'Jornada' }
  const TIPO_COLORS = { nomina:'var(--primary-light)', contrato:'var(--teal)', jornada:'var(--orange)' }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title">Documentos</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setShowForm(false); setTab('todos') }}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="4" x2="7" y2="4"/><line x1="3" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="11" y2="12"/><line x1="7" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/></svg>
            Jornadas mensuales
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)}>+ Nuevo documento</button>
        </div>
      </div>

      {/* New doc form */}
      {showForm && (
        <div style={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>Enviar documento a empleado</div>
          <div className="field-row">
            <div className="field">
              <label>Empleado *</label>
              <select value={form.empId} onChange={e => setForm(f=>({...f,empId:e.target.value}))}>
                <option value="">— Seleccionar —</option>
                {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Tipo *</label>
              <select value={form.tipo} onChange={e => setForm(f=>({...f,tipo:e.target.value}))}>
                <option value="nomina">Nómina</option>
                <option value="contrato">Contrato de trabajo</option>
                <option value="jornada">Jornada mensual</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>Título *</label><input value={form.titulo} onChange={e => setForm(f=>({...f,titulo:e.target.value}))} placeholder="Ej: Nómina enero 2026" /></div>
            <div className="field"><label>Mes (YYYY-MM)</label><input type="month" value={form.mes} onChange={e => setForm(f=>({...f,mes:e.target.value}))} /></div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Archivo (PDF / imagen, máx 700KB)</label>
              <label style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--bg-600)', border:`1px dashed ${fileData?'var(--green)':'var(--border2)'}`, borderRadius:8, cursor:'pointer', transition:'border-color .15s' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={fileData?'var(--green)':'var(--text3)'} strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span style={{ fontSize:12, color: fileData?'var(--green)':'var(--text3)' }}>{fileData ? `✓ ${fileName}` : 'Subir archivo…'}</span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFile} style={{ display:'none' }} />
              </label>
            </div>
            <div className="field"><label>O enlace URL</label><input value={form.url} onChange={e => setForm(f=>({...f,url:e.target.value}))} placeholder="https://..." /></div>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={add}>Enviar documento</button>
          </div>
        </div>
      )}

      {/* Jornadas rápidas */}
      <div style={{ background:'linear-gradient(135deg,var(--primary-dim),rgba(12,200,232,.06))', border:'1px solid rgba(94,106,210,.2)', borderRadius:'var(--r)', padding:'16px 20px', marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--primary-light)" strokeWidth="2" style={{ marginRight:6, verticalAlign:'middle' }}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Solicitar firma de jornada mensual
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {emps.map(e => {
            const now = new Date()
            const mes = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
            const signed = docs.find(d => d.empId === e.id && d.tipo === 'jornada' && d.mes === mes && d.firma)
            const pending = docs.find(d => d.empId === e.id && d.tipo === 'jornada' && d.mes === mes && !d.firma)
            return (
              <div key={e.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg-700)', borderRadius:8, border:'1px solid var(--border)' }}>
                <div style={{ width:26, height:26, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>
                  {(e.initials||e.name.slice(0,2)).toUpperCase()}
                </div>
                <span style={{ fontSize:12, fontWeight:600 }}>{e.name.split(' ')[0]}</span>
                {signed ? (
                  <span className="badge badge-green">✓ Firmada</span>
                ) : pending ? (
                  <span className="badge badge-orange">⏳ Pendiente</span>
                ) : (
                  <button className="btn btn-sm btn-primary" onClick={() => addJornada(e.id)}>Solicitar</button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:6, marginBottom:16 }}>
        {[['todos','Todos'],['pendientes','Pendientes'],['firmados','Firmados'],['nomina','Nóminas'],['contrato','Contratos'],['jornada','Jornadas']].map(([id,lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding:'5px 12px', borderRadius:20, border:'1px solid', fontSize:11, fontWeight:600, cursor:'pointer',
              background: tab===id ? 'var(--primary)' : 'transparent',
              color: tab===id ? '#fff' : 'var(--text3)',
              borderColor: tab===id ? 'var(--primary)' : 'var(--border)' }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Documents list */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {!filtered.length && <div className="empty">Sin documentos</div>}
        {[...filtered].sort((a,b) => b.createdAt?.localeCompare(a.createdAt||'')||0).map(d => {
          const emp = emps.find(e => e.id === d.empId)
          return (
            <div key={d.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)' }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'var(--bg-500)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={TIPO_COLORS[d.tipo]||'var(--text3)'} strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                  <div style={{ fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.titulo}</div>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'var(--bg-400)', color:TIPO_COLORS[d.tipo]||'var(--text3)', flexShrink:0 }}>{TIPO_LABELS[d.tipo]||d.tipo}</span>
                </div>
                <div style={{ fontSize:11, color:'var(--text3)' }}>
                  {d.empName} · {d.createdAt ? new Date(d.createdAt).toLocaleDateString('es-ES') : ''}
                  {d.firma && <span style={{ color:'var(--green)', marginLeft:8, fontWeight:600 }}>✓ Firmado {new Date(d.firma.firmadoAt).toLocaleDateString('es-ES')}</span>}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                {(d.fileData || d.url) && (
                  <a href={d.fileData || d.url} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary" style={{ textDecoration:'none' }}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    Ver
                  </a>
                )}
                {d.firma ? (
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    {d.firma.signatureData && (
                      <img src={d.firma.signatureData} alt="firma" style={{ height:32, borderRadius:4, border:'1px solid var(--border)', background:'var(--bg-600)' }} />
                    )}
                    <span className="badge badge-green">Firmado</span>
                  </div>
                ) : (
                  <span className="badge badge-orange">Pendiente</span>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => del(d.id)}>✕</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── PANEL AUDITORÍA ──────────────────────────────────────────────────────────
function PanelAuditoria({ db }) {
  const audit = (db.audit || []).slice().reverse()
  return (
    <div className="adm-panel">
      <div className="adm-panel-header"><h1 className="adm-panel-title">Auditoría</h1></div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {!audit.length && <div className="empty">Sin registros de auditoría</div>}
        {audit.map((a, i) => (
          <div key={i} className="audit-row">
            <div className="audit-ico">📝</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700 }}>{a.action}</div>
              <div style={{ fontSize:11, color:'var(--text3)' }}>{a.user}</div>
              {a.detail && <div style={{ fontSize:11, color:'var(--text4)', marginTop:2 }}>{a.detail}</div>}
            </div>
            <div style={{ fontSize:10, color:'var(--text4)', textAlign:'right', flexShrink:0 }}>
              {a.ts ? new Date(a.ts).toLocaleString('es-ES') : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
