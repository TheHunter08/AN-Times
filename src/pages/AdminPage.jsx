import { useState, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '../store/appStore.js'
import { today, mhm, p2, ftime, fds, calcSecs, calcMin, gid, vacData, wkStart, recWorkSecs, sortedEmps } from '../utils/time.js'
import { WD, WK, ADMIN_PIN } from '../config/constants.js'
import { auditLog, sendPushNotif } from '../services/dataService.js'
import { DocPreview } from '../components/DocPreview.jsx'

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

// Un "encargado" no es administrador: solo ve y gestiona la jornada de su obra asignada
const ENC_PAGES = [
  { id:'miobra', label:'Mi Obra' },
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
  miobra:      <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const isMobile = window.innerWidth < 768

  // Un "encargado" no es administrador: acceso restringido solo a su obra asignada
  const isEncargado = session.isEnc && !session.isJO
  const pages = isEncargado ? ENC_PAGES : PAGES

  useEffect(() => {
    if (isEncargado && !pages.find(p => p.id === currentAdminPage)) setAdminPage('miobra')
  }, [isEncargado])

  useEffect(() => {
    if (!isEncargado) {
      setTimeout(async () => {
        if ('Notification' in window && Notification.permission === 'default') {
          await Notification.requestPermission()
        }
      }, 3000)
    }
  }, [isEncargado])

  // Buscador global: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(s => !s); setSearchQ('') }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const pendingDocs = (db.documentos || []).filter(d => !d.firma).length
  const adminNotis = (db.notis || []).filter(n => n.empId === '__admin__' && !n.leido)

  const doLogout = () => { logout(); try { if (window._fbSignOut) window._fbSignOut() } catch {} }

  const nav = (id) => { setAdminPage(id); setSideOpen(false) }

  const actPanel = pages.find(p => p.id === currentAdminPage) || pages[0]

  return (
    <div className="screen active" id="sAdmin">
      {/* Topbar */}
      <div className="adm-topbar">
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button className="adm-menu-btn" onClick={() => setSideOpen(s => !s)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="adm-logo">
            <svg width="20" height="20" viewBox="0 0 44 44" fill="none">
              <defs>
                <linearGradient id="admLogoBg" x1="0" y1="0" x2="44" y2="44">
                  <stop offset="0%" stopColor="#7C5CFF"/><stop offset="55%" stopColor="#5E6AD2"/><stop offset="100%" stopColor="#3B4BD6"/>
                </linearGradient>
                <linearGradient id="admLogoAccent" x1="0" y1="0" x2="44" y2="44">
                  <stop offset="0%" stopColor="#7DF9FF"/><stop offset="100%" stopColor="#00D2FF"/>
                </linearGradient>
              </defs>
              <rect width="44" height="44" rx="10" fill="url(#admLogoBg)"/>
              <rect x="11.5" y="14.5" width="21" height="4.4" rx="2.2" fill="white"/>
              <rect x="19.8" y="14.5" width="4.4" height="15.5" rx="2.2" fill="white"/>
              <path d="M 30 19.8 A 7.2 7.2 0 1 1 26.8 27" fill="none" stroke="url(#admLogoAccent)" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="30" cy="19.8" r="1.1" fill="url(#admLogoAccent)"/>
            </svg>
            TIMES INC
          </div>
          <div className="adm-page-title">{actPanel.ico} {actPanel.label}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <SyncBadge />
          {!isEncargado && (
            <button onClick={() => { setSearchOpen(true); setSearchQ('') }} title="Buscar (⌘K)" style={{ background:'var(--bg-500)', border:'1px solid var(--border)', borderRadius:8, display:'flex', alignItems:'center', gap:6, padding:'5px 10px', cursor:'pointer', color:'var(--text3)', fontSize:12 }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span style={{ display:'none', '@media(min-width:640px)': { display:'inline' } }}>Buscar</span>
              <kbd style={{ fontSize:9, padding:'1px 5px', background:'var(--bg-400)', border:'1px solid var(--border)', borderRadius:3, fontFamily:'monospace' }}>⌘K</kbd>
            </button>
          )}
          {!isEncargado && (
            <button title="Notificaciones admin" onClick={() => {
              nav('documentos')
              const updated = (db.notis||[]).map(n => n.empId==='__admin__' ? {...n,leido:true} : n)
              saveDB({ notis: updated })
            }} style={{ position:'relative', background:'none', border:'none', cursor:'pointer', color:'var(--text3)', display:'flex', alignItems:'center', justifyContent:'center', width:34, height:34, borderRadius:8 }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {adminNotis.length > 0 && (
                <span style={{ position:'absolute', top:2, right:2, minWidth:16, height:16, borderRadius:8, background:'var(--danger)', color:'#fff', fontSize:9, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px' }}>{adminNotis.length}</span>
              )}
            </button>
          )}
          {session.user && (
            <button className="btn btn-secondary btn-sm" onClick={() => setScreen('emp')}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Panel Emp.
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={doLogout}>Salir</button>
        </div>
      </div>

      <div style={{ display:'flex', flex:1, minHeight:0, overflow:'hidden', position:'relative' }}>
        {/* Sidebar */}
        <div className={`adm-sidebar${sideOpen ? ' open' : ''}`}>
          <div className="adm-sidebar-inner">
            <div className="adm-nav-section">MENÚ PRINCIPAL</div>
            {pages.map(p => (
              <button key={p.id} type="button" className={`adm-nav-item${currentAdminPage===p.id?' active':''}`} onClick={() => nav(p.id)} aria-current={currentAdminPage===p.id}>
                <span className="adm-nav-ico"><NavIcon id={p.id} /></span>
                <span style={{ flex:1 }}>{p.label}</span>
                {p.id==='documentos' && pendingDocs > 0 && (
                  <span style={{ minWidth:18, height:18, borderRadius:9, background:'var(--orange)', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px', flexShrink:0 }}>{pendingDocs}</span>
                )}
              </button>
            ))}
            <div className="adm-nav-divider" />
            <button type="button" className="adm-nav-item" onClick={doLogout} style={{ color:'var(--danger)' }}>
              <span className="adm-nav-ico">🚪</span><span>Cerrar sesión</span>
            </button>
          </div>
        </div>
        {sideOpen && <div className="adm-sidebar-ov" onClick={() => setSideOpen(false)} />}

        {/* Main content */}
        <div className="adm-main">
          {isEncargado ? (
            currentAdminPage === 'miobra' && <PanelMiObra db={db} toast={toast} saveDB={saveDB} session={session} />
          ) : (
            <>
              {currentAdminPage === 'dashboard'   && <PanelDashboard   db={db} toast={toast} saveDB={saveDB} />}
              {currentAdminPage === 'control'     && <PanelControl     db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'fichajes'    && <PanelFichajes    db={db} toast={toast} saveDB={saveDB} />}
              {currentAdminPage === 'solicitudes' && <PanelSolicitudes db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'empleados'   && <PanelEmpleados   db={db} toast={toast} saveDB={saveDB} openModal={openModal} closeModal={closeModal} activeModal={activeModal} modalData={modalData} session={session} />}
              {currentAdminPage === 'informes'    && <PanelInformes    db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'obras'       && <PanelObras       db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'documentos'  && <PanelDocumentos  db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'auditoria'   && <PanelAuditoria   db={db} />}
            </>
          )}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="adm-mobile-nav">
        {pages.slice(0,5).map(p => (
          <button key={p.id} type="button" className={`adm-mobile-nav-item${currentAdminPage===p.id?' active':''}`} onClick={() => setAdminPage(p.id)} aria-current={currentAdminPage===p.id}>
            <NavIcon id={p.id} size={20} />
            <span>{p.label.slice(0,8)}</span>
          </button>
        ))}
        {!isEncargado && (
          <button type="button" className={`adm-mobile-nav-item${['informes','obras','documentos','auditoria'].includes(currentAdminPage)?' active':''}`} onClick={() => setSideOpen(true)} aria-label="Más opciones">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
            <span>Más</span>
          </button>
        )}
      </div>

      {/* Buscador global */}
      <SearchModal db={db} open={searchOpen} q={searchQ} setQ={setSearchQ} onClose={() => setSearchOpen(false)} onNav={(panel) => { nav(panel); setSearchOpen(false) }} />
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
function PanelDashboard({ db, toast, saveDB }) {
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
        <div>
          <h1 className="adm-panel-title gradient-text">Dashboard</h1>
          <div className="adm-panel-sub" style={{ marginTop:2, textTransform:'capitalize' }}>{now.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <SyncBadge />
        </div>
      </div>

      <div className="adm-stats-grid stagger-in">
        {[
          { label:'Fichados ahora', val: checkedIn, total: emps.length, color:'var(--green)', bg:'var(--green-dim)', ico:'▶️', glow:'rgba(16,185,129,.15)' },
          { label:'Horas esta semana', val: mhm(weekMin), color:'var(--primary-light)', bg:'var(--primary-dim)', ico:'⏱️', glow:'rgba(108,99,255,.15)' },
          { label:'Horas este mes', val: mhm(monthMin), color:'var(--teal)', bg:'rgba(0,212,255,.1)', ico:'📅', glow:'rgba(0,212,255,.12)' },
          { label:'Docs. pendientes', val: (db.documentos||[]).filter(d=>!d.firma).length, color:'var(--orange)', bg:'var(--orange-dim)', ico:'✍️', glow:'rgba(245,158,11,.12)' },
        ].map(({ label, val, total, color, bg, ico, glow }) => (
          <div key={label} className="adm-stat-card card-lift" style={{ borderColor: glow }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <div style={{ width:36, height:36, background:bg, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{ico}</div>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text3)' }}>{label}</div>
            </div>
            <div className="counter-val" style={{ fontSize:30, fontWeight:800, letterSpacing:'-1px', color }}>
              {val}{total !== undefined ? <span style={{ fontSize:14, color:'var(--text3)', fontWeight:400 }}>/{total}</span> : ''}
            </div>
          </div>
        ))}
      </div>

      {/* Live workers + Today activity */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }} className="stagger-in">
        {/* Working now */}
        <div className="dash-widget card-lift">
          <div className="dash-widget-header">
            <div className="dash-widget-title" style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span className="live-indicator" />
              Trabajando ahora
            </div>
            <span className="dash-widget-badge" style={{ background:'var(--green-dim)', color:'var(--green)' }}>{liveRecs.length}</span>
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
      <div className="dash-widget card-lift" style={{ marginBottom:20 }}>
        <div className="dash-widget-header">
          <div className="dash-widget-title">Actividad (últimas 12 semanas)</div>
        </div>
        <Heatmap data={heat} />
      </div>

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
    </div>
  )
}

function ComunicadoWidget({ db, toast, saveDB }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const send = () => {
    if (!title.trim() || !body.trim()) { toast('Completa título y mensaje'); return }
    const msg = { id: gid(), from: 'admin', title: title.trim(), body: body.trim(), to: 'all', ts: new Date().toISOString() }
    saveDB({ mensajes: [...(db.mensajes||[]), msg] })
    sendPushNotif('__all__', '📢 ' + msg.title, msg.body, 'comunicado', '/')
    toast('✅ Comunicado enviado a todos los empleados')
    setTitle(''); setBody(''); setOpen(false)
  }

  const mensajes = (db.mensajes || []).slice(-5).reverse()

  return (
    <div className="dash-widget card-lift" style={{ marginTop:16 }}>
      <div className="dash-widget-header">
        <div className="dash-widget-title">📢 Comunicados</div>
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(o => !o)}>
          {open ? 'Cancelar' : '+ Nuevo'}
        </button>
      </div>
      {open && (
        <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:8 }}>
          <input placeholder="Título del comunicado..." value={title} onChange={e => setTitle(e.target.value)}
            style={{ borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text1)', padding:'8px 12px', fontSize:13 }} />
          <textarea placeholder="Mensaje para todos los empleados..." value={body} onChange={e => setBody(e.target.value)} rows={3}
            style={{ borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text1)', padding:'8px 12px', fontSize:13, resize:'vertical', fontFamily:'inherit' }} />
          <button className="btn btn-primary btn-sm" onClick={send}>Enviar a todos</button>
        </div>
      )}
      {mensajes.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop: open ? 14 : 0 }}>
          {mensajes.map(m => (
            <div key={m.id} style={{ padding:'10px 12px', background:'var(--bg-600)', borderRadius:8, border:'1px solid var(--border)', borderLeft:'3px solid var(--primary)' }}>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:2 }}>{m.title}</div>
              <div style={{ fontSize:11, color:'var(--text3)' }}>{m.body}</div>
              <div style={{ fontSize:10, color:'var(--text4)', marginTop:4 }}>{m.ts ? new Date(m.ts).toLocaleString('es-ES') : ''}</div>
            </div>
          ))}
        </div>
      )}
      {!mensajes.length && !open && (
        <div style={{ fontSize:12, color:'var(--text4)', textAlign:'center', padding:'12px 0' }}>Sin comunicados enviados aún</div>
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
                    background: alpha < 0.01 ? 'var(--bg-500)' : `rgba(108,99,255,${alpha})`,
                    border: alpha > 0 ? '1px solid rgba(108,99,255,.2)' : '1px solid var(--border)' }} />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── PANEL CONTROL LIVE ───────────────────────────────────────────────────────
function PanelControl({ db, toast, saveDB, session }) {
  const emps = (db.employees || []).filter(e => !e.baja)
  const recs = db.records || []
  const liveRecs = recs.filter(r => !r.fin)
  const [tick, setTick] = useState(0)
  const [view, setView] = useState('cards')
  useEffect(() => { const iv = setInterval(() => setTick(t => t+1), 5000); return () => clearInterval(iv) }, [])

  const force = (rec) => {
    if (!window.confirm(`¿Forzar cierre de jornada de ${rec.empName}?`)) return
    const now = new Date().toISOString()
    const breaks = [...(rec.breaks || [])]
    if (rec.enDescanso && rec.bStartTs) breaks.push({ start: rec.bStartTs, end: now })
    const closed = { ...rec, fin: now, breaks, enDescanso: false, bStartTs: null, closed: true }
    const t = calcSecs(closed); closed.workSecs = t.work; closed.breakSecs = t.brk
    const withAudit = auditLog(db, 'Jornada cerrada forzosamente', rec.empName, session?.user?.name || 'Admin')
    saveDB({ records: recs.map(r => r.id === rec.id ? closed : r), audit: withAudit.audit })
    toast('✅ Jornada cerrada forzosamente')
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

      {view === 'cards' && (
        <div className="stagger-in" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:14 }}>
          {emps.map(e => {
            const live = liveRecs.find(r => r.empId === e.id)
            const t = live ? calcSecs(live) : null
            const isWorking = live && !live.enDescanso
            const isBreak = live && live.enDescanso
            const todayMin = recs.filter(r => r.empId===e.id && r.fin && r.inicio.startsWith(today())).reduce((s,r)=>s+calcMin(r),0)
            return (
              <div key={e.id} className={`ctrl-card${isWorking?' working':isBreak?' on-break':''}`}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                  <div className="ctrl-avatar" style={{ background:e.color||'var(--primary)' }}>
                    {(e.initials||e.name.slice(0,2)).toUpperCase()}
                    <div className="ctrl-dot" style={{ background: isWorking?'var(--green)':isBreak?'var(--orange)':'var(--bg-500)', boxShadow: isWorking?'0 0 8px var(--green)':isBreak?'0 0 8px var(--orange)':'none' }} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{live?.centro || e.centroTrabajo || '—'}</div>
                  </div>
                </div>
                <div style={{ textAlign:'center', marginBottom:12 }}>
                  <div className="counter-val" style={{ fontSize:30, fontWeight:800, letterSpacing:'-1px', color: isWorking?'var(--green)':isBreak?'var(--orange)':'var(--text3)' }}>
                    {t ? mhm(Math.floor(t.work/60)) : '—'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                    {isWorking ? `Entrada: ${ftime(live.inicio)}` : isBreak ? 'En descanso' : todayMin>0 ? `Hoy: ${mhm(todayMin)}` : 'Sin jornada hoy'}
                  </div>
                </div>
                {live && (
                  <button className="btn btn-sm btn-danger" style={{ width:'100%', fontSize:11 }} onClick={() => force(live)}>
                    Forzar cierre
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {view === 'tabla' && (
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
                        <div style={{ width:28, height:28, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>
                          {(e.initials||e.name.slice(0,2)).toUpperCase()}
                        </div>
                        {e.name}
                      </div>
                    </td>
                    <td style={{ color:'var(--text3)', fontSize:12 }}>{live?.centro || e.centroTrabajo || '—'}</td>
                    <td style={{ fontVariantNumeric:'tabular-nums', fontSize:12 }}>{live ? ftime(live.inicio) : '—'}</td>
                    <td style={{ fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{t ? mhm(Math.floor(t.work/60)) : '—'}</td>
                    <td>
                      {live ? <span className={`badge ${live.enDescanso?'badge-orange':'badge-green'}`}>{live.enDescanso?'⏸ Descanso':'▶ Trabajando'}</span>
                             : <span className="badge">Libre</span>}
                    </td>
                    <td>{live && <button className="btn btn-sm btn-danger" onClick={() => force(live)}>Cerrar</button>}</td>
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
        <div>
          <h1 className="adm-panel-title gradient-text">Fichajes</h1>
          <div className="adm-panel-sub" style={{ marginTop:2 }}>{recs.length} registros totales</div>
        </div>
      </div>
      <div className="premium-filters">
        <input placeholder="Buscar empleado o centro…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex:1, minWidth:180 }} />
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
function PanelSolicitudes({ db, toast, saveDB, session }) {
  const vacs = (db.vacaciones || []).sort((a,b) => b.ts?.localeCompare(a.ts||'')||0)
  const pend = vacs.filter(v => v.estado === 'pendiente')
  const rest = vacs.filter(v => v.estado !== 'pendiente')

  const act = (id, estado) => {
    const v = (db.vacaciones||[]).find(x => x.id === id)
    const updated = (db.vacaciones||[]).map(v => v.id === id ? { ...v, estado, resolvedAt: new Date().toISOString() } : v)
    const withAudit = auditLog(db, estado === 'aprobada' ? 'Solicitud aprobada' : 'Solicitud rechazada', v?.empName || '', session?.user?.name || 'Admin')
    const noti = { id: gid(), empId: v?.empId, action: estado === 'aprobada' ? 'Vacaciones aprobadas' : 'Vacaciones rechazadas', detail: v ? `${fds(v.fechaInicio)} → ${fds(v.fechaFin)}` : '', ts: new Date().toISOString(), leido: false }
    saveDB({ vacaciones: updated, audit: withAudit.audit, notis: [...(db.notis||[]), noti] })
    if (v?.empId) sendPushNotif('emp:' + v.empId, noti.action, noti.detail, 'times-vac', '/?go=emp:vacaciones')
    toast(estado === 'aprobada' ? '✅ Solicitud aprobada' : '❌ Solicitud rechazada')
  }

  const VacRow = ({ v }) => (
    <div className={`sol-card${v.estado==='pendiente'?' pending':v.estado==='aprobada'?' approved':' rejected'}`} style={{ marginBottom:8 }}>
      <div style={{ width:40, height:40, borderRadius:12, background: v.estado==='pendiente'?'var(--orange-dim)':v.estado==='aprobada'?'var(--green-dim)':'rgba(239,68,68,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
        {v.estado==='pendiente'?'⏳':v.estado==='aprobada'?'✓':'✗'}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:700 }}>{v.empName}</div>
        <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>{fds(v.fechaInicio)} → {fds(v.fechaFin)} · {v.dias} días</div>
        {v.motivo && <div style={{ fontSize:11, color:'var(--text4)', marginTop:3 }}>{v.motivo}</div>}
      </div>
      <div className={`badge${v.estado==='aprobada'?' badge-green':v.estado==='rechazada'?' badge-red':' badge-orange'}`}>
        {v.estado==='aprobada'?'Aprobada':v.estado==='rechazada'?'Rechazada':'Pendiente'}
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
        <div>
          <h1 className="adm-panel-title gradient-text">Solicitudes</h1>
          <div className="adm-panel-sub" style={{ marginTop:2 }}>{pend.length} pendientes · {rest.length} resueltas</div>
        </div>
      </div>
      {pend.length > 0 && (
        <>
          <div className="section-header">Pendientes de revisión</div>
          <div className="stagger-in">
            {pend.map(v => <VacRow key={v.id} v={v} />)}
          </div>
        </>
      )}
      {rest.length > 0 && (
        <>
          <div className="section-header" style={{ marginTop:20 }}>Historial</div>
          {rest.slice(0, 30).map(v => <VacRow key={v.id} v={v} />)}
        </>
      )}
      {!vacs.length && (
        <div className="empty-premium">
          <div className="empty-premium-icon">
            <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div className="empty-premium-title">Sin solicitudes</div>
          <div className="empty-premium-sub">Las solicitudes de vacaciones de los empleados aparecerán aquí</div>
        </div>
      )}
    </div>
  )
}

// ─── PANEL EMPLEADOS ──────────────────────────────────────────────────────────
function PanelEmpleados({ db, toast, saveDB, openModal, closeModal, activeModal, modalData, session }) {
  const emps = sortedEmps(db)
  const [showForm, setShowForm] = useState(false)
  const [editEmp, setEditEmp] = useState(null)

  const EMPTY_EMP = { id: gid(), name:'', pin:'', email:'', role:'emp', empresa:'', centroTrabajo:'', obrasAsignadas:[], color:'#5E6AD2', baja:false, fechaAlta: today(), startDate: today() }
  const [form, setForm] = useState(EMPTY_EMP)

  const openNew = () => { setForm({ ...EMPTY_EMP, id: gid() }); setShowForm(true); setEditEmp(null) }
  const openEdit = (e) => { setForm({ obrasAsignadas: [], ...e }); setShowForm(true); setEditEmp(e.id) }

  const toggleObra = (centro) => {
    setForm(f => {
      const cur = f.obrasAsignadas || []
      return { ...f, obrasAsignadas: cur.includes(centro) ? cur.filter(c => c !== centro) : [...cur, centro] }
    })
  }

  const saveEmp = () => {
    if (!form.name.trim()) { toast('Nombre requerido'); return }
    if (!form.pin || form.pin.length < 4) { toast('PIN de mínimo 4 dígitos'); return }
    const exists = (db.employees||[]).find(e => e.pin === form.pin && e.id !== form.id)
    if (exists) { toast('PIN ya está en uso'); return }
    const emps2 = editEmp
      ? (db.employees||[]).map(e => e.id === editEmp ? form : e)
      : [...(db.employees||[]), form]
    const withAudit = auditLog(db, editEmp ? 'Empleado actualizado' : 'Empleado creado', form.name, session?.user?.name || 'Admin')
    saveDB({ employees: emps2, audit: withAudit.audit })
    toast(editEmp ? '✅ Empleado actualizado' : '✅ Empleado creado')
    setShowForm(false)
  }

  const del = (id) => {
    if (!window.confirm('¿Dar de baja a este empleado?')) return
    const emp = (db.employees||[]).find(e => e.id === id)
    const emps2 = (db.employees||[]).map(e => e.id === id ? { ...e, baja:true, fechaBaja: today() } : e)
    const withAudit = auditLog(db, 'Empleado dado de baja', emp?.name || '', session?.user?.name || 'Admin')
    saveDB({ employees: emps2, audit: withAudit.audit })
    toast('Empleado dado de baja')
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Empleados</h1>
          <div className="adm-panel-sub" style={{ marginTop:2 }}>{emps.length} empleados activos</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nuevo empleado</button>
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
            <div className="field"><label>Centro de trabajo</label>
              <select value={form.centroTrabajo||''} onChange={e => setForm(f=>({...f,centroTrabajo:e.target.value}))}>
                <option value="">— Sin asignar —</option>
                {(db.centrosTrabajo||[]).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {(form.role === 'encargado' || form.role === 'jefe_obra') && (
            <div className="field" style={{ marginBottom:14 }}>
              <label>Obras asignadas para gestión (verá y aceptará jornadas de estas obras)</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingTop:4 }}>
                {(db.centrosTrabajo||[]).map(c => (
                  <div key={c} onClick={() => toggleObra(c)}
                    style={{ padding:'6px 12px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
                      background: (form.obrasAsignadas||[]).includes(c) ? 'var(--primary-dim)' : 'var(--bg-600)',
                      color: (form.obrasAsignadas||[]).includes(c) ? 'var(--primary-light)' : 'var(--text3)',
                      border: `1px solid ${(form.obrasAsignadas||[]).includes(c) ? 'var(--primary)' : 'var(--border)'}` }}>
                    {c}
                  </div>
                ))}
                {!(db.centrosTrabajo||[]).length && <div className="empty" style={{ padding:0 }}>Crea primero un centro de trabajo en Obras</div>}
              </div>
            </div>
          )}
          <div className="field-row">
            <div className="field"><label>Color avatar</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingTop:4 }}>
                {['#5E6AD2','#7C5CFF','#00D2FF','#00C48C','#FF6B6B','#FFB547','#E040FB'].map(c => (
                  <div key={c} onClick={() => setForm(f=>({...f,color:c}))} style={{ width:24, height:24, borderRadius:'50%', background:c, cursor:'pointer', border: form.color===c?'2px solid white':'2px solid transparent', transition:'.15s' }} />
                ))}
              </div>
            </div>
            <div className="field"><label>Fecha alta</label><input type="date" value={form.fechaAlta||''} onChange={e => setForm(f=>({...f,fechaAlta:e.target.value,startDate:e.target.value}))} /></div>
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
function PanelInformes({ db, toast, saveDB, session }) {
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

  const downloadXLSX = async (sheetName, aoa, filename) => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, filename)
  }

  const exportFichajesXLSX = async () => {
    let filtered = recs.filter(r => r.fin)
    if (selEmp) filtered = filtered.filter(r => r.empId === selEmp)
    if (from) filtered = filtered.filter(r => r.inicio.slice(0,10) >= from)
    if (to)   filtered = filtered.filter(r => r.inicio.slice(0,10) <= to)
    if (!filtered.length) { toast('Sin datos para exportar'); return }
    const headers = ['Empleado','Centro','Empresa','Entrada','Salida','Horas trabajo','Horas descanso']
    const rows = filtered.map(r => {
      const wm = Math.floor(recWorkSecs(r)/60), bm = Math.floor((r.breakSecs||0)/60)
      return [r.empName, r.centro||'', r.empresa||'', new Date(r.inicio).toLocaleString('es-ES'), new Date(r.fin).toLocaleString('es-ES'), `${Math.floor(wm/60)}:${p2(wm%60)}`, `${Math.floor(bm/60)}:${p2(bm%60)}`]
    })
    await downloadXLSX('Fichajes', [headers, ...rows], `fichajes_${from||'todo'}_${to||'hoy'}.xlsx`)
    toast('✅ Excel descargado')
  }

  const [y, mo] = filterMonth.split('-').map(Number)
  const daysInMonth = new Date(y, mo, 0).getDate()

  const exportDetalleXLSX = async () => {
    const empRows = sortedEmps(db).filter(e => !e.baja)
    const header = ['Empleado', ...Array.from({length:daysInMonth},(_,i)=>String(i+1)), 'Total']
    const rows = empRows.map(e => {
      const dayMap = {}
      recs.filter(r => r.empId===e.id && r.fin && r.inicio.startsWith(filterMonth)).forEach(r => {
        const day = parseInt(r.inicio.slice(8,10))
        dayMap[day] = (dayMap[day]||0) + calcMin(r)
      })
      const total = Object.values(dayMap).reduce((s,v)=>s+v,0)
      return [e.name, ...Array.from({length:daysInMonth},(_,i)=>dayMap[i+1]?`${Math.floor(dayMap[i+1]/60)}:${p2(dayMap[i+1]%60)}`:''), mhm(total)]
    })
    await downloadXLSX('Detalle diario', [header, ...rows], `detalle_${filterMonth}.xlsx`)
    toast('✅ Excel descargado')
  }

  const exportResumenXLSX = async () => {
    const header = ['Empleado','Días','Total mes','Esperadas','Diferencia','Vac. disp.']
    const xlsxRows = rows.map(({ e, totalMin, diff, days, vac }) => [
      e.name, days, mhm(totalMin), mhm(WK*4), `${diff>=0?'+':''}${mhm(Math.abs(diff))}`, vac.available
    ])
    await downloadXLSX('Resumen mensual', [header, ...xlsxRows], `resumen_${filterMonth}.xlsx`)
    toast('✅ Excel descargado')
  }

  const generarCierre = (e, totalMin, days) => {
    const mes = filterMonth
    const eRecs = (db.records || []).filter(r => r.empId === e.id && r.fin && r.inicio.startsWith(mes))
    const cierre = {
      id: gid(), empId: e.id, empName: e.name, mes,
      generadoPor: session?.user?.name || 'Admin',
      generadoAt: new Date().toISOString(),
      totalMin, dias: days, estado: 'pendiente', firma: null,
      records_snapshot: eRecs.map(r => ({ inicio:r.inicio, fin:r.fin, centro:r.centro, workSecs:r.workSecs||0 }))
    }
    saveDB({ cierres: [...(db.cierres||[]), cierre] })
    sendPushNotif(e.id, '📋 Cierre mensual pendiente', `Tu resumen de ${mes} está listo para firmar.`, 'cierre', '/?tab=perfil')
    toast(`✅ Cierre enviado a ${e.name}`)
  }

  const downloadCierrePDF = (cierre, emp) => {
    const mes = new Date(cierre.mes + '-01').toLocaleDateString('es-ES', { month:'long', year:'numeric' })
    const rowsHtml = (cierre.records_snapshot || []).map(r => {
      const m = Math.floor((r.workSecs||0)/60)
      const d = new Date(r.inicio)
      return `<tr><td>${d.toLocaleDateString('es-ES')}</td><td>${r.centro||'—'}</td><td>${d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</td><td>${mhm(m)}</td></tr>`
    }).join('')
    const win = window.open('', '_blank')
    if (!win) { toast('Permite ventanas emergentes'); return }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cierre ${mes} · ${cierre.empName}</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;color:#555;font-weight:400;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#f0f0f0;padding:8px 12px;text-align:left;border-bottom:2px solid #ccc}td{padding:8px 12px;border-bottom:1px solid #eee}.total{font-weight:700;font-size:15px;margin-top:16px}.sign-box{margin-top:40px;display:flex;gap:60px}.sign-line{flex:1;border-top:1px solid #888;padding-top:6px;font-size:12px;color:#555}@media print{button{display:none}}</style>
    </head><body>
    <h1>Cierre de jornada mensual · ${mes}</h1>
    <h2>${cierre.empName} · Generado el ${new Date(cierre.generadoAt).toLocaleDateString('es-ES')}</h2>
    <table><thead><tr><th>Fecha</th><th>Centro</th><th>Entrada</th><th>Horas</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    <div class="total">Total: ${mhm(cierre.totalMin)} · ${cierre.dias} día(s) trabajado(s)</div>
    ${cierre.firma ? `<div style="margin-top:24px"><b>Firmado digitalmente</b> por ${cierre.empName} · ${new Date(cierre.firma.firmadoAt).toLocaleString('es-ES')}<br><img src="${cierre.firma.signatureData}" style="height:60px;margin-top:8px;border:1px solid #ccc;border-radius:4px"></div>` : ''}
    <div class="sign-box"><div class="sign-line">Firma empleado</div><div class="sign-line">Firma empresa</div></div>
    <br><button onclick="window.print()">Imprimir / Guardar PDF</button>
    </body></html>`)
    win.document.close()
  }

  const TABS = [
    { id:'resumen',  label:'Resumen' },
    { id:'cierre',   label:'📋 Cierre mensual' },
    { id:'detalle',  label:'Detalle diario' },
    { id:'ranking',  label:'Ranking' },
    { id:'analitica',label:'Analítica' },
    { id:'exportar', label:'Exportar' },
  ]

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Informes</h1>
          <div className="adm-panel-sub" style={{ marginTop:2, textTransform:'capitalize' }}>{new Date(filterMonth + '-01').toLocaleDateString('es-ES', { month:'long', year:'numeric' })}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="pill-tabs" style={{ marginBottom:20 }}>
        {TABS.map(t => (
          <button key={t.id} className={`pill-tab${tab===t.id?' active':''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* Month selector */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
        <input type="month" value={filterMonth} onChange={e => setSelMonth(e.target.value)}
          style={{ width:'auto', padding:'7px 12px', fontSize:13, borderRadius:8 }} />
      </div>

      {/* Cierre mensual tab */}
      {tab === 'cierre' && (
        <div className="stagger-in">
          <div style={{ fontSize:12, color:'var(--text3)', marginBottom:16, padding:'12px 14px', background:'var(--primary-dim)', borderRadius:'var(--r)', border:'1px solid var(--primary-glow)', lineHeight:1.6 }}>
            📋 <strong>Cierre mensual</strong> — Genera el resumen y envíalo al empleado para firma digital. Cumple con la Ley de Control Horario (RDL 8/2019). El empleado recibirá una notificación para firmar.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {rows.map(({ e, totalMin, days, diff }) => {
              const cierre = (db.cierres || []).find(c => c.empId === e.id && c.mes === filterMonth)
              return (
                <div key={e.id} className="card" style={{ display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:40, height:40, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>
                    {(e.initials||e.name.slice(0,2)).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{e.name}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                      {days} días · {mhm(totalMin)} · <span style={{ color: diff>=0?'var(--green)':'var(--red)' }}>{diff>=0?'+':''}{mhm(Math.abs(diff))}</span>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                    {cierre ? (
                      <>
                        <span className={`badge ${cierre.estado==='firmado'?'badge-green':'badge-orange'}`}>
                          {cierre.estado === 'firmado' ? '✓ Firmado' : '⏳ Pendiente firma'}
                        </span>
                        <button className="btn btn-secondary btn-sm" onClick={() => downloadCierrePDF(cierre, e)}>PDF</button>
                      </>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => generarCierre(e, totalMin, days)} disabled={!days}>
                        Enviar cierre
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {!rows.length && <div className="empty">Sin empleados activos</div>}
          </div>

          {/* Historial de cierres firmados */}
          {(db.cierres||[]).filter(c => c.estado==='firmado').length > 0 && (
            <div style={{ marginTop:28 }}>
              <div className="adm-section-title" style={{ marginBottom:12 }}>Cierres firmados</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {(db.cierres||[]).filter(c => c.estado==='firmado').sort((a,b) => b.mes.localeCompare(a.mes)).slice(0,20).map(c => {
                  const emp = (db.employees||[]).find(e => e.id === c.empId)
                  return (
                    <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)' }}>
                      <div style={{ fontSize:18 }}>✅</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600 }}>{c.empName} · {c.mes}</div>
                        <div style={{ fontSize:11, color:'var(--text3)' }}>Firmado {new Date(c.firma?.firmadoAt).toLocaleDateString('es-ES')} · {mhm(c.totalMin)}</div>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => downloadCierrePDF(c, emp)}>PDF</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resumen tab */}
      {tab === 'resumen' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button className="btn btn-secondary btn-sm" onClick={exportResumenXLSX}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar Excel
            </button>
          </div>
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
        </div>
      )}

      {/* Detalle diario tab */}
      {tab === 'detalle' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button className="btn btn-secondary btn-sm" onClick={exportDetalleXLSX}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar Excel
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
                          <td key={i} style={{ textAlign:'center', padding:'5px 2px', background: m2?'rgba(108,99,255,.12)':isWknd?'rgba(255,255,255,.02)':undefined, color: m2?'var(--primary-light)':'var(--text4)', fontWeight:m2?700:400, fontVariantNumeric:'tabular-nums' }}>
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
        <div className="stagger-in" style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[...rows].sort((a,b) => b.totalMin - a.totalMin).map(({ e, totalMin, days }, idx) => {
            const maxMin = Math.max(...rows.map(r => r.totalMin), 1)
            const pct = Math.round(totalMin / maxMin * 100)
            const medals = ['🥇','🥈','🥉']
            return (
              <div key={e.id} className="card-lift" style={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', padding:'14px 18px' }}>
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
          <div className="adm-stats-grid stagger-in" style={{ marginBottom:20 }}>
            {(() => {
              const totalMin = rows.reduce((s, r) => s + r.totalMin, 0)
              const avgMin = rows.length ? Math.round(totalMin / rows.length) : 0
              const topEmp = [...rows].sort((a,b) => b.totalMin - a.totalMin)[0]
              const overExpected = rows.filter(r => r.diff > 0).length
              return [
                { label:'Total horas mes', val: mhm(totalMin), color:'var(--primary-light)', bg:'var(--primary-dim)', ico:<line x1="18" y1="20" x2="18" y2="10"/> },
                { label:'Promedio por empleado', val: mhm(avgMin), color:'var(--teal)', bg:'rgba(0,212,255,.1)', ico:<circle cx="12" cy="12" r="10"/> },
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
          <div className="dash-widget" style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Exportar fichajes a Excel</div>
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
            <button className="btn btn-primary" style={{ width:'100%' }} onClick={exportFichajesXLSX}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Descargar Excel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PANEL OBRAS ──────────────────────────────────────────────────────────────
function PanelObras({ db, toast, saveDB, session }) {
  const [tab, setTab] = useState('obras')
  const [newObra, setNewObra] = useState('')
  const [newCentro, setNewCentro] = useState('')
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')

  const obras = db.obras || []
  const centros = db.centrosTrabajo || []
  const who = session?.user?.name || 'Admin'

  const addObra = () => {
    const n = newObra.trim()
    if (!n) { toast('Escribe un nombre'); return }
    if (obras.find(o => o.nombre === n)) { toast('Ya existe'); return }
    const obra = { id: gid(), nombre: n, direccion:'', estado:'activa', createdAt: today() }
    const withAudit = auditLog(db, 'Obra creada', n, who)
    saveDB({ obras: [...obras, obra], audit: withAudit.audit })
    setNewObra('')
    toast('✅ Obra creada')
  }

  const delObra = (id) => {
    if (!window.confirm('¿Eliminar esta obra?')) return
    const o = obras.find(x => x.id === id)
    const withAudit = auditLog(db, 'Obra eliminada', o?.nombre || '', who)
    saveDB({ obras: obras.filter(o => o.id !== id), audit: withAudit.audit })
    toast('Obra eliminada')
  }

  const addCentro = () => {
    const n = newCentro.trim()
    if (!n) { toast('Escribe un nombre'); return }
    if (centros.includes(n)) { toast('Ya existe'); return }
    const withAudit = auditLog(db, 'Centro de trabajo añadido', n, who)
    saveDB({ centrosTrabajo: [...centros, n], audit: withAudit.audit })
    setNewCentro('')
    toast('✅ Centro añadido')
  }

  const delCentro = (c) => {
    if (!window.confirm(`¿Eliminar "${c}"?`)) return
    const withAudit = auditLog(db, 'Centro de trabajo eliminado', c, who)
    saveDB({ centrosTrabajo: centros.filter(x => x !== c), audit: withAudit.audit })
    toast('Centro eliminado')
  }

  const TABS = [{ id:'obras', label:'Obras' }, { id:'centros', label:'Centros de trabajo' }]

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title gradient-text">{tab === 'obras' ? 'Obras' : 'Centros de trabajo'}</h1>
      </div>

      <div className="pill-tabs" style={{ marginBottom:20 }}>
        {TABS.map(t => (
          <button key={t.id} className={`pill-tab${tab===t.id?' active':''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* Obras */}
      {tab === 'obras' && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:20 }}>
            <input style={{ flex:1 }} placeholder="Nombre de la obra…" value={newObra} onChange={e => setNewObra(e.target.value)} onKeyDown={e => e.key==='Enter'&&addObra()} />
            <button className="btn btn-primary" onClick={addObra}>+ Crear</button>
          </div>
          <div className="stagger-in" style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {!obras.length && (
              <div className="empty-premium">
                <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
                <div className="empty-premium-title">Sin obras creadas</div>
                <div className="empty-premium-sub">Crea tu primera obra para organizar los fichajes por proyecto</div>
              </div>
            )}
            {obras.map(o => (
              <div key={o.id} className="card-lift" style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'var(--bg-700)', borderRadius:'var(--r-lg)', border:'1px solid var(--border)' }}>
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
          <div className="stagger-in" style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {!centros.length && (
              <div className="empty-premium">
                <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
                <div className="empty-premium-title">Sin centros de trabajo</div>
                <div className="empty-premium-sub">Añade centros de trabajo para asignarlos a empleados</div>
              </div>
            )}
            {centros.map(c => (
              <div key={c} className="card-lift" style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'var(--bg-700)', borderRadius:'var(--r-lg)', border:'1px solid var(--border)' }}>
                <div style={{ width:40, height:40, borderRadius:10, background:'rgba(0,212,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
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
function PanelDocumentos({ db, toast, saveDB, session }) {
  const emps = (db.employees||[]).filter(e => !e.baja)
  const docs = db.documentos || []
  const who = session?.user?.name || 'Admin'
  const [showForm, setShowForm] = useState(false)
  const [tab, setTab] = useState('todos')
  const [viewing, setViewing] = useState(null)
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

  const TIPO_LABELS = { nomina:'Nómina', contrato:'Contrato', jornada:'Jornada mensual' }

  const add = () => {
    if (!form.empId) { toast('Selecciona un empleado'); return }
    if (!form.titulo.trim()) { toast('Escribe un título'); return }
    const emp = emps.find(e => e.id === form.empId)
    const doc = { ...form, id: gid(), empName: emp?.name || '', createdAt: new Date().toISOString(), firma: null }
    if (fileData) { doc.fileData = fileData; doc.fileName = fileName }
    const noti = { id: gid(), empId: form.empId, action: `Nuevo documento pendiente de firma`, detail: `${TIPO_LABELS[form.tipo]||form.tipo}: ${form.titulo}`, ts: new Date().toISOString(), leido: false }
    const withAudit = auditLog(db, 'Documento enviado', `${TIPO_LABELS[form.tipo]||form.tipo}: ${form.titulo} → ${doc.empName}`, who)
    saveDB({ documentos: [...docs, doc], notis: [...(db.notis||[]), noti], audit: withAudit.audit })
    sendPushNotif('emp:' + form.empId, noti.action, noti.detail, 'times-doc', '/?go=emp:documentos')
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
    const noti = { id: gid(), empId, action: 'Jornada mensual pendiente de firma', detail: `Necesitas firmar la jornada del mes ${mes}`, ts: new Date().toISOString(), leido: false }
    const withAudit = auditLog(db, 'Jornada enviada para firma', `${emp.name} · ${mes}`, who)
    saveDB({ documentos: [...docs, doc], notis: [...(db.notis||[]), noti], audit: withAudit.audit })
    sendPushNotif('emp:' + empId, noti.action, noti.detail, 'times-doc', '/?go=emp:documentos')
    toast('✅ Jornada enviada para firma')
  }

  const del = (id) => {
    if (!window.confirm('¿Eliminar este documento?')) return
    const doc = docs.find(d => d.id === id)
    const withAudit = auditLog(db, 'Documento eliminado', doc?.titulo || '', who)
    saveDB({ documentos: docs.filter(d => d.id !== id), audit: withAudit.audit })
    toast('Documento eliminado')
  }

  const filtered = tab === 'todos' ? docs
    : tab === 'pendientes' ? docs.filter(d => !d.firma)
    : tab === 'firmados' ? docs.filter(d => d.firma)
    : docs.filter(d => d.tipo === tab)

  const TIPO_COLORS = { nomina:'var(--primary-light)', contrato:'var(--teal)', jornada:'var(--orange)' }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title gradient-text">Documentos</h1>
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
      <div style={{ background:'linear-gradient(135deg,var(--primary-dim),rgba(0,212,255,.06))', border:'1px solid rgba(108,99,255,.2)', borderRadius:'var(--r)', padding:'16px 20px', marginBottom:20 }}>
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
      <div className="stagger-in" style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {!filtered.length && (
          <div className="empty-premium">
            <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
            <div className="empty-premium-title">Sin documentos</div>
            <div className="empty-premium-sub">Los documentos enviados a los empleados aparecerán aquí</div>
          </div>
        )}
        {[...filtered].sort((a,b) => b.createdAt?.localeCompare(a.createdAt||'')||0).map(d => {
          const emp = emps.find(e => e.id === d.empId)
          return (
            <div key={d.id} className="card-lift" style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)' }}>
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
                <button className="btn btn-sm btn-secondary" onClick={() => setViewing(d)}>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  Ver
                </button>
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

      {viewing && (
        <div className="modal-ov" onClick={() => setViewing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:560 }}>
            <div className="modal-drag" />
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <h2 style={{ margin:0, fontSize:16 }}>{viewing.titulo}</h2>
              <button onClick={() => setViewing(null)} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:22, cursor:'pointer' }}>×</button>
            </div>
            <DocPreview d={viewing} db={db} empId={viewing.empId} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PANEL MI OBRA (encargado) ─────────────────────────────────────────────────
function PanelMiObra({ db, toast, saveDB, session }) {
  const enc = session.user
  const misCentros = enc?.obrasAsignadas || []
  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin && (misCentros.includes(e.centroTrabajo) || (e.obrasAsignadas || []).some(o => misCentros.includes(o))))
  const empIds = new Set(emps.map(e => e.id))
  const recs = db.records || []
  const liveRecs = recs.filter(r => !r.fin && (misCentros.includes(r.centro) || empIds.has(r.empId)))
  const pendRecs = recs.filter(r => r.fin && (misCentros.includes(r.centro) || empIds.has(r.empId)) && !r.aceptada)
    .sort((a,b) => b.inicio.localeCompare(a.inicio)).slice(0, 50)
  const [editing, setEditing] = useState(null)

  const aceptar = (rec) => {
    const updated = recs.map(r => r.id === rec.id ? { ...r, aceptada: true, aceptadaPor: enc.name, aceptadaAt: new Date().toISOString() } : r)
    const withAudit = auditLog(db, 'Jornada aceptada', `${rec.empName} · ${fds(rec.inicio)}`, enc.name)
    saveDB({ records: updated, audit: withAudit.audit })
    toast('✅ Jornada aceptada')
  }

  const startEdit = (rec) => setEditing({ id: rec.id, inicio: rec.inicio.slice(0,16), fin: rec.fin ? rec.fin.slice(0,16) : '' })

  const saveEdit = () => {
    const rec = recs.find(r => r.id === editing.id)
    const updated = recs.map(r => {
      if (r.id !== editing.id) return r
      const closed = { ...r, inicio: new Date(editing.inicio).toISOString(), fin: editing.fin ? new Date(editing.fin).toISOString() : r.fin }
      const t = calcSecs(closed); closed.workSecs = t.work; closed.breakSecs = t.brk
      return closed
    })
    const withAudit = auditLog(db, 'Jornada modificada', `${rec?.empName || ''} · ${fds(editing.inicio)}`, enc.name)
    saveDB({ records: updated, audit: withAudit.audit })
    toast('✅ Jornada modificada')
    setEditing(null)
  }

  if (!misCentros.length) {
    return (
      <div className="adm-panel">
        <div className="adm-panel-header"><h1 className="adm-panel-title">Mi obra</h1></div>
        <div className="empty">No tienes ninguna obra/centro de trabajo asignado. Pide al administrador que te asigne uno en Empleados.</div>
      </div>
    )
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title">Mi obra</h1>
        <div className="adm-panel-sub">{misCentros.join(', ')}</div>
      </div>

      <div className="adm-section-title" style={{ padding:'0 0 12px' }}>En jornada ahora ({liveRecs.length})</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14, marginBottom:24 }}>
        {emps.map(e => {
          const live = liveRecs.find(r => r.empId === e.id)
          const t = live ? calcSecs(live) : null
          const isWorking = live && !live.enDescanso
          const isBreak = live && live.enDescanso
          return (
            <div key={e.id} style={{ background:'var(--bg-700)', border:`1px solid ${isWorking?'rgba(54,178,126,.35)':isBreak?'rgba(255,145,57,.35)':'var(--border)'}`, borderRadius:'var(--r)', padding:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ width:38, height:38, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>
                  {(e.initials||e.name.slice(0,2)).toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name}</div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>{live?.centro || e.centroTrabajo || '—'}</div>
                </div>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:22, fontWeight:800, color: isWorking?'var(--green)':isBreak?'var(--orange)':'var(--text3)', fontVariantNumeric:'tabular-nums' }}>
                  {t ? mhm(Math.floor(t.work/60)) : '—'}
                </div>
                <div style={{ fontSize:11, color:'var(--text3)' }}>{isWorking?'Trabajando':isBreak?'En descanso':'Sin jornada hoy'}</div>
              </div>
            </div>
          )
        })}
        {!emps.length && <div className="empty">Sin empleados asignados a tu obra</div>}
      </div>

      <div className="adm-section-title" style={{ padding:'0 0 12px' }}>Jornadas pendientes de aceptar ({pendRecs.length})</div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {pendRecs.map(r => (
          <div key={r.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--bg-600)', borderRadius:'var(--r)', border:'1px solid var(--border)', flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:160 }}>
              <div style={{ fontSize:13, fontWeight:700 }}>{r.empName}</div>
              <div style={{ fontSize:12, color:'var(--text3)' }}>{fds(r.inicio)} · {ftime(r.inicio)} → {ftime(r.fin)} · {mhm(Math.floor(recWorkSecs(r)/60))}</div>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn btn-sm btn-secondary" onClick={() => startEdit(r)}>Modificar</button>
              <button className="btn btn-sm btn-primary" onClick={() => aceptar(r)}>✓ Aceptar</button>
            </div>
          </div>
        ))}
        {!pendRecs.length && <div className="empty">Sin jornadas pendientes</div>}
      </div>

      {editing && (
        <div className="modal-ov center" onClick={() => setEditing(null)}>
          <div className="modal center-modal" onClick={e => e.stopPropagation()} style={{ maxWidth:380, width:'calc(100% - 32px)' }}>
            <h2 style={{ margin:'0 0 16px', fontSize:16 }}>Modificar jornada</h2>
            <div className="field" style={{ marginBottom:12 }}>
              <label>ENTRADA</label>
              <input type="datetime-local" value={editing.inicio} onChange={e => setEditing(s => ({ ...s, inicio:e.target.value }))} />
            </div>
            <div className="field" style={{ marginBottom:16 }}>
              <label>SALIDA</label>
              <input type="datetime-local" value={editing.fin} onChange={e => setEditing(s => ({ ...s, fin:e.target.value }))} />
            </div>
            <div className="modal-btns">
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveEdit}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PANEL AUDITORÍA ──────────────────────────────────────────────────────────
function PanelAuditoria({ db }) {
  const audit = (db.audit || []).slice().reverse()
  const ACTION_COLORS = {
    'Jornada': 'var(--green)', 'Empleado': 'var(--primary-light)', 'Obra': 'var(--teal)',
    'Documento': 'var(--orange)', 'Solicitud': 'var(--accent)', 'Centro': 'var(--secondary)',
  }
  const getColor = (action) => {
    for (const [k, v] of Object.entries(ACTION_COLORS)) if (action?.includes(k)) return v
    return 'var(--text3)'
  }
  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Auditoría</h1>
          <div className="adm-panel-sub" style={{ marginTop:2 }}>{audit.length} registros</div>
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
        {!audit.length && (
          <div className="empty-premium">
            <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div>
            <div className="empty-premium-title">Sin registros</div>
            <div className="empty-premium-sub">Las acciones del sistema se registrarán aquí automáticamente</div>
          </div>
        )}
        {audit.map((a, i) => (
          <div key={i} className="audit-row-premium">
            <div className="audit-dot" style={{ background: getColor(a.action) }} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700 }}>{a.action}</div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{a.user}{a.detail ? ` · ${a.detail}` : ''}</div>
            </div>
            <div style={{ fontSize:10, color:'var(--text4)', textAlign:'right', flexShrink:0, whiteSpace:'nowrap' }}>
              {a.ts ? new Date(a.ts).toLocaleString('es-ES', { hour:'2-digit', minute:'2-digit', day:'numeric', month:'short' }) : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── BUSCADOR GLOBAL ──────────────────────────────────────────────────────────
function SearchModal({ db, open, q, setQ, onClose, onNav }) {
  const inputRef = useRef(null)

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])

  const results = useMemo(() => {
    if (!q || q.length < 1) return []
    const lq = q.toLowerCase()
    const emps = (db.employees || []).filter(e => !e.baja && e.name.toLowerCase().includes(lq)).slice(0, 4)
      .map(e => ({ type:'emp', label:e.name, sub:e.role==='encargado'?'Encargado':e.role==='jefe_obra'?'Jefe de Obra':'Empleado', panel:'empleados', color:e.color }))
    const recs = (db.records || []).filter(r => r.fin && (r.empName?.toLowerCase().includes(lq) || r.centro?.toLowerCase().includes(lq))).slice(0, 4)
      .map(r => ({ type:'rec', label:r.empName, sub:(r.centro||'')+ ' · '+r.inicio.slice(0,10), panel:'fichajes' }))
    const obras = (db.obras || []).filter(o => o.nombre?.toLowerCase().includes(lq)).slice(0, 3)
      .map(o => ({ type:'obra', label:o.nombre, sub:o.estado||'activa', panel:'obras' }))
    const centros = (db.centrosTrabajo || []).filter(c => c.toLowerCase().includes(lq)).slice(0, 2)
      .map(c => ({ type:'centro', label:c, sub:'Centro de trabajo', panel:'obras' }))
    return [...emps, ...recs, ...obras, ...centros]
  }, [q, db])

  if (!open) return null
  return (
    <div className="modal-ov center" onClick={onClose} style={{ zIndex:1200 }}>
      <div className="modal center-modal" onClick={e => e.stopPropagation()}
        style={{ maxWidth:520, width:'calc(100% - 24px)', padding:0, overflow:'hidden' }}>
        {/* Search input */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text4)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar empleados, fichajes, obras…"
            style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:15, color:'var(--text)', fontFamily:'inherit' }} />
          <kbd style={{ fontSize:10, padding:'2px 7px', background:'var(--bg-500)', border:'1px solid var(--border)', borderRadius:5, color:'var(--text4)', fontFamily:'monospace', flexShrink:0 }}>ESC</kbd>
        </div>
        {/* Results */}
        <div style={{ maxHeight:380, overflowY:'auto' }}>
          {!q && (
            <div style={{ padding:'28px 16px', textAlign:'center', color:'var(--text4)', fontSize:13 }}>
              Escribe para buscar empleados, fichajes y obras
              <div style={{ marginTop:8, fontSize:11 }}>Atajo: <kbd style={{ padding:'2px 6px', background:'var(--bg-500)', border:'1px solid var(--border)', borderRadius:4, fontFamily:'monospace' }}>⌘K</kbd> · <kbd style={{ padding:'2px 6px', background:'var(--bg-500)', border:'1px solid var(--border)', borderRadius:4, fontFamily:'monospace' }}>Ctrl+K</kbd></div>
            </div>
          )}
          {q && !results.length && (
            <div style={{ padding:'28px 16px', textAlign:'center', color:'var(--text4)', fontSize:13 }}>Sin resultados para "{q}"</div>
          )}
          {results.map((r, i) => (
            <div key={i} onClick={() => onNav(r.panel)} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', cursor:'pointer', transition:'background .1s', borderBottom:'1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background='var(--bg-600)'}
              onMouseLeave={e => e.currentTarget.style.background=''}>
              <div style={{ width:34, height:34, borderRadius:9, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:r.type==='emp'?13:16, fontWeight:700, color:'#fff',
                background: r.type==='emp'?(r.color||'var(--primary)'):r.type==='rec'?'var(--primary-dim)':r.type==='obra'?'rgba(0,212,255,.1)':'var(--green-dim)' }}>
                {r.type==='emp' ? (r.label||'?').slice(0,2).toUpperCase() : r.type==='rec' ? '⏱' : r.type==='obra' ? '🏗' : '📍'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.label}</div>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{r.sub}</div>
              </div>
              <div style={{ fontSize:10, color:'var(--text4)', fontWeight:700, letterSpacing:'.8px', textTransform:'uppercase', flexShrink:0 }}>{r.panel}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
