import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import QRCode from 'qrcode'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useAppStore } from '../store/appStore.js'
import { today, mhm, p2, ftime, fds, calcSecs, calcMin, gid, vacData, wkStart, recWorkSecs, sortedEmps, monthlyExtras } from '../utils/time.js'
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
import { PushNotifWidget } from '../components/admin/PushNotifWidget.jsx'
import { ComunicadoWidget } from '../components/admin/ComunicadoWidget.jsx'
import { buildHeatmap, Heatmap } from '../components/admin/Heatmap.jsx'
import { LiveTimerCell, CtrlCard } from '../components/admin/CtrlCard.jsx'
const MapaObra = lazy(() => import('../components/admin/MapaObra.jsx').then(m => ({ default: m.MapaObra })))

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

const downloadDataUrl = (dataUrl, filename) => {
  const a = document.createElement('a')
  a.href = dataUrl; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

// Un cierre "pendiente" es una foto fija de las horas en el momento en que se generó.
// Si se edita/borra un fichaje de ese mes antes de que el empleado firme, marcamos el
// cierre como desactualizado en vez de solo avisar con un toast que desaparece — la UI
// de Informes/Validar Horas lo muestra con un badge distinto y obliga a regenerarlo.
const flagStaleCierre = (cierresList, empId, inicio) => {
  const mes = inicio?.slice(0, 7)
  let flagged = false
  let staleCierre = null
  const updated = (cierresList || []).map(c => {
    if (c.empId === empId && c.mes === mes && c.estado === 'pendiente' && !c.desactualizado) {
      flagged = true
      staleCierre = c
      return { ...c, desactualizado: true }
    }
    return c
  })
  return { cierres: updated, flagged, staleCierre }
}

// Igual que flagStaleCierre, pero para una edición que puede mover el fichaje
// de mes: si inicio original y nuevo caen en meses distintos, hay que marcar
// como desactualizado el cierre de AMBOS meses (el que pierde horas y el que
// las gana), no solo el original.
const flagStaleCierreForEdit = (cierresList, empId, oldInicio, newInicio) => {
  const r1 = flagStaleCierre(cierresList, empId, oldInicio)
  const mesOld = oldInicio?.slice(0, 7), mesNew = newInicio?.slice(0, 7)
  if (mesNew === mesOld) return { cierres: r1.cierres, flagged: r1.flagged, staleCierres: r1.flagged ? [r1.staleCierre] : [] }
  const r2 = flagStaleCierre(r1.cierres, empId, newInicio)
  const staleCierres = [r1.flagged && r1.staleCierre, r2.flagged && r2.staleCierre].filter(Boolean)
  return { cierres: r2.cierres, flagged: r1.flagged || r2.flagged, staleCierres }
}

// Recorta cada pausa al nuevo rango [inicio, fin] del fichaje editado —
// evita que una pausa con timestamps del rango original (p.ej. si el admin
// mueve el fichaje a otra franja horaria) quede fuera de la nueva jornada y
// descuadre el cálculo de horas trabajadas (podría incluso llegar a 0).
const clipBreaksToWindow = (breaks, inicio, fin) => {
  const s = new Date(inicio).getTime(), e = new Date(fin).getTime()
  return (breaks || []).reduce((out, b) => {
    if (!b.start || !b.end) return out
    const bs = Math.max(new Date(b.start).getTime(), s)
    const be = Math.min(new Date(b.end).getTime(), e)
    if (be > bs) out.push({ ...b, start: new Date(bs).toISOString(), end: new Date(be).toISOString() })
    return out
  }, [])
}

// Avisa por push a quien generó el cierre (si es un JO/encargado con dispositivo propio)
// de que quedó desactualizado, sin esperar a que entre al panel a verlo.
const notifyStaleCierre = (staleCierre, editorId) => {
  if (!staleCierre?.generadoPorId || staleCierre.generadoPorId === editorId) return
  queuePush(staleCierre.generadoPorId, '⚠️ Cierre desactualizado', `El cierre de ${staleCierre.empName} (${staleCierre.mes}) que generaste cambió tras editarse un fichaje. Regénéralo antes de que firme.`, 'cierre', '/?tab=informes')
}

// Deslizar hacia la izquierda revela "Eliminar" (gesto nativo tipo Mail de iOS).
// Los botones explícitos existentes se mantienen intactos — esto es un atajo
// adicional, no un reemplazo, así que no rompe nada para quien no lo use.
function SwipeToDelete({ children, onDelete }) {
  const [swipeX, setSwipeX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const active = useRef(false)
  // Hasta que el gesto no demuestre ser claramente horizontal, no tocamos
  // swipeX — así un scroll vertical con algo de deriva lateral (lo normal en
  // iOS) no desplaza la fila a medias y la deja en un estado raro.
  const axisLocked = useRef(null) // null=indeciso | 'x' | 'y'

  const onTouchStart = (e) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    active.current = true
    axisLocked.current = null
    setDragging(true)
  }
  const onTouchMove = (e) => {
    if (!active.current) return
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    if (axisLocked.current === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return // deadzone: aún no está claro qué quiere el usuario
      axisLocked.current = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y'
    }
    if (axisLocked.current !== 'x') return // gesto vertical: se lo dejamos al scroll nativo, no tocamos swipeX
    if (dx < 0) setSwipeX(Math.max(dx, -96))
  }
  const onTouchEnd = () => {
    if (!active.current) return
    active.current = false
    setDragging(false)
    if (axisLocked.current === 'x' && swipeX < -72) { try { navigator.vibrate?.(10) } catch {}; onDelete() }
    setSwipeX(0)
  }

  return (
    <div style={{ position:'relative', borderRadius:'var(--r)', overflow:'hidden' }}>
      <div style={{
        position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'flex-end',
        paddingRight:24, background:'var(--danger)', opacity: swipeX < -20 ? Math.min(1, -swipeX / 96) : 0,
        transition: dragging ? 'none' : 'opacity .2s', pointerEvents:'none',
      }}>
        <span style={{ color:'#fff', fontWeight:700, fontSize:13 }}>🗑️ Eliminar</span>
      </div>
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        style={{
          transform:`translateX(${swipeX}px)`, transition: dragging ? 'none' : 'transform .25s cubic-bezier(.16,1,.3,1)',
          touchAction:'pan-y', // el navegador solo gestiona scroll vertical — el swipe horizontal es nuestro y no dispara "volver atrás"
        }}
      >
        {children}
      </div>
    </div>
  )
}

const PanelControl   = lazy(() => import('./admin/PanelControl.jsx'))
const PanelAuditoria = lazy(() => import('./admin/PanelAuditoria.jsx'))
const PanelMensajes  = lazy(() => import('./admin/PanelMensajes.jsx'))
const PanelObras     = lazy(() => import('./admin/PanelObras.jsx'))
const PanelDocumentos = lazy(() => import('./admin/PanelDocumentos.jsx'))
const PanelValidarHoras = lazy(() => import('./admin/PanelValidarHoras.jsx'))
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
              {currentAdminPage === 'solicitudes' && <PanelSolicitudes db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'empleados'   && <PanelEmpleados   db={db} toast={toast} saveDB={saveDB} openModal={openModal} closeModal={closeModal} activeModal={activeModal} modalData={modalData} session={session} />}
              {currentAdminPage === 'informes'    && <PanelInformes    db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'ajustes'     && <PanelAjustes     db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'miobra'      && <PanelMiObra      db={db} toast={toast} saveDB={saveDB} session={session} />}
              <Suspense fallback={<div className="adm-panel" style={{padding:32,color:'var(--text3)'}}>Cargando…</div>}>
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
              {currentAdminPage === 'miobra'   && <PanelMiObra   db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'fichajes' && <PanelFichajes db={db} toast={toast} saveDB={saveDB} session={session} />}
              <Suspense fallback={<div className="adm-panel" style={{padding:32,color:'var(--text3)'}}>Cargando…</div>}>
                {currentAdminPage === 'mensajes' && <PanelMensajes db={db} toast={toast} saveDB={saveDB} session={session} />}
              </Suspense>
            </>
          ) : (
            <>
              {currentAdminPage === 'fichajes'    && <PanelFichajes    db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'solicitudes' && <PanelSolicitudes db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'empleados'   && <PanelEmpleados   db={db} toast={toast} saveDB={saveDB} openModal={openModal} closeModal={closeModal} activeModal={activeModal} modalData={modalData} session={session} />}
              {currentAdminPage === 'informes'    && <PanelInformes    db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'ajustes'     && <PanelAjustes     db={db} toast={toast} saveDB={saveDB} session={session} />}
              <Suspense fallback={<div className="adm-panel" style={{padding:32,color:'var(--text3)'}}>Cargando…</div>}>
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

  const openEditModal = (r) => setEditModal({ id: r.id, inicio: r.inicio?.slice(0,16) || '', fin: r.fin?.slice(0,16) || '', motivo: '' })

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
      return { ...rec, inicio: newInicio, fin: newFin, breaks, workSecs: t2.work, breakSecs: t2.brk, correcciones: [...(rec.correcciones||[]), corr] }
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

// ─── PANEL SOLICITUDES ────────────────────────────────────────────────────────
function PanelSolicitudes({ db, toast, saveDB, session }) {
  const { showConfirm } = useAppStore()
  const [solTab, setSolTab] = useState('vacaciones')
  const [ausForm, setAusForm] = useState({ empId:'', tipo:'medico', fechaInicio:today(), fechaFin:today(), motivo:'' })
  const [vacForm, setVacForm] = useState({ empId:'', fechaInicio:today(), fechaFin:today(), motivo:'' })
  const [rejecting, setRejecting] = useState(null)  // id de vacación pendiente de rechazar
  const [rejMotivo, setRejMotivo] = useState('')
  const [editCorrId, setEditCorrId] = useState(null)
  const [editInicio, setEditInicio] = useState('')
  const [editFin, setEditFin] = useState('')

  const vacs = (db.vacaciones || []).sort((a,b) => b.ts?.localeCompare(a.ts||'')||0)
  const pend = vacs.filter(v => v.estado === 'pendiente')
  const rest = vacs.filter(v => v.estado !== 'pendiente')
  const emps = (db.employees || []).filter(e => !e.baja)

  const act = (id, estado, motivoRechazo) => {
    const v = (db.vacaciones||[]).find(x => x.id === id)
    const extra = estado === 'rechazada' && motivoRechazo ? { motivoRechazo } : {}
    const updated = (db.vacaciones||[]).map(v => v.id === id ? { ...v, estado, resolvedAt: new Date().toISOString(), ...extra } : v)
    const withAudit = auditLog(db, estado === 'aprobada' ? 'Solicitud aprobada' : 'Solicitud rechazada', v?.empName || '', session?.user?.name || 'Admin')
    const noti = { id: gid(), empId: v?.empId, action: estado === 'aprobada' ? 'Vacaciones aprobadas' : 'Vacaciones rechazadas', detail: v ? `${fds(v.fechaInicio)} → ${fds(v.fechaFin)}` : '', ts: new Date().toISOString(), leido: false }
    saveDB({ vacaciones: updated, audit: withAudit.audit, notis: [...(db.notis||[]), noti] })
    if (v?.empId) {
      const pushBody = estado === 'rechazada' && motivoRechazo ? `${noti.detail} · ${motivoRechazo}` : noti.detail
      queuePush(v.empId, noti.action, pushBody, 'vacaciones', '/?go=emp:vacaciones')
    }
    toast(estado === 'aprobada' ? 'Solicitud aprobada' : 'Solicitud rechazada', 3000, estado === 'aprobada' ? 'ok' : 'warn')
  }

  const delVac = (id) => {
    const v = (db.vacaciones || []).find(x => x.id === id)
    showConfirm(`¿Eliminar estas vacaciones${v?.empName ? ' de ' + v.empName : ''}? El empleado podrá volver a fichar esos días.`, () => {
      const withAudit = auditLog(db, 'Vacaciones eliminadas', v?.empName || '', session?.user?.name || 'Admin')
      saveDB({ vacaciones: (db.vacaciones || []).filter(x => x.id !== id), audit: withAudit.audit })
      if (v?.empId) queuePush(v.empId, 'Vacaciones canceladas', `Tus vacaciones ${v.fechaInicio ? fds(v.fechaInicio) + ' → ' + fds(v.fechaFin) : ''} han sido eliminadas por el administrador.`, 'vacaciones', '/?go=emp:vacaciones')
      toast('Vacaciones eliminadas')
    })
  }

  // Alta directa de vacaciones (admin / jefe de obra) — quedan aprobadas de inmediato,
  // sin pasar por el flujo de solicitud+aprobación del empleado. Días naturales (no laborables).
  const assignVac = () => {
    if (!vacForm.empId || !vacForm.fechaInicio || !vacForm.fechaFin) { toast('Selecciona empleado y fechas'); return }
    if (vacForm.fechaFin < vacForm.fechaInicio) { toast('La fecha fin no puede ser anterior al inicio', 3500, 'err'); return }
    const solapa = (db.vacaciones || []).some(v =>
      v.empId === vacForm.empId && v.estado !== 'rechazada' &&
      vacForm.fechaInicio <= v.fechaFin && vacForm.fechaFin >= v.fechaInicio
    )
    if (solapa) { toast('Ya existe una solicitud de vacaciones que se solapa con esas fechas', 4000, 'err'); return }
    const emp = emps.find(e => e.id === vacForm.empId)
    const dias = Math.round((new Date(vacForm.fechaFin + 'T00:00:00') - new Date(vacForm.fechaInicio + 'T00:00:00')) / 86400000) + 1
    const disponibles = vacData(vacForm.empId, db).available
    if (dias > disponibles) {
      toast(`⚠️ ${emp?.name || 'El empleado'} solo tiene ${disponibles} días disponibles (asignando ${dias})`, 5000, 'warn')
    }
    const item = {
      id: gid(), empId: vacForm.empId, empName: emp?.name || '',
      fechaInicio: vacForm.fechaInicio, fechaFin: vacForm.fechaFin, dias,
      motivo: vacForm.motivo || 'Vacaciones asignadas', estado: 'aprobada',
      ts: new Date().toISOString(), resolvedAt: new Date().toISOString(),
      asignadaPor: session?.user?.name || 'Admin'
    }
    const withAudit = auditLog(db, 'Vacaciones asignadas', `${item.empName} · ${fds(item.fechaInicio)} → ${fds(item.fechaFin)} (${dias}d)`, session?.user?.name || 'Admin')
    const noti = { id: gid(), empId: vacForm.empId, action: '🌴 Vacaciones asignadas', detail: `${fds(item.fechaInicio)} → ${fds(item.fechaFin)}`, ts: new Date().toISOString(), leido: false }
    saveDB({ vacaciones: [...(db.vacaciones || []), item], audit: withAudit.audit, notis: [...(db.notis || []), noti] })
    queuePush(vacForm.empId, noti.action, noti.detail, 'vacaciones', '/?go=emp:vacaciones')
    setVacForm(f => ({ ...f, empId:'', motivo:'' }))
    toast('Vacaciones asignadas — no podrá fichar esos días', 3500, 'ok')
  }

  const allAus = [
    ...(db.medicos||[]).map(a => ({ ...a, tipo:'medico' })),
    ...(db.ausencias||[]).map(a => ({ ...a, tipo:'ausencia' })),
  ].sort((a,b) => (b.fechaInicio||b.fecha||'').localeCompare(a.fechaInicio||a.fecha||''))

  const addAus = () => {
    if (!ausForm.empId || !ausForm.fechaInicio) { toast('Selecciona empleado y fecha'); return }
    if (ausForm.fechaFin && ausForm.fechaFin < ausForm.fechaInicio) { toast('La fecha fin no puede ser anterior al inicio', 3500, 'err'); return }
    const emp = emps.find(e => e.id === ausForm.empId)
    const key = ausForm.tipo === 'medico' ? 'medicos' : 'ausencias'
    const item = { id: gid(), empId: ausForm.empId, empName: emp?.name || '', fechaInicio: ausForm.fechaInicio, fechaFin: ausForm.fechaFin || ausForm.fechaInicio, motivo: ausForm.motivo, ts: new Date().toISOString() }
    saveDB({ [key]: [...(db[key]||[]), item] })
    const tipoLbl2 = ausForm.tipo === 'medico' ? 'Ausencia médica' : 'Ausencia'
    queuePush(ausForm.empId, `🗓️ ${tipoLbl2} registrada`, `Se ha registrado una ${tipoLbl2.toLowerCase()} el ${ausForm.fechaInicio}.`, 'ausencia', '/?tab=calendario')
    setAusForm(f => ({ ...f, empId:'', motivo:'' }))
    toast('Ausencia registrada', 3000, 'ok')
  }

  const delAus = (id, tipo) => {
    const key = tipo === 'medico' ? 'medicos' : 'ausencias'
    saveDB({ [key]: (db[key]||[]).filter(a => a.id !== id) })
    toast('Ausencia eliminada')
  }

  const VacRow = ({ v }) => {
    const [swipeX, setSwipeX] = useState(0)
    const [isDragging, setIsDragging] = useState(false)
    // { active, axis: null|'x'|'y' } — sin bloqueo de eje, un scroll vertical con
    // algo de deriva lateral podía leerse como swipe y aprobar/rechazar una
    // solicitud sin que el usuario lo quisiera. Ver mismo fix en SwipeToDelete.
    const swipeRef = useRef({ startX: 0, startY: 0, active: false, axis: null })

    const onTouchStart = (e) => {
      if (v.estado !== 'pendiente') return
      swipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, active: true, axis: null }
      setIsDragging(true)
    }
    const onTouchMove = (e) => {
      if (!swipeRef.current.active) return
      const dx = e.touches[0].clientX - swipeRef.current.startX
      const dy = e.touches[0].clientY - swipeRef.current.startY
      if (swipeRef.current.axis === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        swipeRef.current.axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y'
      }
      if (swipeRef.current.axis !== 'x') return
      setSwipeX(Math.max(-100, Math.min(100, dx)))
    }
    const onTouchEnd = () => {
      if (!swipeRef.current.active) return
      const wasHorizontal = swipeRef.current.axis === 'x'
      swipeRef.current.active = false
      setIsDragging(false)
      if (wasHorizontal && swipeX > 75) {
        act(v.id, 'aprobada')
        try { navigator.vibrate(15) } catch {}
      } else if (wasHorizontal && swipeX < -75) {
        setRejecting(v.id); setRejMotivo('')
        try { navigator.vibrate(10) } catch {}
      }
      setSwipeX(0)
    }

    const THRESH = 75
    const progress = Math.abs(swipeX) / THRESH
    const isApprove = swipeX > 20
    const isReject = swipeX < -20

    return (
      <div style={{ position:'relative', marginBottom:8, borderRadius:'var(--r-lg)', overflow:'hidden' }}>
        {/* Reveal backgrounds */}
        {v.estado === 'pendiente' && (
          <>
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', paddingLeft:20, background:'var(--green-dim)', borderRadius:'var(--r-lg)', opacity: isApprove ? Math.min(1, progress) : 0, transition: isDragging ? 'none' : 'opacity .3s', pointerEvents:'none' }}>
              <span style={{ fontSize:20 }}>✓</span>
              <span style={{ marginLeft:8, fontSize:12, fontWeight:700, color:'var(--green)' }}>Aprobar</span>
            </div>
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:20, background:'rgba(239,68,68,.1)', borderRadius:'var(--r-lg)', opacity: isReject ? Math.min(1, progress) : 0, transition: isDragging ? 'none' : 'opacity .3s', pointerEvents:'none' }}>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--danger)' }}>Rechazar</span>
              <span style={{ fontSize:20, marginLeft:8 }}>✗</span>
            </div>
          </>
        )}
        {/* Card */}
        <div
          className={`sol-card${v.estado==='pendiente'?' pending':v.estado==='aprobada'?' approved':' rejected'}`}
          style={{ flexWrap:'wrap', transform:`translateX(${swipeX}px)`, transition: isDragging ? 'none' : 'transform .3s cubic-bezier(.16,1,.3,1)', marginBottom:0, position:'relative', zIndex:1, touchAction: v.estado==='pendiente' ? 'pan-y' : undefined }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div style={{ width:40, height:40, borderRadius:12, background: v.estado==='pendiente'?'var(--orange-dim)':v.estado==='aprobada'?'var(--green-dim)':'rgba(239,68,68,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
            {v.estado==='pendiente'?'⏳':v.estado==='aprobada'?'✓':'✗'}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700 }}>{v.empName}</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>{fds(v.fechaInicio)} → {fds(v.fechaFin)} · {v.dias} días</div>
            {v.motivo && <div style={{ fontSize:11, color:'var(--text4)', marginTop:3 }}>{v.motivo}</div>}
            {v.estado === 'rechazada' && v.motivoRechazo && (
              <div style={{ fontSize:11, color:'var(--danger)', marginTop:3, fontStyle:'italic' }}>Motivo: {v.motivoRechazo}</div>
            )}
          </div>
          <div className={`badge${v.estado==='aprobada'?' badge-green':v.estado==='rechazada'?' badge-red':' badge-orange'}`}>
            {v.estado==='aprobada'?'Aprobada':v.estado==='rechazada'?'Rechazada':'Pendiente'}
          </div>
          {v.estado === 'pendiente' && rejecting !== v.id && (
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn btn-sm btn-primary" onClick={() => act(v.id, 'aprobada')}>✓</button>
              <button className="btn btn-sm btn-danger" onClick={() => { setRejecting(v.id); setRejMotivo('') }}>✗</button>
            </div>
          )}
          {v.estado !== 'pendiente' && (
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn btn-sm btn-secondary" title="Eliminar" onClick={() => delVac(v.id)}>🗑️</button>
            </div>
          )}
          {rejecting === v.id && (
            <div style={{ width:'100%', marginTop:10, display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input
                  autoFocus
                  maxLength={200}
                  style={{ flex:1, background:'var(--bg-500)', border:'1px solid var(--border2)', borderRadius:8, padding:'6px 10px', color:'var(--text)', fontSize:12, fontFamily:'inherit' }}
                  placeholder="Motivo del rechazo (obligatorio)"
                  value={rejMotivo}
                  onChange={e => setRejMotivo(e.target.value.slice(0, 200))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { act(v.id, 'rechazada', rejMotivo.trim()); setRejecting(null) }
                    if (e.key === 'Escape') setRejecting(null)
                  }}
                />
                <button className="btn btn-sm btn-danger" disabled={!rejMotivo.trim()} onClick={() => { act(v.id, 'rechazada', rejMotivo.trim()); setRejecting(null) }}>Rechazar</button>
                <button className="btn btn-sm btn-secondary" onClick={() => setRejecting(null)}>✕</button>
              </div>
              <div style={{ fontSize:10, color: rejMotivo.length > 180 ? 'var(--orange)' : 'var(--text4)', textAlign:'right' }}>{rejMotivo.length}/200</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Solicitudes</h1>
          <div className="adm-panel-sub" style={{ marginTop:2 }}>{pend.length} pendientes de revisión</div>
        </div>
      </div>

      <div className="pill-tabs" style={{ marginBottom:20 }}>
        {[['vacaciones','🌴 Vacaciones'],['ausencias','🏥 Ausencias médicas'],['correcciones','✏️ Correcciones']].map(([v,l]) => (
          <button key={v} className={`pill-tab${solTab===v?' active':''}`} onClick={() => setSolTab(v)}>{l}</button>
        ))}
      </div>

      {solTab === 'vacaciones' && (
        <>
          {/* Alta directa de vacaciones */}
          <div className="dash-widget" style={{ marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>Asignar vacaciones a un empleado</div>
            <div className="field-row">
              <div className="field" style={{ marginBottom:0 }}>
                <label>Empleado</label>
                <select value={vacForm.empId} onChange={e => setVacForm(f => ({ ...f, empId:e.target.value }))}>
                  <option value="">Selecciona empleado</option>
                  {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Motivo (opcional)</label>
                <input value={vacForm.motivo} onChange={e => setVacForm(f => ({ ...f, motivo:e.target.value }))} placeholder="Vacaciones de verano…" />
              </div>
            </div>
            <div className="field-row" style={{ marginTop:10 }}>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Fecha inicio</label>
                <input type="date" value={vacForm.fechaInicio} onChange={e => setVacForm(f => ({ ...f, fechaInicio:e.target.value }))} />
              </div>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Fecha fin</label>
                <input type="date" value={vacForm.fechaFin} min={vacForm.fechaInicio} onChange={e => setVacForm(f => ({ ...f, fechaFin:e.target.value }))} />
              </div>
            </div>
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:10, marginBottom:14 }}>
              Días naturales (incluye fines de semana). Quedan aprobadas al instante y el empleado no podrá fichar hasta que terminen.
            </div>
            <button className="btn btn-primary" onClick={assignVac} style={{ width:'100%' }}>🌴 Asignar vacaciones</button>
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
              <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
              <div className="empty-premium-title">Sin solicitudes</div>
              <div className="empty-premium-sub">Las solicitudes de vacaciones de los empleados aparecerán aquí</div>
            </div>
          )}
        </>
      )}

      {solTab === 'ausencias' && (
        <>
          {/* Formulario alta */}
          <div className="dash-widget" style={{ marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>Registrar ausencia / baja médica</div>
            <div className="field-row">
              <div className="field" style={{ marginBottom:0 }}>
                <label>Empleado</label>
                <select value={ausForm.empId} onChange={e => setAusForm(f => ({ ...f, empId:e.target.value }))}>
                  <option value="">Selecciona empleado</option>
                  {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Tipo</label>
                <select value={ausForm.tipo} onChange={e => setAusForm(f => ({ ...f, tipo:e.target.value }))}>
                  <option value="medico">🏥 Baja médica</option>
                  <option value="ausencia">📋 Ausencia justificada</option>
                </select>
              </div>
            </div>
            <div className="field-row" style={{ marginTop:10 }}>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Fecha inicio</label>
                <input type="date" value={ausForm.fechaInicio} onChange={e => setAusForm(f => ({ ...f, fechaInicio:e.target.value }))} />
              </div>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Fecha fin</label>
                <input type="date" value={ausForm.fechaFin} min={ausForm.fechaInicio} onChange={e => setAusForm(f => ({ ...f, fechaFin:e.target.value }))} />
              </div>
            </div>
            <div className="field" style={{ marginTop:10, marginBottom:14 }}>
              <label>Motivo (opcional)</label>
              <input value={ausForm.motivo} onChange={e => setAusForm(f => ({ ...f, motivo:e.target.value }))} placeholder="Descripción breve de la ausencia" />
            </div>
            <button className="btn btn-primary" onClick={addAus} style={{ width:'100%' }}>+ Registrar ausencia</button>
          </div>

          {/* Listado */}
          <div className="section-header">Historial de ausencias</div>
          <div className="stagger-in" style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {allAus.map(a => {
              const start = new Date(a.fechaInicio + 'T00:00:00'), end = new Date(a.fechaFin + 'T00:00:00')
              const dias = Math.round((end - start) / 86400000) + 1
              return (
                <div key={a.id} className="card" style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:38, height:38, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18,
                    background: a.tipo==='medico' ? 'rgba(239,68,68,.1)' : 'rgba(245,158,11,.1)' }}>
                    {a.tipo==='medico'?'🏥':'📋'}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700 }}>{a.empName}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                      {fds(a.fechaInicio)} → {fds(a.fechaFin)} · {dias}d · <span style={{ color: a.tipo==='medico'?'var(--red)':'var(--orange)' }}>{a.tipo==='medico'?'Baja médica':'Ausencia'}</span>
                    </div>
                    {a.motivo && <div style={{ fontSize:11, color:'var(--text4)', marginTop:1 }}>{a.motivo}</div>}
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => delAus(a.id, a.tipo)}>✕</button>
                </div>
              )
            })}
          </div>
          {!allAus.length && (
            <div className="empty-premium">
              <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div>
              <div className="empty-premium-title">Sin ausencias registradas</div>
              <div className="empty-premium-sub">Las bajas médicas y ausencias aparecerán aquí. También se muestran en el calendario de cada empleado.</div>
            </div>
          )}
        </>
      )}

      {solTab === 'correcciones' && (() => {
        const corrPend = (db.correccionesFichaje || []).filter(c => c.estado === 'pendiente').sort((a,b) => b.ts - a.ts)
        const corrRest = (db.correccionesFichaje || []).filter(c => c.estado !== 'pendiente').sort((a,b) => b.ts - a.ts).slice(0, 20)

        const actCorr = (id, estado, overrideInicio, overrideFin) => {
          const corr = (db.correccionesFichaje || []).find(c => c.id === id)
          if (!corr) return
          let newRecords = db.records || []
          if (estado === 'aprobada') {
            const finalInicio = overrideInicio || corr.propInicio
            const finalFin = overrideFin || corr.propFin
            newRecords = newRecords.map(r => {
              if (r.id !== corr.recId) return r
              const updated = { ...r, inicio: finalInicio, fin: finalFin }
              const t = calcSecs(updated)
              return { ...updated, workSecs: t.work, breakSecs: t.brk }
            })
          }
          const finalInicioLabel = overrideInicio || corr.propInicio
          const finalFinLabel = overrideFin || corr.propFin
          const updated = (db.correccionesFichaje || []).map(c => c.id === id ? { ...c, estado, resolvedAt: new Date().toISOString(), resolvedBy: session?.user?.name || 'Admin', finalInicio: finalInicioLabel, finalFin: finalFinLabel } : c)
          const noti = { id: gid(), empId: corr.empId, action: estado === 'aprobada' ? 'Corrección aprobada' : 'Corrección rechazada', detail: corr.motivo || '', ts: new Date().toISOString(), leido: false }
          const withAudit = auditLog(db, estado === 'aprobada' ? 'correccion_aprobada' : 'correccion_rechazada', `${corr.empName}: ${corr.motivo || ''}`, session?.user?.name || 'Admin')
          saveDB({ correccionesFichaje: updated, records: newRecords, notis: [...(db.notis||[]), noti], audit: withAudit.audit })
          queuePush(corr.empId, noti.action, `Tu solicitud de corrección ha sido ${estado === 'aprobada' ? 'aprobada' : 'rechazada'}.`, 'correccion', '/?tab=jornada')
          toast(estado === 'aprobada' ? 'Corrección aplicada' : 'Corrección rechazada', 3000, estado === 'aprobada' ? 'ok' : 'warn')
          setEditCorrId(null)
        }

        return (
          <>
            {corrPend.length > 0 && (
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:10 }}>Pendientes · {corrPend.length}</div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {corrPend.map(c => (
                    <div key={c.id} className="card" style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                      <div style={{ width:38, height:38, borderRadius:10, background:'var(--orange-dim)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>✏️</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700 }}>{c.empName}</div>
                        <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                          Original: {ftime(c.recInicio)} → {c.recFin ? ftime(c.recFin) : '—'}
                          {c.recInicio && c.recFin && <span style={{ marginLeft:6, fontVariantNumeric:'tabular-nums' }}>({mhm(Math.floor((new Date(c.recFin)-new Date(c.recInicio))/60000))})</span>}
                        </div>
                        <div style={{ fontSize:11, color:'var(--primary-light)', marginTop:2 }}>
                          Propuesto: {ftime(c.propInicio)} → {c.propFin ? ftime(c.propFin) : '—'}
                          {c.propInicio && c.propFin && (() => {
                            const origMin = c.recInicio && c.recFin ? Math.floor((new Date(c.recFin)-new Date(c.recInicio))/60000) : 0
                            const propMin = Math.floor((new Date(c.propFin)-new Date(c.propInicio))/60000)
                            const diff = propMin - origMin
                            return <span style={{ marginLeft:6, fontVariantNumeric:'tabular-nums', color: diff >= 0 ? 'var(--green)' : 'var(--red)', fontWeight:700 }}>({mhm(propMin)} · {diff >= 0 ? '+' : ''}{mhm(Math.abs(diff))})</span>
                          })()}
                        </div>
                        {c.motivo && <div style={{ fontSize:11, color:'var(--text4)', marginTop:3, fontStyle:'italic' }}>"{c.motivo}"</div>}
                        {editCorrId === c.id && (
                          <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6, padding:10, background:'var(--bg-500)', borderRadius:8, border:'1px solid var(--border)' }}>
                            <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', marginBottom:2 }}>Editar horas antes de aprobar</div>
                            <div style={{ display:'flex', gap:8 }}>
                              <div style={{ flex:1 }}>
                                <label style={{ fontSize:10, color:'var(--text3)' }}>Entrada</label>
                                <input type="datetime-local" value={editInicio} onChange={e => setEditInicio(e.target.value)}
                                  style={{ width:'100%', fontSize:11, padding:'5px 6px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text2)', marginTop:2 }} />
                              </div>
                              <div style={{ flex:1 }}>
                                <label style={{ fontSize:10, color:'var(--text3)' }}>Salida</label>
                                <input type="datetime-local" value={editFin} onChange={e => setEditFin(e.target.value)}
                                  style={{ width:'100%', fontSize:11, padding:'5px 6px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text2)', marginTop:2 }} />
                              </div>
                            </div>
                            <div style={{ display:'flex', gap:6, justifyContent:'flex-end', marginTop:2 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => setEditCorrId(null)}>Cancelar</button>
                              <button className="btn btn-primary btn-sm" onClick={() => {
                                const ini = editInicio ? new Date(editInicio).toISOString() : null
                                const fin = editFin   ? new Date(editFin).toISOString()   : null
                                actCorr(c.id, 'aprobada', ini, fin)
                              }}>Aprobar y guardar</button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                        <button className="btn btn-sm btn-primary" onClick={() => actCorr(c.id, 'aprobada')}>✓</button>
                        <button className="btn btn-sm" style={{ background:'var(--bg-500)', color:'var(--text2)', border:'1px solid var(--border)' }}
                          onClick={() => {
                            if (editCorrId === c.id) { setEditCorrId(null); return }
                            setEditCorrId(c.id)
                            setEditInicio(c.propInicio ? c.propInicio.slice(0,16) : '')
                            setEditFin(c.propFin ? c.propFin.slice(0,16) : '')
                          }}>✎</button>
                        <button className="btn btn-sm btn-danger"  onClick={() => actCorr(c.id, 'rechazada')}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!corrPend.length && (
              <div className="empty-premium">
                <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
                <div className="empty-premium-title">Sin correcciones pendientes</div>
                <div className="empty-premium-sub">Cuando un empleado solicite corregir un fichaje aparecerá aquí</div>
              </div>
            )}
            {corrRest.length > 0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:10 }}>Historial</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {corrRest.map(c => (
                    <div key={c.id} style={{ display:'flex', gap:10, padding:'9px 12px', background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)', alignItems:'center' }}>
                      <div style={{ fontSize:15 }}>{c.estado==='aprobada'?'✅':'❌'}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:600 }}>{c.empName}</div>
                        <div style={{ fontSize:11, color:'var(--text3)' }}>{c.motivo || 'Sin motivo'}</div>
                      </div>
                      <div className={`badge ${c.estado==='aprobada'?'badge-green':'badge-red'}`}>{c.estado}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      })()}
    </div>
  )
}

// ─── PANEL EMPLEADOS ──────────────────────────────────────────────────────────
function PanelEmpleados({ db, toast, saveDB, openModal, closeModal, activeModal, modalData, session }) {
  const allEmps = sortedEmps(db)
  const [empSearch, setEmpSearch] = useState('')
  const [qrEmp, setQrEmp] = useState(null)
  const qrCanvasRef = useRef(null)

  useEffect(() => {
    if (!qrEmp || !qrCanvasRef.current) return
    const url = `${window.location.origin}${window.location.pathname}?emp=${encodeURIComponent(qrEmp.id)}`
    QRCode.toCanvas(qrCanvasRef.current, url, { width: 240, margin: 2, color: { dark: '#0d0d18', light: '#ffffff' } }).catch(() => {})
  }, [qrEmp])
  const emps = useMemo(() => {
    if (!empSearch.trim()) return allEmps
    const q = empSearch.toLowerCase()
    return allEmps.filter(e => e.name?.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q) || e.empresa?.toLowerCase().includes(q) || e.centroTrabajo?.toLowerCase().includes(q))
  }, [allEmps, empSearch])
  // Con plantillas grandes, renderizar cientos de tarjetas de golpe se nota en
  // el scroll — igual que en Fichajes, se pagina y se amplía bajo demanda.
  const [empPageSize, setEmpPageSize] = useState(60)
  useEffect(() => { setEmpPageSize(60) }, [empSearch])
  const pagedEmps = useMemo(() => emps.slice(0, empPageSize), [emps, empPageSize])
  const [showForm, setShowForm] = useState(false)
  const [editEmp, setEditEmp] = useState(null)

  const EMPTY_EMP = { id: gid(), name:'', pin:'', email:'', role:'emp', empresa:'', centroTrabajo:'', obrasAsignadas:[], color:'#5E6AD2', baja:false, fechaAlta: today(), startDate: today(), horasSemanales: 40 }
  const [form, setForm] = useState(EMPTY_EMP)

  const openNew = () => { setForm({ ...EMPTY_EMP, id: gid() }); setShowForm(true); setEditEmp(null) }
  const openEdit = (e) => { setForm({ obrasAsignadas: [], ...e, pin: '' }); setShowForm(true); setEditEmp(e.id) }

  const toggleObra = (centro) => {
    setForm(f => {
      const cur = f.obrasAsignadas || []
      return { ...f, obrasAsignadas: cur.includes(centro) ? cur.filter(c => c !== centro) : [...cur, centro] }
    })
  }

  const saveEmp = async () => {
    if (!form.name.trim()) { toast('Nombre requerido'); return }
    const isNewPin = form.pin && form.pin.length >= 4
    if (!editEmp && !isNewPin) { toast('PIN de mínimo 4 dígitos'); return }
    if (form.pin && form.pin.length > 0 && form.pin.length < 4) { toast('PIN de mínimo 4 dígitos'); return }
    if (isNewPin) {
      for (const e of (db.employees||[])) {
        if (e.id === form.id) continue
        const dup = isPinHashed(e.pin) ? (await hashPin(form.pin, e.id)) === e.pin : e.pin === form.pin
        if (dup) { toast('PIN ya está en uso'); return }
      }
    }
    if (form.telefono && form.telefono.trim()) {
      const dupPhone = (db.employees||[]).find(e => e.id !== form.id && !e.baja && e.telefono && e.telefono === form.telefono)
      if (dupPhone) { toast(`Ese WhatsApp ya está en uso por ${dupPhone.name}`); return }
    }
    let finalPin = form.pin
    let pinLen
    if (isNewPin) {
      pinLen = form.pin.length
      finalPin = await hashPin(form.pin, form.id)
    } else if (editEmp) {
      const existing = (db.employees||[]).find(e => e.id === editEmp)
      finalPin = existing?.pin || ''
      pinLen = existing?.pinLen
    }
    const updatedForm = { ...form, pin: finalPin, ...(pinLen !== undefined ? { pinLen } : {}) }
    if (!updatedForm.empresa?.trim()) updatedForm.empresa = 'Sin asignar'
    const emps2 = editEmp
      ? (db.employees||[]).map(e => e.id === editEmp ? updatedForm : e)
      : [...(db.employees||[]), updatedForm]
    const auditAction = editEmp
      ? (isNewPin ? 'Empleado actualizado (PIN cambiado)' : 'Empleado actualizado')
      : 'Empleado creado'
    const withAudit = auditLog(db, auditAction, form.name, session?.user?.name || 'Admin')
    // Auto welcome message for new employees
    const extraData = {}
    if (!editEmp) {
      const welcomeMsg = {
        id: gid(), from: 'admin', to: updatedForm.id,
        text: `¡Bienvenido/a a TIMES INC, ${updatedForm.name.split(' ')[0]}! 👋\nHas sido dado de alta en el sistema. Usa tu PIN para acceder y registrar tu jornada diaria. Si tienes dudas, escríbeme aquí.`,
        ts: Date.now(), leido: false
      }
      extraData.chats = [...(db.chats || []), welcomeMsg]
      const noti = { id: gid(), empId: updatedForm.id, action: '¡Bienvenido/a!', detail: 'Ya puedes acceder con tu PIN', ts: Date.now(), leido: false }
      extraData.notis = [...(db.notis || []), noti]
    }
    saveDB({ employees: emps2, audit: withAudit.audit, ...extraData })
    toast(editEmp ? '✅ Empleado actualizado' : '✅ Empleado creado')
    setShowForm(false)
  }

  const { showConfirm } = useAppStore()
  const del = (id) => {
    showConfirm('¿Dar de baja a este empleado? Esta acción se puede revertir desde el perfil.', () => {
      try { navigator.vibrate(20) } catch {}
      const emp = (db.employees||[]).find(e => e.id === id)
      const emps2 = (db.employees||[]).map(e => e.id === id ? { ...e, baja:true, fechaBaja: today() } : e)
      const withAudit = auditLog(db, 'Empleado dado de baja', emp?.name || '', session?.user?.name || 'Admin')
      saveDB({ employees: emps2, audit: withAudit.audit })
      toast('Empleado dado de baja')
    })
  }

  const exportEmpleadosXLSX = async () => {
    const now2 = new Date()
    const mk2 = `${now2.getFullYear()}-${p2(now2.getMonth()+1)}`
    const XLSX = await import('xlsx')
    const empNombre = (db.config?.companyName || (db.empresas||[])[0] || '')
    const title = [`Empleados — ${empNombre || 'TIMES INC'} — ${mk2}`]
    const headers = ['Nombre','Email','Rol','Obra','Centro trabajo','Alta','H/sem','H. trabajadas (mes actual)','H. trabajadas (dec.)','Estado']
    const dataRows = allEmps.map(e => {
      const monthMin = (db.records||[]).filter(r => r.empId===e.id && r.fin && r.inicio?.startsWith(mk2)).reduce((s,r)=>s+calcMin(r),0)
      return [e.name, e.email||'', e.role||'emp', e.empresa||'', e.centroTrabajo||'', e.startDate||'', e.horasSemanales||40, mhm(monthMin), Math.round(monthMin/60*100)/100, e.baja?'Baja':'Activo']
    })
    const ws = XLSX.utils.aoa_to_sheet([title, [], headers, ...dataRows])
    ws['!cols'] = [22,22,12,18,16,12,7,14,14,8].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Empleados')
    XLSX.writeFile(wb, `empleados_${empNombre?empNombre.replace(/\s+/g,'_')+'_':''}${mk2}.xlsx`)
    toast('Excel descargado', 3000, 'ok')
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Empleados</h1>
          <div className="adm-panel-sub" style={{ marginTop:2 }}>{emps.length} empleado{emps.length!==1?'s':''} {empSearch ? 'encontrados' : `(${emps.filter(e=>!e.baja).length} activos)`}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary btn-sm" onClick={exportEmpleadosXLSX} title="Exportar Excel">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:4 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Excel
          </button>
          <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nuevo</button>
        </div>
      </div>

      <div className="premium-filters" style={{ marginBottom:16 }}>
        <input placeholder="Buscar empleado, obra, centro…" value={empSearch} onChange={e => setEmpSearch(e.target.value)} style={{ flex:1 }} />
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>{editEmp ? 'Editar empleado' : 'Nuevo empleado'}</div>
          <div className="field-row">
            <div className="field"><label>Nombre completo *</label><input value={form.name} maxLength={80} onChange={e => setForm(f=>({...f,name:e.target.value.slice(0,80)}))} /></div>
            <div className="field"><label>PIN (4-6 dígitos){editEmp ? '' : ' *'}</label><input type="password" value={form.pin} maxLength={6} placeholder={editEmp ? 'Vacío = sin cambios' : ''} onChange={e => setForm(f=>({...f,pin:e.target.value.replace(/\D/g,'').slice(0,6)}))} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Email</label><input type="email" value={form.email||''} maxLength={100} onChange={e => setForm(f=>({...f,email:e.target.value.slice(0,100)}))} /></div>
            <div className="field"><label>WhatsApp (ej: 34612345678)</label><input type="tel" value={form.telefono||''} maxLength={15} placeholder="34612345678" onChange={e => setForm(f=>({...f,telefono:e.target.value.replace(/\D/g,'').slice(0,15)}))} /></div>
            <div className="field"><label>Rol</label>
              <select value={form.role||'emp'} onChange={e => setForm(f=>({...f,role:e.target.value}))}>
                <option value="emp">Empleado</option>
                <option value="encargado">Encargado</option>
                <option value="jefe_obra">Jefe de Obra</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>Obra</label>
              <select value={form.empresa||''} onChange={e => setForm(f=>({...f,empresa:e.target.value}))}>
                <option value="">— Sin asignar —</option>
                {(db.empresas||[]).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
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
            <div className="field"><label>DNI / NIE</label><input value={form.dni||''} maxLength={12} placeholder="12345678A" onChange={e => setForm(f=>({...f,dni:e.target.value.toUpperCase().slice(0,12)}))} /></div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Horas contratadas / semana</label>
              <input type="number" min={1} max={60} value={form.horasSemanales||40} onChange={e => setForm(f=>({...f,horasSemanales:parseInt(e.target.value)||40}))} placeholder="40" />
            </div>
            <div className="field" style={{ display:'flex', alignItems:'flex-end' }}>
              <div style={{ fontSize:11, color:'var(--text3)', lineHeight:1.5, paddingBottom:6 }}>
                Usado para calcular horas extra y desvío en informes.<br/>Por defecto: 40h/semana.
              </div>
            </div>
          </div>
          <div className="modal-btns">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveEmp}>Guardar</button>
          </div>
        </div>
      )}

      {emps.length === 0 ? (
        <div className="empty-premium">
          <div className="empty-premium-icon">👷</div>
          <div className="empty-premium-title">Sin empleados {empSearch ? 'con ese filtro' : 'todavía'}</div>
          <div className="empty-premium-sub">{empSearch ? 'Prueba otra búsqueda.' : 'Crea el primer empleado con el botón "+ Nuevo".'}</div>
          {!empSearch && <button className="btn btn-primary btn-sm" style={{ marginTop:12 }} onClick={openNew}>+ Añadir empleado</button>}
        </div>
      ) : (
        <div className="emp-grid stagger-in">
          {pagedEmps.map(e => (
            <div key={e.id} className="emp-card card-lift" style={{ opacity: e.baja ? 0.5 : 1 }}>
              <div className="emp-card-top">
                <div className="emp-card-avatar" style={{ background: e.color || 'var(--primary)' }}>
                  {(e.initials || e.name.slice(0, 2)).toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="emp-card-name">{e.name}</div>
                  <div className="emp-card-sub">{e.empresa || 'Sin obra asignada'}</div>
                </div>
                <span className={`badge${e.role==='encargado'?' badge-purple':e.role==='jefe_obra'?' badge-blue':''}`}>
                  {e.role==='encargado'?'⭐ Enc.':e.role==='jefe_obra'?'🏗️ JO':'👷 Emp'}
                </span>
              </div>
              <div className="emp-card-body">
                <div className="emp-card-row">
                  <span className="emp-card-row-lbl">PIN</span>
                  <span className="emp-card-row-val" style={{ fontFamily:'monospace', letterSpacing:2 }}>{'•'.repeat(e.pinLen || (e.pin?.length <= 6 ? e.pin?.length : 4) || 4)}</span>
                </div>
                <div className="emp-card-row">
                  <span className="emp-card-row-lbl">Alta</span>
                  <span className="emp-card-row-val">{e.fechaAlta || '—'}</span>
                </div>
                {e.baja && <div className="emp-card-row"><span className="badge badge-red">Baja</span></div>}
              </div>
              <div className="emp-card-actions">
                <button className="btn btn-sm btn-secondary" onClick={() => openEdit(e)}>✏️ Editar</button>
                <button className="btn btn-sm btn-secondary" title="Generar QR de acceso" onClick={() => setQrEmp(e)}>QR</button>
                {!e.baja && <button className="btn btn-sm btn-danger" onClick={() => del(e.id)}>Baja</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {emps.length > pagedEmps.length && (
        <div style={{ textAlign:'center', marginTop:16 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setEmpPageSize(s => s + 60)}>
            Ver más ({emps.length - pagedEmps.length} restantes)
          </button>
        </div>
      )}

      {/* ── Modal QR ─────────────────────────────────────────────── */}
      {qrEmp && (
        <div onClick={() => setQrEmp(null)} style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.6)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'var(--bg-700)', borderRadius:20, padding:'28px 24px 24px', boxShadow:'0 20px 60px rgba(0,0,0,.5)', border:'1px solid var(--border2)', textAlign:'center', maxWidth:320, width:'90%' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:4 }}>QR de acceso rápido</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginBottom:16 }}>{qrEmp.name} · escanea para pre-seleccionar</div>
            <div style={{ background:'#fff', borderRadius:12, display:'inline-block', padding:12, marginBottom:16 }}>
              <canvas ref={qrCanvasRef} />
            </div>
            <div style={{ fontSize:11, color:'var(--text4)', marginBottom:20, lineHeight:1.5 }}>
              Al escanear el QR, la app abrirá la pantalla de login con este empleado ya seleccionado.
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:8 }}>
              <button className="btn btn-secondary btn-sm" style={{ flex:1 }} onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}?emp=${encodeURIComponent(qrEmp.id)}`
                navigator.clipboard?.writeText(url).then(() => toast('Enlace copiado', 2000, 'ok')).catch(() => toast('No se pudo copiar', 2000, 'err'))
              }}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:4 }}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copiar enlace
              </button>
              <button className="btn btn-secondary" style={{ flex:1 }} onClick={() => setQrEmp(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
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
  const [procesandoCierre, setProcesandoCierre] = useState(new Set())
  const procesandoCierreRef = useRef(new Set())
  const [agruparCentro, setAgruparCentro] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(null) // id del cierre en curso, o 'consolidado'
  const empresaNombreCfg = db.config?.companyName || db.empresas?.[0] || 'TIMES INC'
  const recs = db.records || []
  const emps = (db.employees || []).filter(e => !e.baja)
  const now = new Date()

  const filterMonth = selMonth || `${now.getFullYear()}-${p2(now.getMonth()+1)}`

  const rows = sortedEmps(db).filter(e => !e.baja).map(e => {
    const eRecs = recs.filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(filterMonth))
    const totalMin = eRecs.reduce((s, r) => s + calcMin(r), 0)
    const weeklyH = e.horasSemanales || (WK / 60)  // siempre en horas
    const expected = weeklyH * 4 * 60              // 4 semanas → minutos
    const diff = totalMin - expected
    const vac = vacData(e.id, db)
    return { e, totalMin, diff, days: eRecs.length, vac, expected, weeklyH }
  })

  const empresa = db.config?.companyName || (db.empresas||[])[0] || ''

  const downloadXLSX = async (sheetName, aoa, filename, colWidths) => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    if (colWidths) ws['!cols'] = colWidths.map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, filename)
  }

  const minToDecH = m => Math.round(m / 60 * 100) / 100

  const exportFichajesXLSX = async () => {
    let filtered = recs.filter(r => r.fin)
    if (selEmp) filtered = filtered.filter(r => r.empId === selEmp)
    if (from) filtered = filtered.filter(r => (r.inicio?.slice(0,10) || '') >= from)
    if (to)   filtered = filtered.filter(r => (r.inicio?.slice(0,10) || '') <= to)
    if (!filtered.length) { toast('Sin datos para exportar'); return }
    if (agruparCentro) {
      filtered.sort((a, b) => (a.centro||'').localeCompare(b.centro||'') || (a.empName||'').localeCompare(b.empName||'') || (a.inicio||'').localeCompare(b.inicio||''))
    } else {
      filtered.sort((a, b) => (a.inicio||'').localeCompare(b.inicio||''))
    }
    const periodo = from || to ? `${from||'inicio'} a ${to||'hoy'}` : filterMonth
    const title = [`Fichajes — ${empresa || 'TIMES INC'} — ${periodo}${agruparCentro ? ' (agrupado por centro)' : ''}`]
    const headers = ['Empleado','Obra','Centro','Fecha','Entrada','Salida','H. trabajo','H. trabajo (dec.)','H. descanso','Notas']
    const dataRows = filtered.map(r => {
      const wm = Math.floor(recWorkSecs(r)/60), bm = Math.floor((r.breakSecs||0)/60)
      const d = new Date(r.inicio), fin = new Date(r.fin)
      return [
        r.empName,
        r.empresa||'',
        r.centro||'',
        d.toLocaleDateString('es-ES'),
        d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}),
        fin.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}),
        `${Math.floor(wm/60)}:${p2(wm%60)}`,
        minToDecH(wm),
        `${Math.floor(bm/60)}:${p2(bm%60)}`,
        r.notes||''
      ]
    })
    const totalWm = filtered.reduce((s,r) => s + Math.floor(recWorkSecs(r)/60), 0)
    const totals = ['TOTAL','','','','','', mhm(totalWm), minToDecH(totalWm),'','']
    const aoa = [title, [], headers, ...dataRows, [], totals]
    const cols = [22,18,16,12,8,8,10,14,10,20]
    const fname = `fichajes_${empresa?empresa.replace(/\s+/g,'_')+'_':''}${from||'todo'}_${to||'hoy'}.xlsx`
    await downloadXLSX('Fichajes', aoa, fname, cols)
    toast('Excel descargado', 3000, 'ok')
  }

  const [y, mo] = filterMonth.split('-').map(Number)
  const daysInMonth = new Date(y, mo, 0).getDate()
  const mesNombreXLSX = new Date(filterMonth + '-01').toLocaleDateString('es-ES', { month:'long', year:'numeric' })

  const exportDetalleXLSX = async () => {
    const empRows = sortedEmps(db).filter(e => !e.baja)
    const title = [`Detalle diario — ${empresa || 'TIMES INC'} — ${mesNombreXLSX}`]
    const header = ['Empleado', ...Array.from({length:daysInMonth},(_,i)=>i+1), 'Total h', 'Total (dec.)']
    const dataRows = empRows.map(e => {
      const dayMap = {}
      recs.filter(r => r.empId===e.id && r.fin && r.inicio?.startsWith(filterMonth)).forEach(r => {
        const day = parseInt(r.inicio.slice(8,10))
        dayMap[day] = (dayMap[day]||0) + calcMin(r)
      })
      const total = Object.values(dayMap).reduce((s,v)=>s+v,0)
      return [
        e.name,
        ...Array.from({length:daysInMonth},(_,i) => dayMap[i+1] ? minToDecH(dayMap[i+1]) : ''),
        mhm(total),
        minToDecH(total)
      ]
    })
    const grandTotal = empRows.reduce((s,e) => {
      return s + recs.filter(r => r.empId===e.id && r.fin && r.inicio?.startsWith(filterMonth)).reduce((ss,r)=>ss+calcMin(r),0)
    }, 0)
    const totalsRow = ['TOTAL', ...Array(daysInMonth).fill(''), mhm(grandTotal), minToDecH(grandTotal)]
    const aoa = [title, [], header, ...dataRows, [], totalsRow]
    const cols = [22, ...Array(daysInMonth).fill(5), 10, 12]
    await downloadXLSX('Detalle diario', aoa, `detalle_${empresa?empresa.replace(/\s+/g,'_')+'_':''}${filterMonth}.xlsx`, cols)
    toast('Excel descargado', 3000, 'ok')
  }

  const exportResumenXLSX = async () => {
    const title = [`Resumen mensual — ${empresa || 'TIMES INC'} — ${mesNombreXLSX}`]
    const header = ['Empleado','Días','Total mes','Total (dec. h)','Contratadas (dec. h)','Diferencia (dec. h)','Balance','Vac. disp. (días)','H/semana']
    const xlsxRows = rows.map(({ e, totalMin, diff, days, vac, weeklyH, expected }) => [
      e.name,
      days,
      mhm(totalMin),
      minToDecH(totalMin),
      minToDecH(expected),
      minToDecH(diff),
      diff >= 0 ? `+${mhm(diff)}` : `-${mhm(Math.abs(diff))}`,
      vac.available,
      weeklyH
    ])
    const totalDays = rows.reduce((s,r)=>s+r.days,0)
    const totalMin2 = rows.reduce((s,r)=>s+r.totalMin,0)
    const totalDiff = rows.reduce((s,r)=>s+r.diff,0)
    const totalsRow = ['TOTAL', totalDays, mhm(totalMin2), minToDecH(totalMin2), '', minToDecH(totalDiff), totalDiff>=0?`+${mhm(totalDiff)}`:`-${mhm(Math.abs(totalDiff))}`, '', '']
    const aoa = [title, [], header, ...xlsxRows, [], totalsRow]
    const cols = [22,7,11,14,16,16,12,14,10]
    await downloadXLSX('Resumen mensual', aoa, `resumen_${empresa?empresa.replace(/\s+/g,'_')+'_':''}${filterMonth}.xlsx`, cols)
    toast('Excel descargado', 3000, 'ok')
  }

  const exportTodoXLSX = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const makeSheet = (aoa, cols) => {
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      if (cols) ws['!cols'] = cols.map(w => ({ wch: w }))
      return ws
    }
    // Hoja 1: Resumen
    const h1 = [`Resumen mensual — ${empresa || 'TIMES INC'} — ${mesNombreXLSX}`]
    const r1h = ['Empleado','Días','Total mes','Total (dec. h)','Contratadas (dec. h)','Diferencia (dec. h)','Balance','Vac. disp. (días)','H/semana']
    const r1rows = rows.map(({ e, totalMin, diff, days, vac, weeklyH, expected }) => [e.name, days, mhm(totalMin), minToDecH(totalMin), minToDecH(expected), minToDecH(diff), diff>=0?`+${mhm(diff)}`:`-${mhm(Math.abs(diff))}`, vac.available, weeklyH])
    const r1tot = ['TOTAL', rows.reduce((s,r)=>s+r.days,0), mhm(rows.reduce((s,r)=>s+r.totalMin,0)), minToDecH(rows.reduce((s,r)=>s+r.totalMin,0)), '', minToDecH(rows.reduce((s,r)=>s+r.diff,0)), '', '', '']
    XLSX.utils.book_append_sheet(wb, makeSheet([h1,[],r1h,...r1rows,[],r1tot],[22,7,11,14,16,16,12,14,10]), 'Resumen')
    // Hoja 2: Detalle
    const h2 = [`Detalle diario — ${empresa || 'TIMES INC'} — ${mesNombreXLSX}`]
    const r2h = ['Empleado',...Array.from({length:daysInMonth},(_,i)=>i+1),'Total h','Total (dec. h)']
    const empRowsD = sortedEmps(db).filter(e => !e.baja)
    const r2rows = empRowsD.map(e => {
      const dayMap = {}
      recs.filter(r => r.empId===e.id && r.fin && r.inicio?.startsWith(filterMonth)).forEach(r => { const d=parseInt(r.inicio.slice(8,10)); dayMap[d]=(dayMap[d]||0)+calcMin(r) })
      const tot = Object.values(dayMap).reduce((s,v)=>s+v,0)
      return [e.name,...Array.from({length:daysInMonth},(_,i)=>dayMap[i+1]?minToDecH(dayMap[i+1]):''),mhm(tot),minToDecH(tot)]
    })
    const gt = empRowsD.reduce((s,e)=>s+recs.filter(r=>r.empId===e.id&&r.fin&&r.inicio?.startsWith(filterMonth)).reduce((ss,r)=>ss+calcMin(r),0),0)
    XLSX.utils.book_append_sheet(wb, makeSheet([h2,[],r2h,...r2rows,[],['TOTAL',...Array(daysInMonth).fill(''),mhm(gt),minToDecH(gt)]],[22,...Array(daysInMonth).fill(5),10,12]), 'Detalle diario')
    // Hoja 3: Fichajes
    const allFichajesThisMonth = recs.filter(r=>r.fin&&r.inicio?.startsWith(filterMonth)).sort((a,b)=>a.inicio.localeCompare(b.inicio))
    const h3 = [`Fichajes — ${empresa || 'TIMES INC'} — ${mesNombreXLSX}`]
    const r3h = ['Empleado','Obra','Centro','Fecha','Entrada','Salida','H. trabajo','H. trabajo (dec.)','H. descanso','Notas']
    const r3rows = allFichajesThisMonth.map(r => {
      const wm=Math.floor(recWorkSecs(r)/60), bm=Math.floor((r.breakSecs||0)/60)
      const d=new Date(r.inicio), fin=new Date(r.fin)
      return [r.empName, r.empresa||'', r.centro||'', d.toLocaleDateString('es-ES'), d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}), fin.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}), `${Math.floor(wm/60)}:${p2(wm%60)}`, minToDecH(wm), `${Math.floor(bm/60)}:${p2(bm%60)}`, r.notes||'']
    })
    const totWm=allFichajesThisMonth.reduce((s,r)=>s+Math.floor(recWorkSecs(r)/60),0)
    XLSX.utils.book_append_sheet(wb, makeSheet([h3,[],r3h,...r3rows,[],['TOTAL','','','','','',mhm(totWm),minToDecH(totWm),'','']],[22,18,16,12,8,8,10,14,10,20]), 'Fichajes')
    // Hoja 4: Empleados
    const r4h = ['Nombre','Email','Rol','Obra','Centro trabajo','Alta','H/sem','Estado']
    const r4rows = sortedEmps(db).map(e => [e.name,e.email||'',e.role||'emp',e.empresa||'',e.centroTrabajo||'',e.startDate||'',e.horasSemanales||40,e.baja?'Baja':'Activo'])
    XLSX.utils.book_append_sheet(wb, makeSheet([r4h,...r4rows],[22,22,12,18,16,12,7,8]), 'Empleados')
    const fname = `informe_completo_${empresa?empresa.replace(/\s+/g,'_')+'_':''}${filterMonth}.xlsx`
    XLSX.writeFile(wb, fname)
    toast('Excel completo descargado', 3000, 'ok')
  }

  const printHtml = (html) => {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;opacity:0'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument || iframe.contentWindow.document
    doc.open(); doc.write(html); doc.close()
    setTimeout(() => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print() } catch(err) { console.warn('[printHtml]', err) }
      setTimeout(() => { try { document.body.removeChild(iframe) } catch {} }, 4000)
    }, 350)
  }

  // PDF de horas trabajadas ese mes (no es una nómina/documento de pago — solo el
  // detalle de horas fichadas). Reutiliza el mismo generador pdf-lib que los cierres,
  // como un cierre "de solo lectura" no persistido, para tener el mismo formato/calidad.
  const [generandoHorasPdf, setGenerandoHorasPdf] = useState(null)
  const downloadHorasMesPDF = async ({ e, totalMin, days }) => {
    setGenerandoHorasPdf(e.id)
    try {
      const eRecs = (db.records || []).filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(filterMonth))
        .sort((a, b) => a.inicio.localeCompare(b.inicio))
      const cierreEfimero = {
        empId: e.id, empName: e.name, mes: filterMonth,
        generadoPor: session?.user?.name || 'Admin',
        generadoAt: new Date().toISOString(),
        totalMin, dias: days, estado: 'informativo', firma: null,
        records_snapshot: eRecs.map(r => ({ inicio:r.inicio, fin:r.fin, centro:r.centro, workSecs:r.workSecs||0 })),
      }
      const { dataUrl } = await buildCierreIndividualPDF({ cierre: cierreEfimero, empresa: empresaNombreCfg })
      downloadDataUrl(dataUrl, `horas-${filterMonth}-${(e.name||'').replace(/\s+/g,'_')}.pdf`)
    } catch (err) {
      toast('Error al generar el PDF: ' + (err?.message || err), 5000, 'err')
    } finally {
      setGenerandoHorasPdf(null)
    }
  }

  const generarTodosCierres = () => {
    const mes = filterMonth
    const empsActivos = sortedEmps(db).filter(e => !e.baja && !e.isAdmin)
    const nuevos = []
    empsActivos.forEach(e => {
      if ((db.cierres||[]).find(c => c.empId === e.id && c.mes === mes)) return
      const eRecs = (db.records||[]).filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(mes))
      if (!eRecs.length) return
      const totalMin = eRecs.reduce((s, r) => s + calcMin(r), 0)
      nuevos.push({
        id: gid(), empId: e.id, empName: e.name, mes,
        generadoPor: session?.user?.name || 'Admin',
        generadoPorId: session?.user?.id || null,
        generadoAt: new Date().toISOString(),
        totalMin, dias: eRecs.length, estado: 'pendiente', firma: null,
        records_snapshot: eRecs.map(r => ({ inicio:r.inicio, fin:r.fin, centro:r.centro, workSecs:r.workSecs||0 }))
      })
    })
    if (!nuevos.length) { toast('Todos los empleados ya tienen cierre o sin registros'); return }
    saveDB({ cierres: [...(db.cierres||[]), ...nuevos] })
    nuevos.forEach(c => {
      const mesLabel = new Date(c.mes+'-01').toLocaleDateString('es-ES',{month:'long',year:'numeric'})
      queuePush(c.empId, '📋 Cierre mensual pendiente', `Tu resumen de ${mesLabel} está listo para firmar.`, 'cierre', '/?go=emp:perfil')
    })
    toast(`✅ ${nuevos.length} cierre${nuevos.length!==1?'s':''} generado${nuevos.length!==1?'s':''}`)
  }

  const generarCierre = (e, totalMin, days) => {
    if (procesandoCierreRef.current.has(e.id)) return
    procesandoCierreRef.current.add(e.id)
    setProcesandoCierre(s => new Set([...s, e.id]))
    const mes = filterMonth
    if ((db.cierres || []).find(c => c.empId === e.id && c.mes === mes)) {
      procesandoCierreRef.current.delete(e.id)
      setProcesandoCierre(s => { const n = new Set(s); n.delete(e.id); return n })
      toast('Ya existe un cierre para este empleado y mes', 3000, 'warn')
      return
    }
    const eRecs = (db.records || []).filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(mes))
    const cierre = {
      id: gid(), empId: e.id, empName: e.name, mes,
      generadoPor: session?.user?.name || 'Admin',
      generadoPorId: session?.user?.id || null,
      generadoAt: new Date().toISOString(),
      totalMin, dias: days, estado: 'pendiente', firma: null,
      records_snapshot: eRecs.map(r => ({ inicio:r.inicio, fin:r.fin, centro:r.centro, workSecs:r.workSecs||0 }))
    }
    saveDB({ cierres: [...(db.cierres||[]), cierre] })
    queuePush(e.id, '📋 Cierre mensual pendiente', `Tu resumen de ${mes} está listo para firmar.`, 'cierre', '/?go=emp:perfil')
    toast(`✅ Cierre enviado a ${e.name}`)
    procesandoCierreRef.current.delete(e.id)
    setProcesandoCierre(s => { const n = new Set(s); n.delete(e.id); return n })
  }

  // Refresca un cierre desactualizado (fichajes editados/borrados tras generarlo) con
  // los datos reales actuales y limpia el aviso — el empleado ya puede firmarlo sin miedo.
  const regenerarCierre = (cierre, e, totalMin, days) => {
    const eRecs = (db.records || []).filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(cierre.mes))
    const updated = (db.cierres || []).map(c => c.id === cierre.id ? {
      ...c, totalMin, dias: days, desactualizado: false, pdfData: null,
      records_snapshot: eRecs.map(r => ({ inicio:r.inicio, fin:r.fin, centro:r.centro, workSecs:r.workSecs||0 })),
      regeneradoAt: new Date().toISOString(), regeneradoPor: session?.user?.name || 'Admin',
    } : c)
    const withAudit = auditLog(db, 'Cierre regenerado', `${e.name} · ${cierre.mes}`, session?.user?.name || 'Admin')
    saveDB({ cierres: updated, audit: withAudit.audit })
    queuePush(e.id, '📋 Cierre mensual actualizado', `Tu resumen de ${cierre.mes} se actualizó y ya puedes firmarlo.`, 'cierre', '/?go=emp:perfil')
    toast('Cierre regenerado', 3000, 'ok')
  }

  const downloadCierrePDF = async (cierre) => {
    const filename = `cierre-${cierre.mes}-${(cierre.empName||'').replace(/\s+/g,'_')}.pdf`
    if (cierre.pdfData) { downloadDataUrl(cierre.pdfData, filename); return }
    setGenerandoPdf(cierre.id)
    try {
      const { dataUrl } = await buildCierreIndividualPDF({ cierre, empresa: empresaNombreCfg })
      downloadDataUrl(dataUrl, filename)
    } catch (e) {
      toast('Error al generar el PDF: ' + (e?.message || e), 5000, 'err')
    } finally {
      setGenerandoPdf(null)
    }
  }

  const finalizarMesCierres = async () => {
    const cierresMes = (db.cierres || []).filter(c => c.mes === filterMonth)
    if (!cierresMes.length) { toast('No hay cierres generados para este mes'); return }
    setGenerandoPdf('consolidado')
    try {
      const { dataUrl } = await buildCierreConsolidadoPDF({ cierres: cierresMes, mes: filterMonth, empresa: empresaNombreCfg })
      downloadDataUrl(dataUrl, `cierre-consolidado-${filterMonth}.pdf`)
      toast('PDF consolidado generado', 3000, 'ok')
    } catch (e) {
      toast('Error al generar el PDF consolidado: ' + (e?.message || e), 5000, 'err')
    } finally {
      setGenerandoPdf(null)
    }
  }

  const TABS = [
    { id:'resumen',  label:'Resumen' },
    { id:'cierre',   label:'📋 Cierre mensual' },
    { id:'detalle',  label:'Detalle diario' },
    { id:'ranking',  label:'Ranking' },
    { id:'extras',   label:'⚡ Horas extra' },
    { id:'analitica',label:'Analítica' },
    { id:'obras',    label:'Por Obra' },
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
          <div style={{ fontSize:12, color:'var(--text3)', marginBottom:12, padding:'12px 14px', background:'var(--primary-dim)', borderRadius:'var(--r)', border:'1px solid var(--primary-glow)', lineHeight:1.6 }}>
            📋 <strong>Cierre mensual</strong> — Genera el resumen y envíalo al empleado para firma digital. Cumple con la Ley de Control Horario (RDL 8/2019). El empleado recibirá una notificación para firmar.
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            <button className="btn btn-primary" style={{ flex:1 }} onClick={generarTodosCierres}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:6 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Generar cierres para todos ({rows.filter(r => !(db.cierres||[]).find(c => c.empId===r.e.id && c.mes===filterMonth) && r.days>0).length} pendientes)
            </button>
            <button className="btn btn-secondary" onClick={finalizarMesCierres} disabled={generandoPdf === 'consolidado' || !(db.cierres||[]).some(c => c.mes===filterMonth)}>
              {generandoPdf === 'consolidado' ? 'Generando…' : '📄 Finalizar mes'}
            </button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {rows.map(({ e, totalMin, days, diff, weeklyH }) => {
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
                        <span className={`badge ${cierre.estado==='firmado'?'badge-green':cierre.desactualizado?'badge-red':'badge-orange'}`}>
                          {cierre.estado === 'firmado' ? '✓ Firmado' : cierre.desactualizado ? '⚠️ Desactualizado' : '⏳ Pendiente firma'}
                        </span>
                        {cierre.desactualizado ? (
                          <button className="btn btn-danger btn-sm" onClick={() => regenerarCierre(cierre, e, totalMin, days)}>Regenerar</button>
                        ) : (
                          <button className="btn btn-secondary btn-sm" onClick={() => downloadCierrePDF(cierre)} disabled={generandoPdf === cierre.id}>{generandoPdf === cierre.id ? '…' : 'PDF'}</button>
                        )}
                      </>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => generarCierre(e, totalMin, days)} disabled={!days || procesandoCierre.has(e.id)}>
                        {procesandoCierre.has(e.id) ? '…' : 'Enviar cierre'}
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
                {(db.cierres||[]).filter(c => c.estado==='firmado').sort((a,b) => (b.mes||'').localeCompare(a.mes||'')).slice(0,20).map(c => {
                  const emp = (db.employees||[]).find(e => e.id === c.empId)
                  return (
                    <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)' }}>
                      <div style={{ fontSize:18 }}>✅</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600 }}>{c.empName} · {c.mes}</div>
                        <div style={{ fontSize:11, color:'var(--text3)' }}>Firmado {new Date(c.firma?.firmadoAt).toLocaleDateString('es-ES')} · {mhm(c.totalMin)}</div>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => downloadCierrePDF(c)} disabled={generandoPdf === c.id}>{generandoPdf === c.id ? '…' : 'PDF'}</button>
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
        {!rows.length ? (
          <div className="empty-premium">
            <div className="empty-premium-icon">📊</div>
            <div className="empty-premium-title">Sin datos este mes</div>
          </div>
        ) : (
        <div className="emp-grid stagger-in">
          {rows.map(({ e, totalMin, diff, days, vac, expected, weeklyH }) => (
            <div key={e.id} className="emp-card card-lift">
              <div className="emp-card-top">
                <div className="emp-card-avatar" style={{ background: e.color || 'var(--primary)' }}>
                  {(e.initials || e.name.slice(0, 2)).toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="emp-card-name">{e.name}</div>
                  <div className="emp-card-sub">{days} días trabajados</div>
                </div>
                <span className="badge" style={{ color: diff >= 0 ? 'var(--green)' : 'var(--red)', background: diff >= 0 ? 'var(--green-dim)' : 'var(--red-dim)' }}>
                  {diff >= 0 ? '+' : ''}{mhm(Math.abs(diff))}
                </span>
              </div>
              <div className="emp-card-body">
                <div className="emp-card-row">
                  <span className="emp-card-row-lbl">Total mes</span>
                  <span className="emp-card-row-val">{mhm(totalMin)}</span>
                </div>
                <div className="emp-card-row">
                  <span className="emp-card-row-lbl">Contratadas</span>
                  <span className="emp-card-row-val">{mhm(expected)} <span style={{ fontSize:10, opacity:.7 }}>({weeklyH}h/sem)</span></span>
                </div>
                <div className="emp-card-row">
                  <span className="emp-card-row-lbl">Vacaciones disp.</span>
                  <span className="emp-card-row-val">{vac.available}d</span>
                </div>
              </div>
              <div className="emp-card-actions">
                <button className="btn btn-sm btn-secondary" disabled={generandoHorasPdf === e.id} onClick={() => downloadHorasMesPDF({ e, totalMin, days })}>{generandoHorasPdf === e.id ? '…' : '📄 PDF horas del mes'}</button>
              </div>
            </div>
          ))}
        </div>
        )}
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
                  recs.filter(r=>r.empId===e.id&&r.fin&&r.inicio?.startsWith(filterMonth)).forEach(r=>{
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

      {/* Horas Extra tab */}
      {tab === 'extras' && (() => {
        const allRecs = db.records || []
        const extRows = sortedEmps(db).filter(e => !e.baja && !e.isAdmin).map(e => {
          const eRecs = allRecs.filter(r => r.empId === e.id && r.fin)
          const totalMin = eRecs.reduce((s, r) => s + calcMin(r), 0)
          const weeklyH = e.horasSemanales || (WK / 60)
          const monthlyH = e.horasMensuales || 160
          // Histórico (balance vida laboral)
          const start = e.startDate ? new Date(e.startDate) : new Date()
          const msWorked = Date.now() - start.getTime()
          const weeks = Math.max(0, msWorked / (7 * 24 * 3600 * 1000))
          const expectedMin = Math.round(weeks * weeklyH * 60)
          const diff = totalMin - expectedMin
          // Regla TIMES INC: extras semanales (>40h/sem) compensadas contra
          // el déficit del objetivo mensual (160h). Si las extras no alcanzan
          // a cubrir el déficit, lo restante aparece como déficit real.
          const ex = monthlyExtras(allRecs, e.id, filterMonth, { weeklyH, monthlyH })
          return {
            e, totalMin, expectedMin, diff, weeklyH, monthlyH,
            mMin: ex.workedMin,
            mExpected: monthlyH * 60,
            mExtra: ex.netExtraMin,
            mDeficit: ex.deficitMin,
            mWeeklyExtra: ex.weeklyExtraMin,
            mShortfall: ex.shortfallMin,
          }
        })
        const totalExtra = extRows.reduce((s, r) => s + r.mExtra, 0)
        const totalDeficit = extRows.reduce((s, r) => s + r.mDeficit, 0)
        return (
          <div className="stagger-in">
            <div className="adm-stats-grid" style={{ marginBottom:20 }}>
              <div className="stat-card">
                <div className="stat-icon" style={{ background:'var(--orange-dim)' }}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
                <div className="stat-value" style={{ color:'var(--orange)' }}>+{mhm(totalExtra)}</div>
                <div className="stat-label">H. extra este mes</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background:'var(--red-dim)' }}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
                <div className="stat-value" style={{ color:'var(--red)' }}>-{mhm(totalDeficit)}</div>
                <div className="stat-label">Déficit este mes</div>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {extRows.map(({ e, mMin, mExpected, mExtra, mDeficit, mWeeklyExtra, mShortfall }) => {
                const compensated = mWeeklyExtra > 0 && mShortfall > 0
                return (
                  <div key={e.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--bg-700)', borderRadius:'var(--r)', border:`1px solid ${mExtra > 0 ? 'rgba(245,158,11,.25)' : mDeficit > 0 ? 'rgba(239,68,68,.2)' : 'var(--border)'}` }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0 }}>
                      {(e.initials||e.name.slice(0,2)).toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name}</div>
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                        {mhm(mMin)} trabajadas · objetivo {mhm(Math.round(mExpected))}
                        {compensated && <span style={{ marginLeft:6, color:'var(--text4)' }}>({mhm(Math.round(mWeeklyExtra))} sem. − {mhm(Math.round(mShortfall))} déf.)</span>}
                      </div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      {mExtra > 0 && <div style={{ fontSize:14, fontWeight:800, color:'var(--orange)', fontVariantNumeric:'tabular-nums' }}>+{mhm(Math.round(mExtra))}</div>}
                      {mDeficit > 0 && <div style={{ fontSize:14, fontWeight:800, color:'var(--red)', fontVariantNumeric:'tabular-nums' }}>−{mhm(Math.round(mDeficit))}</div>}
                      {mExtra === 0 && mDeficit === 0 && <div style={{ fontSize:14, fontWeight:800, color:'var(--green)' }}>✓</div>}
                      <div style={{ fontSize:10, color:'var(--text4)' }}>{mExtra > 0 ? 'extras' : mDeficit > 0 ? 'déficit' : 'al día'}</div>
                    </div>
                  </div>
                )
              })}
              {!extRows.length && <div className="empty">Sin empleados activos</div>}
            </div>
          </div>
        )
      })()}

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
          {/* Tendencia 6 meses */}
          {(() => {
            const months = []
            const now2 = new Date()
            for (let i = 5; i >= 0; i--) {
              const d = new Date(now2.getFullYear(), now2.getMonth() - i, 1)
              const mk = `${d.getFullYear()}-${p2(d.getMonth()+1)}`
              const label = d.toLocaleDateString('es-ES', { month:'short', year:'2-digit' })
              const entry = { mes: label }
              sortedEmps(db).filter(e => !e.baja).forEach(e => {
                entry[e.name.split(' ')[0]] = Math.round(recs.filter(r => r.empId===e.id && r.fin && r.inicio?.startsWith(mk)).reduce((s,r)=>s+calcMin(r),0) / 60 * 10) / 10
              })
              months.push(entry)
            }
            const empColors = ['#7c5cff','#10b981','#f59e0b','#ef4444','#00d4ff','#a78bfa']
            const empNames = sortedEmps(db).filter(e=>!e.baja).map(e=>e.name.split(' ')[0])
            return (
              <div className="adm-section" style={{ marginTop:20 }}>
                <div className="adm-section-title">Tendencia 6 meses (horas/empleado)</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={months} margin={{ top:4, right:8, left:-10, bottom:0 }} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize:11, fill:'var(--text3)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize:10, fill:'var(--text3)' }} axisLine={false} tickLine={false} unit="h" />
                    <Tooltip contentStyle={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:8, fontSize:12 }} labelStyle={{ color:'var(--text)', fontWeight:700 }} formatter={(v)=>[`${v}h`,'']} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize:11 }} />
                    {empNames.map((name, i) => (
                      <Bar key={name} dataKey={name} fill={empColors[i % empColors.length]} radius={[3,3,0,0]} maxBarSize={28} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          })()}
        </div>
      )}

      {/* Por Obra tab */}
      {tab === 'obras' && (() => {
        const obras = db.obras || []
        const allEmps = sortedEmps(db).filter(e => !e.baja)
        const obraRows = obras.map(obra => {
          const assigned = allEmps.filter(e => (e.obrasAsignadas || []).includes(obra.nombre))
          const empData = assigned.map(e => {
            const eRecs = recs.filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(filterMonth))
            const mins = eRecs.reduce((s, r) => s + calcMin(r), 0)
            return { e, mins, days: eRecs.length }
          }).filter(d => d.mins > 0 || assigned.length > 0)
          const totalMins = empData.reduce((s, d) => s + d.mins, 0)
          return { obra, empData, totalMins, assignedCount: assigned.length }
        })
        // Employees with no obra assigned
        const unassinged = allEmps.filter(e => !(e.obrasAsignadas || []).length)
        const unassignedData = unassinged.map(e => {
          const eRecs = recs.filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(filterMonth))
          const mins = eRecs.reduce((s, r) => s + calcMin(r), 0)
          return { e, mins, days: eRecs.length }
        }).filter(d => d.mins > 0)
        const maxObraMin = Math.max(...obraRows.map(r => r.totalMins), 1)
        return (
          <div className="stagger-in" style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {!obras.length && (
              <div className="empty-premium">
                <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
                <div className="empty-premium-title">Sin obras configuradas</div>
                <div className="empty-premium-sub">Ve a Obras para crear proyectos y asignarlos a tus empleados.</div>
              </div>
            )}
            {obraRows.map(({ obra, empData, totalMins, assignedCount }) => {
              const pct = Math.round(totalMins / maxObraMin * 100)
              return (
                <div key={obra} className="card-lift" style={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', padding:'16px 18px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                    <div style={{ width:38, height:38, borderRadius:10, background:'var(--primary-dim)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--primary-light)" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:15, fontWeight:700, marginBottom:1 }}>{obra}</div>
                      <div style={{ fontSize:11, color:'var(--text3)' }}>{assignedCount} empleado{assignedCount!==1?'s':''} asignado{assignedCount!==1?'s':''}</div>
                    </div>
                    <div style={{ fontSize:22, fontWeight:800, color:'var(--primary-light)', fontVariantNumeric:'tabular-nums', flexShrink:0 }}>{mhm(totalMins)}</div>
                  </div>
                  <div className="progress-track" style={{ marginBottom:12 }}>
                    <div className="progress-fill" style={{ width: pct + '%', background:'linear-gradient(90deg,var(--primary),var(--accent))' }} />
                  </div>
                  {empData.length > 0 && (
                    <div style={{ display:'flex', flexDirection:'column', gap:6, borderTop:'1px solid var(--border)', paddingTop:10 }}>
                      {empData.map(({ e, mins, days }) => (
                        <div key={e.id} style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:22, height:22, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, color:'#fff', flexShrink:0 }}>
                            {(e.initials||e.name.slice(0,2)).toUpperCase()}
                          </div>
                          <div style={{ flex:1, fontSize:12, color:'var(--text2)' }}>{e.name}</div>
                          <div style={{ fontSize:11, color:'var(--text3)' }}>{days}d</div>
                          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', fontVariantNumeric:'tabular-nums', minWidth:52, textAlign:'right' }}>{mhm(mins)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {empData.length === 0 && <div style={{ fontSize:12, color:'var(--text4)' }}>Sin horas registradas este mes</div>}
                </div>
              )
            })}
            {unassignedData.length > 0 && (
              <div className="card-lift" style={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', padding:'16px 18px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:'rgba(96,116,138,.12)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:700, marginBottom:1 }}>Sin obra asignada</div>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>Empleados sin proyecto</div>
                  </div>
                  <div style={{ fontSize:22, fontWeight:800, color:'var(--text3)', fontVariantNumeric:'tabular-nums' }}>{mhm(unassignedData.reduce((s,d)=>s+d.mins,0))}</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6, borderTop:'1px solid var(--border)', paddingTop:10 }}>
                  {unassignedData.map(({ e, mins, days }) => (
                    <div key={e.id} style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:22, height:22, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, color:'#fff', flexShrink:0 }}>
                        {(e.initials||e.name.slice(0,2)).toUpperCase()}
                      </div>
                      <div style={{ flex:1, fontSize:12, color:'var(--text2)' }}>{e.name}</div>
                      <div style={{ fontSize:11, color:'var(--text3)' }}>{days}d</div>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', fontVariantNumeric:'tabular-nums', minWidth:52, textAlign:'right' }}>{mhm(mins)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Exportar tab */}
      {tab === 'exportar' && (
        <div style={{ maxWidth:520, display:'flex', flexDirection:'column', gap:16 }}>

          {/* Exportar todo - estrella del show */}
          <div className="dash-widget" style={{ display:'flex', flexDirection:'column', gap:10, border:'2px solid var(--primary)', background:'var(--primary-dim)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--primary)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <div style={{ fontSize:14, fontWeight:700 }}>Informe completo — 4 hojas Excel</div>
            </div>
            <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6 }}>
              Un único archivo con <strong>Resumen mensual</strong>, <strong>Detalle diario</strong>, <strong>Fichajes</strong> y <strong>Empleados</strong>. Incluye columnas de horas decimales para fórmulas, totales automáticos y anchos de columna optimizados.
            </div>
            <button className="btn btn-primary" style={{ width:'100%' }} onClick={exportTodoXLSX}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:6 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar informe completo ({mesNombreXLSX})
            </button>
          </div>

          {/* Fichajes filtrados */}
          <div className="dash-widget" style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:2 }}>Exportar fichajes filtrados</div>
            <div style={{ fontSize:12, color:'var(--text3)' }}>Filtra por empleado y rango de fechas. Incluye horas decimales, descansos y totales.</div>
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
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--text2)', cursor:'pointer', userSelect:'none' }}>
              <input type="checkbox" checked={agruparCentro} onChange={e => setAgruparCentro(e.target.checked)}
                style={{ width:16, height:16, cursor:'pointer' }} />
              Agrupar por centro de trabajo
            </label>
            <button className="btn btn-secondary" style={{ width:'100%' }} onClick={exportFichajesXLSX}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:6 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Descargar Excel fichajes
            </button>
          </div>

          {/* Informe oficial inspección de trabajo */}
          <div className="dash-widget" style={{ display:'flex', flexDirection:'column', gap:10, border:'1px solid rgba(245,158,11,.35)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:16 }}>⚖️</span>
              <div style={{ fontSize:14, fontWeight:700 }}>Registro oficial — Inspección de Trabajo</div>
            </div>
            <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6 }}>
              Registro diario de jornada conforme al <strong>art. 34.9 ET (RD-ley 8/2019)</strong>: una hoja por empleado con el mes completo día a día, CIF de la empresa, DNI del trabajador, pausas, horas extra y espacio de firmas. Conservación obligatoria: 4 años.
              {!db.config?.companyCif && <div style={{ marginTop:6, color:'var(--orange)' }}>⚠ Falta el CIF de la empresa — configúralo en Ajustes para que el informe sea completo.</div>}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-secondary" style={{ flex:1 }} onClick={async () => {
                const r = await exportInspeccionXLSX(db, filterMonth)
                if (r.ok) toast(`Registro oficial descargado (${r.count} empleados)`, 3000, 'ok')
                else toast('No hay empleados activos', 3000, 'warn')
              }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:6 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Excel oficial
              </button>
              <button className="btn btn-secondary" style={{ flex:1 }} onClick={() => printHtml(buildInspeccionHTML(db, filterMonth))}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:6 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                PDF con firmas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ─── PANEL MI OBRA (encargado) ─────────────────────────────────────────────────
function PanelMiObra({ db, toast, saveDB, session }) {
  const { showConfirm } = useAppStore()
  const enc = session.user
  const misCentros = enc?.obrasAsignadas || []
  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin && (misCentros.includes(e.centroTrabajo) || (e.obrasAsignadas || []).some(o => misCentros.includes(o))))
  const empIds = new Set(emps.map(e => e.id))
  const recs = db.records || []
  const liveRecs = recs.filter(r => !r.fin && empIds.has(r.empId))
  const pendRecs = recs.filter(r => r.fin && empIds.has(r.empId) && !r.aceptada)
    .sort((a,b) => (b.inicio||'').localeCompare(a.inicio||'')).slice(0, 50)
  const correcsPend = (db.correccionesFichaje || []).filter(c => c.estado === 'pendiente' && empIds.has(c.empId)).sort((a,b) => b.ts - a.ts)
  const correcsHist = (db.correccionesFichaje || []).filter(c => c.estado !== 'pendiente' && empIds.has(c.empId)).sort((a,b) => b.ts - a.ts).slice(0, 15)
  const teamAus = [
    ...(db.medicos  || []).map(a => ({ ...a, tipoAus:'medico'   })),
    ...(db.ausencias|| []).map(a => ({ ...a, tipoAus:'ausencia' })),
  ].filter(a => empIds.has(a.empId)).sort((a,b) => (b.fechaInicio||'').localeCompare(a.fechaInicio||'')).slice(0, 30)

  const [tab, setTab]       = useState('live')
  const [editing, setEditing] = useState(null)
  const editingPushed = useRef(false)
  useEffect(() => {
    if (!editing) {
      if (editingPushed.current) { editingPushed.current = false; window.history.back() }
      return
    }
    window.history.pushState({ timesModal: true }, '')
    editingPushed.current = true
    const onPop = () => { if (!editingPushed.current) return; editingPushed.current = false; setEditing(null) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [editing])
  const [ausForm, setAusForm] = useState({ empId:'', tipo:'medico', fechaInicio:today(), fechaFin:today(), motivo:'' })

  const aceptar = (rec) => {
    const updated = recs.map(r => r.id === rec.id ? { ...r, aceptada: true, aceptadaPor: enc.name, aceptadaAt: new Date().toISOString() } : r)
    const withAudit = auditLog(db, 'Jornada aceptada', `${rec.empName} · ${fds(rec.inicio)}`, enc.name)
    saveDB({ records: updated, audit: withAudit.audit })
    queuePush(rec.empId, '✅ Jornada validada', `Tu jornada del ${fds(rec.inicio)} ha sido validada por ${enc.name}.`, 'jornada', '/?tab=jornada')
    toast('Jornada aceptada', 3000, 'ok')
  }

  const startEdit = (rec) => setEditing({ id: rec.id, inicio: rec.inicio?.slice(0,16) || '', fin: rec.fin ? rec.fin.slice(0,16) : '', motivo:'' })

  const saveEdit = () => {
    if (!editing.motivo?.trim()) { toast('Indica el motivo del cambio', 3500, 'err'); return }
    const rec = recs.find(r => r.id === editing.id)
    if (!rec) return
    const motivo = editing.motivo.trim()
    const newInicio = new Date(editing.inicio).toISOString()
    const newFin = editing.fin ? new Date(editing.fin).toISOString() : rec.fin
    if (newFin && newInicio >= newFin) { toast('La entrada debe ser anterior a la salida', 3500, 'err'); return }
    const updated = recs.map(r => {
      if (r.id !== editing.id) return r
      const breaks = newFin ? clipBreaksToWindow(r.breaks, newInicio, newFin) : (r.breaks || [])
      const closed = { ...r, inicio: newInicio, fin: newFin, breaks }
      const t = calcSecs(closed); closed.workSecs = t.work; closed.breakSecs = t.brk
      const corr = { campo:'inicio+fin', antes: `${ftime(r.inicio)}–${ftime(r.fin)}`, despues: `${ftime(newInicio)}–${ftime(newFin)}`, motivo, por: enc.name, ts: new Date().toISOString() }
      return { ...closed, correcciones: [...(r.correcciones||[]), corr] }
    })
    const withAudit = auditLog(db, 'Jornada modificada', `${rec.empName} · ${fds(editing.inicio)} · Motivo: ${motivo}`, enc.name)
    const { cierres, flagged, staleCierres } = flagStaleCierreForEdit(db.cierres, rec.empId, rec.inicio, newInicio)
    saveDB({ records: updated, audit: withAudit.audit, cierres })
    queuePush(rec.empId, '✏️ Jornada modificada', `${enc.name} corrigió tu jornada del ${fds(editing.inicio)}: ${motivo}`, 'jornada', '/?tab=jornada')
    staleCierres.forEach(sc => notifyStaleCierre(sc, enc.id))
    const warn = flagged ? ' ⚠️ El cierre de ese mes quedó desactualizado — pide que lo regeneren en Informes.' : ''
    toast('Jornada modificada' + warn, warn ? 6000 : 3000, warn ? 'warn' : 'ok')
    setEditing(null)
  }

  const startJornada = (e) => {
    const alreadyOpen = liveRecs.find(r => r.empId === e.id)
    if (alreadyOpen) { toast('Este empleado ya tiene una jornada abierta', 3000, 'warn'); return }
    const newRec = { id: gid(), empId: e.id, empName: e.name, inicio: new Date().toISOString(), fin: null, centro: e.centroTrabajo || misCentros[0] || '', breaks: [], workSecs: 0, creadoPor: enc.name }
    const withAudit = auditLog(db, 'Jornada iniciada por encargado', e.name, enc.name)
    saveDB({ records: [...recs, newRec], audit: withAudit.audit })
    queuePush(e.id, '▶ Jornada iniciada', `${enc.name} ha iniciado tu jornada laboral.`, 'jornada', '/?tab=inicio')
    toast('Jornada iniciada', 3000, 'ok')
  }

  const toggleDescanso = (rec) => {
    const now = new Date().toISOString()
    let updated
    if (rec.enDescanso) {
      const breaks = [...(rec.breaks || []), { start: rec.bStartTs, end: now }]
      updated = { ...rec, enDescanso: false, bStartTs: null, breaks, breakSecs: calcSecs({ ...rec, enDescanso: false, breaks }).brk }
      queuePush(rec.empId, '▶ Descanso finalizado', `${enc.name} ha reanudado tu jornada.`, 'jornada', '/?tab=inicio')
      toast('Descanso finalizado', 3000, 'ok')
    } else {
      updated = { ...rec, enDescanso: true, bStartTs: now }
      queuePush(rec.empId, '⏸ Descanso iniciado', `${enc.name} ha pausado tu jornada.`, 'jornada', '/?tab=inicio')
      toast('Descanso iniciado', 3000, 'ok')
    }
    saveDB({ records: recs.map(r => r.id === rec.id ? updated : r) })
  }

  const forceClose = (rec) => {
    showConfirm(`¿Finalizar jornada de ${rec.empName}?`, () => {
      const now = new Date().toISOString()
      const breaks = [...(rec.breaks || [])]
      if (rec.enDescanso && rec.bStartTs) breaks.push({ start: rec.bStartTs, end: now })
      const closed = { ...rec, fin: now, breaks, enDescanso: false, bStartTs: null, closed: true }
      const t = calcSecs(closed); closed.workSecs = t.work; closed.breakSecs = t.brk
      const withAudit = auditLog(db, 'Jornada finalizada por encargado', rec.empName, enc.name)
      saveDB({ records: recs.map(r => r.id === rec.id ? closed : r), audit: withAudit.audit })
      queuePush(rec.empId, '⏹ Jornada finalizada', `${enc.name} ha finalizado tu jornada (${mhm(Math.floor(t.work/60))}).`, 'jornada', '/?tab=jornada')
      toast('Jornada finalizada', 3000, 'ok')
    })
  }

  const addAus = () => {
    if (!ausForm.empId || !ausForm.fechaInicio) { toast('Selecciona empleado y fecha'); return }
    if (ausForm.fechaFin && ausForm.fechaFin < ausForm.fechaInicio) { toast('La fecha fin no puede ser anterior al inicio', 3500, 'err'); return }
    const emp = emps.find(e => e.id === ausForm.empId)
    const key  = ausForm.tipo === 'medico' ? 'medicos' : 'ausencias'
    const item = { id: gid(), empId: ausForm.empId, empName: emp?.name || '', fechaInicio: ausForm.fechaInicio, fechaFin: ausForm.fechaFin || ausForm.fechaInicio, motivo: ausForm.motivo, ts: new Date().toISOString(), registradoPor: enc.name }
    saveDB({ [key]: [...(db[key] || []), item] })
    const tipoLbl = ausForm.tipo === 'medico' ? 'Ausencia médica' : 'Ausencia'
    queuePush(ausForm.empId, `🗓️ ${tipoLbl} registrada`, `${enc.name} registró una ${tipoLbl.toLowerCase()} el ${ausForm.fechaInicio}.`, 'ausencia', '/?tab=calendario')
    setAusForm(f => ({ ...f, empId:'', motivo:'' }))
    toast('Ausencia registrada', 3000, 'ok')
  }

  const delAus = (id, tipo) => {
    const key = tipo === 'medico' ? 'medicos' : 'ausencias'
    showConfirm('¿Eliminar esta ausencia?', () => {
      saveDB({ [key]: (db[key] || []).filter(a => a.id !== id) })
      toast('Ausencia eliminada')
    })
  }

  const actCorr = (id, estado) => {
    const corr = (db.correccionesFichaje || []).find(c => c.id === id)
    if (!corr) return
    let newRecords = db.records || []
    if (estado === 'aprobada') {
      newRecords = newRecords.map(r => {
        if (r.id !== corr.recId) return r
        const updated = { ...r, inicio: corr.propInicio, fin: corr.propFin }
        const t = calcSecs(updated)
        return { ...updated, workSecs: t.work, breakSecs: t.brk }
      })
    }
    const updated = (db.correccionesFichaje || []).map(c => c.id === id ? { ...c, estado, resolvedAt: new Date().toISOString(), resolvedBy: enc.name } : c)
    const noti = { id: gid(), empId: corr.empId, action: estado === 'aprobada' ? 'Corrección aprobada' : 'Corrección rechazada', detail: corr.motivo || '', ts: new Date().toISOString(), leido: false }
    const withAuditEnc = auditLog(db, estado === 'aprobada' ? 'correccion_aprobada' : 'correccion_rechazada', `${corr.empName}: ${corr.motivo || ''}`, enc.name)
    saveDB({ correccionesFichaje: updated, records: newRecords, notis: [...(db.notis || []), noti], audit: withAuditEnc.audit })
    queuePush(corr.empId, noti.action, `Tu solicitud de corrección ha sido ${estado === 'aprobada' ? 'aprobada' : 'rechazada'}.`, 'correccion', '/?tab=jornada')
    toast(estado === 'aprobada' ? 'Corrección aplicada' : 'Corrección rechazada', 3000, estado === 'aprobada' ? 'ok' : 'warn')
  }

  if (!misCentros.length) {
    return (
      <div className="adm-panel">
        <div className="adm-panel-header"><h1 className="adm-panel-title">Mi obra</h1></div>
        <div className="empty">No tienes ninguna obra/centro de trabajo asignado. Pide al administrador que te asigne uno en Empleados.</div>
      </div>
    )
  }

  const Badge = ({ n }) => n > 0 ? <span style={{ minWidth:16, height:16, borderRadius:8, background:'var(--danger)', color:'#fff', fontSize:9, fontWeight:800, display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'0 4px', marginLeft:5 }}>{n}</span> : null

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Mi obra</h1>
          <div className="adm-panel-sub">{misCentros.join(', ')} · {emps.length} empleado{emps.length !== 1 ? 's' : ''}</div>
        </div>
        {(pendRecs.length + correcsPend.length) > 0 && (
          <span style={{ fontSize:12, fontWeight:700, padding:'4px 10px', borderRadius:20, background:'var(--orange-dim)', color:'var(--orange)', border:'1px solid rgba(245,158,11,.25)' }}>
            {pendRecs.length + correcsPend.length} pendientes
          </span>
        )}
      </div>

      <div className="pill-tabs" style={{ marginBottom:20 }}>
        {[
          ['live',        '🔴 En vivo',     liveRecs.length],
          ['jornadas',    '📋 Jornadas',    pendRecs.length],
          ['ausencias',   '🏥 Ausencias',   0],
          ['correcciones','✏️ Correcciones', correcsPend.length],
        ].map(([id, label, badge]) => (
          <button key={id} className={`pill-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {label}<Badge n={badge} />
          </button>
        ))}
      </div>

      {/* ── Tab: En vivo ─────────────────────────────────────────────────── */}
      {tab === 'live' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14 }}>
          {emps.map(e => {
            const live = liveRecs.find(r => r.empId === e.id)
            const t = live ? calcSecs(live) : null
            const isWorking = live && !live.enDescanso
            const isBreak   = live && live.enDescanso
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
                <div style={{ textAlign:'center', marginBottom:12 }}>
                  <div style={{ fontSize:22, fontWeight:800, color: isWorking?'var(--green)':isBreak?'var(--orange)':'var(--text3)', fontVariantNumeric:'tabular-nums' }}>
                    {t ? mhm(Math.floor(t.work/60)) : '—'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>{isWorking?'Trabajando':isBreak?'En descanso':'Sin jornada hoy'}</div>
                </div>
                {live ? (
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-sm btn-secondary" style={{ flex:1, fontSize:11 }} onClick={() => toggleDescanso(live)}>
                      {live.enDescanso ? '▶ Continuar' : '⏸ Pausa'}
                    </button>
                    <button className="btn btn-sm btn-danger" style={{ flex:1, fontSize:11 }} onClick={() => forceClose(live)}>■ Finalizar</button>
                  </div>
                ) : (
                  <button className="btn btn-sm btn-primary" style={{ width:'100%', fontSize:11 }} onClick={() => startJornada(e)}>▶ Iniciar jornada</button>
                )}
              </div>
            )
          })}
          {!emps.length && <div className="empty">Sin empleados asignados a tu obra</div>}
        </div>
      )}

      {/* ── Tab: Jornadas ────────────────────────────────────────────────── */}
      {tab === 'jornadas' && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {pendRecs.map(r => (
            <div key={r.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--bg-600)', borderRadius:'var(--r)', border:'1px solid var(--border)', flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:160 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{r.empName}</div>
                <div style={{ fontSize:12, color:'var(--text3)' }}>{fds(r.inicio)} · {ftime(r.inicio)} → {ftime(r.fin)} · {mhm(Math.floor(recWorkSecs(r)/60))}</div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button className="btn btn-sm btn-secondary" onClick={() => startEdit(r)}>Modificar</button>
                <button className="btn btn-sm btn-primary"   onClick={() => aceptar(r)}>✓ Aceptar</button>
              </div>
            </div>
          ))}
          {!pendRecs.length && <div className="empty">Sin jornadas pendientes de aceptar</div>}
        </div>
      )}

      {/* ── Tab: Ausencias ───────────────────────────────────────────────── */}
      {tab === 'ausencias' && (
        <div>
          <div className="dash-widget" style={{ marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>Registrar ausencia</div>
            <div className="field-row">
              <div className="field" style={{ marginBottom:0 }}>
                <label>Empleado</label>
                <select value={ausForm.empId} onChange={e => setAusForm(f => ({ ...f, empId:e.target.value }))}>
                  <option value="">Selecciona…</option>
                  {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Tipo</label>
                <select value={ausForm.tipo} onChange={e => setAusForm(f => ({ ...f, tipo:e.target.value }))}>
                  <option value="medico">🏥 Baja médica</option>
                  <option value="ausencia">📋 Ausencia justificada</option>
                </select>
              </div>
            </div>
            <div className="field-row" style={{ marginTop:10 }}>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Fecha inicio</label>
                <input type="date" value={ausForm.fechaInicio} onChange={e => setAusForm(f => ({ ...f, fechaInicio:e.target.value }))} />
              </div>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Fecha fin</label>
                <input type="date" value={ausForm.fechaFin} min={ausForm.fechaInicio} onChange={e => setAusForm(f => ({ ...f, fechaFin:e.target.value }))} />
              </div>
            </div>
            <div className="field" style={{ marginTop:10, marginBottom:14 }}>
              <label>Motivo (opcional)</label>
              <input value={ausForm.motivo} onChange={e => setAusForm(f => ({ ...f, motivo:e.target.value }))} placeholder="Breve descripción" />
            </div>
            <button className="btn btn-primary" onClick={addAus} style={{ width:'100%' }}>+ Registrar ausencia</button>
          </div>

          <div className="adm-section-title" style={{ padding:'0 0 12px' }}>Historial de mi equipo</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {teamAus.map(a => {
              const dias = Math.round((new Date(a.fechaFin+'T00:00:00') - new Date(a.fechaInicio+'T00:00:00')) / 86400000) + 1
              return (
                <div key={a.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--bg-700)', borderRadius:'var(--r)', border:'1px solid var(--border)' }}>
                  <span style={{ fontSize:20 }}>{a.tipoAus === 'medico' ? '🏥' : '📋'}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700 }}>{a.empName}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{fds(a.fechaInicio)} → {fds(a.fechaFin)} · {dias}d · {a.tipoAus === 'medico' ? 'Baja médica' : 'Ausencia'}</div>
                    {a.motivo && <div style={{ fontSize:11, color:'var(--text4)', marginTop:1 }}>{a.motivo}</div>}
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => delAus(a.id, a.tipoAus)}>✕</button>
                </div>
              )
            })}
            {!teamAus.length && <div className="empty">Sin ausencias registradas en tu equipo</div>}
          </div>
        </div>
      )}

      {/* ── Tab: Correcciones ────────────────────────────────────────────── */}
      {tab === 'correcciones' && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {correcsPend.length > 0 && (
            <>
              <div className="adm-section-title" style={{ padding:'0 0 10px' }}>Pendientes de revisar ({correcsPend.length})</div>
              {correcsPend.map(c => (
                <div key={c.id} style={{ padding:'14px 16px', background:'var(--orange-dim)', border:'1px solid rgba(245,158,11,.25)', borderRadius:'var(--r)' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
                    <div style={{ flex:1, minWidth:180 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>{c.empName}</div>
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:3 }}>
                        Original: {ftime(c.recInicio)} → {c.recFin ? ftime(c.recFin) : '—'}
                      </div>
                      <div style={{ fontSize:11, color:'var(--primary-light)', marginTop:2 }}>
                        Propuesto: {ftime(c.propInicio)} → {ftime(c.propFin)}
                      </div>
                      {c.motivo && <div style={{ fontSize:11, color:'var(--text3)', marginTop:4, fontStyle:'italic' }}>"{c.motivo}"</div>}
                    </div>
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => actCorr(c.id, 'aprobada')}>✓ Aprobar</button>
                      <button className="btn btn-sm btn-danger"  onClick={() => actCorr(c.id, 'rechazada')}>✗ Rechazar</button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
          {correcsHist.length > 0 && (
            <>
              <div className="adm-section-title" style={{ padding:'16px 0 10px' }}>Historial</div>
              {correcsHist.map(c => (
                <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'var(--bg-700)', borderRadius:'var(--r)', border:'1px solid var(--border)' }}>
                  <span style={{ fontSize:16 }}>{c.estado === 'aprobada' ? '✅' : '❌'}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700 }}>{c.empName}</div>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>{fds(c.propInicio)} · {ftime(c.propInicio)} → {ftime(c.propFin)}</div>
                  </div>
                  <span className={`badge ${c.estado === 'aprobada' ? 'badge-green' : 'badge-red'}`}>{c.estado}</span>
                </div>
              ))}
            </>
          )}
          {!correcsPend.length && !correcsHist.length && <div className="empty">Sin correcciones de tu equipo</div>}
        </div>
      )}

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
            <div className="field" style={{ marginBottom:16 }}>
              <label>MOTIVO DEL CAMBIO (obligatorio)</label>
              <input type="text" maxLength={200} placeholder="Ej: olvidó fichar la salida, se fue antes por cita médica…"
                value={editing.motivo || ''} onChange={e => setEditing(s => ({ ...s, motivo:e.target.value }))} />
            </div>
            <div className="modal-btns">
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={!editing.motivo?.trim()} onClick={saveEdit}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PANEL AJUSTES ────────────────────────────────────────────────────────────
const COLOR_PRESETS = ['#6C63FF','#3B5BFF','#7c3aed','#0891b2','#059669','#dc2626','#d97706','#db2777']

function TimeList({ label, desc, times, onChange }) {
  const add    = ()    => onChange([...times, '09:00'])
  const remove = i     => onChange(times.filter((_, idx) => idx !== i))
  const update = (i,v) => onChange(times.map((t, idx) => idx === i ? v : t))
  return (
    <div>
      <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4, textTransform:'uppercase', letterSpacing:.8 }}>{label}</div>
      {desc && <div style={{ fontSize:11, color:'var(--text3)', marginBottom:8, opacity:.7 }}>{desc}</div>}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
        {times.map((t, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:6, background:'var(--bg-500)', borderRadius:10, padding:'6px 10px', border:'1px solid var(--border)' }}>
            <input type="time" value={t} onChange={e => update(i, e.target.value)}
              style={{ background:'none', border:'none', color:'var(--text)', fontSize:14, fontWeight:700, cursor:'pointer', outline:'none', width:80 }} />
            {times.length > 1 &&
              <button onClick={() => remove(i)} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:13, padding:0, lineHeight:1 }}>✕</button>
            }
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={add} style={{ fontSize:12 }}>+ Hora</button>
      </div>
    </div>
  )
}

function PanelAjustes({ db, toast, saveDB, session }) {
  const cfg = db.config || {}
  const [primaryColor, setPrimaryColor] = useState(cfg.primaryColor || '#6C63FF')
  const [companyName,  setCompanyName]  = useState(cfg.companyName  || db.empresas?.[0] || '')
  const [companyCif,   setCompanyCif]   = useState(cfg.companyCif || '')
  const [logoUploading, setLogoUploading] = useState(false)
  const [wdHoras, setWdHoras] = useState(cfg.wdMin ? String(Math.round(cfg.wdMin / 60 * 100) / 100) : '8')
  const [wkHoras, setWkHoras] = useState(cfg.wkMin ? String(Math.round(cfg.wkMin / 60 * 100) / 100) : '40')
  const [festivosExtra, setFestivosExtra] = useState(cfg.festivosExtra || {})
  const [usarFestivosMadrid, setUsarFestivosMadrid] = useState(cfg.usarFestivosMadrid !== false)
  const [newFestivoFecha, setNewFestivoFecha] = useState('')
  const [newFestivoNombre, setNewFestivoNombre] = useState('')
  const [reminders, setReminders] = useState({
    entrada:   cfg.reminders?.entrada?.length ? cfg.reminders.entrada : ['08:30'],
    salida:    cfg.reminders?.salida?.length  ? cfg.reminders.salida  : ['20:00'],
    semanal:   cfg.reminders?.semanal?.length ? cfg.reminders.semanal : ['17:00'],
    alertHoras: cfg.reminders?.alertHoras ?? 10,
  })
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const backupRef = useRef(null)

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type:'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `an-times-backup-${new Date().toISOString().slice(0,10)}.json`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast('Backup descargado', 3000, 'ok')
  }

  const importBackup = e => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result)
        if (!parsed.employees || !parsed.records) throw new Error('Formato inválido')
        saveDB(parsed)
        toast('Backup restaurado correctamente', 4000, 'ok')
      } catch {
        toast('Error: archivo no válido o corrupto', 4000, 'warn')
      }
    }
    reader.readAsText(file)
  }

  // Live preview: apply color as you change it
  useEffect(() => {
    document.documentElement.style.setProperty('--primary', primaryColor)
    document.documentElement.style.setProperty('--primary-glow', primaryColor + '30')
    document.documentElement.style.setProperty('--primary-dim', primaryColor + '22')
  }, [primaryColor])

  const save = () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    const wdMin = Math.round(parseFloat(wdHoras || '8') * 60) || 480
    const wkMin = Math.round(parseFloat(wkHoras || '40') * 60) || 2400
    const config = { ...cfg, primaryColor, companyName, companyCif: companyCif.trim().toUpperCase(), wdMin, wkMin, festivosExtra, usarFestivosMadrid, reminders }
    const withAudit = auditLog(db, 'Configuración guardada', companyName || 'Ajustes', session?.user?.name || 'Admin')
    saveDB({ config, audit: withAudit.audit })
    toast('Ajustes guardados', 3000, 'ok')
    setSaving(false)
    setTimeout(() => { savingRef.current = false }, 600)
  }

  const reset = () => {
    setPrimaryColor('#6C63FF')
    const config = { ...cfg, primaryColor: '', companyName }
    saveDB({ config })
    document.documentElement.style.removeProperty('--primary')
    document.documentElement.style.removeProperty('--primary-glow')
    document.documentElement.style.removeProperty('--primary-dim')
    toast('Color restablecido', 2000, 'ok')
  }

  // El logo se guarda al momento (no espera al botón "Guardar ajustes"): es una
  // operación de archivo, y perderla si el admin navega antes de guardar sería
  // una mala sorpresa.
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLogoUploading(true)
    try {
      const dataUrl = await resizeImageToDataUrl(file, 256, 0.88)
      saveDB({ config: { ...(db.config || {}), companyLogo: dataUrl } })
      toast('Logo actualizado', 2500, 'ok')
    } catch (err) {
      toast('No se pudo procesar la imagen: ' + (err?.message || err), 4000, 'err')
    } finally {
      setLogoUploading(false)
    }
  }

  const removeLogo = () => {
    const config = { ...(db.config || {}) }
    delete config.companyLogo
    saveDB({ config })
    toast('Logo eliminado', 2000, 'ok')
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Ajustes</h1>
          <div className="adm-panel-sub" style={{ marginTop:2 }}>Personalización de la aplicación</div>
        </div>
      </div>

      <div className="dash-widget card-lift" style={{ marginBottom:20 }}>
        <div className="dash-widget-header">
          <div className="dash-widget-title">🏗️ Obras</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14, marginTop:4 }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:60, height:60, borderRadius:14, background:'var(--bg-600)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
              {db.config?.companyLogo
                ? <img src={db.config.companyLogo} alt="Logo empresa" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                : <span style={{ fontSize:22, opacity:.35 }}>🏢</span>}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>Logo de la empresa</div>
              <div style={{ display:'flex', gap:8 }}>
                <label className="btn btn-secondary btn-sm" style={{ cursor:'pointer' }}>
                  {logoUploading ? 'Procesando…' : (db.config?.companyLogo ? 'Cambiar' : 'Subir logo')}
                  <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={logoUploading} style={{ display:'none' }} />
                </label>
                {db.config?.companyLogo && (
                  <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={removeLogo}>Quitar</button>
                )}
              </div>
              <div style={{ fontSize:10, color:'var(--text4)', marginTop:5 }}>Aparece en la pantalla de acceso y en el menú. Se ajusta automáticamente.</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ flex:2 }}>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>Nombre visible en la app</div>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder={db.empresas?.[0] || 'Nombre de obra'}
                style={{ width:'100%', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'10px 14px', fontSize:14, boxSizing:'border-box' }} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>CIF empresa</div>
              <input value={companyCif} maxLength={12} onChange={e => setCompanyCif(e.target.value.toUpperCase())} placeholder="B12345678"
                style={{ width:'100%', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'10px 14px', fontSize:14, boxSizing:'border-box' }} />
            </div>
          </div>
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>Jornada diaria (horas)</div>
              <input type="number" min="1" max="24" step="0.5" value={wdHoras} onChange={e => setWdHoras(e.target.value)}
                style={{ width:'100%', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'10px 14px', fontSize:14, boxSizing:'border-box' }} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>Jornada semanal (horas)</div>
              <input type="number" min="1" max="60" step="0.5" value={wkHoras} onChange={e => setWkHoras(e.target.value)}
                style={{ width:'100%', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'10px 14px', fontSize:14, boxSizing:'border-box' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="dash-widget card-lift" style={{ marginBottom:20 }}>
        <div className="dash-widget-header">
          <div className="dash-widget-title">📅 Festivos personalizados</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ fontSize:11, color:'var(--text3)' }}>Festivos base de la Comunidad de Madrid</div>
          <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', fontSize:12 }}>
            <input type="checkbox" checked={usarFestivosMadrid} onChange={e => setUsarFestivosMadrid(e.target.checked)}
              style={{ accentColor:'var(--primary)', width:15, height:15 }} />
            Incluir festivos Madrid
          </label>
        </div>
        <div style={{ fontSize:11, color:'var(--text3)', marginBottom:10 }}>Añade festivos propios de tu empresa o comunidad autónoma.</div>
        {Object.entries(festivosExtra).sort(([a],[b]) => a.localeCompare(b)).map(([fecha, nombre]) => (
          <div key={fecha} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--text2)', flex:1 }}>{fecha}</div>
            <div style={{ fontSize:12, color:'var(--text3)', flex:2 }}>{nombre}</div>
            <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)', padding:'2px 8px' }}
              onClick={() => { const f = { ...festivosExtra }; delete f[fecha]; setFestivosExtra(f) }}>✕</button>
          </div>
        ))}
        <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
          <input type="date" value={newFestivoFecha} onChange={e => setNewFestivoFecha(e.target.value)}
            style={{ borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'7px 10px', fontSize:12 }} />
          <input value={newFestivoNombre} onChange={e => setNewFestivoNombre(e.target.value)} placeholder="Nombre del festivo"
            style={{ flex:1, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'7px 10px', fontSize:12 }} />
          <button className="btn btn-secondary btn-sm" onClick={() => {
            if (!newFestivoFecha || !newFestivoNombre.trim()) return
            setFestivosExtra(prev => ({ ...prev, [newFestivoFecha]: newFestivoNombre.trim() }))
            setNewFestivoFecha(''); setNewFestivoNombre('')
          }}>Añadir</button>
        </div>
      </div>

      <div className="dash-widget card-lift" style={{ marginBottom:20 }}>
        <div className="dash-widget-header">
          <div className="dash-widget-title">🎨 Color principal</div>
          <button className="btn btn-secondary btn-sm" onClick={reset} style={{ fontSize:11 }}>Restablecer</button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14, marginTop:4 }}>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
              style={{ width:48, height:48, borderRadius:10, border:'2px solid var(--border)', cursor:'pointer', padding:2, background:'none', flexShrink:0 }} />
            <input value={primaryColor} onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setPrimaryColor(e.target.value) }}
              style={{ flex:1, borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'10px 14px', fontSize:13, fontFamily:'monospace' }} />
            <div style={{ width:48, height:48, borderRadius:10, background: primaryColor, flexShrink:0, border:'1px solid var(--border)' }} />
          </div>

          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {COLOR_PRESETS.map(c => (
              <div key={c} onClick={() => setPrimaryColor(c)}
                style={{ width:32, height:32, borderRadius:9, background:c, cursor:'pointer',
                  border: c.toLowerCase() === primaryColor.toLowerCase() ? '3px solid white' : '2px solid transparent',
                  transition:'transform .15s, box-shadow .15s',
                  boxShadow: c.toLowerCase() === primaryColor.toLowerCase() ? `0 0 10px ${c}` : 'none' }}
                onMouseEnter={e => { e.currentTarget.style.transform='scale(1.2)' }}
                onMouseLeave={e => { e.currentTarget.style.transform='' }} />
            ))}
          </div>

          <div style={{ padding:'12px 14px', background:'var(--bg-500)', borderRadius:10, border:'1px solid var(--border)' }}>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:8, fontWeight:700, textTransform:'uppercase', letterSpacing:.5 }}>Vista previa</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button className="btn btn-primary btn-sm">Botón primario</button>
              <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', background:'var(--primary-dim)', border:'1px solid var(--primary-glow)', borderRadius:20, fontSize:11, fontWeight:700, color:'var(--primary-light)' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--primary)' }} />
                Chip
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-widget card-lift" style={{ marginBottom:20 }}>
        <div className="dash-widget-header">
          <div className="dash-widget-title">🔔 Recordatorios automáticos</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:18, marginTop:4 }}>
          <TimeList
            label="Recordatorio de entrada"
            desc="Se envía si el empleado no ha fichado aún a esa hora (L–V)"
            times={reminders.entrada}
            onChange={v => setReminders(r => ({ ...r, entrada: v }))}
          />
          <TimeList
            label="Recordatorio de salida olvidada"
            desc="Se envía si el empleado tiene la jornada abierta a esa hora"
            times={reminders.salida}
            onChange={v => setReminders(r => ({ ...r, salida: v }))}
          />
          <TimeList
            label="Resumen semanal (viernes)"
            desc="Envía el resumen de horas de la semana cada viernes a esa hora"
            times={reminders.semanal}
            onChange={v => setReminders(r => ({ ...r, semanal: v }))}
          />
          <div>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4, textTransform:'uppercase', letterSpacing:.8 }}>Alerta jornada muy larga</div>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:8, opacity:.7 }}>Avisa al admin si un empleado lleva más de X horas con la jornada abierta</div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <input type="number" min="1" max="24" step="0.5"
                value={reminders.alertHoras}
                onChange={e => setReminders(r => ({ ...r, alertHoras: parseFloat(e.target.value) || 10 }))}
                style={{ width:80, borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-500)', color:'var(--text)', padding:'6px 12px', fontSize:14, fontWeight:700 }} />
              <span style={{ fontSize:13, color:'var(--text2)' }}>horas</span>
            </div>
          </div>
        </div>
      </div>

      <button className="btn btn-primary" disabled={saving} onClick={save} style={{ width:'100%', padding:'14px' }}>
        {saving ? 'Guardando…' : '✓ Guardar ajustes'}
      </button>

      <div className="dash-widget card-lift" style={{ marginTop:20 }}>
        <div className="dash-widget-header">
          <div className="dash-widget-title">💾 Backup y restauración</div>
        </div>
        <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6, marginBottom:14 }}>
          Exporta todos los datos en formato JSON para hacer una copia de seguridad o migrar a otro entorno. Importar sobreescribe todos los datos actuales.
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <button className="btn btn-secondary" onClick={exportBackup} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar backup (JSON)
          </button>
          <button className="btn btn-secondary" onClick={() => backupRef.current?.click()} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Importar backup
          </button>
          <input ref={backupRef} type="file" accept=".json" style={{ display:'none' }} onChange={importBackup} />
        </div>
        <div style={{ fontSize:11, color:'var(--red)', marginTop:10, fontWeight:600 }}>
          ⚠ Importar reemplaza todos los datos actuales sin posibilidad de deshacer.
        </div>
      </div>
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

