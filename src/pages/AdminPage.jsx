import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import QRCode from 'qrcode'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useAppStore } from '../store/appStore.js'
import { today, mhm, p2, ftime, fds, calcSecs, calcMin, gid, vacData, wkStart, recWorkSecs, sortedEmps, monthlyExtras } from '../utils/time.js'
import { WD, WK, VAPID_PUB } from '../config/constants.js'
import { auditLog, queuePush, pushSubscribe } from '../services/dataService.js'
import { DocPreview } from '../components/DocPreview.jsx'
import { useModalBack } from '../hooks/useModalBack.js'
import { startedInHorizontalScroller } from '../utils/gesture.js'
import { hashPin, isPinHashed } from '../utils/pinSecurity.js'

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

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
  { id:'mensajes', label:'Mensajes' },
]

const JO_PAGES = [
  ...PAGES,
  { id:'validar',  label:'Validar Horas' },
]

const NAV_ICONS = {
  ajustes:     <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  dashboard:   <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  control:     <><circle cx="12" cy="12" r="9"/><polyline points="12 6 12 12 16 14"/></>,
  fichajes:    <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/></>,
  solicitudes: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
  empleados:   <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  informes:    <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></>,
  obras:       <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
  documentos:  <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></>,
  auditoria:   <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
  mensajes:    <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
  miobra:      <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
  validar:     <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
  turnos:      <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="15" x2="9" y2="15"/><line x1="15" y1="15" x2="15" y2="15"/></>,
  gastos:      <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
  anomalias:   <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  denuncias:   <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
}

function NavIcon({ id, size = 17 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {NAV_ICONS[id] || null}
    </svg>
  )
}

// ── Helper compartido para envío push masivo ──────────────────────────────────
// Usado por el modal de topbar y por PushNotifWidget para evitar duplicar lógica
async function callSendPushAll(titleText, bodyText, targetValue) {
  const headers = { 'Content-Type': 'application/json' }
  const secret = import.meta.env.VITE_PUSH_SECRET
  if (secret) headers['Authorization'] = `Bearer ${secret}`
  const tgt = (targetValue === 'all' || targetValue === 'activos') ? targetValue : { role: targetValue }
  const res = await fetch('/api/send-push-all', {
    method: 'POST', headers,
    body: JSON.stringify({ title: titleText, body: bodyText, url: '/', target: tgt })
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, ...json }
}

function showPushToast(json, toast) {
  if (!json.ok) {
    toast('Error: ' + (json.error || json.status), 4000, 'err')
  } else if (json.sent === 0 && (json.noSub ?? 0) > 0) {
    toast(`Ningún empleado tiene push activado (${json.noSub} sin suscripción)`, 4000, 'warn')
  } else {
    const extra = [
      json.failed > 0 ? `${json.failed} fallaron` : '',
      json.noSub  > 0 ? `${json.noSub} sin push`  : '',
    ].filter(Boolean).join(' · ')
    toast(`Enviado a ${json.sent ?? 0} empleado${json.sent !== 1 ? 's' : ''}${extra ? ` · ${extra}` : ''}`, 3000, 'ok')
  }
}
// ─────────────────────────────────────────────────────────────────────────────

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
        if (uid) pushSubscribe(uid, VAPID_PUB)
        if (!isEncargado) pushSubscribe('__admin__', VAPID_PUB)
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

  // Company theme: apply --primary from db.config if set
  useEffect(() => {
    const color = db.config?.primaryColor
    if (!color) return
    document.documentElement.style.setProperty('--primary', color)
    document.documentElement.style.setProperty('--primary-glow', color + '30')
    document.documentElement.style.setProperty('--primary-dim', color + '22')
    return () => {
      document.documentElement.style.removeProperty('--primary')
      document.documentElement.style.removeProperty('--primary-glow')
      document.documentElement.style.removeProperty('--primary-dim')
    }
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
            <span className="adm-logo-text">TIMES INC</span>
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
              {currentAdminPage === 'dashboard'   && <PanelDashboard   db={db} toast={toast} saveDB={saveDB} />}
              {currentAdminPage === 'control'     && <PanelControl     db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'fichajes'    && <PanelFichajes    db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'solicitudes' && <PanelSolicitudes db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'empleados'   && <PanelEmpleados   db={db} toast={toast} saveDB={saveDB} openModal={openModal} closeModal={closeModal} activeModal={activeModal} modalData={modalData} session={session} />}
              {currentAdminPage === 'informes'    && <PanelInformes    db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'mensajes'    && <PanelMensajes    db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'obras'       && <PanelObras       db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'documentos'  && <PanelDocumentos  db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'auditoria'   && <PanelAuditoria   db={db} />}
              {currentAdminPage === 'ajustes'     && <PanelAjustes     db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'miobra'      && <PanelMiObra      db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'validar'     && <PanelValidarHoras db={db} toast={toast} saveDB={saveDB} session={session} />}
              <Suspense fallback={<div className="adm-panel" style={{padding:32,color:'var(--text3)'}}>Cargando…</div>}>
                {currentAdminPage === 'turnos'    && <PanelTurnos    db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'gastos'    && <PanelGastos    db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'anomalias' && <PanelAnomalias db={db} toast={toast} saveDB={saveDB} session={session} />}
                {currentAdminPage === 'denuncias' && <PanelDenuncias db={db} toast={toast} saveDB={saveDB} session={session} />}
              </Suspense>
            </>
          ) : isEncargado ? (
            <>
              {currentAdminPage === 'miobra'   && <PanelMiObra  db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'mensajes' && <PanelMensajes db={db} toast={toast} saveDB={saveDB} session={session} />}
            </>
          ) : (
            <>
              {currentAdminPage === 'dashboard'   && <PanelDashboard   db={db} toast={toast} saveDB={saveDB} />}
              {currentAdminPage === 'control'     && <PanelControl     db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'fichajes'    && <PanelFichajes    db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'solicitudes' && <PanelSolicitudes db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'empleados'   && <PanelEmpleados   db={db} toast={toast} saveDB={saveDB} openModal={openModal} closeModal={closeModal} activeModal={activeModal} modalData={modalData} session={session} />}
              {currentAdminPage === 'informes'    && <PanelInformes    db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'mensajes'    && <PanelMensajes    db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'obras'       && <PanelObras       db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'documentos'  && <PanelDocumentos  db={db} toast={toast} saveDB={saveDB} session={session} />}
              {currentAdminPage === 'auditoria'   && <PanelAuditoria   db={db} />}
              {currentAdminPage === 'ajustes'     && <PanelAjustes     db={db} toast={toast} saveDB={saveDB} session={session} />}
              <Suspense fallback={<div className="adm-panel" style={{padding:32,color:'var(--text3)'}}>Cargando…</div>}>
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

function SyncBadge() {
  const syncStatus = useAppStore(s => s.syncStatus)
  const syncError  = useAppStore(s => s.syncError)
  const isNoConfig = syncError === 'no_config'
  const color = syncStatus === 'synced' ? 'var(--green)'
    : syncStatus === 'syncing' ? 'var(--orange)'
    : isNoConfig ? 'var(--text3)'
    : 'var(--danger)'
  const label = syncStatus === 'synced' ? 'Sincronizado'
    : syncStatus === 'syncing' ? 'Guardando…'
    : isNoConfig ? 'Solo local'
    : 'Sin conexión'
  return (
    <div style={{ fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:4, color }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:'currentColor', flexShrink:0 }} />
      {label}
    </div>
  )
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'
  if (next === 'dark') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', 'light')
  try { localStorage.setItem('theme', next) } catch {}
}

// ─── PANEL DASHBOARD ──────────────────────────────────────────────────────────
function PanelDashboard({ db, toast, saveDB }) {
  const { setAdminPage } = useAppStore()
  const [showAllLive, setShowAllLive] = useState(false)
  const [showAllToday, setShowAllToday] = useState(false)
  const now = new Date()
  const todayStr = today()
  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
  const recs = db.records || []

  const liveRecs = recs.filter(r => !r.fin)
  const todayRecs = recs.filter(r => r.inicio?.startsWith(todayStr))
  const checkedIn = new Set(liveRecs.map(r => r.empId)).size

  const ws = wkStart(now)
  const wsStr = ws.toISOString().slice(0, 10)
  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMk = `${prevDate.getFullYear()}-${p2(prevDate.getMonth()+1)}`
  const weekRecs = useMemo(() => {
    const wsDate = new Date(wsStr)
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
          // Productividad: horas reales del mes vs objetivo (WD * 20 días por empleado activo)
          const objetivoMes = emps.length * WD * 20
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
              const pct = Math.round(val / Math.max(monthMin, lastMonthMin) * 100)
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
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Nuevo fichaje', ico:'⏱️', page:'fichajes', color:'var(--primary-dim)', accent:'var(--primary-light)' },
          { label:'Ver solicitudes', ico:'🌴', page:'solicitudes', color:'var(--orange-dim)', accent:'var(--orange)' },
          { label:'Generar informe', ico:'📊', page:'informes', color:'var(--green-dim)', accent:'var(--green)' },
        ].map(({ label, ico, page, color, accent }) => (
          <button key={page} onClick={() => setAdminPage(page)} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'14px 8px', background:color, border:`1px solid ${accent}22`, borderRadius:'var(--r-lg)', cursor:'pointer', transition:'transform .15s, box-shadow .15s', WebkitTapHighlightColor:'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow=`0 6px 16px ${accent}33` }}
            onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='' }}>
            <span style={{ fontSize:22 }}>{ico}</span>
            <span style={{ fontSize:11, fontWeight:700, color: accent, textAlign:'center', lineHeight:1.2 }}>{label}</span>
          </button>
        ))}
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
      <PushNotifWidget db={db} toast={toast} />
    </div>
  )
}

function PushNotifWidget({ db, toast }) {
  const [open, setOpen]       = useState(false)
  const [target, setTarget]   = useState('all')
  const [title, setTitle]     = useState('')
  const [body, setBody]       = useState('')
  const [sending, setSending] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  const permStatus = 'Notification' in window ? Notification.permission : 'unsupported'

  const send = async () => {
    if (!title.trim() || !body.trim()) { toast('Completa título y mensaje'); return }
    setSending(true)
    setLastResult(null)
    try {
      const json = await callSendPushAll(title.trim(), body.trim(), target)
      setLastResult(json)
      showPushToast(json, toast)
      if (json.ok) { setTitle(''); setBody(''); setOpen(false) }
    } catch(e) {
      setLastResult({ ok: false, error: e.message })
      toast('Error de red al enviar push', 3000, 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="dash-widget card-lift" style={{ marginTop:12 }}>
      <div className="dash-widget-header">
        <div className="dash-widget-title">📢 Push Masivo</div>
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(o => !o)}>
          {open ? 'Cancelar' : '+ Enviar'}
        </button>
      </div>
      {!open && (
        <div style={{ fontSize:11, color:'var(--text4)', marginTop:4, display:'flex', flexDirection:'column', gap:3 }}>
          <span>Notificación masiva — llega al móvil aunque esté bloqueado</span>
          <span style={{ color: permStatus === 'granted' ? 'var(--green)' : permStatus === 'denied' ? 'var(--danger)' : 'var(--orange)' }}>
            Este dispositivo: {permStatus === 'granted' ? '✓ Push activado' : permStatus === 'denied' ? '✗ Push bloqueado — actívalo en ajustes del navegador' : '⚠ Push no solicitado'}
          </span>
          {lastResult && (
            <span style={{ color: lastResult.ok ? 'var(--green)' : 'var(--danger)' }}>
              Último envío: {lastResult.ok
                ? `✓ ${lastResult.sent ?? 0} enviados${lastResult.failed > 0 ? `, ${lastResult.failed} fallaron` : ''}${lastResult.noSub > 0 ? `, ${lastResult.noSub} sin suscripción` : ''}`
                : `✗ ${lastResult.error || 'error'}`}
            </span>
          )}
        </div>
      )}
      {open && (
        <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:8 }}>
          <select value={target} onChange={e => setTarget(e.target.value)}
            style={{ borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'8px 12px', fontSize:13 }}>
            <option value="all">Todos los empleados</option>
            <option value="activos">Activos ahora (fichados)</option>
            <option value="jefe_obra">Solo jefes de obra</option>
            <option value="encargado">Solo encargados</option>
            <option value="empleado">Solo empleados base</option>
          </select>
          <input placeholder="Título (máx 80 caracteres)…" maxLength={80} value={title} onChange={e => setTitle(e.target.value)}
            style={{ borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'8px 12px', fontSize:13 }} />
          <textarea placeholder="Mensaje (máx 200 caracteres)…" maxLength={200} value={body} onChange={e => setBody(e.target.value)} rows={2}
            style={{ borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'8px 12px', fontSize:13, resize:'none', fontFamily:'inherit' }} />
          <div style={{ fontSize:10, color:'var(--text4)', textAlign:'right' }}>
            {title.length}/80 · {body.length}/200
          </div>
          <button className="btn btn-primary btn-sm" disabled={sending || !title.trim() || !body.trim()} onClick={send}>
            {sending ? 'Enviando…' : '📢 Enviar notificación masiva'}
          </button>
          <div style={{ fontSize:10, color:'var(--text4)', lineHeight:1.5 }}>
            Solo llega a empleados con la app abierta alguna vez y permisos concedidos.
          </div>
        </div>
      )}
    </div>
  )
}

function ComunicadoWidget({ db, toast, saveDB }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!title.trim() || !body.trim()) { toast('Completa título y mensaje'); return }
    setSending(true)
    const msg = { id: gid(), from: 'admin', title: title.trim(), body: body.trim(), to: 'all', ts: new Date().toISOString() }
    const withAudit = auditLog(db, 'Comunicado enviado', msg.title, 'Admin')
    saveDB({ mensajes: [...(db.mensajes||[]), msg], audit: withAudit.audit })
    await queuePush('__all__', '📢 ' + msg.title, msg.body, 'comunicado', '/?tab=inicio')
    toast('Comunicado enviado a todos los empleados', 3000, 'ok')
    setSending(false)
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
            style={{ borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'8px 12px', fontSize:13 }} />
          <textarea placeholder="Mensaje para todos los empleados..." value={body} onChange={e => setBody(e.target.value)} rows={3}
            style={{ borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'8px 12px', fontSize:13, resize:'vertical', fontFamily:'inherit' }} />
          <button className="btn btn-primary btn-sm" disabled={sending} onClick={send}>{sending ? 'Enviando…' : 'Enviar a todos'}</button>
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
  recs.filter(r => r.fin && r.inicio).forEach(r => {
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

// ─── PANEL CONTROL LIVE ───────────────────────────────────────────────────────
function PanelControl({ db, toast, saveDB, session }) {
  const { showConfirm } = useAppStore()
  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
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

// ─── PANEL FICHAJES ───────────────────────────────────────────────────────────
function PanelFichajes({ db, toast, saveDB, session }) {
  const [search, setSearch] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [filterEmp, setFilterEmp] = useState('')
  const [quickFilter, setQuickFilter] = useState('')
  const [editingRec, setEditingRec] = useState(null) // { id, field: 'inicio'|'fin', value }
  const [pageSize, setPageSize] = useState(100)
  const emps = (db.employees || []).filter(e => !e.isAdmin)
  const recs = (db.records || []).filter(r => r.fin)
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
  }).sort((a,b) => b.inicio.localeCompare(a.inicio) || a.id.localeCompare(b.id)), [recs, quickFilter, filterDate, filterEmp, search])
  const pagedFiltered = filtered.slice(0, pageSize)

  const totalWork = useMemo(() => filtered.reduce((s,r) => s + Math.floor(recWorkSecs(r)/60), 0), [filtered])
  const totalBreak = useMemo(() => filtered.reduce((s,r) => s + Math.floor((r.breakSecs||0)/60), 0), [filtered])

  const { showConfirm } = useAppStore()
  const del = (id) => {
    showConfirm('¿Eliminar este fichaje?', () => {
      const rec = (db.records||[]).find(r => r.id === id)
      const withAudit = auditLog(db, 'Fichaje eliminado', `${rec?.empName || ''} · ${rec?.inicio?.slice(0,10) || ''}`, session?.user?.name || 'Admin')
      saveDB({ records: (db.records||[]).filter(r => r.id !== id), audit: withAudit.audit })
      toast('Fichaje eliminado')
    })
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
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Empleado</th><th>Centro</th><th>Entrada</th><th>Salida</th><th>Trabajo</th><th>Descanso</th><th>GPS</th><th></th></tr></thead>
          <tbody>
            {pagedFiltered.map(r => {
              const wm = Math.floor(recWorkSecs(r)/60)
              const bm = Math.floor((r.breakSecs||0)/60)
              const over = wm > WD
              const loc = r.locInicio
              return (
                <tr key={r.id}>
                  <td>{r.empName}</td>
                  <td style={{ color:'var(--text3)', fontSize:12 }}>{r.centro || '—'}</td>
                  <td style={{ fontVariantNumeric:'tabular-nums', fontSize:12 }}>
                    {editingRec?.id === r.id && editingRec?.field === 'inicio' ? (
                      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                        <input type="datetime-local" defaultValue={r.inicio?.slice(0,16) || ''} id="edit-rec-input"
                          style={{ fontSize:11, padding:'3px 6px', borderRadius:6, border:'1px solid var(--border2)', background:'var(--bg-500)', color:'var(--text)', fontFamily:'inherit', width:155 }} />
                        <button className="btn btn-sm btn-primary" style={{ fontSize:10, padding:'3px 8px' }}
                          onClick={() => {
                            const val = document.getElementById('edit-rec-input').value
                            if (!val) return
                            const newInicio = new Date(val).toISOString()
                            if (r.fin && newInicio >= r.fin) { toast('La entrada debe ser anterior a la salida', 3500, 'err'); return }
                            const empRecs = (db.records||[]).filter(rec => rec.empId === r.empId && rec.id !== r.id && rec.fin)
                            if (empRecs.some(rec => newInicio < rec.fin && (r.fin || newInicio) > rec.inicio)) { toast('La hora se solapa con otro fichaje', 3500, 'err'); return }
                            const updated = (db.records||[]).map(rec => {
                              if (rec.id !== r.id) return rec
                              const t2 = calcSecs({ ...rec, inicio: newInicio })
                              return { ...rec, inicio: newInicio, workSecs: t2.work, breakSecs: t2.brk }
                            })
                            const withAudit = auditLog(db, 'Hora entrada editada', `${r.empName}: ${ftime(r.inicio)} → ${ftime(newInicio)}`, session?.user?.name || 'Admin')
                            saveDB({ records: updated, audit: withAudit.audit })
                            setEditingRec(null)
                            toast('Hora de entrada actualizada', 3000, 'ok')
                          }}>✓</button>
                        <button className="btn btn-sm btn-secondary" style={{ fontSize:10, padding:'3px 8px' }} onClick={() => setEditingRec(null)}>✕</button>
                      </div>
                    ) : (
                      <span style={{ cursor:'pointer', textDecoration:'underline dotted', textUnderlineOffset:2 }} title="Click para editar" onClick={() => setEditingRec({ id:r.id, field:'inicio' })}>
                        {ftime(r.inicio)}
                      </span>
                    )}
                  </td>
                  <td style={{ fontVariantNumeric:'tabular-nums', fontSize:12 }}>
                    {editingRec?.id === r.id && editingRec?.field === 'fin' ? (
                      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                        <input type="datetime-local" defaultValue={r.fin?.slice(0,16)} id="edit-rec-fin-input"
                          style={{ fontSize:11, padding:'3px 6px', borderRadius:6, border:'1px solid var(--border2)', background:'var(--bg-500)', color:'var(--text)', fontFamily:'inherit', width:155 }} />
                        <button className="btn btn-sm btn-primary" style={{ fontSize:10, padding:'3px 8px' }}
                          onClick={() => {
                            const val = document.getElementById('edit-rec-fin-input').value
                            if (!val) return
                            const newFin = new Date(val).toISOString()
                            if (newFin <= r.inicio) { toast('La salida debe ser posterior a la entrada', 3500, 'err'); return }
                            const empRecs2 = (db.records||[]).filter(rec => rec.empId === r.empId && rec.id !== r.id && rec.fin)
                            if (empRecs2.some(rec => r.inicio < rec.fin && newFin > rec.inicio)) { toast('La hora se solapa con otro fichaje', 3500, 'err'); return }
                            const updated = (db.records||[]).map(rec => {
                              if (rec.id !== r.id) return rec
                              const t2 = calcSecs({ ...rec, fin: newFin })
                              return { ...rec, fin: newFin, workSecs: t2.work, breakSecs: t2.brk }
                            })
                            const withAudit = auditLog(db, 'Hora salida editada', `${r.empName}: ${ftime(r.fin)} → ${ftime(newFin)}`, session?.user?.name || 'Admin')
                            saveDB({ records: updated, audit: withAudit.audit })
                            setEditingRec(null)
                            toast('Hora de salida actualizada', 3000, 'ok')
                          }}>✓</button>
                        <button className="btn btn-sm btn-secondary" style={{ fontSize:10, padding:'3px 8px' }} onClick={() => setEditingRec(null)}>✕</button>
                      </div>
                    ) : (
                      <span style={{ cursor:'pointer', textDecoration:'underline dotted', textUnderlineOffset:2 }} title="Click para editar" onClick={() => setEditingRec({ id:r.id, field:'fin' })}>
                        {ftime(r.fin)}
                      </span>
                    )}
                  </td>
                  <td style={{ fontWeight:700, color: over ? 'var(--orange)' : undefined }}>{mhm(wm)}</td>
                  <td style={{ color:'var(--text3)', fontSize:12 }}>{mhm(bm)}</td>
                  <td>
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
                  </td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => del(r.id)}>✕</button></td>
                </tr>
              )
            })}
            {!pagedFiltered.length && <tr><td colSpan={8} className="empty">Sin resultados</td></tr>}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr style={{ background:'var(--bg-500)' }}>
                <td colSpan={4} style={{ fontWeight:700, fontSize:12, color:'var(--text3)', padding:'8px 14px' }}>
                  Total ({filtered.length} registros)
                </td>
                <td style={{ fontWeight:800, color:'var(--primary-light)', fontVariantNumeric:'tabular-nums' }}>{mhm(totalWork)}</td>
                <td style={{ fontWeight:700, color:'var(--text3)', fontVariantNumeric:'tabular-nums', fontSize:12 }}>{mhm(totalBreak)}</td>
                <td /><td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {filtered.length > pageSize && (
        <div style={{ textAlign:'center', marginTop:14 }}>
          <button className="btn btn-secondary" onClick={() => setPageSize(s => s + 100)}>
            Ver más ({filtered.length - pageSize} restantes)
          </button>
        </div>
      )}
    </div>
  )
}

// ─── PANEL SOLICITUDES ────────────────────────────────────────────────────────
function PanelSolicitudes({ db, toast, saveDB, session }) {
  const [solTab, setSolTab] = useState('vacaciones')
  const [ausForm, setAusForm] = useState({ empId:'', tipo:'medico', fechaInicio:today(), fechaFin:today(), motivo:'' })
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
    const swipeRef = useRef({ startX: 0, active: false })

    const onTouchStart = (e) => {
      if (v.estado !== 'pendiente') return
      swipeRef.current = { startX: e.touches[0].clientX, active: true }
      setIsDragging(true)
    }
    const onTouchMove = (e) => {
      if (!swipeRef.current.active) return
      const dx = e.touches[0].clientX - swipeRef.current.startX
      setSwipeX(Math.max(-100, Math.min(100, dx)))
    }
    const onTouchEnd = () => {
      if (!swipeRef.current.active) return
      swipeRef.current.active = false
      setIsDragging(false)
      if (swipeX > 75) {
        act(v.id, 'aprobada')
        try { navigator.vibrate(15) } catch {}
      } else if (swipeX < -75) {
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
          style={{ flexWrap:'wrap', transform:`translateX(${swipeX}px)`, transition: isDragging ? 'none' : 'transform .3s cubic-bezier(.16,1,.3,1)', marginBottom:0, position:'relative', zIndex:1 }}
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
    const headers = ['Nombre','Email','Rol','Empresa','Centro trabajo','Alta','H/sem','H. trabajadas (mes actual)','H. trabajadas (dec.)','Estado']
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
        <input placeholder="Buscar empleado, empresa, centro…" value={empSearch} onChange={e => setEmpSearch(e.target.value)} style={{ flex:1 }} />
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

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Empleado</th><th>PIN</th><th>Rol</th><th>Empresa</th><th>Alta</th><th></th></tr></thead>
          <tbody>
            {emps.length === 0 && (
              <tr><td colSpan={6}>
                <div style={{ padding:'40px 20px', textAlign:'center', color:'var(--text3)' }}>
                  <div style={{ fontSize:36, marginBottom:12 }}>👷</div>
                  <div style={{ fontSize:15, fontWeight:700, color:'var(--text2)', marginBottom:6 }}>Sin empleados {empSearch ? 'con ese filtro' : 'todavía'}</div>
                  <div style={{ fontSize:13, marginBottom:16 }}>{empSearch ? 'Prueba otra búsqueda.' : 'Crea el primer empleado con el botón "+ Nuevo".'}</div>
                  {!empSearch && <button className="btn btn-primary btn-sm" onClick={openNew}>+ Añadir empleado</button>}
                </div>
              </td></tr>
            )}
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
                <td style={{ fontFamily:'monospace', letterSpacing:2 }}>{'•'.repeat(e.pinLen || (e.pin?.length <= 6 ? e.pin?.length : 4) || 4)}</td>
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
                    <button className="btn btn-sm btn-secondary" title="Generar QR de acceso" onClick={() => setQrEmp(e)}>QR</button>
                    {!e.baja && <button className="btn btn-sm btn-danger" onClick={() => del(e.id)}>Baja</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
  const [agruparCentro, setAgruparCentro] = useState(false)
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
      filtered.sort((a, b) => (a.centro||'').localeCompare(b.centro||'') || a.empName.localeCompare(b.empName) || a.inicio.localeCompare(b.inicio))
    } else {
      filtered.sort((a, b) => a.inicio.localeCompare(b.inicio))
    }
    const periodo = from || to ? `${from||'inicio'} a ${to||'hoy'}` : filterMonth
    const title = [`Fichajes — ${empresa || 'TIMES INC'} — ${periodo}${agruparCentro ? ' (agrupado por centro)' : ''}`]
    const headers = ['Empleado','Empresa','Centro','Fecha','Entrada','Salida','H. trabajo','H. trabajo (dec.)','H. descanso','Notas']
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
    const r3h = ['Empleado','Empresa','Centro','Fecha','Entrada','Salida','H. trabajo','H. trabajo (dec.)','H. descanso','Notas']
    const r3rows = allFichajesThisMonth.map(r => {
      const wm=Math.floor(recWorkSecs(r)/60), bm=Math.floor((r.breakSecs||0)/60)
      const d=new Date(r.inicio), fin=new Date(r.fin)
      return [r.empName, r.empresa||'', r.centro||'', d.toLocaleDateString('es-ES'), d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}), fin.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}), `${Math.floor(wm/60)}:${p2(wm%60)}`, minToDecH(wm), `${Math.floor(bm/60)}:${p2(bm%60)}`, r.notes||'']
    })
    const totWm=allFichajesThisMonth.reduce((s,r)=>s+Math.floor(recWorkSecs(r)/60),0)
    XLSX.utils.book_append_sheet(wb, makeSheet([h3,[],r3h,...r3rows,[],['TOTAL','','','','','',mhm(totWm),minToDecH(totWm),'','']],[22,18,16,12,8,8,10,14,10,20]), 'Fichajes')
    // Hoja 4: Empleados
    const r4h = ['Nombre','Email','Rol','Empresa','Centro trabajo','Alta','H/sem','Estado']
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

  const downloadNominaPDF = ({ e, totalMin, days }) => {
    const eRecs = (db.records || []).filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(filterMonth))
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
    const mes = new Date(filterMonth + '-01').toLocaleDateString('es-ES', { month:'long', year:'numeric' })
    const ausEmp = (db.ausencias || []).filter(a => a.empId === e.id && (a.fechaInicio || a.fecha || '').startsWith(filterMonth.slice(0,7)))
    const vacEmp = (db.vacaciones || []).filter(v => v.empId === e.id && v.estado === 'aprobada' && (v.fechaInicio || '').slice(0,7) === filterMonth)
    const vacDiasTotal = vacEmp.reduce((s, v) => {
      if (v.fechaInicio && v.fechaFin) return s + Math.round((new Date(v.fechaFin+'T00:00:00') - new Date(v.fechaInicio+'T00:00:00')) / 86400000) + 1
      return s + (v.dias || 0)
    }, 0)
    const rowsHtml = eRecs.map(r => {
      const wm = Math.floor(recWorkSecs(r) / 60)
      const d = new Date(r.inicio), fin = new Date(r.fin)
      return `<tr><td>${d.toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'})}</td><td>${d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</td><td>${fin.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</td><td>${esc(r.centro||'—')}</td><td>${mhm(wm)}</td></tr>`
    }).join('')
    printHtml(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Nómina ${mes} · ${esc(e.name)}</title>
<style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;padding:40px;color:#111;max-width:750px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px}h2{font-size:14px;color:#666;font-weight:400;margin:0 0 24px}
.meta{display:flex;gap:32px;margin-bottom:24px;padding:14px 18px;background:#f8f8f8;border-radius:8px;font-size:13px}
.meta span{color:#555}.meta strong{display:block;font-size:15px;color:#111;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px}
th{background:#f0f0f0;padding:9px 12px;text-align:left;border-bottom:2px solid #ddd;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
td{padding:8px 12px;border-bottom:1px solid #eee}tr:last-child td{border-bottom:none}
.total-row{font-weight:700;background:#f8f8f8;font-size:14px}
.sign{display:flex;gap:48px;margin-top:48px}.sign-box{flex:1;border-top:1px solid #999;padding-top:8px;font-size:12px;color:#666}
.badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;margin-left:8px}
.b-ok{background:#dcfce7;color:#166534}.b-warn{background:#fef9c3;color:#854d0e}
footer{margin-top:32px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px;display:flex;justify-content:space-between}
@media print{body{padding:20px}}</style></head><body>
<h1>${esc(e.name)} <span class="badge ${totalMin >= (e.horasSemanales||WK)*4*0.9 ? 'b-ok':'b-warn'}">${mhm(totalMin)}</span></h1>
<h2>Nómina de horas · ${mes}</h2>
<div class="meta">
  <div><span>Empresa</span><strong>${esc(e.empresa||'—')}</strong></div>
  <div><span>Centro</span><strong>${esc(e.centroTrabajo||'—')}</strong></div>
  <div><span>Jornada</span><strong>${e.horasSemanales||WK}h/sem</strong></div>
  <div><span>Días trabajados</span><strong>${days}</strong></div>
</div>
<table><thead><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Centro</th><th>Horas</th></tr></thead>
<tbody>${rowsHtml}</tbody>
<tfoot><tr class="total-row"><td colspan="4">Total horas trabajadas</td><td>${mhm(totalMin)}</td></tr></tfoot></table>
<div class="meta" style="gap:24px">
  <div><span>Vacaciones aprobadas</span><strong>${vacDiasTotal} días</strong></div>
  <div><span>Ausencias/bajas</span><strong>${ausEmp.length} registro${ausEmp.length!==1?'s':''}</strong></div>
</div>
<div class="sign"><div class="sign-box">Firma empleado<br><br><br>_________________________<br>${esc(e.name)}</div>
<div class="sign-box">Firma empresa<br><br><br>_________________________<br>Representante</div></div>
<footer><span>Generado: ${new Date().toLocaleString('es-ES')}</span><span>TIMES INC · Registro de jornada laboral</span></footer>
</body></html>`)
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
    if (procesandoCierre.has(e.id)) return
    setProcesandoCierre(s => new Set([...s, e.id]))
    const mes = filterMonth
    const eRecs = (db.records || []).filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(mes))
    const cierre = {
      id: gid(), empId: e.id, empName: e.name, mes,
      generadoPor: session?.user?.name || 'Admin',
      generadoAt: new Date().toISOString(),
      totalMin, dias: days, estado: 'pendiente', firma: null,
      records_snapshot: eRecs.map(r => ({ inicio:r.inicio, fin:r.fin, centro:r.centro, workSecs:r.workSecs||0 }))
    }
    saveDB({ cierres: [...(db.cierres||[]), cierre] })
    queuePush(e.id, '📋 Cierre mensual pendiente', `Tu resumen de ${mes} está listo para firmar.`, 'cierre', '/?go=emp:perfil')
    toast(`✅ Cierre enviado a ${e.name}`)
    setProcesandoCierre(s => { const n = new Set(s); n.delete(e.id); return n })
  }

  const downloadCierrePDF = (cierre, emp) => {
    const mes = new Date(cierre.mes + '-01').toLocaleDateString('es-ES', { month:'long', year:'numeric' })
    const rowsHtml = (cierre.records_snapshot || []).map(r => {
      const m = Math.floor((r.workSecs||0)/60)
      const d = new Date(r.inicio)
      return `<tr><td>${d.toLocaleDateString('es-ES')}</td><td>${esc(r.centro||'—')}</td><td>${d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</td><td>${mhm(m)}</td></tr>`
    }).join('')
    printHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cierre ${mes} · ${esc(cierre.empName)}</title>
<style>body{font-family:Arial,sans-serif;padding:32px;color:#111;max-width:700px;margin:0 auto}h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;color:#555;font-weight:400;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#f0f0f0;padding:8px 12px;text-align:left;border-bottom:2px solid #ccc}td{padding:8px 12px;border-bottom:1px solid #eee}.total{font-weight:700;font-size:15px;margin-top:16px}.sign-box{margin-top:40px;display:flex;gap:60px}.sign-line{flex:1;border-top:1px solid #888;padding-top:6px;font-size:12px;color:#555}@media print{body{padding:20px}}</style>
</head><body>
<h1>Cierre de jornada mensual · ${mes}</h1>
<h2>${esc(cierre.empName)} · Generado el ${new Date(cierre.generadoAt).toLocaleDateString('es-ES')}</h2>
<table><thead><tr><th>Fecha</th><th>Centro</th><th>Entrada</th><th>Horas</th></tr></thead><tbody>${rowsHtml}</tbody></table>
<div class="total">Total: ${mhm(cierre.totalMin)} · ${cierre.dias} día(s) trabajado(s)</div>
${cierre.firma ? `<div style="margin-top:24px"><b>Firmado digitalmente</b> por ${esc(cierre.empName)} · ${new Date(cierre.firma.firmadoAt).toLocaleString('es-ES')}<br><img src="${cierre.firma.signatureData}" style="height:60px;margin-top:8px;border:1px solid #ccc;border-radius:4px"></div>` : ''}
<div class="sign-box"><div class="sign-line">Firma empleado</div><div class="sign-line">Firma empresa</div></div>
</body></html>`)
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
          <button className="btn btn-primary" style={{ width:'100%', marginBottom:16 }} onClick={generarTodosCierres}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:6 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Generar cierres para todos ({rows.filter(r => !(db.cierres||[]).find(c => c.empId===r.e.id && c.mes===filterMonth) && r.days>0).length} pendientes)
          </button>
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
                        <span className={`badge ${cierre.estado==='firmado'?'badge-green':'badge-orange'}`}>
                          {cierre.estado === 'firmado' ? '✓ Firmado' : '⏳ Pendiente firma'}
                        </span>
                        <button className="btn btn-secondary btn-sm" onClick={() => downloadCierrePDF(cierre, e)}>PDF</button>
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
            <thead><tr><th>Empleado</th><th>Días</th><th>Total mes</th><th>Contratadas</th><th>Diferencia</th><th>Vac. disp.</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ e, totalMin, diff, days, vac, expected, weeklyH }) => (
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
                  <td style={{ color:'var(--text3)' }}>{mhm(expected)}<span style={{ fontSize:10, marginLeft:4, opacity:.7 }}>({weeklyH}h/sem)</span></td>
                  <td style={{ fontWeight:700, color: diff >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {diff >= 0 ? '+' : ''}{mhm(Math.abs(diff))}
                  </td>
                  <td>{vac.available}d</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" title="Descargar PDF nómina" onClick={() => downloadNominaPDF({ e, totalMin, days })}>
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                      PDF
                    </button>
                  </td>
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
          <div className="dash-widget" style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontSize:14, fontWeight:700 }}>Registro oficial — Inspección de Trabajo</div>
            <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6 }}>
              Formato RDL 8/2019 con todos los empleados, entrada/salida diaria y firmas. Listo para imprimir o guardar como PDF.
            </div>
            <button className="btn btn-secondary" style={{ width:'100%' }} onClick={() => {
              const mesNombre2 = new Date(filterMonth + '-01').toLocaleDateString('es-ES', { month:'long', year:'numeric' })
              const empsActivos = sortedEmps(db).filter(e => !e.baja && !e.isAdmin)
              const empresaNombre = empresa || '—'
              let rowsHtml = ''
              empsActivos.forEach(e => {
                const eRecs = (db.records || []).filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(filterMonth))
                  .sort((a, b) => a.inicio.localeCompare(b.inicio))
                if (!eRecs.length) {
                  rowsHtml += `<tr><td>${esc(e.name)}</td><td colspan="4" style="color:#999;text-align:center">Sin registros este mes</td></tr>`
                  return
                }
                eRecs.forEach((r, i) => {
                  const wm = Math.floor((r.workSecs > 0 ? r.workSecs : Math.max(0, (new Date(r.fin) - new Date(r.inicio))/1000 - (r.breakSecs||0))) / 60)
                  const bm = Math.floor((r.breakSecs||0)/60)
                  const d = new Date(r.inicio)
                  rowsHtml += `<tr>
                    ${i === 0 ? `<td rowspan="${eRecs.length}" style="font-weight:600;vertical-align:top;border-right:2px solid #ddd">${esc(e.name)}</td>` : ''}
                    <td>${d.toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'})}</td>
                    <td>${d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</td>
                    <td>${new Date(r.fin).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</td>
                    <td style="text-align:center">${bm > 0 ? `${Math.floor(bm/60)}h ${p2(bm%60)}m` : '—'}</td>
                    <td style="font-weight:600">${Math.floor(wm/60)}h ${p2(wm%60)}m</td>
                  </tr>`
                })
              })
              printHtml(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Registro de jornada ${mesNombre2} · ${esc(empresaNombre)}</title>
<style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;padding:32px;color:#111;font-size:13px}
h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;color:#555;font-weight:400;margin:0 0 20px}
.meta{display:flex;gap:24px;background:#f8f8f8;padding:12px 16px;border-radius:6px;margin-bottom:20px;font-size:12px}
.meta div span{display:block;color:#888;font-size:11px}
table{width:100%;border-collapse:collapse}th{background:#1a1a2e;color:#fff;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
td{padding:7px 10px;border-bottom:1px solid #eee}tr:hover td{background:#f9fafb}
.sign{margin-top:48px;display:flex;gap:64px}.sign-box{flex:1;border-top:1px solid #999;padding-top:8px;font-size:11px;color:#666}
footer{margin-top:32px;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:10px;display:flex;justify-content:space-between}
@media print{button{display:none}}</style></head><body>
<h1>Registro de control de jornada laboral</h1>
<h2>${esc(empresaNombre)} · ${mesNombre2}</h2>
<div class="meta">
  <div><span>Empresa</span>${esc(empresaNombre)}</div>
  <div><span>Período</span>${mesNombre2}</div>
  <div><span>Generado</span>${new Date().toLocaleDateString('es-ES')}</div>
  <div><span>Empleados</span>${empsActivos.length}</div>
</div>
<table><thead><tr><th>Empleado</th><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Descanso</th><th>Horas netas</th></tr></thead>
<tbody>${rowsHtml}</tbody></table>
<div class="sign">
  <div class="sign-box">Representante legal de la empresa<br><br><br>________________________<br><span style="font-size:10px">${esc(empresaNombre)}</span></div>
  <div class="sign-box">Sello empresa<br><br><br>________________________</div>
</div>
<footer><span>Documento generado por AN-Times · Control horario RDL 8/2019</span><span>${new Date().toLocaleDateString('es-ES')}</span></footer>
</body></html>`)
            }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:6 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Descargar registro oficial PDF
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PANEL OBRAS ──────────────────────────────────────────────────────────────
function PanelObras({ db, toast, saveDB, session }) {
  const { showConfirm } = useAppStore()
  const [tab, setTab] = useState('obras')
  const [newObra, setNewObra] = useState('')
  const [newCentro, setNewCentro] = useState('')
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [expandedObra, setExpandedObra] = useState(null)
  const [geoCapturing, setGeoCapturing] = useState(null)

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
    toast('Obra creada', 3000, 'ok')
  }

  const delObra = (id) => {
    showConfirm('¿Eliminar esta obra?', () => {
      const o = obras.find(x => x.id === id)
      const withAudit = auditLog(db, 'Obra eliminada', o?.nombre || '', who)
      saveDB({ obras: obras.filter(o => o.id !== id), audit: withAudit.audit })
      toast('Obra eliminada')
      if (expandedObra === id) setExpandedObra(null)
    })
  }

  const captureGeo = (obraId) => {
    if (!navigator.geolocation) { toast('GPS no disponible'); return }
    setGeoCapturing(obraId)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGeoCapturing(null)
        const coords = { lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5), acc: Math.round(pos.coords.accuracy) }
        const updated = obras.map(o => o.id === obraId ? { ...o, coords } : o)
        const withAudit = auditLog(db, 'Geofence configurado', obras.find(o => o.id === obraId)?.nombre || '', who)
        saveDB({ obras: updated, audit: withAudit.audit })
        toast('📍 Ubicación GPS guardada', 3000, 'ok')
      },
      () => { setGeoCapturing(null); toast('No se pudo obtener GPS', 3000, 'err') },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const setRadio = (obraId, radio) => {
    const updated = obras.map(o => o.id === obraId ? { ...o, radio: Number(radio) } : o)
    saveDB({ obras: updated })
  }

  const setGpsRequired = (obraId, required) => {
    const updated = obras.map(o => o.id === obraId ? { ...o, gpsRequired: required } : o)
    saveDB({ obras: updated })
  }

  const clearGeo = (obraId) => {
    showConfirm('¿Quitar la geovalla de esta obra?', () => {
      const updated = obras.map(o => o.id === obraId ? { ...o, coords: undefined, radio: undefined } : o)
      saveDB({ obras: updated })
      toast('Geovalla eliminada')
    })
  }

  const addCentro = () => {
    const n = newCentro.trim()
    if (!n) { toast('Escribe un nombre'); return }
    if (centros.includes(n)) { toast('Ya existe'); return }
    const withAudit = auditLog(db, 'Centro de trabajo añadido', n, who)
    saveDB({ centrosTrabajo: [...centros, n], audit: withAudit.audit })
    setNewCentro('')
    toast('Centro añadido', 3000, 'ok')
  }

  const delCentro = (c) => {
    showConfirm(`¿Eliminar "${c}"?`, () => {
      const withAudit = auditLog(db, 'Centro de trabajo eliminado', c, who)
      saveDB({ centrosTrabajo: centros.filter(x => x !== c), audit: withAudit.audit })
      toast('Centro eliminado')
    })
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
              <div key={o.id} className="card-lift" style={{ background:'var(--bg-700)', borderRadius:'var(--r-lg)', border:`1px solid ${expandedObra===o.id ? 'var(--border2)' : 'var(--border)'}`, padding:'14px 16px', transition:'border-color .15s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:'var(--primary-dim)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--primary-light)" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{o.nombre}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3, flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, color:'var(--text3)' }}>{(db.records||[]).filter(r=>r.centro===o.nombre&&r.fin).length} fichajes · {o.createdAt}</span>
                      <span className={`geo-badge ${o.coords ? 'active' : 'none'}`}>
                        {o.coords ? `📍 ${o.radio||200}m` : '📍 Sin geovalla'}
                      </span>
                    </div>
                  </div>
                  <span className={`badge ${o.estado==='activa'?'badge-green':'badge-gray'}`}>{o.estado}</span>
                  <button
                    className={`btn btn-sm ${expandedObra===o.id ? 'btn-secondary' : 'btn-ghost'}`}
                    onClick={() => setExpandedObra(expandedObra===o.id ? null : o.id)}
                    title="Configurar geovalla"
                    style={{ fontSize:13, padding:'4px 10px' }}
                  >⚙️</button>
                  <button className="btn btn-sm btn-danger" onClick={() => delObra(o.id)}>✕</button>
                </div>

                {expandedObra === o.id && (
                  <div className="obra-geo-panel">
                    <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:'var(--text3)', marginBottom:2 }}>Geovalla GPS</div>
                    {o.coords ? (
                      <div className="obra-geo-coords">
                        <span>📍 {o.coords.lat}, {o.coords.lng} · ±{o.coords.acc||'?'}m</span>
                        <a href={`https://www.openstreetmap.org/?mlat=${o.coords.lat}&mlon=${o.coords.lng}&zoom=17`} target="_blank" rel="noopener noreferrer" style={{ color:'var(--primary-light)', fontSize:11, textDecoration:'none' }}>Ver mapa ↗</a>
                      </div>
                    ) : (
                      <div style={{ fontSize:12, color:'var(--text4)', padding:'8px 12px', background:'var(--bg-800)', borderRadius:8, border:'1px solid var(--border)' }}>
                        Sin ubicación GPS. Pulsa "Fijar GPS" estando en la obra.
                      </div>
                    )}
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:11, color:'var(--text3)', fontWeight:600 }}>Radio:</span>
                        <select
                          value={o.radio || 200}
                          onChange={e => setRadio(o.id, e.target.value)}
                          style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:'auto' }}
                        >
                          <option value={50}>50 m</option>
                          <option value={100}>100 m</option>
                          <option value={200}>200 m</option>
                          <option value={300}>300 m</option>
                          <option value={500}>500 m</option>
                          <option value={1000}>1 km</option>
                        </select>
                      </div>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => captureGeo(o.id)}
                        disabled={geoCapturing === o.id}
                        style={{ flex:1 }}
                      >
                        {geoCapturing === o.id ? '⌛ Obteniendo GPS…' : '📍 Fijar GPS aquí'}
                      </button>
                      {o.coords && (
                        <button className="btn btn-sm btn-danger" onClick={() => clearGeo(o.id)}>Quitar</button>
                      )}
                    </div>
                    <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'6px 0' }}>
                      <input
                        type="checkbox"
                        checked={o.gpsRequired || false}
                        onChange={e => setGpsRequired(o.id, e.target.checked)}
                        style={{ width:15, height:15, accentColor:'var(--primary)', cursor:'pointer' }}
                      />
                      <span style={{ fontSize:12, fontWeight:600, color:'var(--text2)' }}>GPS obligatorio para fichar</span>
                      {o.gpsRequired && <span style={{ fontSize:10, fontWeight:700, color:'var(--red)', background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)', borderRadius:10, padding:'1px 6px' }}>ACTIVO</span>}
                    </label>
                    <div style={{ fontSize:10, color:'var(--text4)', lineHeight:1.5 }}>
                      {o.gpsRequired
                        ? 'Los empleados no podrán fichar sin ubicación GPS activa.'
                        : 'Si el empleado ficha fuera del radio definido, recibirá un aviso de ubicación.'}
                    </div>
                  </div>
                )}
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
  const { showConfirm } = useAppStore()
  const emps = (db.employees||[]).filter(e => !e.baja)
  const docs = db.documentos || []
  const who = session?.user?.name || 'Admin'
  const [showForm, setShowForm] = useState(false)
  const [tab, setTab] = useState('todos')
  const [viewing, setViewing] = useState(null)
  const viewingPushed = useRef(false)
  useEffect(() => {
    if (!viewing) {
      if (viewingPushed.current) { viewingPushed.current = false; window.history.back() }
      return
    }
    window.history.pushState({ timesModal: true }, '')
    viewingPushed.current = true
    const onPop = () => { if (!viewingPushed.current) return; viewingPushed.current = false; setViewing(null) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [viewing])
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
    queuePush(form.empId, noti.action, noti.detail, 'times-doc', '/?go=emp:documentos')
    toast('Documento enviado al empleado', 3000, 'ok')
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
    queuePush(empId, noti.action, noti.detail, 'times-doc', '/?go=emp:documentos')
    toast('Jornada enviada para firma', 3000, 'ok')
  }

  const del = (id) => {
    showConfirm('¿Eliminar este documento?', () => {
      const doc = docs.find(d => d.id === id)
      const withAudit = auditLog(db, 'Documento eliminado', doc?.titulo || '', who)
      saveDB({ documentos: docs.filter(d => d.id !== id), audit: withAudit.audit })
      toast('Documento eliminado')
    })
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
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
              <button onClick={() => setViewing(null)} style={{ background:'var(--bg-500)', border:'1px solid var(--border)', color:'var(--text2)', width:32, height:32, borderRadius:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <h2 style={{ margin:0, fontSize:16, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{viewing.titulo}</h2>
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
  const { showConfirm } = useAppStore()
  const enc = session.user
  const misCentros = enc?.obrasAsignadas || []
  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin && (misCentros.includes(e.centroTrabajo) || (e.obrasAsignadas || []).some(o => misCentros.includes(o))))
  const empIds = new Set(emps.map(e => e.id))
  const recs = db.records || []
  const liveRecs = recs.filter(r => !r.fin && empIds.has(r.empId))
  const pendRecs = recs.filter(r => r.fin && empIds.has(r.empId) && !r.aceptada)
    .sort((a,b) => b.inicio.localeCompare(a.inicio)).slice(0, 50)
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
    if (rec) queuePush(rec.empId, '✏️ Jornada modificada', `${enc.name} ha modificado tu jornada del ${fds(editing.inicio)}.`, 'jornada', '/?tab=jornada')
    toast('Jornada modificada', 3000, 'ok')
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
            <div className="modal-btns">
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn btn-primary"   onClick={saveEdit}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PANEL MENSAJES ───────────────────────────────────────────────────────────
function PanelMensajes({ db, toast, saveDB, session }) {
  const [selEmpId, setSelEmpId] = useState(null)
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
  const chats = db.chats || []
  const adminId = 'admin'

  const getConv = empId => chats
    .filter(m => (m.from === empId && m.to === adminId) || (m.from === adminId && m.to === empId))
    .sort((a, b) => a.ts - b.ts)

  const unreadFor = empId => chats.filter(m => m.from === empId && m.to === adminId && !m.leido).length

  const selEmp = emps.find(e => e.id === selEmpId)
  const conv = selEmpId ? getConv(selEmpId) : []

  useEffect(() => {
    if (!selEmpId) return
    // Marcar mensajes del empleado como leídos
    const hasUnread = chats.some(m => m.from === selEmpId && m.to === adminId && !m.leido)
    if (hasUnread) {
      saveDB({ chats: chats.map(m => m.from === selEmpId && m.to === adminId ? { ...m, leido: true } : m) })
    }
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 50)
  }, [selEmpId, chats.length])

  const send = () => {
    const t = text.trim()
    if (!t || !selEmpId) return
    const msg = { id: gid(), from: adminId, to: selEmpId, text: t, ts: Date.now(), leido: false }
    saveDB({ chats: [...chats, msg] })
    queuePush(selEmpId, `Mensaje de ${session?.user?.name || 'Admin'}`, t, 'chat', '/?go=emp:mensajes')
    setText('')
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 50)
  }

  const totalUnread = emps.reduce((s, e) => s + unreadFor(e.id), 0)

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Mensajes</h1>
          <div className="adm-panel-sub">{totalUnread > 0 ? `${totalUnread} sin leer` : 'Chat interno con empleados'}</div>
        </div>
      </div>

      <div style={{ display:'flex', gap:14, height:'calc(100vh - 200px)', minHeight:400 }}>
        {/* Lista empleados */}
        <div style={{ width:200, flexShrink:0, display:'flex', flexDirection:'column', gap:6 }}>
          {emps.map(e => {
            const conv2 = getConv(e.id)
            const last  = conv2[conv2.length - 1]
            const unr   = unreadFor(e.id)
            return (
              <button key={e.id} onClick={() => setSelEmpId(e.id)}
                style={{ display:'flex', gap:10, alignItems:'center', padding:'10px 12px',
                  background: selEmpId === e.id ? 'var(--primary-dim)' : 'var(--bg-700)',
                  border: `1px solid ${selEmpId === e.id ? 'var(--primary-glow)' : 'var(--border)'}`,
                  borderRadius:'var(--r)', cursor:'pointer', fontFamily:'inherit', textAlign:'left', width:'100%' }}>
                <div style={{ width:32, height:32, borderRadius:'50%', background: e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0, position:'relative' }}>
                  {(e.initials||e.name.slice(0,2)).toUpperCase()}
                  {unr > 0 && <span style={{ position:'absolute', top:-4, right:-4, minWidth:14, height:14, borderRadius:7, background:'var(--danger)', color:'#fff', fontSize:8, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 2px' }}>{unr}</span>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name.split(' ')[0]}</div>
                  {last && <div style={{ fontSize:10, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{last.from === adminId ? 'Tú: ' : ''}{last.text}</div>}
                </div>
              </button>
            )
          })}
          {!emps.length && <div style={{ fontSize:12, color:'var(--text3)', padding:12 }}>Sin empleados</div>}
        </div>

        {/* Conversación */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
          {!selEmpId ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10, color:'var(--text3)' }}>
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <div style={{ fontSize:13 }}>Selecciona un empleado</div>
            </div>
          ) : (
            <>
              {/* Cabecera */}
              <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:'50%', background: selEmp?.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff' }}>
                  {(selEmp?.initials||selEmp?.name.slice(0,2)||'?').toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{selEmp?.name}</div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>{selEmp?.empresa}</div>
                </div>
              </div>

              {/* Mensajes */}
              <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ flex:1 }} />
                {!conv.length && <div style={{ textAlign:'center', fontSize:12, color:'var(--text3)' }}>Sin mensajes. Escribe el primero.</div>}
                {conv.map(m => {
                  const isAdmin = m.from === adminId
                  return (
                    <div key={m.id} style={{ display:'flex', justifyContent: isAdmin ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth:'75%', padding:'8px 12px', borderRadius: isAdmin ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: isAdmin ? 'var(--primary)' : 'var(--bg-500)',
                        border: isAdmin ? 'none' : '1px solid var(--border)',
                        fontSize:13, color: isAdmin ? '#fff' : 'var(--text)' }}>
                        {m.text}
                        <div style={{ fontSize:10, marginTop:4, opacity:.65, textAlign:'right' }}>{new Date(m.ts).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:8 }}>
                <input value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
                  placeholder="Escribe un mensaje…"
                  style={{ flex:1, padding:'10px 14px', borderRadius:22, border:'1px solid var(--border)', background:'var(--bg-500)', color:'var(--text)', fontSize:13, fontFamily:'inherit' }} />
                <button onClick={send} disabled={!text.trim()}
                  style={{ width:40, height:40, borderRadius:'50%', background:'var(--primary)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, opacity: text.trim() ? 1 : .4 }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── PANEL AUDITORÍA ──────────────────────────────────────────────────────────
function PanelAuditoria({ db }) {
  const [auditQ, setAuditQ] = useState('')
  const [auditUser, setAuditUser] = useState('')
  const audit = (db.audit || []).slice().reverse()
  const users = [...new Set(audit.map(a => a.user).filter(Boolean))]

  const exportAuditCSV = () => {
    const headers = ['Fecha','Hora','Acción','Usuario','Detalle']
    const rows = filtered.map(a => {
      const d = a.ts ? new Date(a.ts) : null
      return [
        d ? d.toLocaleDateString('es-ES') : '',
        d ? d.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' }) : '',
        a.action || '',
        a.user || '',
        a.detail || ''
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type:'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `auditoria_${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  const ACTION_COLORS = {
    'Jornada': 'var(--green)', 'Empleado': 'var(--primary-light)', 'Obra': 'var(--teal)',
    'Documento': 'var(--orange)', 'Solicitud': 'var(--accent)', 'Centro': 'var(--secondary)',
    'PIN': 'var(--red)', 'correccion': 'var(--yellow)',
  }
  const getColor = (action) => {
    for (const [k, v] of Object.entries(ACTION_COLORS)) if (action?.toLowerCase().includes(k.toLowerCase())) return v
    return 'var(--text3)'
  }
  const filtered = audit.filter(a => {
    if (auditQ) {
      const q = auditQ.toLowerCase()
      if (!a.action?.toLowerCase().includes(q) && !a.detail?.toLowerCase().includes(q)) return false
    }
    if (auditUser && a.user !== auditUser) return false
    return true
  })
  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Auditoría</h1>
          <div className="adm-panel-sub" style={{ marginTop:2 }}>{filtered.length} de {audit.length} registros</div>
        </div>
        <button onClick={exportAuditCSV} className="btn btn-secondary btn-sm" disabled={!filtered.length} style={{ display:'flex', alignItems:'center', gap:5 }}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          CSV
        </button>
      </div>
      <div className="premium-filters" style={{ marginBottom:16 }}>
        <input placeholder="Buscar acción o detalle…" value={auditQ} onChange={e => setAuditQ(e.target.value)} style={{ flex:1, minWidth:160 }} />
        <select value={auditUser} onChange={e => setAuditUser(e.target.value)}>
          <option value="">Todos los usuarios</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        {(auditQ || auditUser) && (
          <button onClick={() => { setAuditQ(''); setAuditUser('') }} className="btn btn-secondary" style={{ fontSize:12 }}>Limpiar</button>
        )}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
        {!filtered.length && (
          <div className="empty-premium">
            <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div>
            <div className="empty-premium-title">{audit.length ? 'Sin resultados' : 'Sin registros'}</div>
            <div className="empty-premium-sub">{audit.length ? 'Prueba con otros filtros' : 'Las acciones del sistema se registrarán aquí automáticamente'}</div>
          </div>
        )}
        {filtered.map((a, i) => (
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

// ─── PANEL AJUSTES ────────────────────────────────────────────────────────────
const COLOR_PRESETS = ['#6C63FF','#2563EB','#7c3aed','#0891b2','#059669','#dc2626','#d97706','#db2777']

function PanelAjustes({ db, toast, saveDB, session }) {
  const cfg = db.config || {}
  const [primaryColor, setPrimaryColor] = useState(cfg.primaryColor || '#6C63FF')
  const [companyName,  setCompanyName]  = useState(cfg.companyName  || db.empresas?.[0] || '')
  const [wdHoras, setWdHoras] = useState(cfg.wdMin ? String(Math.round(cfg.wdMin / 60 * 100) / 100) : '8')
  const [wkHoras, setWkHoras] = useState(cfg.wkMin ? String(Math.round(cfg.wkMin / 60 * 100) / 100) : '40')
  const [festivosExtra, setFestivosExtra] = useState(cfg.festivosExtra || {})
  const [usarFestivosMadrid, setUsarFestivosMadrid] = useState(cfg.usarFestivosMadrid !== false)
  const [newFestivoFecha, setNewFestivoFecha] = useState('')
  const [newFestivoNombre, setNewFestivoNombre] = useState('')
  const [saving, setSaving] = useState(false)
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
    setSaving(true)
    const wdMin = Math.round(parseFloat(wdHoras || '8') * 60) || 480
    const wkMin = Math.round(parseFloat(wkHoras || '40') * 60) || 2400
    const config = { ...cfg, primaryColor, companyName, wdMin, wkMin, festivosExtra, usarFestivosMadrid }
    const withAudit = auditLog(db, 'Configuración guardada', companyName || 'Ajustes', session?.user?.name || 'Admin')
    saveDB({ config, audit: withAudit.audit })
    toast('Ajustes guardados', 3000, 'ok')
    setSaving(false)
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
          <div className="dash-widget-title">🏢 Empresa</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14, marginTop:4 }}>
          <div>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>Nombre visible en la app</div>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder={db.empresas?.[0] || 'Nombre de empresa'}
              style={{ width:'100%', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'10px 14px', fontSize:14, boxSizing:'border-box' }} />
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

// ─── PANEL VALIDAR HORAS (Jefe de Obra) ──────────────────────────────────────
function PanelValidarHoras({ db, toast, saveDB, session }) {
  const now = new Date()
  const [selMonth, setSelMonth] = useState(`${now.getFullYear()}-${p2(now.getMonth()+1)}`)

  const joObras = session?.user?.obrasAsignadas || []
  const recs = db.records || []

  const emps = (db.employees || []).filter(e =>
    !e.baja && !e.isAdmin && e.obrasAsignadas?.some(o => joObras.includes(o))
  )

  const rows = emps.map(e => {
    const eRecs = recs.filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(selMonth))
    const totalMin = eRecs.reduce((s, r) => s + calcMin(r), 0)
    const days = new Set(eRecs.map(r => r.inicio?.slice(0, 10)).filter(Boolean)).size
    const weeklyH = e.horasSemanales || (WK / 60)  // siempre en horas
    const expected = Math.round((weeklyH / 5) * days * 60)
    const diff = totalMin - expected
    return { e, totalMin, days, diff }
  })

  const printHtml = (html) => {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;opacity:0'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument || iframe.contentWindow.document
    doc.open(); doc.write(html); doc.close()
    setTimeout(() => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print() } catch {}
      setTimeout(() => { try { document.body.removeChild(iframe) } catch {} }, 4000)
    }, 350)
  }

  const generarCierreJO = (e, totalMin, days) => {
    const eRecs = recs.filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(selMonth))
    const cierre = {
      id: gid(), empId: e.id, empName: e.name, mes: selMonth,
      generadoPor: session?.user?.name || 'Jefe de Obra',
      generadoAt: new Date().toISOString(),
      totalMin, dias: days, estado: 'pendiente', firma: null,
      records_snapshot: eRecs.map(r => ({ inicio:r.inicio, fin:r.fin, centro:r.centro, workSecs:r.workSecs||0 }))
    }
    saveDB({ cierres: [...(db.cierres||[]), cierre] })
    const mesLabel = new Date(selMonth+'-01').toLocaleDateString('es-ES',{month:'long',year:'numeric'})
    queuePush(e.id, '📋 Cierre mensual pendiente', `Tu resumen de ${mesLabel} está listo para firmar.`, 'cierre', '/?go=emp:perfil')
    toast(`✅ Cierre enviado a ${e.name}`)
  }

  const generarTodosJO = () => {
    const nuevos = []
    rows.forEach(({ e, totalMin, days }) => {
      if ((db.cierres||[]).find(c => c.empId === e.id && c.mes === selMonth)) return
      if (!days) return
      const eRecs = recs.filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(selMonth))
      nuevos.push({
        id: gid(), empId: e.id, empName: e.name, mes: selMonth,
        generadoPor: session?.user?.name || 'Jefe de Obra',
        generadoAt: new Date().toISOString(),
        totalMin, dias: days, estado: 'pendiente', firma: null,
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

  const downloadCierrePDF = (cierre) => {
    const mes = new Date(cierre.mes + '-01').toLocaleDateString('es-ES', { month:'long', year:'numeric' })
    const rowsHtml = (cierre.records_snapshot || []).map(r => {
      const m = Math.floor((r.workSecs||0)/60)
      const d = new Date(r.inicio)
      return `<tr><td>${d.toLocaleDateString('es-ES')}</td><td>${esc(r.centro||'—')}</td><td>${d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</td><td>${mhm(m)}</td></tr>`
    }).join('')
    printHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cierre ${mes} · ${esc(cierre.empName)}</title>
<style>body{font-family:Arial,sans-serif;padding:32px;color:#111;max-width:700px;margin:0 auto}h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;color:#555;font-weight:400;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#f0f0f0;padding:8px 12px;text-align:left;border-bottom:2px solid #ccc}td{padding:8px 12px;border-bottom:1px solid #eee}.total{font-weight:700;font-size:15px;margin-top:16px}.sign-box{margin-top:40px;display:flex;gap:60px}.sign-line{flex:1;border-top:1px solid #888;padding-top:6px;font-size:12px;color:#555}@media print{body{padding:20px}}</style>
</head><body>
<h1>Cierre de jornada mensual · ${mes}</h1>
<h2>${esc(cierre.empName)} · Generado el ${new Date(cierre.generadoAt).toLocaleDateString('es-ES')}</h2>
<table><thead><tr><th>Fecha</th><th>Centro</th><th>Entrada</th><th>Horas</th></tr></thead><tbody>${rowsHtml}</tbody></table>
<div class="total">Total: ${mhm(cierre.totalMin)} · ${cierre.dias} día(s) trabajado(s)</div>
${cierre.firma ? `<div style="margin-top:24px"><b>Firmado digitalmente</b> por ${esc(cierre.empName)} · ${new Date(cierre.firma.firmadoAt).toLocaleString('es-ES')}<br><img src="${cierre.firma.signatureData}" style="height:60px;margin-top:8px;border:1px solid #ccc;border-radius:4px"></div>` : ''}
<div class="sign-box"><div class="sign-line">Firma empleado</div><div class="sign-line">Firma jefe de obra</div></div>
</body></html>`)
  }

  const pendientes = rows.filter(r => !(db.cierres||[]).find(c => c.empId===r.e.id && c.mes===selMonth) && r.days>0).length
  const mesLabel = new Date(selMonth+'-01').toLocaleDateString('es-ES', { month:'long', year:'numeric' })
  const firmados = (db.cierres||[]).filter(c => c.estado==='firmado' && emps.some(e => e.id===c.empId))

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Validar Horas</h1>
          <div className="adm-panel-sub" style={{ marginTop:2, textTransform:'capitalize' }}>{mesLabel}</div>
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
        <input type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)}
          style={{ width:'auto', padding:'7px 12px', fontSize:13, borderRadius:8 }} />
      </div>

      {!joObras.length ? (
        <div className="empty">No tienes obras asignadas. Contacta con el administrador.</div>
      ) : (
        <>
          <div style={{ fontSize:12, color:'var(--text3)', marginBottom:16, padding:'12px 14px', background:'var(--primary-dim)', borderRadius:'var(--r)', border:'1px solid var(--primary-glow)', lineHeight:1.6 }}>
            📋 <strong>Validar horas</strong> — Genera el cierre mensual y envíaselo a tus empleados para firma digital. Obras: <strong>{joObras.join(', ')}</strong>
          </div>

          <button className="btn btn-primary" style={{ width:'100%', marginBottom:16 }} onClick={generarTodosJO} disabled={!pendientes}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:6 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Enviar cierre a todos ({pendientes} pendientes)
          </button>

          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {rows.map(({ e, totalMin, days, diff }) => {
              const cierre = (db.cierres||[]).find(c => c.empId === e.id && c.mes === selMonth)
              return (
                <div key={e.id} className="card" style={{ display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:40, height:40, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>
                    {(e.initials||e.name.slice(0,2)).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{e.name}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                      {days} días · {mhm(totalMin)}
                      {days > 0 && <span style={{ color: diff>=0?'var(--green)':'var(--red)', marginLeft:4 }}>{diff>=0?'+':''}{mhm(Math.abs(diff))}</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                    {cierre ? (
                      <>
                        <span className={`badge ${cierre.estado==='firmado'?'badge-green':'badge-orange'}`}>
                          {cierre.estado === 'firmado' ? '✓ Firmado' : '⏳ Pendiente'}
                        </span>
                        <button className="btn btn-secondary btn-sm" onClick={() => downloadCierrePDF(cierre)}>PDF</button>
                      </>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => generarCierreJO(e, totalMin, days)} disabled={!days}>
                        Enviar cierre
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {!rows.length && <div className="empty">Sin empleados activos en tus obras para este mes</div>}
          </div>

          {firmados.length > 0 && (
            <div style={{ marginTop:28 }}>
              <div className="adm-section-title" style={{ marginBottom:12 }}>Cierres firmados</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {firmados.sort((a,b) => b.mes.localeCompare(a.mes)).slice(0,20).map(c => (
                  <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)' }}>
                    <div style={{ fontSize:18 }}>✅</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{c.empName} · {c.mes}</div>
                      <div style={{ fontSize:11, color:'var(--text3)' }}>Firmado {new Date(c.firma?.firmadoAt).toLocaleDateString('es-ES')} · {mhm(c.totalMin)}</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => downloadCierrePDF(c)}>PDF</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
