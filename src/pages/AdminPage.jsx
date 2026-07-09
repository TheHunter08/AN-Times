import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import QRCode from 'qrcode'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useAppStore } from '../store/appStore.js'
import { today, mhm, p2, ftime, fds, calcSecs, calcMin, gid, vacData, wkStart, recWorkSecs, sortedEmps, monthlyExtras, toDatetimeLocal } from '../utils/time.js'
import { WD, WK, VAPID_PUB } from '../config/constants.js'
import { auditLog, queuePush, pushSubscribe } from '../services/dataService.js'
import { DocPreview } from '../components/DocPreview.jsx'
import { useModalBack } from '../hooks/useModalBack.js'
import { useSwipeDismiss } from '../hooks/useSwipeDismiss.js'
import { startedInHorizontalScroller } from '../utils/gesture.js'
import { hashPin, isPinHashed } from '../utils/pinSecurity.js'
import { buildCierreIndividualPDF, buildCierreConsolidadoPDF } from '../utils/cierrePdf.js'
import { exportInspeccionXLSX, buildInspeccionHTML } from '../utils/inspeccionExport.js'
import { resizeImageToDataUrl } from '../utils/imageResize.js'
import { callSendPushAll, showPushToast } from '../utils/pushAll.js'
import { NavIcon } from '../components/admin/NavIcon.jsx'
import { SyncBadge } from '../components/admin/SyncBadge.jsx'
import { toggleTheme } from '../utils/userConfig.js'
import { applyBrandColor, removeBrandColor } from '../utils/webauthn.js'
import { esc, downloadDataUrl, flagStaleCierre, flagStaleCierreForEdit, clipBreaksToWindow, notifyStaleCierre } from '../utils/adminHelpers.js'
import { SwipeToDelete } from '../components/admin/SwipeToDelete.jsx'
import { PushNotifWidget } from '../components/admin/PushNotifWidget.jsx'
import { ComunicadoWidget } from '../components/admin/ComunicadoWidget.jsx'
import { buildHeatmap, Heatmap } from '../components/admin/Heatmap.jsx'
import { LiveTimerCell, CtrlCard } from '../components/admin/CtrlCard.jsx'
const MapaObra = lazy(() => import('../components/admin/MapaObra.jsx').then(m => ({ default: m.MapaObra })))

const PanelControl   = lazy(() => import('./admin/PanelControl.jsx'))
const PanelAuditoria = lazy(() => import('./admin/PanelAuditoria.jsx'))
const PanelMensajes  = lazy(() => import('./admin/PanelMensajes.jsx'))
const PanelObras     = lazy(() => import('./admin/PanelObras.jsx'))
const PanelDocumentos = lazy(() => import('./admin/PanelDocumentos.jsx'))
const PanelValidarHoras = lazy(() => import('./admin/PanelValidarHoras.jsx'))
const PanelMiObra    = lazy(() => import('./admin/PanelMiObra.jsx'))
const PanelSolicitudes = lazy(() => import('./admin/PanelSolicitudes.jsx'))
const PanelEmpleados = lazy(() => import('./admin/PanelEmpleados.jsx'))
const PanelInformes  = lazy(() => import('./admin/PanelInformes.jsx'))
const PanelAjustes   = lazy(() => import('./admin/PanelAjustes.jsx'))
const PanelDashboard = lazy(() => import('./admin/PanelDashboard.jsx'))
const PanelTurnos    = lazy(() => import('./admin/PanelTurnos.jsx'))
const PanelAnomalias = lazy(() => import('./admin/PanelAnomalias.jsx'))
const PanelGastos    = lazy(() => import('./admin/PanelGastos.jsx'))
const PanelDenuncias = lazy(() => import('./admin/PanelDenuncias.jsx'))

const PAGES = [
  { id:'dashboard',   label:'Dashboard' },
  { id:'control',     label:'Control Live' },
  { id:'fichajes',    label:'Fichajes' },
  { id:'solicitudes', label:'Solicitudes' },
  { id:'empleados',   label:'Empleados' },
  { id:'turnos',      label:'Turnos' },
  { id:'informes',    label:'Informes' },
  { id:'mensajes',    label:'Mensajes' },
  { id:'obras',       label:'Obras' },
  { id:'documentos',  label:'Documentos' },
  { id:'gastos',      label:'Gastos' },
  { id:'anomalias',   label:'Anomalías' },
  { id:'denuncias',   label:'Denuncias' },
  { id:'auditoria',   label:'Auditoría' },
  { id:'ajustes',     label:'Ajustes' },
]

// Un "encargado" no es administrador: solo ve y gestiona la jornada de su obra asignada
const ENC_PAGES = [
  { id:'miobra',   label:'Mi Obra' },
  { id:'fichajes', label:'Fichajes' },
  { id:'mensajes', label:'Mensajes' },
]

const JO_PAGES = [
  { id:'miobra',  label:'Mi Obra' },
  ...PAGES,
  { id:'validar',  label:'Validar Horas' },
]

export default function AdminPage() {
  const { db, session, currentAdminPage, setAdminPage, saveDB, toast, setScreen, logout, openModal, closeModal, activeModal, modalData, syncStatus } = useAppStore()
  const [sideOpen, setSideOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [isLight, setIsLight] = useState(() => document.documentElement.getAttribute('data-theme') === 'light')
  const [pushOpen, setPushOpen] = useState(false)
  const [pushTarget, setPushTarget] = useState('all')
  const [pushTitle, setPushTitle] = useState('')
  const [pushBody, setPushBody] = useState('')
  const [pushSending, setPushSending] = useState(false)
  const [pushResult, setPushResult] = useState(null)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Un "encargado" no es administrador: acceso restringido solo a su obra asignada
  const isEncargado = session.isEnc && !session.isJO
  const isJefeObra = !!session.isJO
  const pages = isJefeObra ? JO_PAGES : isEncargado ? ENC_PAGES : PAGES

  // Swipe touch navigation — mirror del sistema en EmployeePage
  const admMainRef = useRef(null)
  const currentPageRef = useRef(currentAdminPage)
  const prevPageRef = useRef(currentAdminPage)
  const isEncargadoRef = useRef(isEncargado)
  const isJefeObraRef = useRef(isJefeObra)

  useEffect(() => { isEncargadoRef.current = isEncargado }, [isEncargado])
  useEffect(() => { isJefeObraRef.current = isJefeObra }, [isJefeObra])

  // Animación de dirección al cambiar página (igual que emp-body[data-dir])
  useEffect(() => {
    const prev = prevPageRef.current
    if (prev !== currentAdminPage && admMainRef.current) {
      const order = (isJefeObraRef.current ? JO_PAGES : isEncargadoRef.current ? ENC_PAGES : PAGES).map(p => p.id)
      const pi = order.indexOf(prev), ci = order.indexOf(currentAdminPage)
      admMainRef.current.dataset.dir = ci >= pi ? 'right' : 'left'
    }
    prevPageRef.current = currentAdminPage
    currentPageRef.current = currentAdminPage
  }, [currentAdminPage])

  useEffect(() => {
    const el = admMainRef.current
    if (!el) return
    let sx = 0, sy = 0, st = 0, locked = false
    const onStart = e => {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now()
      // No cambiar de panel si el gesto nace en una tabla/scroller horizontal
      locked = startedInHorizontalScroller(e.target, el)
    }
    const onEnd = e => {
      if (locked) return
      const dx = e.changedTouches[0].clientX - sx
      const dy = e.changedTouches[0].clientY - sy
      const dt = Date.now() - st
      const vx = Math.abs(dx) / dt
      const isSwipe = Math.abs(dx) > 45 && (Math.abs(dx) > 70 || vx > 0.45) && Math.abs(dx) > Math.abs(dy) * 2
      if (!isSwipe) return
      const order = (isJefeObraRef.current ? JO_PAGES : isEncargadoRef.current ? ENC_PAGES : PAGES).map(p => p.id)
      const ci = order.indexOf(currentPageRef.current)
      if (dx < 0 && ci < order.length - 1) { try { navigator.vibrate(8) } catch {} ; setAdminPage(order[ci + 1]) }
      else if (dx > 0 && ci > 0) { try { navigator.vibrate(8) } catch {} ; setAdminPage(order[ci - 1]) }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchend', onEnd) }
  }, [setAdminPage])

  useEffect(() => {
    if ((isEncargado || isJefeObra) && !pages.find(p => p.id === currentAdminPage)) setAdminPage('miobra')
  }, [isEncargado, isJefeObra])

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!('Notification' in window)) return
      const uid = useAppStore.getState().session?.user?.id
      let perm = Notification.permission
      if (perm === 'default') perm = await Notification.requestPermission()
      if (perm === 'granted') {
        if (uid) await pushSubscribe(uid, VAPID_PUB)
        if (!isEncargado) await pushSubscribe('__admin__', VAPID_PUB)
      }
    }, 3000)
    return () => clearTimeout(t)
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
  const pendingVacs = (db.vacaciones || []).filter(v => v.estado === 'pendiente').length
  const adminUnreadChats = (db.chats || []).filter(m => m.to === 'admin' && !m.leido).length
  const activeNow = (db.records || []).filter(r => !r.fin).length

  // Company theme: apply --primary (+ derived tokens) from db.config if set
  useEffect(() => {
    const color = db.config?.primaryColor
    if (!color) return
    applyBrandColor(color)
    return () => removeBrandColor()
  }, [db.config?.primaryColor])

  const doLogout = () => { logout() }

  const nav = (id) => { setAdminPage(id); if (window.innerWidth < 960) setSideOpen(false) }

  const actPanel = pages.find(p => p.id === currentAdminPage) || pages[0]

  const sendPushMasivo = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) { toast('Completa título y mensaje'); return }
    setPushSending(true)
    setPushResult(null)
    try {
      const json = await callSendPushAll(pushTitle.trim(), pushBody.trim(), pushTarget)
      setPushResult(json)
      showPushToast(json, toast)
      if (json.ok && json.sent > 0) { setPushOpen(false); setPushTitle(''); setPushBody('') }
    } catch(e) {
      setPushResult({ ok: false, error: e.message })
      toast('Error de red', 3000, 'error')
    } finally {
      setPushSending(false)
    }
  }

  return (
    <div className="screen active" id="sAdmin">
      {/* Topbar */}
      <div className="adm-topbar">
        <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0, overflow:'hidden' }}>
          <button className="adm-menu-btn" onClick={() => setSideOpen(s => !s)} style={{ flexShrink:0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="adm-logo" style={{ flexShrink:0 }}>
            {db.config?.companyLogo ? (
              <img src={db.config.companyLogo} alt={db.config?.companyName || 'Logo'} style={{ width:20, height:20, objectFit:'contain', borderRadius:5 }} />
            ) : (
              <svg width="20" height="20" viewBox="0 0 44 44" fill="none">
                <defs>
                  <linearGradient id="admLogoBg" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="var(--accent)"/>
                    <stop offset="100%" stopColor="var(--primary)"/>
                  </linearGradient>
                  <linearGradient id="admLogoAccent" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="var(--secondary)"/>
                    <stop offset="100%" stopColor="var(--teal)"/>
                  </linearGradient>
                </defs>
                <rect width="44" height="44" rx="10" fill="url(#admLogoBg)"/>
                <rect x="11.5" y="14.5" width="21" height="4.4" rx="2.2" fill="white"/>
                <rect x="19.8" y="14.5" width="4.4" height="15.5" rx="2.2" fill="white"/>
                <path d="M 30 19.8 A 7.2 7.2 0 1 1 26.8 27" fill="none" stroke="url(#admLogoAccent)" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="30" cy="19.8" r="1.1" fill="url(#admLogoAccent)"/>
              </svg>
            )}
            <span className="adm-logo-text">{db.config?.companyName || 'TIMES INC'}</span>
          </div>
          <div className="adm-page-title" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{actPanel.label}</div>
          {activeNow > 0 && (
            <div onClick={() => nav('control')} className="adm-live-chip">
              <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--green)', animation:'livePing 2s ease-in-out infinite', flexShrink:0 }} />
              <span style={{ fontSize:11, fontWeight:700, color:'var(--green)', whiteSpace:'nowrap' }}>{activeNow} en obra</span>
            </div>
          )}
        </div>
        <div className="adm-topbar-actions">
          <SyncBadge />
          {!isEncargado && (
            <button className="adm-topbar-search" onClick={() => { setSearchOpen(true); setSearchQ('') }} title="Buscar (⌘K)" aria-label="Buscar empleados y registros">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span className="adm-search-label">Buscar</span>
              <kbd className="adm-search-kbd">⌘K</kbd>
            </button>
          )}
          {!isEncargado && (
            <button className="adm-topbar-icon-btn" title={adminUnreadChats > 0 ? `${adminUnreadChats} mensaje${adminUnreadChats>1?'s':''} sin leer` : 'Mensajes'} aria-label={adminUnreadChats > 0 ? `${adminUnreadChats} mensajes sin leer` : 'Mensajes'} onClick={() => nav('mensajes')}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              {adminUnreadChats > 0 && (
                <span style={{ position:'absolute', top:2, right:2, minWidth:16, height:16, borderRadius:8, background:'var(--danger)', color:'#fff', fontSize:9, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px' }}>{adminUnreadChats > 9 ? '9+' : adminUnreadChats}</span>
              )}
            </button>
          )}
          {!isEncargado && (
            <button className="adm-topbar-icon-btn" title="Push masivo" aria-label="Enviar notificación masiva" onClick={() => setPushOpen(true)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </button>
          )}
          {session.user && (
            <button className="btn btn-secondary btn-sm adm-topbar-emp-btn" onClick={() => setScreen('emp')} title="Panel Empleado">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span className="adm-topbar-emp-lbl">Panel Emp.</span>
            </button>
          )}
          <button className="theme-toggle-btn adm-topbar-theme" onClick={() => { toggleTheme(); setIsLight(l => !l) }} title="Cambiar tema">{isLight ? '🌙' : '☀️'}</button>
          <button className="btn btn-secondary btn-sm adm-topbar-logout" onClick={doLogout} title="Cerrar sesión">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span className="adm-topbar-logout-lbl">Salir</span>
          </button>
        </div>
      </div>

      {/* Modal push masivo */}
      {pushOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 16px' }}
          onClick={e => { if (e.target === e.currentTarget) setPushOpen(false) }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(6px)' }} />
          <div style={{ position:'relative', background:'var(--bg-400)', border:'1px solid rgba(255,255,255,.1)', borderRadius:20, padding:24, width:'100%', maxWidth:440, boxShadow:'0 24px 64px rgba(0,0,0,.6)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
              <div style={{ fontWeight:700, fontSize:16, display:'flex', alignItems:'center', gap:8 }}>
                <span>📢</span> Notificación masiva
              </div>
              <button onClick={() => setPushOpen(false)} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:20, cursor:'pointer', lineHeight:1 }}>×</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <select value={pushTarget} onChange={e => setPushTarget(e.target.value)}
                style={{ borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'10px 14px', fontSize:13 }}>
                <option value="all">Todos los empleados</option>
                <option value="activos">Activos ahora (fichados)</option>
                <option value="jefe_obra">Solo jefes de obra</option>
                <option value="encargado">Solo encargados</option>
                <option value="empleado">Solo empleados base</option>
              </select>
              <input placeholder="Título (máx 80 caracteres)…" maxLength={80} value={pushTitle} onChange={e => setPushTitle(e.target.value)}
                style={{ borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'10px 14px', fontSize:13 }} />
              <textarea placeholder="Mensaje (máx 200 caracteres)…" maxLength={200} value={pushBody} onChange={e => setPushBody(e.target.value)} rows={3}
                style={{ borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'10px 14px', fontSize:13, resize:'none', fontFamily:'inherit' }} />
              <div style={{ fontSize:10, color:'var(--text4)', textAlign:'right' }}>{pushTitle.length}/80 · {pushBody.length}/200</div>
              {pushResult && (
                <div style={{ fontSize:12, color: pushResult.ok ? 'var(--green)' : 'var(--danger)', background: pushResult.ok ? 'rgba(16,185,129,.08)' : 'rgba(239,68,68,.08)', borderRadius:8, padding:'8px 12px' }}>
                  {pushResult.ok
                    ? `✓ Enviado a ${pushResult.sent ?? 0} empleado${pushResult.sent !== 1 ? 's' : ''}${pushResult.failed > 0 ? ` · ${pushResult.failed} fallaron` : ''}${pushResult.noSub > 0 ? ` · ${pushResult.noSub} sin suscripción` : ''}`
                    : `✗ ${pushResult.error || 'Error desconocido'}`}
                </div>
              )}
              <button className="btn btn-primary" disabled={pushSending || !pushTitle.trim() || !pushBody.trim()} onClick={sendPushMasivo}
                style={{ marginTop:4 }}>
                {pushSending ? 'Enviando…' : '📢 Enviar a todos'}
              </button>
              <p style={{ fontSize:10, color:'var(--text4)', margin:0, lineHeight:1.5 }}>
                Solo llega a empleados con la app instalada y permisos concedidos.
              </p>
            </div>
          </div>
        </div>
      )}

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
                {p.id==='solicitudes' && pendingVacs > 0 && (
                  <span style={{ minWidth:18, height:18, borderRadius:9, background:'var(--danger)', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px', flexShrink:0 }}>{pendingVacs}</span>
                )}
              </button>
            ))}
            <div className="adm-nav-divider" />
            {session.user && (
              <button type="button" className="adm-nav-item adm-sidebar-emp-btn" onClick={() => { setScreen('emp'); setSideOpen(false) }}>
                <span className="adm-nav-ico"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
                <span>Panel empleado</span>
              </button>
            )}
            <button type="button" className="adm-nav-item adm-sidebar-theme-btn" onClick={() => { toggleTheme(); setIsLight(l => !l) }}>
              <span className="adm-nav-ico">{isLight ? '🌙' : '☀️'}</span>
              <span>{isLight ? 'Modo oscuro' : 'Modo claro'}</span>
            </button>
            <button type="button" className="adm-nav-item" onClick={doLogout} style={{ color:'var(--danger)' }}>
              <span className="adm-nav-ico">🚪</span><span>Cerrar sesión</span>
            </button>
          </div>
        </div>
        {sideOpen && <div className="adm-sidebar-ov" onClick={() => setSideOpen(false)} />}

        {/* Main content */}
        <div className="adm-main" ref={admMainRef}>
          {isJefeObra ? (
            <>
              {currentAdminPage === 'fichajes'    && <PanelFichajes    db={db} toast={toast} saveDB={saveDB} session={session} />}
              <Suspense fallback={<div className="adm-panel" style={{padding:32,color:'var(--text3)'}}>Cargando…</div>}>
                {currentAdminPage === 'ajustes'   && <PanelAjustes     db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'informes'  && <PanelInformes    db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'empleados' && <PanelEmpleados   db={db} toast={toast} saveDB={saveDB} openModal={openModal} closeModal={closeModal} activeModal={activeModal} modalData={modalData} session={session} />}
                {currentAdminPage === 'solicitudes' && <PanelSolicitudes db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'miobra'    && <PanelMiObra      db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'validar'   && <PanelValidarHoras db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'control'   && <PanelControl   db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'auditoria' && <PanelAuditoria db={db} />}
                {currentAdminPage === 'mensajes'  && <PanelMensajes  db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'obras'      && <PanelObras      db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'documentos' && <PanelDocumentos db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'dashboard'  && <PanelDashboard  db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'turnos'    && <PanelTurnos    db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'gastos'    && <PanelGastos    db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'anomalias' && <PanelAnomalias db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'denuncias' && <PanelDenuncias db={db} toast={toast} saveDB={saveDB} session={session} />}
              </Suspense>
            </>
          ) : isEncargado ? (
            <>
              {currentAdminPage === 'fichajes' && <PanelFichajes db={db} toast={toast} saveDB={saveDB} session={session} />}
              <Suspense fallback={<div className="adm-panel" style={{padding:32,color:'var(--text3)'}}>Cargando…</div>}>
                {currentAdminPage === 'miobra'   && <PanelMiObra   db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'mensajes' && <PanelMensajes db={db} toast={toast} saveDB={saveDB} session={session} />}
              </Suspense>
            </>
          ) : (
            <>
              {currentAdminPage === 'fichajes'    && <PanelFichajes    db={db} toast={toast} saveDB={saveDB} session={session} />}
              <Suspense fallback={<div className="adm-panel" style={{padding:32,color:'var(--text3)'}}>Cargando…</div>}>
                {currentAdminPage === 'ajustes'   && <PanelAjustes     db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'informes'  && <PanelInformes    db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'empleados' && <PanelEmpleados   db={db} toast={toast} saveDB={saveDB} openModal={openModal} closeModal={closeModal} activeModal={activeModal} modalData={modalData} session={session} />}
                {currentAdminPage === 'solicitudes' && <PanelSolicitudes db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'control'   && <PanelControl   db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'auditoria' && <PanelAuditoria db={db} />}
                {currentAdminPage === 'mensajes'  && <PanelMensajes  db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'obras'      && <PanelObras      db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'documentos' && <PanelDocumentos db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'dashboard'  && <PanelDashboard  db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'turnos'    && <PanelTurnos    db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'gastos'    && <PanelGastos    db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'anomalias' && <PanelAnomalias db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'denuncias' && <PanelDenuncias db={db} toast={toast} saveDB={saveDB} session={session} />}
              </Suspense>
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

// ─── BUSCADOR GLOBAL ──────────────────────────────────────────────────────────
function SearchModal({ db, open, q, setQ, onClose, onNav }) {
  const inputRef = useRef(null)

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])
  useModalBack(open, onClose)

  const results = useMemo(() => {
    if (!q || q.length < 1) return []
    const lq = q.toLowerCase()
    const emps = (db.employees || []).filter(e => !e.baja && e.name.toLowerCase().includes(lq)).slice(0, 4)
      .map(e => ({ type:'emp', label:e.name, sub:e.role==='encargado'?'Encargado':e.role==='jefe_obra'?'Jefe de Obra':'Empleado', panel:'empleados', color:e.color }))
    const recs = (db.records || []).filter(r => r.fin && (r.empName?.toLowerCase().includes(lq) || r.centro?.toLowerCase().includes(lq))).slice(0, 4)
      .map(r => ({ type:'rec', label:r.empName, sub:(r.centro||'')+ ' · '+(r.inicio?.slice(0,10)||''), panel:'fichajes' }))
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

// ─── PANEL FICHAJES ───────────────────────────────────────────────────────────
function PanelFichajes({ db, toast, saveDB, session }) {
  const [search, setSearch] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [filterEmp, setFilterEmp] = useState('')
  const [quickFilter, setQuickFilter] = useState('mes')
  const [editModal, setEditModal] = useState(null) // { id, inicio, fin, motivo }
  const [deletingId, setDeletingId] = useState(null)
  const [delMotivo, setDelMotivo] = useState('')
  const [pageSize, setPageSize] = useState(100)

  // Un encargado o jefe de obra solo ve/gestiona los fichajes de los centros de
  // trabajo que tiene asignados — solo el admin ve todos los centros sin filtrar.
  const isScoped = !!(session?.isEnc || session?.isJO)
  const misCentros = session?.user?.obrasAsignadas || []
  const emps = (db.employees || []).filter(e => !e.isAdmin &&
    (!isScoped || misCentros.includes(e.centroTrabajo) || (e.obrasAsignadas || []).some(o => misCentros.includes(o))))
  const empIds = useMemo(() => new Set(emps.map(e => e.id)), [emps])
  const recs = (db.records || []).filter(r => r.fin && (!isScoped || empIds.has(r.empId)))
  const now = new Date()
  const todayStr = today()
  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`

  const qs = {
    hoy:    r => r.inicio?.startsWith(todayStr),
    semana: r => r.inicio && new Date(r.inicio) >= wkStart(now),
    mes:    r => r.inicio?.startsWith(mk),
  }

  const filtered = useMemo(() => recs.filter(r => {
    if (quickFilter && qs[quickFilter] && !qs[quickFilter](r)) return false
    if (!quickFilter && filterDate && !r.inicio?.startsWith(filterDate)) return false
    if (filterEmp && r.empId !== filterEmp) return false
    if (search) {
      const q = search.toLowerCase()
      if (!r.empName?.toLowerCase().includes(q) && !r.centro?.toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a,b) => (b.inicio||'').localeCompare(a.inicio||'') || a.id.localeCompare(b.id)), [recs, quickFilter, filterDate, filterEmp, search])
  const pagedFiltered = filtered.slice(0, pageSize)

  const totalWork = useMemo(() => filtered.reduce((s,r) => s + Math.floor(recWorkSecs(r)/60), 0), [filtered])
  const totalBreak = useMemo(() => filtered.reduce((s,r) => s + Math.floor((r.breakSecs||0)/60), 0), [filtered])

  const confirmDelete = () => {
    if (!delMotivo.trim()) { toast('Indica el motivo de la eliminación', 3500, 'err'); return }
    const rec = (db.records||[]).find(r => r.id === deletingId)
    const motivo = delMotivo.trim()
    const withAudit = auditLog(db, 'Fichaje eliminado', `${rec?.empName || ''} · ${rec?.inicio?.slice(0,10) || ''} · Motivo: ${motivo}`, session?.user?.name || 'Admin')
    const { cierres, flagged, staleCierre } = rec ? flagStaleCierre(db.cierres || [], rec.empId, rec.inicio) : { cierres: db.cierres, flagged: false, staleCierre: null }
    saveDB({ records: (db.records||[]).filter(r => r.id !== deletingId), audit: withAudit.audit, cierres })
    if (rec) queuePush(rec.empId, '🗑️ Fichaje eliminado', `${session?.user?.name || 'Un responsable'} eliminó tu fichaje del ${fds(rec.inicio)}: ${motivo}`, 'jornada', '/?tab=jornada')
    if (flagged) notifyStaleCierre(staleCierre, session?.user?.id)
    const warn = flagged ? ' ⚠️ El cierre de ese mes quedó desactualizado — regénéralo en Informes antes de que firme.' : ''
    toast('Fichaje eliminado' + warn, warn ? 6000 : 3000, warn ? 'warn' : 'ok')
    setDeletingId(null); setDelMotivo('')
  }

  const openEditModal = (r) => setEditModal({ id: r.id, inicio: toDatetimeLocal(r.inicio), fin: toDatetimeLocal(r.fin), motivo: '' })

  const saveEditModal = () => {
    if (!editModal.motivo?.trim()) { toast('Indica el motivo del cambio', 3500, 'err'); return }
    const r = (db.records||[]).find(rec => rec.id === editModal.id)
    if (!r) return
    const motivo = editModal.motivo.trim()
    const newInicio = new Date(editModal.inicio).toISOString()
    const newFin = editModal.fin ? new Date(editModal.fin).toISOString() : r.fin
    if (newFin && newInicio >= newFin) { toast('La entrada debe ser anterior a la salida', 3500, 'err'); return }
    const empRecs = (db.records||[]).filter(rec => rec.empId === r.empId && rec.id !== r.id && rec.fin)
    if (empRecs.some(rec => newInicio < rec.fin && (newFin || newInicio) > rec.inicio)) { toast('La hora se solapa con otro fichaje', 3500, 'err'); return }
    const updated = (db.records||[]).map(rec => {
      if (rec.id !== r.id) return rec
      const breaks = newFin ? clipBreaksToWindow(rec.breaks, newInicio, newFin) : (rec.breaks || [])
      const t2 = calcSecs({ ...rec, inicio: newInicio, fin: newFin, breaks })
      const corr = { campo:'inicio+fin', antes: `${ftime(rec.inicio)}–${ftime(rec.fin)}`, despues: `${ftime(newInicio)}–${ftime(newFin)}`, motivo, por: session?.user?.name || 'Admin', ts: new Date().toISOString() }
      return { ...rec, inicio: newInicio, fin: newFin, breaks, workSecs: t2.work, breakSecs: t2.brk, correcciones: [...(rec.correcciones||[]), corr], _upd: new Date().toISOString() }
    })
    const withAudit = auditLog(db, 'Fichaje editado', `${r.empName}: ${ftime(r.inicio)}–${ftime(r.fin)} → ${ftime(newInicio)}–${ftime(newFin)} · Motivo: ${motivo}`, session?.user?.name || 'Admin')
    const { cierres, flagged, staleCierres } = flagStaleCierreForEdit(db.cierres || [], r.empId, r.inicio, newInicio)
    saveDB({ records: updated, audit: withAudit.audit, cierres })
    queuePush(r.empId, '✏️ Fichaje corregido', `${session?.user?.name || 'Un responsable'} corrigió tu fichaje del ${fds(r.inicio)}: ${motivo}`, 'jornada', '/?tab=jornada')
    staleCierres.forEach(sc => notifyStaleCierre(sc, session?.user?.id))
    setEditModal(null)
    const warn = flagged ? ' ⚠️ El cierre de ese mes quedó desactualizado — regénéralo en Informes antes de que firme.' : ''
    toast('Fichaje actualizado' + warn, warn ? 6000 : 3000, warn ? 'warn' : 'ok')
  }

  const downloadCSV = () => {
    const headers = ['Empleado','Centro','Fecha','Entrada','Salida','Trabajo (min)','Descanso (min)']
    const rows = filtered.map(r => [
      r.empName || '',
      r.centro || '',
      r.inicio?.slice(0,10) || '',
      r.inicio?.slice(11,16) || '',
      r.fin?.slice(11,16) || '',
      Math.floor(recWorkSecs(r)/60),
      Math.floor((r.breakSecs||0)/60)
    ])
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `fichajes-${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast(`${rows.length} fichajes exportados`, 3000, 'ok')
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Fichajes</h1>
          <div className="adm-panel-sub" style={{ marginTop:2 }}>{filtered.length} registros · {mhm(totalWork)} trabajo</div>
        </div>
        <button onClick={downloadCSV} className="btn btn-secondary" style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar CSV
        </button>
      </div>

      {/* Quick filters */}
      <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
        {[['','Todos'],['hoy','Hoy'],['semana','Esta semana'],['mes','Este mes']].map(([v,l]) => (
          <button key={v} onClick={() => { setQuickFilter(v); if(v) setFilterDate('') }}
            style={{ padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', border:'1px solid', transition:'all .15s',
              background: quickFilter===v ? 'var(--primary)' : 'var(--bg-600)',
              color: quickFilter===v ? '#fff' : 'var(--text3)',
              borderColor: quickFilter===v ? 'var(--primary)' : 'var(--border)' }}>
            {l}
          </button>
        ))}
      </div>

      {/* Active filter badge */}
      {(quickFilter || filterDate || filterEmp) && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
          <span style={{ fontSize:11, color:'var(--text4)', fontWeight:600, alignSelf:'center' }}>Viendo:</span>
          {quickFilter && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'var(--primary-dim)', color:'var(--primary-light)', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, border:'1px solid var(--primary-glow)' }}>
              {quickFilter === 'hoy' ? 'Hoy' : quickFilter === 'semana' ? 'Esta semana' : 'Este mes'}
              <button onClick={() => setQuickFilter('')} style={{ background:'none', border:'none', color:'inherit', cursor:'pointer', padding:0, lineHeight:1, fontSize:12, fontWeight:700 }}>×</button>
            </span>
          )}
          {filterDate && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'var(--primary-dim)', color:'var(--primary-light)', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, border:'1px solid var(--primary-glow)' }}>
              {filterDate}
              <button onClick={() => setFilterDate('')} style={{ background:'none', border:'none', color:'inherit', cursor:'pointer', padding:0, lineHeight:1, fontSize:12, fontWeight:700 }}>×</button>
            </span>
          )}
          {filterEmp && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'var(--primary-dim)', color:'var(--primary-light)', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, border:'1px solid var(--primary-glow)' }}>
              {emps.find(e => e.id === filterEmp)?.name || filterEmp}
              <button onClick={() => setFilterEmp('')} style={{ background:'none', border:'none', color:'inherit', cursor:'pointer', padding:0, lineHeight:1, fontSize:12, fontWeight:700 }}>×</button>
            </span>
          )}
        </div>
      )}

      <div className="premium-filters">
        <input placeholder="Buscar empleado o centro…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex:1, minWidth:180 }} />
        <input type="date" value={filterDate} onChange={e => { setFilterDate(e.target.value); setQuickFilter('') }} />
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="">Todos los empleados</option>
          {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      {!pagedFiltered.length ? (
        <div className="empty-premium">
          <div className="empty-premium-icon">🗂️</div>
          <div className="empty-premium-title">Sin resultados</div>
          <div className="empty-premium-sub">Prueba a cambiar los filtros de búsqueda.</div>
        </div>
      ) : (
      <div className="fich-list stagger-in">
        {pagedFiltered.map(r => {
          const wm = Math.floor(recWorkSecs(r)/60)
          const bm = Math.floor((r.breakSecs||0)/60)
          const over = wm > (db.config?.wdMin || WD)
          const loc = r.locInicio
          return (
            <SwipeToDelete key={r.id} onDelete={() => { setDeletingId(r.id); setDelMotivo('') }}>
            <div className="fich-card">
              <div className="fich-avatar">{(r.empName || '?').slice(0,2).toUpperCase()}</div>
              <div className="fich-id">
                <div className="fich-name">{r.empName}</div>
                <div className="fich-sub">{r.centro || 'Sin centro'}</div>
              </div>
              <div className="fich-block">
                <span className="fich-block-lbl">Día</span>
                <span className="fich-block-val">{fds(r.inicio)}</span>
              </div>
              <div className="fich-block">
                <span className="fich-block-lbl">Entrada</span>
                <span className="fich-block-val">{ftime(r.inicio)}</span>
              </div>
              <div className="fich-block">
                <span className="fich-block-lbl">Salida</span>
                <span className="fich-block-val" style={{ display:'inline-flex', alignItems:'center', gap:3 }}>
                  {ftime(r.fin)}
                  {r.correcciones?.length > 0 && (
                    <span style={{ fontSize:9, color:'var(--orange)' }} title={`Editado ${r.correcciones.length}x — última: ${r.correcciones[r.correcciones.length-1].motivo}`}>✏️</span>
                  )}
                </span>
              </div>
              <div className="fich-block">
                <span className="fich-block-lbl">Trabajo</span>
                <span className="fich-block-val" style={{ fontWeight:700, color: over ? 'var(--orange)' : undefined }}>{mhm(wm)}</span>
              </div>
              <div className="fich-block">
                <span className="fich-block-lbl">Descanso</span>
                <span className="fich-block-val">{mhm(bm)}</span>
              </div>
              <div className="fich-block">
                <span className="fich-block-lbl">GPS</span>
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                      {loc ? (
                        <a href={`https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}&zoom=17`}
                          target="_blank" rel="noopener noreferrer"
                          title={`Entrada: ${loc.lat}, ${loc.lng} ±${loc.acc||'?'}m${r.geoAlert ? ` ⚠️ Fuera de zona: ${r.geoAlert.dist}m (radio ${r.geoAlert.radio}m)` : ''}`}
                          style={{ textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4 }}>
                          <span style={{ fontSize:13 }}>▶ 📍</span>
                          {r.geoAlert ? (
                            <span style={{ fontSize:9, fontWeight:700, color: r.geoAlert.dist > r.geoAlert.radio * 2 ? 'var(--red)' : 'var(--orange)', background: r.geoAlert.dist > r.geoAlert.radio * 2 ? 'rgba(239,68,68,.1)' : 'var(--orange-dim)', border:`1px solid ${r.geoAlert.dist > r.geoAlert.radio * 2 ? 'rgba(239,68,68,.3)' : 'rgba(245,158,11,.25)'}`, borderRadius:20, padding:'1px 5px', whiteSpace:'nowrap' }}>⚠ +{r.geoAlert.dist}m</span>
                          ) : (
                            <span style={{ fontSize:9, color:'var(--green)', fontWeight:600 }}>✓</span>
                          )}
                        </a>
                      ) : <span style={{ color:'var(--text4)', fontSize:11 }}>▶ —</span>}
                      {r.locFin ? (
                        <a href={`https://www.openstreetmap.org/?mlat=${r.locFin.lat}&mlon=${r.locFin.lng}&zoom=17`}
                          target="_blank" rel="noopener noreferrer"
                          title={`Salida: ${r.locFin.lat}, ${r.locFin.lng}`}
                          style={{ textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4 }}>
                          <span style={{ fontSize:13 }}>⏹ 📍</span>
                          <span style={{ fontSize:9, color:'var(--text4)' }}>salida</span>
                        </a>
                      ) : r.fin ? <span style={{ fontSize:10, color:'var(--text4)' }}>⏹ —</span> : null}
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button className="btn btn-sm btn-secondary" onClick={() => openEditModal(r)}>✏️ Editar</button>
                <button className="btn btn-sm btn-danger" onClick={() => { setDeletingId(r.id); setDelMotivo('') }}>✕</button>
              </div>
            </div>
            </SwipeToDelete>
          )
        })}
      </div>
      )}
      {filtered.length > 0 && (
        <div className="fich-card" style={{ marginTop:4, background:'var(--bg-500)', fontWeight:700 }}>
          <div className="fich-id" style={{ fontSize:12, color:'var(--text3)' }}>Total ({filtered.length} registros)</div>
          <div className="fich-block">
            <span className="fich-block-lbl">Trabajo</span>
            <span className="fich-block-val" style={{ fontWeight:800, color:'var(--primary-light)' }}>{mhm(totalWork)}</span>
          </div>
          <div className="fich-block">
            <span className="fich-block-lbl">Descanso</span>
            <span className="fich-block-val">{mhm(totalBreak)}</span>
          </div>
        </div>
      )}
      {filtered.length > pageSize && (
        <div style={{ textAlign:'center', marginTop:14 }}>
          <button className="btn btn-secondary" onClick={() => setPageSize(s => s + 100)}>
            Ver más ({filtered.length - pageSize} restantes)
          </button>
        </div>
      )}

      {editModal && (
        <div className="modal-ov center" onClick={() => setEditModal(null)}>
          <div className="modal center-modal" onClick={e => e.stopPropagation()} style={{ maxWidth:380, width:'calc(100% - 32px)' }}>
            <h2 style={{ margin:'0 0 16px', fontSize:16 }}>Editar fichaje</h2>
            <div className="field" style={{ marginBottom:12 }}>
              <label>ENTRADA</label>
              <input type="datetime-local" value={editModal.inicio} onChange={e => setEditModal(m => ({ ...m, inicio:e.target.value }))} />
            </div>
            <div className="field" style={{ marginBottom:12 }}>
              <label>SALIDA</label>
              <input type="datetime-local" value={editModal.fin} onChange={e => setEditModal(m => ({ ...m, fin:e.target.value }))} />
            </div>
            <div className="field" style={{ marginBottom:16 }}>
              <label>MOTIVO DEL CAMBIO (obligatorio)</label>
              <input type="text" maxLength={200} placeholder="Ej: olvidó fichar la salida…"
                value={editModal.motivo || ''} onChange={e => setEditModal(m => ({ ...m, motivo:e.target.value }))} />
            </div>
            <div className="modal-btns">
              <button className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={!editModal.motivo?.trim()} onClick={saveEditModal}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {deletingId && (
        <div className="modal-ov center" onClick={() => { setDeletingId(null); setDelMotivo('') }}>
          <div className="modal center-modal" onClick={e => e.stopPropagation()} style={{ maxWidth:380, width:'calc(100% - 32px)' }}>
            <h2 style={{ margin:'0 0 12px', fontSize:16 }}>Eliminar fichaje</h2>
            <div style={{ fontSize:12, color:'var(--text3)', marginBottom:14 }}>Esta acción no se puede deshacer. El empleado recibirá un aviso.</div>
            <div className="field" style={{ marginBottom:16 }}>
              <label>MOTIVO (obligatorio)</label>
              <input type="text" autoFocus maxLength={200} placeholder="Ej: fichaje duplicado, prueba errónea…"
                value={delMotivo} onChange={e => setDelMotivo(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmDelete() }} />
            </div>
            <div className="modal-btns">
              <button className="btn btn-secondary" onClick={() => { setDeletingId(null); setDelMotivo('') }}>Cancelar</button>
              <button className="btn btn-danger" disabled={!delMotivo.trim()} onClick={confirmDelete}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

