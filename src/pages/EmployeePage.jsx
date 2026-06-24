import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAppStore } from '../store/appStore.js'
import { useTimer } from '../hooks/useTimer.js'
import { today, s2t, mhm, p2, ftime, fds, calcSecs, calcMin, gid, vacData, wkStart, recWorkSecs, sortedEmps, monthlyExtras } from '../utils/time.js'
import { WD, WK, FESTIVOS_MADRID_2026, VAPID_PUB } from '../config/constants.js'
import { auditLog, pushSubscribe, queuePush } from '../services/dataService.js'
import { DocPreview } from '../components/DocPreview.jsx'
import { PWAInstall } from '../components/PWAInstall.jsx'
import { makePrintableSignature, stampSignatureOnPdf, stampSignatureOnImage } from '../utils/pdfSign.js'
import { startedInHorizontalScroller } from '../utils/gesture.js'
import { useModalBack } from '../hooks/useModalBack.js'
import { checkPlatformAuth, hasBiometric, registerBiometric, isBioOfferDismissed, dismissBioOffer, applyBrandColor } from '../utils/webauthn.js'

// ─── HOOK: reloj en vivo (aislado para no re-renderizar el componente padre) ──
function useClock() {
  const [clockTime, setClockTime] = useState('')
  const [clockDate, setClockDate] = useState('')
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
  return { clockTime, clockDate }
}

function TopbarClock() {
  const { clockTime, clockDate } = useClock()
  const lastSyncTime = useAppStore(s => s.lastSyncTime)
  const syncStatus = useAppStore(s => s.syncStatus)
  const [, force] = useState(0)
  // Re-render cada minuto para refrescar "hace X min"
  useEffect(() => { const id = setInterval(() => force(t => t + 1), 60000); return () => clearInterval(id) }, [])

  const syncLabel = (() => {
    if (syncStatus === 'syncing') return 'sincronizando…'
    if (syncStatus === 'error') return 'sin conexión'
    if (!lastSyncTime) return null
    const m = Math.floor((Date.now() - lastSyncTime) / 60000)
    if (m < 1) return 'sincronizado ahora'
    if (m < 60) return `hace ${m} min`
    const h = Math.floor(m / 60)
    if (h < 24) return `hace ${h} h`
    return `hace ${Math.floor(h / 24)} d`
  })()

  return (
    <div className="emp-subdate">
      {clockDate} · <span style={{ color:'var(--primary-light)', fontWeight:600 }}>{clockTime}</span>
      {syncLabel && <span style={{ marginLeft:6, color: syncStatus === 'error' ? 'var(--danger)' : 'var(--text4)', fontSize:10 }}>· {syncLabel}</span>}
    </div>
  )
}

// ─── HOOK REUTILIZABLE: canvas de firma ───────────────────────────────────────
function useSignatureCanvas() {
  const canvasRef  = useRef(null)
  const drawingRef = useRef(false)
  const lastPtRef  = useRef(null)

  const getPos = useCallback((e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const src  = e.touches ? e.touches[0] : e
    return { x: (src.clientX - rect.left) * (canvas.width / rect.width), y: (src.clientY - rect.top) * (canvas.height / rect.height) }
  }, [])

  const handlers = {
    onMouseDown:  useCallback(e => { e.preventDefault(); const c = canvasRef.current; if (!c) return; lastPtRef.current = getPos(e, c); drawingRef.current = true }, [getPos]),
    onMouseMove:  useCallback(e => {
      if (!drawingRef.current) return; e.preventDefault()
      const c = canvasRef.current; if (!c) return
      const ctx = c.getContext('2d'); const pt = getPos(e, c)
      ctx.beginPath(); ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y); ctx.lineTo(pt.x, pt.y)
      ctx.strokeStyle = '#c7d2fe'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke()
      lastPtRef.current = pt
    }, [getPos]),
    onMouseUp:    useCallback(() => { drawingRef.current = false; lastPtRef.current = null }, []),
    onMouseLeave: useCallback(() => { drawingRef.current = false; lastPtRef.current = null }, []),
    onTouchStart: null, onTouchMove: null, onTouchEnd: null,
  }
  handlers.onTouchStart = handlers.onMouseDown
  handlers.onTouchMove  = handlers.onMouseMove
  handlers.onTouchEnd   = handlers.onMouseUp

  const clearCanvas = useCallback(() => {
    const c = canvasRef.current; if (!c) return
    c.getContext('2d').fillStyle = '#0D1218'
    c.getContext('2d').fillRect(0, 0, c.width, c.height)
  }, [])

  const initCanvas = useCallback(() => clearCanvas(), [clearCanvas])

  const getSignatureData = useCallback(() => {
    const c = canvasRef.current; if (!c) return null
    const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    if (!Array.from(pixels).some((v, i) => i % 4 !== 3 && v > 30)) return null
    const small = document.createElement('canvas'); small.width = 320; small.height = 120
    const ctx2 = small.getContext('2d')
    ctx2.fillStyle = '#0D1218'; ctx2.fillRect(0, 0, 320, 120)
    ctx2.drawImage(c, 0, 0, 320, 120)
    return small.toDataURL('image/jpeg', 0.7)
  }, [])

  return { canvasRef, handlers, clearCanvas, initCanvas, getSignatureData }
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2)**2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

export default function EmployeePage() {
  const { db, session, currentEmpTab, setEmpTab, saveDB, logout, toast, showConfirm, setScreen, openModal, closeModal, activeModal, modalData, syncStatus } = useAppStore()
  const timer = useTimer()
  // Derivar siempre desde db.employees para que onboardingDone y otros campos
  // se actualicen reactivamente sin depender del snapshot estático de la sesión.
  const u = useMemo(() => {
    const su = session.user
    if (!su) return null
    return (db.employees || []).find(e => e.id === su.id) || su
  }, [session.user?.id, db.employees])
  const [pendingGPS, setPendingGPS] = useState(null)
  const [gpsStatus, setGpsStatus] = useState('idle') // 'idle' | 'pending' | 'ok' | 'fail'
  const [calMonth, setCalMonth] = useState(new Date())
  const [showConfetti, setShowConfetti] = useState(false)
  // Bug fix: derive from DOM so initial icon matches actual theme (dark=☀️, light=🌙)
  const [isLight, setIsLight] = useState(() => document.documentElement.getAttribute('data-theme') === 'light')
  const dbRef = useRef(db)
  const geoAbortRef = useRef(false)
  useEffect(() => { dbRef.current = db }, [db])

  // ── Notification permission banner (global, all tabs) ─────────────────────────
  const _notifDismissKey = 'an_notif_dismiss_ts'
  const _isNotifDismissed = () => {
    try {
      const ts = parseInt(localStorage.getItem(_notifDismissKey) || '0', 10)
      return ts > 0 && (Date.now() - ts) < 30 * 24 * 60 * 60 * 1000  // 30 days
    } catch { return false }
  }
  const [notifPerm, setNotifPerm] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'granted'
  )
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(_isNotifDismissed)
  const showNotifBanner = notifPerm === 'default' && !notifBannerDismissed

  const handleNotifActivate = async () => {
    try {
      const p = await Notification.requestPermission()
      setNotifPerm(p)
      if (p === 'granted' && u?.id) {
        pushSubscribe(u.id, VAPID_PUB)
        toast('Notificaciones activadas', 3000, 'ok')
      }
    } catch {}
    try { localStorage.setItem(_notifDismissKey, String(Date.now())) } catch {}
    setNotifBannerDismissed(true)
  }
  const handleNotifDismiss = () => {
    try { localStorage.setItem(_notifDismissKey, String(Date.now())) } catch {}
    setNotifBannerDismissed(true)
  }

  // Fast-path: if permission already granted, register subscription immediately
  useEffect(() => {
    if (!u?.id || !('Notification' in window)) return
    if (Notification.permission === 'granted') {
      pushSubscribe(u.id, VAPID_PUB)
    }
    // Keep banner in sync with actual permission (e.g. user granted from browser settings)
    const id = setInterval(() => {
      setNotifPerm(Notification.permission)
    }, 4000)
    return () => clearInterval(id)
  }, [u?.id])

  // Recordatorio de fichaje — verifica cada minuto si hay que notificar
  useEffect(() => {
    if (!u?.reminderTime || !u?.id) return
    const check = () => {
      const now = new Date()
      const [rh, rm] = u.reminderTime.split(':').map(Number)
      if (now.getHours() * 60 + now.getMinutes() < rh * 60 + rm) return
      const todayStr = now.toISOString().slice(0, 10)
      const worked = (dbRef.current?.records || []).some(r => r.empId === u.id && r.inicio?.startsWith(todayStr))
      if (worked) return
      const key = `rem_${u.id}_${todayStr}`
      if (localStorage.getItem(key)) return
      try {
        if (Notification.permission === 'granted') {
          new Notification('⏰ Recuerda fichar', { body: `Son las ${u.reminderTime}. ¿Has iniciado tu jornada?`, icon: '/pwa-192x192.png' })
          localStorage.setItem(key, '1')
        }
      } catch {}
    }
    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [u?.reminderTime, u?.id])

  // Color de acento personal del empleado (override brand color when logged in)
  useEffect(() => {
    if (u?.accentColor) applyBrandColor(u.accentColor)
  }, [u?.accentColor])

  // Live document title: "⏱️ 3h 24m · TIMES INC" while jornada is active
  useEffect(() => {
    const base = 'TIMES INC'
    if (timer.state === 'idle') { document.title = base; return }
    const h = Math.floor(timer.ws / 3600)
    const m = Math.floor((timer.ws % 3600) / 60)
    document.title = `⏱️ ${h}h ${p2(m)}m · ${base}`
    return () => { document.title = base }
  }, [timer.ws, timer.state])

  // Screen Wake Lock: evita que la pantalla se apague mientras hay jornada activa
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock = null
    const acquire = async () => {
      try { lock = await navigator.wakeLock.request('screen') } catch {}
    }
    const release = () => { lock?.release(); lock = null }
    if (timer.state !== 'idle') acquire()
    else release()
    const onVisible = () => { if (document.visibilityState === 'visible' && timer.state !== 'idle') acquire() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { release(); document.removeEventListener('visibilitychange', onVisible) }
  }, [timer.state])


  const empBodyRef = useRef(null)
  const prevTabRef = useRef(currentEmpTab)
  const currentTabRef = useRef(currentEmpTab)
  const TAB_ORDER = ['inicio', 'jornada', 'vacaciones', 'calendario', 'mensajes', 'perfil']
  useEffect(() => {
    const prev = prevTabRef.current
    if (prev !== currentEmpTab && empBodyRef.current) {
      const pi = TAB_ORDER.indexOf(prev), ci = TAB_ORDER.indexOf(currentEmpTab)
      empBodyRef.current.dataset.dir = ci >= pi ? 'right' : 'left'
    }
    prevTabRef.current = currentEmpTab
    currentTabRef.current = currentEmpTab
  }, [currentEmpTab])

  useEffect(() => {
    const el = empBodyRef.current
    if (!el) return
    let sx = 0, sy = 0, st = 0, locked = false
    const onStart = e => {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now()
      // Si el gesto nace dentro de un scroller horizontal, no cambiamos de pantalla
      locked = startedInHorizontalScroller(e.target, el)
    }
    const onEnd = e => {
      if (locked) return
      const dx = e.changedTouches[0].clientX - sx
      const dy = e.changedTouches[0].clientY - sy
      const dt = Date.now() - st
      const vx = Math.abs(dx) / dt
      // Gesto de cambio de pantalla: claramente horizontal (no un scroll lateral
      // accidental ni un scroll vertical). Exigimos dominancia horizontal 2:1.
      const isSwipe = Math.abs(dx) > 45 && (Math.abs(dx) > 70 || vx > 0.45) && Math.abs(dx) > Math.abs(dy) * 2
      if (!isSwipe) return
      const ci = TAB_ORDER.indexOf(currentTabRef.current)
      if (dx < 0 && ci < TAB_ORDER.length - 1) { try { navigator.vibrate(8) } catch {} ; setEmpTab(TAB_ORDER[ci + 1]) }
      else if (dx > 0 && ci > 0) { try { navigator.vibrate(8) } catch {} ; setEmpTab(TAB_ORDER[ci - 1]) }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchend', onEnd)
    }
  }, [setEmpTab])

  // Manejar shortcuts del manifest PWA (?tab=inicio|jornada|vacaciones|calendario|perfil)
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab && ['inicio','jornada','vacaciones','calendario','mensajes','perfil'].includes(tab)) {
      setEmpTab(tab)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    if (!u) return

    // Smart notifications: check every 60s if any reminder should fire
    // Bug fix #8: claves de notificaciones en db.notisSent (sincronizado entre dispositivos)
    const checkSmartNotis = () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      const now = new Date()
      const todayStr = `${now.getFullYear()}-${p2(now.getMonth()+1)}-${p2(now.getDate())}`
      const hh = now.getHours()
      const mm = now.getMinutes()
      const db = dbRef.current
      const notisSent = { ...(db.notisSent || {}) }
      let dirty = false

      const hasSent = (key, val) => val !== undefined ? notisSent[key] === val : !!notisSent[key]
      const markSent = (key, val = '1') => { notisSent[key] = val; dirty = true }

      // Si la app está visible (usuario mirando la pantalla), no enviar push del servidor:
      // bastan los toasts in-app + la campana. Push solo cuando la app está cerrada/en background,
      // evitando notificaciones duplicadas (in-app + push) sobre el mismo evento.
      const appVisible = typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()
      const sendPush = (...args) => { if (!appVisible) queuePush(...args) }

      // Permanent device-local guard for one-time notifications (vacaciones result).
      // Survives realtime overwrites even if Supabase write is delayed.
      const _lsPermKey = '__notisPermV__'
      const _lsPermMap = (() => { try { return JSON.parse(localStorage.getItem(_lsPermKey) || '{}') } catch { return {} } })()
      const isPermSent = (key) => !!_lsPermMap[key]
      const markPermSent = (key) => { _lsPermMap[key] = '1'; try { localStorage.setItem(_lsPermKey, JSON.stringify(_lsPermMap)) } catch {} }

      // Acumulador de notis a añadir a db.notis (para que aparezcan en la campana)
      const bellNotis = []
      const addBell = (action, detail) => {
        bellNotis.push({
          id: 'sn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          empId: u.id, action, detail,
          ts: new Date().toISOString(), leido: false
        })
      }

      // 1. Recordatorio diario de fichaje
      // Dispara una vez al día: desde reminderTime hasta las 23:59 si no se ha fichado.
      // (antes era una ventana de 5min; si la app no estaba abierta justo en esos 5min,
      // la noti se perdía para siempre).
      if (getCfg('notiFichaje', true)) {
        const _empRec = (db.employees || []).find(e => e.id === u.id)
        const [rh, rm] = (_empRec?.reminderTime || getCfg('reminderTime', '20:00')).split(':').map(Number)
        const minsPast = (hh - rh) * 60 + (mm - rm)
        if (minsPast >= 0) {
          const hasFichado = (db.records || []).some(r => r.empId === u.id && r.inicio?.startsWith(todayStr))
          const lastKey = 'an_rem_' + u.id
          if (!hasFichado && !hasSent(lastKey, todayStr)) {
            markSent(lastKey, todayStr)
            const _msgRem = '¿Has fichado hoy? No olvides registrar tu jornada laboral.'
            sendPush(u.id, '⏰ Recordatorio de fichaje', _msgRem, 'reminder-fichar', '/?tab=inicio')
            addBell('⏰ Recordatorio de fichaje', _msgRem)
          }
        }
      }

      // 2. Aviso de jornada larga (7h 45min)
      const openRec = (db.records || []).find(r => r.empId === u.id && !r.fin)
      if (openRec) {
        const elapsed = (Date.now() - new Date(openRec.inicio).getTime()) / 60000
        const warn14h = 'an_warn_14h_' + openRec.id
        if (elapsed >= 465 && elapsed < 475 && !hasSent(warn14h)) {
          markSent(warn14h)
          const _msgLong = 'Llevas más de 7h 45min trabajando. Recuerda fichar la salida.'
          sendPush(u.id, '⏳ Jornada larga', _msgLong, 'jornada', '/')
          addBell('⏳ Jornada larga', _msgLong)
        }
      }

      // 3. Recordatorio de salida olvidada
      // Ventana abierta: desde salidaTime hasta el cierre de jornada
      if (getCfg('notiSalida', true) && openRec) {
        const [sh, sm] = (getCfg('salidaTime', '21:00')).split(':').map(Number)
        const salidaMinsPast = (hh - sh) * 60 + (mm - sm)
        if (salidaMinsPast >= 0) {
          const sKey = 'an_salida_' + openRec.id
          if (!hasSent(sKey)) {
            markSent(sKey)
            const elapsedSalida = Math.floor((Date.now() - new Date(openRec.inicio).getTime()) / 60000)
            const _msgSal = `Llevas ${mhm(elapsedSalida)} con la jornada abierta. ¿Ya has terminado?`
            sendPush(u.id, '🔔 ¿Olvidaste fichar la salida?', _msgSal, 'jornada', '/?tab=inicio')
            addBell('🔔 ¿Olvidaste fichar la salida?', _msgSal)
          }
        }
      }

      // 4. Vacaciones aprobadas/rechazadas (una vez por solicitud, entre dispositivos)
      ;(db.vacaciones || []).filter(v => v.empId === u.id && (v.estado === 'aprobada' || v.estado === 'rechazada')).forEach(v => {
        const key = 'an_vac_res_' + v.id
        if (!hasSent(key) && !isPermSent(key)) {
          markSent(key)
          markPermSent(key)
          if (v.estado === 'aprobada') {
            const _msgVac = `Tu solicitud de ${v.dias} día(s) ha sido aprobada.`
            sendPush(u.id, '🎉 Vacaciones aprobadas', _msgVac, 'vacaciones', '/?go=emp:vacaciones')
            addBell('🎉 Vacaciones aprobadas', _msgVac)
          } else {
            const motivoTxt = v.motivoRechazo ? ` Motivo: ${v.motivoRechazo}` : ''
            const _msgVac = `Tu solicitud de ${v.dias} día(s) ha sido rechazada.${motivoTxt}`
            sendPush(u.id, '❌ Vacaciones rechazadas', _msgVac, 'vacaciones', '/?go=emp:vacaciones')
            addBell('❌ Vacaciones rechazadas', _msgVac)
          }
        }
      })

      // 5. Documentos pendientes de firma (una vez al día a partir de las 9h)
      const pendDocs = (db.documentos || []).filter(d => d.empId === u.id && !d.firma)
      if (pendDocs.length > 0) {
        const key = 'an_docs_' + u.id
        if (!hasSent(key, todayStr) && hh >= 9) {
          markSent(key, todayStr)
          const _msgDoc = `Tienes ${pendDocs.length} documento(s) pendiente(s) de firma.`
          sendPush(u.id, '📄 Documentos pendientes', _msgDoc, 'documentos', '/?go=emp:documentos')
          addBell('📄 Documentos pendientes', _msgDoc)
        }
      }

      // 6. Cierre mensual pendiente (una vez al día a partir de las 9h)
      const pendCierres = (db.cierres || []).filter(c => c.empId === u.id && c.estado === 'pendiente')
      if (pendCierres.length > 0) {
        const key = 'an_cierre_' + u.id
        if (!hasSent(key, todayStr) && hh >= 9) {
          markSent(key, todayStr)
          const _msgCi = `Tienes ${pendCierres.length} resumen${pendCierres.length > 1 ? 'es' : ''} mensual pendiente${pendCierres.length > 1 ? 's' : ''} de firma.`
          sendPush(u.id, '📋 Cierre mensual pendiente', _msgCi, 'cierre', '/?go=emp:perfil')
          addBell('📋 Cierre mensual pendiente', _msgCi)
        }
      }

      // 7. Auto-cierre de jornada olvidada (> 12h sin fichar salida)
      // 7a. Aviso preventivo a las 11h50m (10 min antes del auto-cierre)
      const staleRecs = (db.records || []).filter(r => r.empId === u.id && !r.fin)
      staleRecs.forEach(stale => {
        const elapsedStale = (Date.now() - new Date(stale.inicio).getTime()) / 60000
        if (elapsedStale >= 710 && elapsedStale < 720) {
          const warnKey = 'an_autoclose_warn_' + stale.id
          if (!hasSent(warnKey)) {
            markSent(warnKey)
            sendPush(u.id, '⚠️ Cierre automático en 10 minutos', 'Llevas más de 11h 50m sin fichar salida. Tu jornada se cerrará automáticamente en 10 min.', 'jornada', '/?tab=inicio')
            addBell('⚠️ Cierre automático en 10 minutos', 'Llevas más de 11h 50m sin fichar salida. Tu jornada se cerrará automáticamente en 10 min.')
            toast('Tu jornada se cerrará automáticamente en ~10 minutos', 8000, 'warn')
          }
        }
        if (elapsedStale > 720) {
          const acKey = 'an_autoclose_' + stale.id
          if (!hasSent(acKey)) {
            // Re-read from current db snapshot to avoid double-close race
            const freshRec = dbRef.current.records.find(r => r.id === stale.id)
            if (!freshRec || freshRec.fin) return
            markSent(acKey)
            dirty = false  // guardado junto con records a continuación
            const closeTime = new Date().toISOString()
            const breaks2 = [...(freshRec.breaks || [])]
            const t2 = calcSecs({ ...freshRec, fin: closeTime, breaks: breaks2 })
            const closed2 = { ...freshRec, fin: closeTime, breaks: breaks2, workSecs: t2.work, breakSecs: t2.brk, closed: true, autoClosedAt: closeTime }
            const snapshot = dbRef.current.records
            const updRecs = snapshot.map(r => r.id === freshRec.id ? closed2 : r)
            const dbWithAudit = auditLog(dbRef.current, 'Auto-cierre jornada', `${u.name} · ${freshRec.inicio.slice(0,10)} · ${mhm(Math.floor(t2.work/60))}`, u.name)
            const _msgAc = `Tu jornada del ${freshRec.inicio.slice(0,10)} se cerró por inactividad (${mhm(Math.floor(t2.work/60))}).`
            addBell('⏱️ Jornada cerrada automáticamente', _msgAc)
            const _notisToSave = [...(dbRef.current.notis || []), ...bellNotis]
            bellNotis.length = 0
            saveDB({ records: updRecs, notisSent: { ...(dbRef.current.notisSent || {}), ...notisSent }, audit: dbWithAudit.audit, notis: _notisToSave })
            sendPush(u.id, '⏱️ Jornada cerrada automáticamente', _msgAc, 'jornada', '/?tab=jornada')
          }
        }
      })

      // Batch save: una sola escritura por ciclo. Combina notisSent + bell notis.
      // Merge new keys into current dbRef to avoid stale-snapshot overwrites.
      if (dirty || bellNotis.length) {
        const partial = {}
        if (dirty) partial.notisSent = { ...(dbRef.current.notisSent || {}), ...notisSent }
        if (bellNotis.length) partial.notis = [...(dbRef.current.notis || []), ...bellNotis]
        saveDB(partial)
      }
    }

    const iv = setInterval(checkSmartNotis, 60000)
    // Check immediately (after 5s to let permission settle)
    const t = setTimeout(checkSmartNotis, 5000)
    // También cuando la pestaña vuelva a primer plano (cubre el caso de app cerrada → reabrir tras la hora del recordatorio)
    const onVis = () => { if (document.visibilityState === 'visible') checkSmartNotis() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); clearTimeout(t); document.removeEventListener('visibilitychange', onVis) }
  }, [u?.id])

  // App Badge API — muestra el contador de no leídas en el icono de la app instalada
  useEffect(() => {
    if (!u || !('setAppBadge' in navigator)) return
    const total = (db.notis || []).filter(n => n.empId === u.id && !n.leido).length
    try {
      if (total > 0) navigator.setAppBadge(total)
      else navigator.clearAppBadge()
    } catch {}
  }, [db.notis, u])

  const openRec = () => (db.records || []).find(r => r.empId === u?.id && !r.fin)

  // === TIMER ACTIONS ===
  const doStart = () => {
    if (timer.state !== 'idle') return
    const cs = db.centrosTrabajo || []
    openModal('selCentro', { centros: cs, current: u?.centroTrabajo || '' })
    // Get GPS — geoAbortRef discards the result if modal is closed before it resolves
    geoAbortRef.current = false
    setPendingGPS(null)
    setGpsStatus('pending')
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (geoAbortRef.current) return
          const lat = +pos.coords.latitude.toFixed(5)
          const lng = +pos.coords.longitude.toFixed(5)
          if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0)) {
            setPendingGPS({ lat, lng, acc: Math.round(pos.coords.accuracy), ts: new Date().toISOString() })
            setGpsStatus('ok')
          }
        },
        () => { if (!geoAbortRef.current) setGpsStatus('fail') },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    }
  }

  const confirmarCentro = useCallback((centro) => {
    if (!centro) { toast('Selecciona un centro de trabajo'); return }
    geoAbortRef.current = true
    setGpsStatus('idle')
    closeModal()
    const rec = {
      id: gid(), empId: u.id, empName: u.name, empresa: u.empresa || '',
      centro, inicio: new Date().toISOString(), fin: null,
      workSecs: 0, breakSecs: 0, enDescanso: false, bStartTs: null, breaks: [], closed: false
    }
    if (pendingGPS) rec.locInicio = pendingGPS
    // Geofencing: warn if employee is outside the obra's defined radius
    if (pendingGPS) {
      const obraGeo = (db.obras || []).find(o => o.nombre === centro)
      if (obraGeo?.coords) {
        const dist = haversine(pendingGPS.lat, pendingGPS.lng, obraGeo.coords.lat, obraGeo.coords.lng)
        const radio = obraGeo.radio || 200
        if (dist > radio) {
          rec.geoAlert = { dist, radio, ts: new Date().toISOString() }
          setTimeout(() => toast(`⚠️ Estás a ${dist}m de la obra (radio ${radio}m)`, 6000, 'warn'), 600)
        }
      }
    }
    const newDB = { ...db, records: [...db.records, rec] }
    // Update employee's centroTrabajo
    const emps = newDB.employees.map(e => e.id === u.id ? { ...e, centroTrabajo: centro } : e)
    saveDB({ records: newDB.records, employees: emps })
    try { navigator.vibrate(15) } catch {}
    toast('Jornada iniciada en ' + centro, 3000, 'ok')
  }, [u, db, pendingGPS, closeModal, saveDB, toast])

  const doStop = useCallback(() => {
    const o = openRec()
    if (!o) return
    showConfirm('¿Terminar la jornada ahora?', () => {
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
      try { navigator.vibrate([15, 50, 30]) } catch {}
      toast('Jornada finalizada — ' + mhm(Math.floor(t.work / 60)), 3000, 'ok')
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 2600)
      // Capturar GPS en background y actualizar el registro cuando resuelva
      if (navigator.geolocation) {
        const stopId = closed.id
        navigator.geolocation.getCurrentPosition(
          pos => {
            const locFin = { lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5), ts: new Date().toISOString() }
            const updated = dbRef.current.records.map(r => r.id === stopId ? { ...r, locFin } : r)
            useAppStore.getState().saveDB({ records: updated })
          },
          () => {},
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        )
      }
    })
  }, [db, openRec, saveDB, toast, showConfirm])

  const doBreak = useCallback(() => {
    const o = openRec()
    if (!o) return
    const now = new Date().toISOString()
    let updated
    if (o.enDescanso) {
      const breaks = [...(o.breaks || []), { start: o.bStartTs, end: now }]
      updated = { ...o, breaks, breakSecs: calcSecs({ ...o, breaks }).brk, enDescanso: false, bStartTs: null }
      try { navigator.vibrate(10) } catch {}
      toast('▶️ Descanso finalizado')
    } else {
      updated = { ...o, enDescanso: true, bStartTs: now }
      try { navigator.vibrate(10) } catch {}
      toast('⏸️ Descanso iniciado')
    }
    const records = db.records.map(r => r.id === o.id ? updated : r)
    saveDB({ records })
  }, [db, openRec, saveDB, toast])

  const doLogout = () => {
    showConfirm('¿Cerrar sesión? Si tienes una jornada activa, seguirá registrada.', () => {
      try { navigator.vibrate(20) } catch {}
      logout()
    })
  }

  // Company theme: apply --primary from db config if set
  useEffect(() => {
    const color = db.config?.primaryColor
    if (color) {
      document.documentElement.style.setProperty('--primary', color)
      document.documentElement.style.setProperty('--primary-glow', color + '30')
      document.documentElement.style.setProperty('--primary-dim', color + '22')
    }
    return () => {
      document.documentElement.style.removeProperty('--primary')
      document.documentElement.style.removeProperty('--primary-glow')
      document.documentElement.style.removeProperty('--primary-dim')
    }
  }, [db.config?.primaryColor])

  if (!u) return null

  const initials = useMemo(
    () => u.initials || u.name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?',
    [u.initials, u.name]
  )
  const vac = useMemo(() => vacData(u.id, db), [u.id, db.employees, db.vacaciones])
  const unread = useMemo(() => (db.notis || []).filter(n => n.empId === u?.id && !n.leido).length, [db.notis, u?.id])
  const chatUnread = useMemo(() => (db.chats || []).filter(m => m.from === 'admin' && m.to === u?.id && !m.leido).length, [db.chats, u?.id])

  const greeting = useMemo(() => {
    const h = new Date().getHours()
    const firstName = u.name.split(' ')[0]
    if (h >= 6 && h < 14) return `Buenos días, ${firstName} ☀️`
    if (h >= 14 && h < 21) return `Buenas tardes, ${firstName} 👋`
    return `Buenas noches, ${firstName} 🌙`
  }, [u.name, new Date().getHours()])

  return (
    <div className="screen active" id="sEmp">
      {/* Topbar */}
      <div className="emp-topbar">
        <div className="emp-top-left">
          <div className="emp-avatar" style={{ background: u.color || 'var(--primary)', position:'relative' }}>
            {initials}
            {syncStatus === 'syncing' && <span style={{ position:'absolute', bottom:-2, right:-2, width:8, height:8, borderRadius:'50%', background:'var(--primary-light)', border:'2px solid var(--bg-700)', animation:'pulse 1.2s ease-in-out infinite' }} />}
          </div>
          <div style={{ minWidth:0, overflow:'hidden' }}>
            <div className="emp-greeting">{greeting}</div>
            <TopbarClock />
          </div>
        </div>
        <div className="emp-top-right">
          {(session.isEnc || session.isJO) && (
            <button className="enc-chip" onClick={() => setScreen('admin')}>
              {session.isJO ? '🏗️ Panel' : '⭐ Panel'}
            </button>
          )}
          <button className="theme-toggle-btn" onClick={() => { toggleTheme(); setIsLight(l => !l) }} title="Tema" aria-label="Cambiar tema claro/oscuro">{isLight ? '🌙' : '☀️'}</button>
          <button className="icon-btn ai-btn" onClick={() => openModal('ai')} title="IA" aria-label="Abrir asistente de IA">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/></svg>
          </button>
          <button className="icon-btn" onClick={() => openModal('chat')} style={{ position:'relative' }} aria-label="Chat con administrador">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            {chatUnread > 0 && <span style={{ position:'absolute', top:-4, right:-4, minWidth:16, height:16, borderRadius:8, background:'var(--danger)', color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px', pointerEvents:'none' }} aria-hidden="true">{chatUnread > 9 ? '9+' : chatUnread}</span>}
          </button>
          <button className="icon-btn" onClick={() => openModal('notis')} style={{ position:'relative' }} aria-label={`Notificaciones${unread > 0 ? ` (${unread} sin leer)` : ''}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            {unread > 0 && (
              <span style={{ position:'absolute', top:-4, right:-4, minWidth:16, height:16, borderRadius:8, background:'var(--danger)', color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px', lineHeight:1, pointerEvents:'none' }} aria-hidden="true">{unread > 9 ? '9+' : unread}</span>
            )}
          </button>
          <button className="icon-btn logout-btn" onClick={doLogout} aria-label="Cerrar sesión" title="Cerrar sesión">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>

      <PWAInstall />
      <OfflineBanner />

      {/* Notificaciones push v3 */}
      {showNotifBanner && (
        <div className="v3-notif-banner" style={{ margin:'0', borderRadius:0, borderBottom:'1px solid rgba(37,99,235,.2)', borderTop:'none', borderLeft:'none', borderRight:'none' }}>
          <div className="v3-notif-banner-icon">🔔</div>
          <div className="v3-notif-banner-text">
            <div className="v3-notif-banner-title">Activa las notificaciones</div>
            <div className="v3-notif-banner-sub">Recibe avisos de jornada, documentos y mensajes</div>
          </div>
          <button className="v3-notif-banner-btn" onClick={handleNotifActivate}>Activar</button>
          <button className="v3-notif-banner-close" onClick={handleNotifDismiss} aria-label="Cerrar">×</button>
        </div>
      )}

      {/* Body */}
      <div className="emp-body" ref={empBodyRef}>
        {currentEmpTab === 'inicio' && <TabInicio timer={timer} doStart={doStart} doStop={doStop} doBreak={doBreak} openRec={openRec} db={db} u={u} openModal={openModal} gpsStatus={gpsStatus} session={session} vac={vac} saveDB={saveDB} toast={toast} />}
        {currentEmpTab === 'jornada' && <TabJornada timer={timer} db={db} u={u} toast={toast} saveDB={saveDB} openModal={openModal} closeModal={closeModal} activeModal={activeModal} modalData={modalData} openCorreccion={openModal} />}
        {currentEmpTab === 'vacaciones' && <TabVacaciones db={db} u={u} vac={vac} toast={toast} saveDB={saveDB} />}
        {currentEmpTab === 'calendario' && <TabCalendario db={db} u={u} calMonth={calMonth} setCalMonth={setCalMonth} />}
        {currentEmpTab === 'mensajes' && <TabMensajes db={db} u={u} toast={toast} saveDB={saveDB} />}
        {currentEmpTab === 'perfil' && <TabPerfil u={u} session={session} db={db} saveDB={saveDB} toast={toast} doLogout={doLogout} openModal={openModal} />}
      </div>

      {/* Bottom nav */}
      {(()=> {
        return (
      <div className="emp-nav">
        {[
          { id:'inicio',     label:'Inicio',     icon:<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>, extra:<polyline points="9 22 9 12 15 12 15 22"/> },
          { id:'jornada',    label:'Jornada',    icon:<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>, live: timer.state !== 'idle' },
          { id:'vacaciones', label:'Vac.',        icon:<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><path d="M12 3c0 0 4 4 4 8s-4 8-4 8"/><path d="M12 3c0 0-4 4-4 8s4 8 4 8"/></> },
          { id:'calendario', label:'Calendario', icon:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></> },
          { id:'mensajes',   label:'Mensajes',   icon:<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>, badge: chatUnread },
          { id:'perfil',     label:'Perfil',     icon:<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></> },
        ].map(({ id, label, icon, extra, badge, live }) => (
          <button key={id} type="button" className={`emp-nav-item${currentEmpTab===id?' on':''}`} onClick={() => { try { navigator.vibrate(5) } catch {}; setEmpTab(id) }} aria-current={currentEmpTab===id} aria-label={label}>
            <span style={{ position:'relative', display:'inline-flex' }}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{icon}{extra}</svg>
              {badge > 0 && <span style={{ position:'absolute', top:-4, right:-6, minWidth:14, height:14, borderRadius:7, background:'var(--danger)', color:'#fff', fontSize:8, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 2px' }}>{badge}</span>}
              {live && !badge && <span style={{ position:'absolute', top:-3, right:-4, width:8, height:8, borderRadius:'50%', background:'var(--green)', border:'2px solid var(--bg-800)', animation:'livePing 2s ease-in-out infinite' }} />}
            </span>
            {label}
          </button>
        ))}
      </div>
        )
      })()}

      {/* Modals */}
      <ModalSelCentro visible={activeModal==='selCentro'} data={modalData} onConfirm={confirmarCentro} onClose={closeModal} />
      <ModalNotis visible={activeModal==='notis'} db={db} onClose={closeModal} toast={toast} saveDB={saveDB} u={u} />
      <ModalAI visible={activeModal==='ai'} db={db} u={u} onClose={closeModal} />
      <ModalVacForm visible={activeModal==='vacForm'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalSign visible={activeModal==='sign'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalInfoPersonal visible={activeModal==='infoPersonal'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalDocumentos visible={activeModal==='documentos'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalConfiguracion visible={activeModal==='configuracion'} u={u} db={db} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalCierreSign visible={activeModal==='cierreSign'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalChat visible={activeModal==='chat'} db={db} u={u} onClose={closeModal} saveDB={saveDB} toast={toast} />
      <ModalCorreccion visible={activeModal==='correccion'} data={modalData} db={db} u={u} onClose={closeModal} saveDB={saveDB} toast={toast} />

      {/* Confetti al cerrar jornada */}
      <Confetti visible={showConfetti} />

      {/* Welcome slides: solo si ya completó el onboarding (no bloquear al nuevo empleado) */}
      {u.onboardingDone && <WelcomeSlides />}

      {/* Onboarding: primer login — aparece siempre si no está completado */}
      <OnboardingModal visible={!u.onboardingDone} u={u} db={db} saveDB={saveDB} toast={toast} />
    </div>
  )
}

// ─── OFFLINE BANNER v3 ─────────────────────────────────────────────────────────
function OfflineBanner() {
  const syncStatus = useAppStore(s => s.syncStatus)
  const fetchDB    = useAppStore(s => s.fetchDB)
  const [realOffline, setRealOffline] = useState(() => !navigator.onLine)
  const [lastSync, setLastSync] = useState(null)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    const on  = () => { setRealOffline(false); setLastSync(new Date()) }
    const off = () => setRealOffline(true)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  if (syncStatus !== 'error' && !realOffline) return null

  const handleRetry = async () => {
    if (retrying) return
    setRetrying(true)
    try { await fetchDB() } catch {}
    setRetrying(false)
  }

  const ago = lastSync ? Math.floor((Date.now() - lastSync.getTime()) / 60000) : null

  return (
    <div className="offline-v3">
      <div className="offline-v3-dot" />
      <div className="offline-v3-text">
        <div>{realOffline ? 'Sin conexión' : 'Error de conexión'}</div>
        <div className="offline-v3-sub">
          {realOffline ? 'Los fichajes se guardan localmente' : 'Datos guardados localmente'}
          {ago !== null && ` · Última sync hace ${ago}min`}
        </div>
      </div>
      {!realOffline && (
        <button className="offline-v3-retry" onClick={handleRetry} disabled={retrying}>
          {retrying ? '…' : 'Reintentar'}
        </button>
      )}
    </div>
  )
}

// ─── PULL TO REFRESH ────────────────────────────────────────────────────────────
// iOS PWA: NUNCA aplicar transform al contenedor con overflow:auto — rompe
// -webkit-overflow-scrolling de forma permanente. El scroll vive en .emp-tab
// limpio; el contenido se desplaza con transform en un wrapper INTERIOR,
// manipulado vía .style directo (sin React rerender) para no invalidar el layer.
function PullToRefresh({ children }) {
  const fetchDB = useAppStore(s => s.fetchDB)
  const scrollRef = useRef(null)
  const innerRef = useRef(null)
  const indicatorRef = useRef(null)
  const arrowRef = useRef(null)
  const labelRef = useRef(null)
  const [refreshing, setRefreshing] = useState(false)
  const ptr = useRef({ startY: 0, active: false, dist: 0, refreshing: false })

  useEffect(() => {
    const el = scrollRef.current
    const inner = innerRef.current
    const indicator = indicatorRef.current
    if (!el || !inner) return

    // Guardia: si algún estado quedó colgado de una sesión anterior, lo reseteamos al montar.
    // iOS bug: transform en hijo de overflow-scroll rompe -webkit-overflow-scrolling.
    // Usamos marginTop en su lugar — no afecta al compositing layer del scroll container.
    inner.style.transition = 'none'
    inner.style.marginTop = ''
    if (indicator) indicator.style.opacity = '0'

    const setOffset = (px, animate) => {
      inner.style.transition = animate ? 'margin-top .3s cubic-bezier(.25,.46,.45,.94)' : 'none'
      inner.style.marginTop = px > 0 ? `${px}px` : ''
      if (indicator) indicator.style.opacity = px > 0 ? '1' : '0'
    }

    // Forzar reset si una transición se quedó a medias (p.ej. reload tras SW update)
    const forceReset = () => {
      ptr.current.active = false
      ptr.current.dist = 0
      ptr.current.refreshing = false
      inner.style.transition = 'none'
      inner.style.marginTop = ''
      if (indicator) indicator.style.opacity = '0'
      // Forzar re-evaluación del scroll en iOS (wake up scroll container)
      try { el.scrollTop = el.scrollTop } catch {}
    }

    const setHint = (d) => {
      if (arrowRef.current) arrowRef.current.style.transform = d > 48 ? 'rotate(180deg)' : 'rotate(0deg)'
      if (labelRef.current) labelRef.current.textContent = d > 48 ? 'Suelta para actualizar' : 'Bajar para actualizar'
    }

    const onStart = e => {
      if (ptr.current.refreshing) return
      if (el.scrollTop <= 0) {
        ptr.current.startY = e.touches[0].clientY
        ptr.current.active = true
        ptr.current.dist = 0
      }
    }

    const onMove = e => {
      if (!ptr.current.active || ptr.current.refreshing) return
      const d = e.touches[0].clientY - ptr.current.startY
      if (d > 0) {
        const offset = Math.min(d * 0.45, 80)
        ptr.current.dist = offset
        setOffset(offset, false)
        setHint(offset)
      } else {
        ptr.current.active = false
        ptr.current.dist = 0
        setOffset(0, true)
      }
    }

    const onEnd = async () => {
      const wasActive = ptr.current.active
      const triggered = wasActive && ptr.current.dist > 48 && !ptr.current.refreshing
      ptr.current.active = false
      ptr.current.dist = 0
      if (triggered) {
        ptr.current.refreshing = true
        setRefreshing(true)
        setOffset(50, true)
        try { await fetchDB() } finally {
          ptr.current.refreshing = false
          setRefreshing(false)
          setOffset(0, true)
          // iOS: forzar re-evaluación del scroll tras la animación de retorno
          setTimeout(() => { try { el.scrollTop = el.scrollTop } catch {} }, 350)
        }
      } else {
        setOffset(0, true)
      }
    }

    const onCancel = () => {
      ptr.current.active = false
      ptr.current.dist = 0
      if (!ptr.current.refreshing) setOffset(0, true)
    }

    // Safety nets globales: si vuelvo a la pestaña, o el SW se activa y la app
    // se queda con la transform a medias, forzamos reset.
    const onVisibility = () => { if (document.visibilityState === 'visible') forceReset() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', forceReset)

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', forceReset)
      forceReset()
    }
  }, [fetchDB])

  return (
    <div ref={scrollRef} className="emp-tab active">
      <div ref={indicatorRef} style={{
        position:'absolute', top:0, left:0, right:0, height:50, zIndex:1,
        display:'flex', alignItems:'center', justifyContent:'center', gap:7,
        color:'var(--text3)', fontSize:11, fontWeight:600, pointerEvents:'none',
        opacity:0, transition:'opacity .2s'
      }}>
        {refreshing ? (
          <>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation:'ptr-spin .7s linear infinite', flexShrink:0 }}>
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Actualizando…
          </>
        ) : (
          <>
            <svg ref={arrowRef} viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transition:'transform .25s', flexShrink:0 }}>
              <line x1="12" y1="5" x2="12" y2="19"/>
              <polyline points="19 12 12 19 5 12"/>
            </svg>
            <span ref={labelRef}>Bajar para actualizar</span>
          </>
        )}
      </div>
      <div ref={innerRef}>
        {children}
      </div>
    </div>
  )
}

// ─── TAB INICIO ────────────────────────────────────────────────────────────────
// ─── Utilities for streak and work pattern ────────────────────────────────────
function calcStreak(records, empId, todayDate) {
  const workedDays = new Set(
    (records || [])
      .filter(r => r.empId === empId && r.fin && (r.workSecs || 0) >= 1800)
      .map(r => r.inicio?.slice(0, 10))
      .filter(Boolean)
  )
  let count = 0
  const d = new Date(todayDate)
  if (!workedDays.has(todayDate)) {
    d.setDate(d.getDate() - 1)
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  }
  while (count < 400) {
    const ds = d.toISOString().slice(0, 10)
    if (!workedDays.has(ds)) break
    count++
    d.setDate(d.getDate() - 1)
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  }
  return count
}

function calcWorkPattern(records, empId) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const recs = (records || []).filter(r =>
    r.empId === empId && r.fin && r.inicio &&
    new Date(r.inicio).getTime() > cutoff &&
    (r.workSecs || 0) >= 3600
  )
  if (recs.length < 5) return null
  const entryMins = recs.map(r => { const d = new Date(r.inicio); return d.getHours() * 60 + d.getMinutes() }).sort((a, b) => a - b)
  const avg = Math.round(entryMins.reduce((a, b) => a + b, 0) / entryMins.length)
  const p20 = entryMins[Math.floor(entryMins.length * 0.2)]
  const p80 = entryMins[Math.floor(entryMins.length * 0.8)]
  const fm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return { earlyStr: fm(p20), lateStr: fm(p80), avgMin: avg, sampleSize: recs.length }
}

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100]

function streakLabel(n) {
  if (n === 0) return null
  const next = STREAK_MILESTONES.find(m => m > n)
  return next ? `${next - n} días para el hito 🏆` : '¡Racha épica! 🌟'
}

// ─── WeatherCard ─────────────────────────────────────────────────────────────
function WeatherCard() {
  const [wx, setWx] = useState(null)
  useEffect(() => {
    try { const c = sessionStorage.getItem('wx_v1'); if (c) { const d = JSON.parse(c); if (Date.now() - d.ts < 30*60*1000) { setWx(d); return } } } catch {}
    navigator.geolocation?.getCurrentPosition(({ coords }) => {
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude.toFixed(4)}&longitude=${coords.longitude.toFixed(4)}&current=temperature_2m,weather_code`)
        .then(r => r.json()).then(d => {
          const w = { ...d.current, ts: Date.now() }
          setWx(w)
          try { sessionStorage.setItem('wx_v1', JSON.stringify(w)) } catch {}
        }).catch(() => {})
    }, () => {}, { timeout: 5000 })
  }, [])
  if (!wx) return null
  const c = wx.weather_code ?? 0
  const icon = c === 0 ? '☀️' : c <= 2 ? '⛅' : c <= 3 ? '☁️' : c <= 49 ? '🌫️' : c <= 69 ? '🌧️' : c <= 79 ? '🌨️' : c <= 99 ? '⛈️' : '🌤️'
  const desc = c === 0 ? 'Despejado' : c <= 2 ? 'Poco nublado' : c <= 3 ? 'Nublado' : c <= 49 ? 'Niebla' : c <= 69 ? 'Lluvia' : c <= 79 ? 'Nieve' : c <= 99 ? 'Tormenta' : 'Variable'
  return (
    <div className="v3-weather-pill">
      <span>{icon}</span>
      <span className="v3-weather-temp">{Math.round(wx.temperature_2m)}°C</span>
      <span className="v3-weather-desc">{desc}</span>
    </div>
  )
}

// ─── WorkHeatmap ──────────────────────────────────────────────────────────────
function WorkHeatmap({ records, empId }) {
  const dayMap = useMemo(() => {
    const m = {}
    ;(records || []).filter(r => r.empId === empId && r.fin && r.inicio).forEach(r => {
      const d = r.inicio.slice(0, 10); m[d] = (m[d] || 0) + calcMin(r)
    })
    return m
  }, [records, empId])

  const weeks = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const start = new Date(now)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 14 * 7)
    const result = []
    for (let w = 0; w < 15; w++) {
      const col = []
      for (let d = 0; d < 7; d++) {
        const dt = new Date(start)
        dt.setDate(dt.getDate() + w * 7 + d)
        const ds = dt.toISOString().slice(0, 10)
        col.push({ ds, mins: dayMap[ds] || 0, future: dt > now })
      }
      result.push(col)
    }
    return result
  }, [dayMap])

  const color = (mins, future) => {
    if (future) return 'transparent'
    if (mins === 0) return 'var(--bg-500)'
    if (mins < 120) return 'rgba(37,99,235,.25)'
    if (mins < 300) return 'rgba(37,99,235,.5)'
    if (mins < 450) return 'rgba(37,99,235,.75)'
    return 'rgba(37,99,235,.95)'
  }

  return (
    <div className="v3-heatmap-wrap">
      <div className="v3-heatmap-grid">
        {weeks.map((col, wi) => (
          <div key={wi} className="v3-heatmap-col">
            {col.map(({ ds, mins, future }) => (
              <div key={ds} className="v3-heatmap-cell" style={{ background: color(mins, future) }}
                title={mins > 0 ? `${ds}: ${mhm(mins)}` : ds} />
            ))}
          </div>
        ))}
      </div>
      <div className="v3-heatmap-legend">
        <span>Menos</span>
        {[0, 120, 300, 450, 600].map((m, i) => (
          <div key={i} className="v3-heatmap-cell" style={{ background: color(m, false), width:10, height:10 }} />
        ))}
        <span>Más</span>
      </div>
    </div>
  )
}

// ─── PomodoroWidget ───────────────────────────────────────────────────────────
function PomodoroWidget() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(false)
  const [phase, setPhase] = useState('work')
  const [secs, setSecs] = useState(25 * 60)
  const [count, setCount] = useState(0)
  const WS = 25 * 60, BS = 5 * 60

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      setSecs(s => {
        if (s > 1) return s - 1
        if (phase === 'work') {
          setPhase('break'); setSecs(BS); setCount(c => c + 1)
          try { new Notification('🍅 ¡Pomodoro completado!', { body: '5 min de descanso.' }) } catch {}
        } else {
          setPhase('work'); setSecs(WS)
          try { new Notification('⏱️ ¡Vuelve al trabajo!', { body: 'Empieza el siguiente pomodoro.' }) } catch {}
        }
        try { navigator.vibrate?.([150, 80, 150]) } catch {}
        return s
      })
    }, 1000)
    return () => clearInterval(id)
  }, [active, phase])

  const reset = () => { setActive(false); setPhase('work'); setSecs(WS) }

  if (!open) return (
    <button className="v3-pomodoro-toggle" onClick={() => setOpen(true)}>
      🍅 <span>Modo Pomodoro</span>
    </button>
  )

  const total = phase === 'work' ? WS : BS
  const R = 28, C2PI = 2 * Math.PI * R
  const offset = C2PI * (1 - (total - secs) / total)
  const mm = Math.floor(secs / 60), ss = secs % 60

  return (
    <div className={`v3-pomodoro-card${phase === 'break' ? ' break' : ''}`}>
      <div className="v3-pomodoro-header">
        <span>{phase === 'work' ? '🍅 Trabajo · 25 min' : '☕ Descanso · 5 min'}</span>
        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
          {count > 0 && <span className="v3-pomodoro-count">×{count}</span>}
          <button className="v3-pomodoro-close" onClick={() => { reset(); setOpen(false) }}>×</button>
        </div>
      </div>
      <div className="v3-pomodoro-body">
        <div style={{ position:'relative', width:64, height:64, flexShrink:0 }}>
          <svg viewBox="0 0 64 64" width="64" height="64">
            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--border2)" strokeWidth="4.5" />
            <circle cx="32" cy="32" r={R} fill="none"
              stroke={phase === 'work' ? 'var(--primary)' : 'var(--green)'}
              strokeWidth="4.5" strokeLinecap="round"
              strokeDasharray={C2PI} strokeDashoffset={offset}
              transform="rotate(-90 32 32)" />
          </svg>
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, fontVariantNumeric:'tabular-nums' }}>
            {String(mm).padStart(2,'0')}:{String(ss).padStart(2,'0')}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className={`v3-pomodoro-btn${active ? ' active' : ''}`} onClick={() => setActive(a => !a)}>
            {active ? '⏸' : '▶'}
          </button>
          <button className="v3-pomodoro-reset" onClick={reset} title="Reiniciar">↺</button>
        </div>
      </div>
    </div>
  )
}

// ─── Achievements ─────────────────────────────────────────────────────────────
const ACHIEVEMENTS = [
  { id:'a1', icon:'🌱', title:'Primera jornada', desc:'Primera jornada completada', check:(r)=>r.filter(x=>x.fin).length>=1 },
  { id:'a2', icon:'⚡', title:'Tres en raya', desc:'3 días consecutivos', check:(r,s)=>s>=3 },
  { id:'a3', icon:'🔥', title:'Semana de fuego', desc:'7 días seguidos', check:(r,s)=>s>=7 },
  { id:'a4', icon:'🌟', title:'Mes imparable', desc:'30 días seguidos', check:(r,s)=>s>=30 },
  { id:'a5', icon:'📅', title:'50 jornadas', desc:'50 días trabajados', check:(r)=>new Set(r.filter(x=>x.fin&&x.inicio).map(x=>x.inicio.slice(0,10))).size>=50 },
  { id:'a6', icon:'💯', title:'100 jornadas', desc:'100 días trabajados', check:(r)=>new Set(r.filter(x=>x.fin&&x.inicio).map(x=>x.inicio.slice(0,10))).size>=100 },
  { id:'a7', icon:'🏅', title:'Ultramaratón', desc:'10h en un solo día', check:(r)=>{const m={};r.filter(x=>x.fin&&x.inicio).forEach(x=>{const d=x.inicio.slice(0,10);m[d]=(m[d]||0)+calcMin(x)});return Object.values(m).some(v=>v>=600)} },
  { id:'a8', icon:'💪', title:'Centurión', desc:'100h en un mes', check:(r)=>{const m={};r.filter(x=>x.fin&&x.inicio).forEach(x=>{const k=x.inicio.slice(0,7);m[k]=(m[k]||0)+calcMin(x)});return Object.values(m).some(v=>v>=6000)} },
  { id:'a9', icon:'⏰', title:'Siempre puntual', desc:'5 días antes de las 09:30', check:(r)=>r.filter(x=>{if(!x.fin||!x.inicio)return false;const d=new Date(x.inicio);return d.getHours()*60+d.getMinutes()<=570}).length>=5 },
  { id:'a10', icon:'🌅', title:'Madrugador', desc:'3 veces antes de las 08:00', check:(r)=>r.filter(x=>{if(!x.fin||!x.inicio)return false;const d=new Date(x.inicio);return d.getHours()*60+d.getMinutes()<=480}).length>=3 },
]

function AchievementsSection({ myRecs, streak }) {
  const unlocked = useMemo(() => new Set(ACHIEVEMENTS.filter(a => a.check(myRecs, streak)).map(a => a.id)), [myRecs, streak])
  return (
    <div style={{ margin:'0 16px 16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.6px' }}>Logros</div>
        <div style={{ fontSize:11, color:'var(--text4)' }}>{unlocked.size}/{ACHIEVEMENTS.length} desbloqueados</div>
      </div>
      <div className="v3-achievements-grid">
        {ACHIEVEMENTS.map(a => {
          const ok = unlocked.has(a.id)
          return (
            <div key={a.id} className={`v3-achievement${ok ? ' unlocked' : ''}`} title={a.desc}>
              <div className="v3-achievement-icon">{ok ? a.icon : '🔒'}</div>
              <div className="v3-achievement-title">{a.title}</div>
              <div className="v3-achievement-desc">{a.desc}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ACCENT_PRESETS = ['#5E6AD2','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#F97316','#0EA5E9','#84CC16']

// ─── TabInicio ─────────────────────────────────────────────────────────────────
function TabInicio({ timer, doStart, doStop, doBreak, openRec, db, u, openModal, gpsStatus, session, vac, saveDB, toast }) {
  const { setEmpTab } = useAppStore()
  const { clockTime, clockDate } = useClock()
  const todayStr = today()
  const [showTip, setShowTip] = useState(() => {
    try { return localStorage.getItem('an_tip_fichar') !== '1' } catch { return false }
  })
  const [bioOfferVisible, setBioOfferVisible] = useState(false)
  const [bioOfferLoading, setBioOfferLoading] = useState(false)
  // Memo: TabInicio re-renderiza cada segundo via timer; evitar refiltrar listas grandes
  const recs = useMemo(
    () => (db.records || []).filter(r => r.empId === u.id && r.inicio?.startsWith(todayStr)),
    [db.records, u.id, todayStr]
  )
  const realRecs = useMemo(() => recs.filter(r => !r.fin || recWorkSecs(r) >= 30), [recs])
  const o = openRec()
  const pendingDocs = useMemo(
    () => (db.documentos || []).filter(d => d.empId === u.id && !d.firma),
    [db.documentos, u.id]
  )

  const lastAutoClosed = useMemo(() => {
    return (db.records || [])
      .filter(r => r.empId === u.id && r.autoClosedAt)
      .sort((a, b) => b.autoClosedAt.localeCompare(a.autoClosedAt))[0] || null
  }, [db.records, u.id])
  const [autoCloseDismissed, setAutoCloseDismissed] = useState(false)
  const showAutoCloseWarning = !autoCloseDismissed && lastAutoClosed &&
    (Date.now() - new Date(lastAutoClosed.autoClosedAt).getTime()) < 24 * 60 * 60 * 1000

  // Racha de asistencia (se actualiza cuando cambian los records, no cada segundo)
  const streak = useMemo(() => calcStreak(db.records, u.id, todayStr), [db.records, u.id, todayStr])
  const streakNext = streakLabel(streak)

  // IA horaria: patrón de entrada de los últimos 30 días
  const workPattern = useMemo(() => calcWorkPattern(db.records, u.id), [db.records, u.id])

  // Oferta biométrica — mostrar solo una vez si el dispositivo lo soporta y no está registrado
  useEffect(() => {
    if (!u?.id) return
    if (hasBiometric(u.id) || isBioOfferDismissed(u.id)) return
    checkPlatformAuth().then(ok => { if (ok) setBioOfferVisible(true) })
  }, [u?.id])

  const completedSecs = realRecs.filter(r => r.fin && r.closed).reduce((a, r) => a + recWorkSecs(r), 0)
  const liveSecs = o ? calcSecs(o).work : 0
  const totSecs = completedSecs + liveSecs
  const totMin = Math.floor(totSecs / 60)
  const pct = Math.min(100, Math.round(totMin / WD * 100))
  const remainMin = Math.max(0, WD - totMin)
  const extraMin = Math.max(0, totMin - WD)

  const entradaRec = realRecs[0]
  const salidaRec = [...realRecs].reverse().find(r => r.fin && r.closed)
  const brkMin = recs.reduce((a, r) => a + Math.floor((r.breakSecs || 0) / 60), 0)

  const now = new Date()
  const ws = wkStart(now)
  const wsStr = ws.toISOString().slice(0, 10)
  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
  const weekRecs = useMemo(() => {
    const wsDate = new Date(wsStr)
    return (db.records || []).filter(r => r.empId === u.id && r.fin && new Date(r.inicio) >= wsDate)
  }, [db.records, u.id, wsStr])
  const weekMin = weekRecs.reduce((s, r) => s + calcMin(r), 0) + (timer.state !== 'idle' ? Math.floor(timer.ws / 60) : 0)
  const weekPct = Math.min(100, Math.round(weekMin / WK * 100))
  const lastWeekMin = useMemo(() => {
    const lws = new Date(wsStr); lws.setDate(lws.getDate() - 7)
    const lwe = new Date(wsStr)
    return (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio && new Date(r.inicio) >= lws && new Date(r.inicio) < lwe).reduce((s, r) => s + calcMin(r), 0)
  }, [db.records, u.id, wsStr])
  const monthRecs = useMemo(
    () => (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio?.startsWith(mk)),
    [db.records, u.id, mk]
  )
  const monthMin = useMemo(() => monthRecs.reduce((s, r) => s + calcMin(r), 0), [monthRecs])
  const { netExtraMin: monthExtraMin, deficitMin: monthDeficitMin } = useMemo(
    () => monthlyExtras(db.records, u.id, mk),
    [db.records, u.id, mk]
  )
  const monthPct = Math.min(100, Math.round(monthMin / 9600 * 100))

  // "Mi equipo" data — precomputado para evitar O(n²) cada segundo en encargados
  const teamData = useMemo(() => {
    if (u.role !== 'encargado' && u.role !== 'jefe_obra') return null
    const isJO = u.role === 'jefe_obra'
    const teamEmps = (db.employees || []).filter(e =>
      !e.isAdmin && !e.baja && e.id !== u.id &&
      (isJO || !u.obrasAsignadas?.length ||
        u.obrasAsignadas.some(obra => e.obrasAsignadas?.includes(obra)))
    )
    if (!teamEmps.length) return null
    const todayRecords = (db.records || []).filter(r => r.inicio?.startsWith(todayStr))
    const liveIds  = new Set(todayRecords.filter(r => !r.fin).map(r => r.empId))
    const doneIds  = new Set(todayRecords.filter(r => r.fin && !liveIds.has(r.empId)).map(r => r.empId))
    const minByEmp = {}
    todayRecords.filter(r => r.fin).forEach(r => { minByEmp[r.empId] = (minByEmp[r.empId] || 0) + calcMin(r) })
    return { teamEmps, liveIds, doneIds, minByEmp }
  }, [u.role, u.id, u.obrasAsignadas, db.employees, db.records, todayStr])

  // SVG arc
  const ARC_R = 50
  const ARC_C = 2 * Math.PI * ARC_R
  const arcOffset = ARC_C * (1 - pct / 100)

  const handleMainBtn = () => {
    if (timer.state === 'idle') doStart()
    else doStop()
  }

  const statusClass = timer.state === 'idle' ? 'idle' : timer.state === 'break' ? 'break' : ''

  if (!db.records) return (
    <div className="emp-tab active">
      <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:12 }}>
        <div className="skeleton" style={{ height:280, borderRadius:20 }} />
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height:68, borderRadius:14 }} />)}
        </div>
        <div className="skeleton" style={{ height:56, borderRadius:14 }} />
        <div className="skeleton" style={{ height:80, borderRadius:14 }} />
      </div>
    </div>
  )

  return (
    <PullToRefresh>
      <div className="ini-wrap">

        <WeatherCard />

        {/* Hero clock card */}
        <div className={`hero-clock-card${timer.state !== 'idle' ? ' jornada-active' : ''}`}>
          <div className="hero-clock-display">{clockTime || '--:--:--'}</div>
          <div className="hero-clock-date">{clockDate}</div>

          <div className={`hero-status-badge${statusClass ? ' ' + statusClass : ''}`}>
            <span className="hero-badge-dot" />
            {timer.state === 'idle' ? 'Sin jornada activa' : timer.state === 'break' ? 'En descanso' : 'Jornada activa'}
          </div>

          <div className="hero-hours-row">
            <div className="hero-hour-pill">
              <div className="hero-hour-label">Trabajado</div>
              <div className="hero-hour-value">
                {Math.floor(totMin / 60)}h <span>{p2(totMin % 60)}m</span>
              </div>
            </div>
            <div className="hero-hour-pill">
              <div className="hero-hour-label">Restante</div>
              <div className="hero-hour-value">
                {Math.floor(remainMin / 60)}h <span>{p2(remainMin % 60)}m</span>
              </div>
            </div>
            <div className="hero-hour-pill">
              <div className="hero-hour-label">Extra hoy</div>
              <div className="hero-hour-value" style={{ color: 'var(--accent3)' }}>
                {Math.floor(extraMin / 60)}h <span>{p2(extraMin % 60)}m</span>
              </div>
            </div>
          </div>

          <div className="hero-arc-row">
            <svg className="hero-arc-svg" viewBox="0 0 120 120">
              <defs>
                <linearGradient id="heroArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#2563EB" />
                  <stop offset="100%" stopColor="#8B5CF6" />
                </linearGradient>
              </defs>
              <circle cx="60" cy="60" r={ARC_R} fill="none" stroke="var(--border2)" strokeWidth="9" />
              <circle cx="60" cy="60" r={ARC_R} fill="none" stroke="url(#heroArcGrad)" strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={ARC_C} strokeDashoffset={arcOffset}
                transform="rotate(-90 60 60)" />
            </svg>
            <div>
              <div className="hero-arc-pct">{pct}%</div>
              <div className="hero-arc-sub">jornada completada</div>
              {timer.state !== 'idle' && (
                <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 3 }}>
                  {s2t(timer.ws)} activo
                </div>
              )}
            </div>
          </div>

          <button className={`hero-fichar-btn ripple-btn${timer.state !== 'idle' ? ' active' : ''}`}
            onClick={e => {
              const btn = e.currentTarget
              const r = document.createElement('span')
              r.className = 'ripple'
              const rect = btn.getBoundingClientRect()
              const size = Math.max(rect.width, rect.height)
              r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px`
              btn.appendChild(r)
              setTimeout(() => r.remove(), 600)
              if (showTip) { try { localStorage.setItem('an_tip_fichar', '1') } catch {}; setShowTip(false) }
              handleMainBtn()
            }}>
            {timer.state === 'idle'
              ? '▶  Iniciar jornada'
              : timer.state === 'break'
                ? '⏹  Terminar jornada'
                : '⏹  Registrar salida'}
          </button>
          {showTip && timer.state === 'idle' && (
            <div style={{ marginTop:10, padding:'9px 14px', background:'var(--primary)', color:'#fff', borderRadius:10, fontSize:12, fontWeight:600, textAlign:'center', boxShadow:'0 4px 14px rgba(108,99,255,.35)', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <span style={{ fontSize:14 }}>👆</span>
              Pulsa el botón para iniciar tu jornada
            </div>
          )}

          {timer.state !== 'idle' && (
            <button
              className={`jor-break-chip${timer.state === 'break' ? ' active' : ''}`}
              onClick={doBreak}
              style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}>
              {timer.state === 'break' ? '▶️ Reanudar trabajo' : '⏸️ Iniciar descanso'}
            </button>
          )}
        </div>

        {/* Stats grid */}
        <div className="stat-mini-grid">
          {[
            { lbl: 'Entrada', val: entradaRec ? ftime(entradaRec.inicio) : '- -:- -', color: 'var(--primary-light)', bg: 'rgba(37,99,235,.12)' },
            { lbl: 'Salida',  val: o ? '- -:- -' : salidaRec ? ftime(salidaRec.fin) : '- -:- -', color: 'var(--green)', bg: 'var(--green-dim)' },
            { lbl: 'Pausa',   val: brkMin > 0 ? `${Math.floor(brkMin / 60).toString().padStart(2, '0')}:${p2(brkMin % 60)}` : '00:00', color: 'var(--orange)', bg: 'var(--orange-dim)' },
            { lbl: 'Total',   val: totMin > 0 ? `${Math.floor(totMin / 60)}h ${p2(totMin % 60)}m` : '0h 00m', color: 'var(--secondary)', bg: 'rgba(6,182,212,.1)' },
          ].map(({ lbl, val, color, bg }) => (
            <div key={lbl} className="stat-card-premium v3-stat-card" style={{ textAlign: 'center' }}>
              <div className="stat-lbl v3-stat-label">{lbl}</div>
              <div className="stat-val v3-stat-value" style={{ color, fontSize: 14 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Weekly progress bar */}
        <div style={{ margin:'0 16px 12px', padding:'12px 14px', background:'var(--bg-600)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.6px', color:'var(--text3)' }}>Progreso semanal</div>
            <div style={{ fontSize:12, fontWeight:700, color: weekPct >= 100 ? 'var(--green)' : 'var(--primary-light)' }}>{mhm(weekMin)} / 40h</div>
          </div>
          <div className="v3-progress">
            <div className={`v3-progress-fill${weekPct >= 100 ? ' green' : ''}`} style={{ width:`${Math.min(weekPct, 100)}%` }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:5 }}>
            <span style={{ fontSize:9, color:'var(--text4)' }}>Lun · {new Date(ws).toLocaleDateString('es-ES', { day:'numeric', month:'short' })}</span>
            <span style={{ fontSize:9, color: weekPct >= 100 ? 'var(--green)' : 'var(--text4)' }}>{weekPct >= 100 ? '✓ 40h completadas' : `${100 - weekPct}% restante`}</span>
          </div>
        </div>

        {/* ── Comparativa semana a semana ─────────────────────────────── */}
        {(weekMin > 0 || lastWeekMin > 0) && (
          <div className="v3-compare-card">
            <div className="v3-compare-title">Comparativa semanal</div>
            {[{ label:'Sem. anterior', mins: lastWeekMin }, { label:'Esta semana', mins: weekMin }].map(({ label, mins }) => {
              const pct = Math.min(100, mins / Math.max(lastWeekMin, weekMin, WK) * 100)
              return (
                <div key={label} className="v3-compare-row">
                  <div className="v3-compare-lbl">{label}</div>
                  <div className="v3-compare-track">
                    <div className="v3-compare-fill" style={{ width:`${pct}%` }} />
                  </div>
                  <div className="v3-compare-val">{mhm(mins)}</div>
                </div>
              )
            })}
            {lastWeekMin > 0 && weekMin !== lastWeekMin && (() => {
              const diff = weekMin - lastWeekMin
              return <div className="v3-compare-delta" style={{ color: diff > 0 ? 'var(--green)' : 'var(--orange)' }}>{diff > 0 ? '+' : ''}{mhm(Math.abs(diff))} {diff > 0 ? 'más' : 'menos'} que la semana pasada</div>
            })()}
          </div>
        )}

        {/* Monthly progress bar */}
        <div style={{ margin:'0 16px 12px', padding:'12px 14px', background:'var(--bg-600)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.6px', color:'var(--text3)' }}>Este mes</div>
            <div style={{ fontSize:12, fontWeight:700, color: monthPct >= 100 ? 'var(--green)' : 'var(--primary-light)' }}>{mhm(monthMin)} / 160h</div>
          </div>
          <div className="v3-progress">
            <div className={`v3-progress-fill${monthPct >= 100 ? ' green' : monthDeficitMin > 0 ? ' orange' : ''}`} style={{ width:`${Math.min(monthPct, 100)}%` }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:5 }}>
            <span style={{ fontSize:9, color:'var(--text4)' }}>{now.toLocaleDateString('es-ES', { month:'long', year:'numeric' })}</span>
            {monthExtraMin > 0 ? (
              <span style={{ fontSize:9, color:'var(--green)', fontWeight:700 }}>+{mhm(monthExtraMin)} extra</span>
            ) : monthDeficitMin > 0 ? (
              <span style={{ fontSize:9, color:'var(--orange)' }}>−{mhm(monthDeficitMin)} déficit</span>
            ) : (
              <span style={{ fontSize:9, color: monthPct >= 100 ? 'var(--green)' : 'var(--text4)' }}>{monthPct >= 100 ? '✓ 160h alcanzadas' : `${100 - monthPct}% restante`}</span>
            )}
          </div>
        </div>

        {/* ─── Streak + IA pattern row ─────────────────────────────────────────── */}
        <div className="v3-insights-row">

          {/* Racha de asistencia */}
          {streak > 0 && (
            <div className={`v3-streak-card${streak >= 7 ? ' hot' : ''}`}>
              <div className="v3-streak-fire">{streak >= 30 ? '🌟' : streak >= 7 ? '🔥' : '✅'}</div>
              <div className="v3-streak-body">
                <div className="v3-streak-count">{streak} <span>día{streak !== 1 ? 's' : ''}</span></div>
                <div className="v3-streak-label">racha activa</div>
                {streakNext && <div className="v3-streak-next">{streakNext}</div>}
              </div>
            </div>
          )}

          {/* IA horaria offline — predicción de entrada */}
          {workPattern && (
            <div className="v3-pattern-card">
              <div className="v3-pattern-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div className="v3-pattern-body">
                <div className="v3-pattern-title">Tu horario habitual</div>
                <div className="v3-pattern-range">{workPattern.earlyStr} – {workPattern.lateStr}</div>
                {(() => {
                  if (!entradaRec) return <div className="v3-pattern-sub">basado en {workPattern.sampleSize} días</div>
                  const d = new Date(entradaRec.inicio)
                  const entMin = d.getHours() * 60 + d.getMinutes()
                  const diff = entMin - workPattern.avgMin
                  const abs = Math.abs(diff)
                  if (abs < 6) return <div className="v3-pattern-sub" style={{ color:'var(--green)' }}>✓ Llegaste a tu hora habitual</div>
                  const fm = m => `${Math.floor(m / 60)}h ${m % 60 ? (m % 60) + 'min' : ''}`.trim()
                  return (
                    <div className="v3-pattern-sub" style={{ color: diff < 0 ? 'var(--green)' : 'var(--orange)' }}>
                      {diff < 0 ? `⚡ ${fm(abs)} antes de lo habitual` : `+${fm(abs)} más tarde de lo habitual`}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

        </div>

        {/* Biometric offer bottom sheet */}
        {bioOfferVisible && (
          <div className="v3-bio-offer">
            <div className="v3-bio-offer-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="28" height="28"><path d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 0 0 8 11a4 4 0 1 1 8 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0 0 15.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 0 0 8 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"/></svg>
            </div>
            <div className="v3-bio-offer-text">
              <div className="v3-bio-offer-title">Activa el acceso rápido</div>
              <div className="v3-bio-offer-sub">Entra con tu huella o Face ID la próxima vez, sin introducir el PIN.</div>
            </div>
            <div className="v3-bio-offer-actions">
              <button className="v3-bio-offer-btn primary" disabled={bioOfferLoading}
                onClick={async () => {
                  setBioOfferLoading(true)
                  try {
                    await registerBiometric(u.id, u.name)
                    setBioOfferVisible(false)
                    dismissBioOffer(u.id)
                    toast('¡Huella registrada! Ya puedes entrar sin PIN 🔓')
                  } catch {
                    toast('No se pudo registrar. Inténtalo desde la pantalla de login.')
                    setBioOfferVisible(false)
                    dismissBioOffer(u.id)
                  }
                  setBioOfferLoading(false)
                }}>
                {bioOfferLoading ? 'Registrando…' : 'Activar'}
              </button>
              <button className="v3-bio-offer-btn secondary"
                onClick={() => { setBioOfferVisible(false); dismissBioOffer(u.id) }}>
                Ahora no
              </button>
            </div>
          </div>
        )}

        {/* Vacation balance */}
        {vac && vac.available > 0 && (
          <div onClick={() => setEmpTab('vacaciones')} style={{ margin:'-4px 16px 8px', padding:'10px 14px', background:'var(--bg-600)', border:'1px solid var(--border)', borderRadius:'var(--r)', display:'flex', alignItems:'center', gap:10, cursor:'pointer', WebkitTapHighlightColor:'transparent' }}>
            <span style={{ fontSize:20, flexShrink:0 }}>🌴</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700 }}>{vac.available} días de vacaciones disponibles</div>
              <div style={{ fontSize:10, color:'var(--text3)', marginTop:1 }}>
                {vac.used > 0 ? `${vac.used} usados · ` : ''}{vac.pending > 0 ? `${vac.pending} pendientes · ` : ''}generados: {vac.generated}d en {vac.months} meses
              </div>
            </div>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text3)" strokeWidth="2.5" style={{ flexShrink:0 }}><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        )}

        {/* Documentos pendientes de firma */}
        {pendingDocs.length > 0 && (
          <div onClick={() => openModal('documentos')} style={{ margin:'-4px 16px 0', padding:'12px 14px', background:'var(--orange-dim)', border:'1px solid rgba(245,158,11,.3)', borderRadius:'var(--r)', display:'flex', alignItems:'center', gap:10, cursor:'pointer', WebkitTapHighlightColor:'transparent' }}>
            <span style={{ fontSize:20, flexShrink:0 }}>📄</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--orange)' }}>
                {pendingDocs.length === 1 ? 'Tienes 1 documento pendiente' : `Tienes ${pendingDocs.length} documentos pendientes`} de firma
              </div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>Toca para revisarlos y firmar</div>
            </div>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--orange)" strokeWidth="2.5" style={{ flexShrink:0 }}><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        )}

        {/* Auto-close warning banner */}
        {showAutoCloseWarning && (
          <div className="v3-autoclose-warn">
            <span className="v3-autoclose-warn-icon">⚠️</span>
            <div className="v3-autoclose-warn-text">
              <div className="v3-autoclose-warn-title">Jornada cerrada automáticamente</div>
              <div className="v3-autoclose-warn-sub">
                Tu jornada del {new Date(lastAutoClosed.inicio).toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'short' })} fue cerrada automáticamente por inactividad ({mhm(Math.floor((lastAutoClosed.workSecs||0)/60))}).
              </div>
            </div>
            <button className="v3-autoclose-warn-close" onClick={() => setAutoCloseDismissed(true)}>×</button>
          </div>
        )}

        {/* GPS card */}
        {o && (
          <div className={`gps-card${gpsStatus === 'pending' ? ' capturing' : ''}${o.geoAlert ? ' geo-alert' : ''}`}>
            <div className="gps-ico">
              <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="gps-name">{o.centro || u.centroTrabajo || 'Sin centro'}</div>
              <div className={`gps-status${gpsStatus === 'pending' ? ' pending' : gpsStatus === 'fail' ? ' fail' : ''}`}>
                {o?.locInicio ? '✓ GPS verificado'
                  : gpsStatus === 'pending' ? 'Capturando ubicación…'
                  : gpsStatus === 'fail' ? '⚠ Sin GPS — ubicación no registrada'
                  : 'Sin GPS'}
              </div>
              {o.geoAlert && (
                <div className="gps-alert-tag">⚠ Fuera de zona · +{o.geoAlert.dist}m del radio ({o.geoAlert.radio}m)</div>
              )}
            </div>
          </div>
        )}

        {/* Mi equipo — solo para encargados y jefes de obra */}
        {teamData && (() => {
          const { teamEmps, liveIds, doneIds, minByEmp } = teamData
          const liveCount = teamEmps.filter(e => liveIds.has(e.id)).length
          const recs = db.records || []

          const teamStartJornada = (e) => {
            if (liveIds.has(e.id)) { toast('Ya tiene jornada abierta', 2500, 'warn'); return }
            const newRec = { id: gid(), empId: e.id, empName: e.name, inicio: new Date().toISOString(), fin: null, centro: e.centroTrabajo || '', breaks: [], workSecs: 0, creadoPor: u.name }
            saveDB({ records: [...recs, newRec] })
            queuePush(e.id, '▶ Jornada iniciada', `${u.name} ha iniciado tu jornada laboral.`, 'jornada', '/?tab=inicio')
            toast('Jornada iniciada', 2500, 'ok')
          }

          const teamToggleDescanso = (rec) => {
            const now = new Date().toISOString()
            let updated
            if (rec.enDescanso) {
              const breaks = [...(rec.breaks || []), { start: rec.bStartTs, end: now }]
              updated = { ...rec, enDescanso: false, bStartTs: null, breaks, breakSecs: calcSecs({ ...rec, enDescanso: false, breaks }).brk }
              queuePush(rec.empId, '▶ Descanso finalizado', `${u.name} ha reanudado tu jornada.`, 'jornada', '/?tab=inicio')
              toast('Jornada reanudada', 2500, 'ok')
            } else {
              updated = { ...rec, enDescanso: true, bStartTs: now }
              queuePush(rec.empId, '⏸ Descanso iniciado', `${u.name} ha pausado tu jornada.`, 'jornada', '/?tab=inicio')
              toast('Descanso iniciado', 2500, 'ok')
            }
            saveDB({ records: recs.map(r => r.id === rec.id ? updated : r) })
          }

          const teamForceClose = (rec) => {
            const empName = teamEmps.find(e => e.id === rec.empId)?.name || rec.empName
            if (!window.confirm(`¿Finalizar jornada de ${empName}?`)) return
            const now = new Date().toISOString()
            const breaks = [...(rec.breaks || [])]
            if (rec.enDescanso && rec.bStartTs) breaks.push({ start: rec.bStartTs, end: now })
            const closed = { ...rec, fin: now, breaks, enDescanso: false, bStartTs: null, closed: true }
            const t = calcSecs(closed); closed.workSecs = t.work; closed.breakSecs = t.brk
            saveDB({ records: recs.map(r => r.id === rec.id ? closed : r) })
            queuePush(rec.empId, '⏹ Jornada finalizada', `${u.name} ha finalizado tu jornada (${mhm(Math.floor(t.work/60))}).`, 'jornada', '/?tab=jornada')
            toast('Jornada finalizada', 2500, 'ok')
          }

          return (
            <div style={{ padding:'0 16px 12px' }}>
              <div className="sec-label">
                Mi equipo hoy
                <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:10, background:'var(--green-dim)', color:'var(--green)', border:'1px solid rgba(16,185,129,.2)', textTransform:'none', letterSpacing:0 }}>
                  {liveCount} activo{liveCount !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {teamEmps.map(e => {
                  const isWorking = liveIds.has(e.id)
                  const isDone    = !isWorking && doneIds.has(e.id)
                  const openRec2  = isWorking ? recs.find(r => r.empId === e.id && !r.fin) : null
                  const totalMin  = isDone ? (minByEmp[e.id] || 0) : 0
                  const dotColor  = isWorking ? 'var(--green)' : isDone ? 'var(--primary-light)' : 'var(--text4)'
                  const statusTxt = isWorking
                    ? (openRec2?.enDescanso ? `En descanso desde ${ftime(openRec2?.bStartTs || openRec2?.inicio)}` : `Activo desde ${ftime(openRec2?.inicio)}`)
                    : isDone ? `${mhm(totalMin)} · Finalizado`
                    : 'Sin fichar hoy'
                  return (
                    <div key={e.id} className={`v3-team-card${isWorking ? (openRec2?.enDescanso ? ' paused' : ' working') : ''}`}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:dotColor, flexShrink:0, boxShadow: isWorking ? `0 0 7px ${dotColor}` : 'none' }} />
                        <div style={{ width:32, height:32, borderRadius:9, background: e.color || 'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:'#fff', flexShrink:0 }}>
                          {e.initials || e.name.slice(0,2).toUpperCase()}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name.split(' ')[0]} {e.name.split(' ')[1] || ''}</div>
                          <div style={{ fontSize:10, color: isWorking ? (openRec2?.enDescanso ? 'var(--orange)' : 'var(--green)') : isDone ? 'var(--text3)' : 'var(--text4)', marginTop:1 }}>{statusTxt}</div>
                        </div>
                      </div>
                      {/* Botones de control — solo si saveDB disponible */}
                      {saveDB && (
                        isWorking ? (
                          <div className="v3-team-card-actions">
                            <button onClick={() => teamToggleDescanso(openRec2)} className="v3-team-btn">
                              {openRec2?.enDescanso ? '▶ Reanudar' : '⏸ Pausa'}
                            </button>
                            <button onClick={() => teamForceClose(openRec2)} className="v3-team-btn danger">
                              ■ Finalizar
                            </button>
                          </div>
                        ) : !isDone ? (
                          <div className="v3-team-card-actions">
                            <button onClick={() => teamStartJornada(e)} className="v3-team-btn primary" style={{ flex:'none', width:'100%' }}>
                              ▶ Iniciar jornada
                            </button>
                          </div>
                        ) : null
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

      </div>
    </PullToRefresh>
  )
}

// ─── TAB JORNADA ───────────────────────────────────────────────────────────────
function TabJornada({ timer, db, u, toast, saveDB, openModal, closeModal, activeModal, modalData }) {
  if (!db.records) return (
    <div className="emp-tab active">
      <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:12 }}>
        <div className="skeleton" style={{ height:80, borderRadius:14 }} />
        <div className="skeleton" style={{ height:200, borderRadius:18 }} />
        <div className="skeleton" style={{ height:140, borderRadius:14 }} />
      </div>
    </div>
  )
  const todayStr = today()
  const recs = (db.records || []).filter(r => r.empId === u.id && r.inicio?.startsWith(todayStr)).sort((a,b) => a.inicio.localeCompare(b.inicio))
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
  const wsStr = ws.toISOString().slice(0, 10)
  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
  const weekRecs = useMemo(() => {
    const wsDate = new Date(wsStr)
    return (db.records || []).filter(r => r.empId === u.id && r.fin && new Date(r.inicio) >= wsDate)
  }, [db.records, u.id, wsStr])
  const weekMin = weekRecs.reduce((s, r) => s + calcMin(r), 0) + (timer.state !== 'idle' ? Math.floor(timer.ws / 60) : 0)

  const monthMin = useMemo(
    () => (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio?.startsWith(mk)).reduce((s, r) => s + calcMin(r), 0),
    [db.records, u.id, mk]
  )

  const tlItems = realRecs.map(r => ({ r, isCurrent: !r.fin }))

  const [informeUrl, setInformeUrl]     = useState(null)
  const [informeBlob, setInformeBlob]   = useState(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [generatingWeekPdf, setGeneratingWeekPdf] = useState(false)

  const closeInforme = useCallback(() => {
    setInformeUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setInformeBlob(null)
  }, [])

  useModalBack(!!informeUrl, closeInforme)

  const exportMonthPDF = async () => {
    setGeneratingPdf(true)
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const now2 = new Date()
      const mk2 = `${now2.getFullYear()}-${p2(now2.getMonth()+1)}`
      const monthRecs = (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio?.startsWith(mk2)).sort((a,b) => a.inicio.localeCompare(b.inicio))
      const totalMin2 = monthRecs.reduce((s,r) => s + calcMin(r), 0)
      const monthName = now2.toLocaleDateString('es-ES', { month:'long', year:'numeric' })

      const pdfDoc  = await PDFDocument.create()
      const fontR   = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const fontB   = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

      // ─ Layout constants ────────────────────────────────────────────
      const PW = 595, PH = 842       // A4 portrait
      const ML = 35, MR = 35        // margins left/right
      const CW = PW - ML - MR       // 525 content width
      const COLS = [
        { label:'Fecha',              w: 72 },
        { label:'Entrada',            w: 52 },
        { label:'Salida',             w: 52 },
        { label:'Centro / Obra',      w: 279 },
        { label:'Horas netas',        w: 70 },
      ]
      const ROW_H = 15, HEAD_H = 17, SIG_AREA = 110

      // ─ Colors ──────────────────────────────────────────────────────
      const cPri    = rgb(0.36,0.38,0.82)
      const cPriLt  = rgb(0.94,0.93,1.0)
      const cDark   = rgb(0.10,0.10,0.15)
      const cGray   = rgb(0.55,0.55,0.60)
      const cLtGray = rgb(0.96,0.96,0.98)
      const cBorder = rgb(0.82,0.82,0.88)
      const cWhite  = rgb(1,1,1)
      const cGreen  = rgb(0.10,0.62,0.46)

      // ─ Page helpers ────────────────────────────────────────────────
      let page, y, pageNum = 0

      const newPage = () => {
        page = pdfDoc.addPage([PW, PH]); pageNum++; y = PH - 30
        // header strip
        page.drawRectangle({ x:ML, y:y-64, width:CW, height:64, color:cPriLt, borderColor:cPri, borderWidth:0.8 })
        page.drawText(u.empresa || 'Empresa', { x:ML+10, y:y-18, size:10, font:fontB, color:cPri })
        page.drawText('REGISTRO DE JORNADA LABORAL', { x:ML+10, y:y-31, size:8.5, font:fontB, color:cDark })
        const obras = u.obrasAsignadas?.length ? u.obrasAsignadas.join(', ') : (u.centroTrabajo || '—')
        page.drawText(`Trabajador: ${u.name}   ·   Mes: ${monthName}   ·   Obras: ${obras}`, { x:ML+10, y:y-44, size:7.5, font:fontR, color:cGray, maxWidth:CW-80 })
        page.drawText(`Pág. ${pageNum}   ·   ${new Date().toLocaleDateString('es-ES')}`, { x:PW-MR-85, y:y-18, size:7.5, font:fontR, color:cGray })
        y -= 74
      }

      const tableHeader = () => {
        let xc = ML
        page.drawRectangle({ x:ML, y:y-HEAD_H, width:CW, height:HEAD_H, color:cPri })
        COLS.forEach(c => {
          page.drawText(c.label, { x:xc+4, y:y-HEAD_H+5, size:7.5, font:fontB, color:cWhite, maxWidth:c.w-6 })
          xc += c.w
        })
        y -= HEAD_H
      }

      // ─ Cover page ─────────────────────────────────────────────────
      const cover = pdfDoc.addPage([PW, PH])
      // header band
      cover.drawRectangle({ x:0, y:PH-120, width:PW, height:120, color:cPri })
      cover.drawText(u.empresa || 'TIMES INC', { x:ML, y:PH-50, size:24, font:fontB, color:cWhite })
      cover.drawText('REGISTRO DE JORNADA LABORAL', { x:ML, y:PH-78, size:11, font:fontR, color:rgb(0.8,0.82,1) })
      cover.drawText(new Date().toLocaleDateString('es-ES'), { x:PW-MR-90, y:PH-50, size:10, font:fontR, color:rgb(0.8,0.82,1) })
      // main info block
      const ly = (n) => PH - 200 - n * 28
      cover.drawText('Trabajador', { x:ML, y:ly(0)+10, size:8, font:fontR, color:cGray })
      cover.drawText(u.name, { x:ML, y:ly(0)-6, size:16, font:fontB, color:cDark })
      cover.drawLine({ start:{x:ML,y:ly(0)-16}, end:{x:PW-MR,y:ly(0)-16}, thickness:0.4, color:cBorder })
      cover.drawText('Periodo', { x:ML, y:ly(1)+10, size:8, font:fontR, color:cGray })
      cover.drawText(monthName.charAt(0).toUpperCase() + monthName.slice(1), { x:ML, y:ly(1)-6, size:16, font:fontB, color:cDark })
      cover.drawLine({ start:{x:ML,y:ly(1)-16}, end:{x:PW-MR,y:ly(1)-16}, thickness:0.4, color:cBorder })
      cover.drawText('Centro / Obra', { x:ML, y:ly(2)+10, size:8, font:fontR, color:cGray })
      cover.drawText(u.obrasAsignadas?.length ? u.obrasAsignadas.join(', ') : (u.centroTrabajo || '—'), { x:ML, y:ly(2)-6, size:12, font:fontB, color:cDark, maxWidth:CW })
      cover.drawLine({ start:{x:ML,y:ly(2)-16}, end:{x:PW-MR,y:ly(2)-16}, thickness:0.4, color:cBorder })
      // stats row
      const statsY = ly(3) - 10
      cover.drawRectangle({ x:ML, y:statsY-80, width:CW, height:80, color:cPriLt, borderColor:cPri, borderWidth:0.6 })
      const exCover = monthlyExtras(db.records, u.id, mk2)
      const statItems = [
        { label:'Jornadas', val: String(monthRecs.length) },
        { label:'Total horas', val: mhm(totalMin2) },
        { label:'H. extra', val: exCover.netExtraMin > 0 ? `+${mhm(exCover.netExtraMin)}` : exCover.deficitMin > 0 ? `−${mhm(exCover.deficitMin)}` : '0h' },
        { label:'Objetivo 160h', val: totalMin2 >= 9600 ? '✓ OK' : `Falta ${mhm(9600 - totalMin2)}` },
      ]
      const statW = CW / statItems.length
      statItems.forEach((s, i) => {
        const sx = ML + i * statW + statW / 2
        cover.drawText(s.label, { x:sx-20, y:statsY-25, size:7.5, font:fontR, color:cGray, maxWidth:statW-8 })
        cover.drawText(s.val, { x:sx-26, y:statsY-50, size:14, font:fontB, color:cPri, maxWidth:statW-4 })
      })
      cover.drawText(
        'Generado automáticamente por TIMES INC conforme al RDL 8/2019 de registro diario de jornada.',
        { x:ML, y:40, size:6, font:fontR, color:cGray, maxWidth:CW }
      )

      // ─ Start first page ────────────────────────────────────────────
      newPage(); tableHeader()

      // ─ Data rows ──────────────────────────────────────────────────
      monthRecs.forEach((r, i) => {
        if (y - ROW_H < 35 + SIG_AREA) { newPage(); tableHeader() }
        const wm = Math.floor(recWorkSecs(r) / 60)
        const centroObra = [r.centro, r.obra].filter(Boolean).join(' / ') || u.centroTrabajo || '—'
        const vals = [ r.inicio.slice(0,10), ftime(r.inicio), r.fin ? ftime(r.fin) : '—', centroObra, mhm(wm) ]

        page.drawRectangle({ x:ML, y:y-ROW_H, width:CW, height:ROW_H, color: i%2===0 ? cWhite : cLtGray })
        page.drawLine({ start:{x:ML, y:y-ROW_H}, end:{x:ML+CW, y:y-ROW_H}, thickness:0.3, color:cBorder })

        let xc = ML
        vals.forEach((v, ci) => {
          const isHours = ci === 4
          page.drawText(String(v), { x:xc+4, y:y-ROW_H+4, size:7.5, font: isHours?fontB:fontR, color: isHours?cPri:cDark, maxWidth:COLS[ci].w-8 })
          xc += COLS[ci].w
        })
        // vertical separators
        let xs = ML
        COLS.forEach((c,ci) => { if(ci<COLS.length-1) { page.drawLine({ start:{x:xs+c.w,y:y}, end:{x:xs+c.w,y:y-ROW_H}, thickness:0.3, color:cBorder }); xs+=c.w } })
        y -= ROW_H
      })

      // ─ Total + resumen vs objetivo (regla TIMES INC: 160h/mes, extras semanales >40h) ─────
      if (y - 50 < 35 + SIG_AREA) { newPage() }
      const exPdf = monthlyExtras(db.records, u.id, mk2)
      const targetMin2 = 9600  // 160h = objetivo mensual TIMES INC
      const cDiff = exPdf.netExtraMin > 0 ? cGreen : exPdf.deficitMin > 0 ? rgb(0.87,0.27,0.27) : cPri
      page.drawRectangle({ x:ML, y:y-50, width:CW, height:50, color:cPriLt, borderColor:cPri, borderWidth:0.6 })
      page.drawText(`TOTAL: ${mhm(totalMin2)}   ·   ${monthRecs.length} jornada${monthRecs.length!==1?'s':''} registrada${monthRecs.length!==1?'s':''}`, { x:ML+8, y:y-14, size:8.5, font:fontB, color:cPri })
      page.drawText(`Objetivo mensual: 160h (${mhm(targetMin2)})`, { x:ML+8, y:y-28, size:7.5, font:fontR, color:cDark, maxWidth:CW-16 })
      const extraLine = exPdf.netExtraMin > 0
        ? `H. extra netas: +${mhm(exPdf.netExtraMin)}  (${mhm(exPdf.weeklyExtraMin)} sem. − ${mhm(exPdf.shortfallMin)} déf.)`
        : exPdf.deficitMin > 0
          ? `Déficit: −${mhm(exPdf.deficitMin)} para completar las 160h obligatorias`
          : totalMin2 >= targetMin2 ? '✓ Objetivo de 160h alcanzado' : `Pendiente: ${mhm(targetMin2 - totalMin2)} para las 160h`
      page.drawText(extraLine, { x:ML+8, y:y-42, size:7.5, font:fontB, color:cDiff, maxWidth:CW-16 })
      y -= 58

      // ─ Signature block ────────────────────────────────────────────
      if (y - SIG_AREA < 30) { newPage() }
      y -= 10
      page.drawText('FIRMA DEL TRABAJADOR', { x:ML, y:y-11, size:6.5, font:fontB, color:cGray })

      const firma = db.firmas?.[u?.id]?.main
      if (firma?.data) {
        try {
          const printable = await makePrintableSignature(firma.data)
          const b64 = printable.split(',')[1]
          const bin = atob(b64)
          const bytes = new Uint8Array(bin.length)
          for (let i=0; i<bin.length; i++) bytes[i] = bin.charCodeAt(i)
          const sigImg = await pdfDoc.embedPng(bytes.buffer)
          const sigW = 130, sigH = sigW * (sigImg.height / sigImg.width)
          page.drawImage(sigImg, { x:ML, y:y-18-sigH, width:sigW, height:sigH })
          page.drawLine({ start:{x:ML,y:y-22-sigH}, end:{x:ML+170,y:y-22-sigH}, thickness:0.5, color:cGray })
          page.drawText(`${u.name}   ·   Firmado digitalmente   ·   ${new Date().toLocaleString('es-ES')}`, { x:ML, y:y-31-sigH, size:6.5, font:fontR, color:cGray, maxWidth:260 })
          // green tick
          page.drawText('✓ Firma verificada', { x:ML+175, y:y-25-sigH, size:7, font:fontB, color:cGreen })
        } catch {
          page.drawLine({ start:{x:ML,y:y-65}, end:{x:ML+170,y:y-65}, thickness:0.5, color:cGray })
          page.drawText(u.name, { x:ML, y:y-73, size:7, font:fontR, color:cGray })
        }
      } else {
        page.drawRectangle({ x:ML, y:y-16-70, width:170, height:70, color:cLtGray, borderColor:rgb(0.87,0.27,0.27), borderWidth:0.5 })
        page.drawText('⚠ Sin firma digital', { x:ML+10, y:y-32, size:7.5, font:fontB, color:rgb(0.87,0.27,0.27) })
        page.drawText('Configúrala en Perfil › Firma digital', { x:ML+10, y:y-44, size:6.5, font:fontR, color:cGray })
        page.drawLine({ start:{x:ML,y:y-16-70+10}, end:{x:ML+170,y:y-16-70+10}, thickness:0.5, color:cBorder })
        page.drawText(u.name, { x:ML, y:y-16-70+4, size:6.5, font:fontR, color:cGray })
      }

      // ─ Legal footer ───────────────────────────────────────────────
      page.drawText(
        'Documento generado automáticamente por TIMES INC conforme al RDL 8/2019 de registro diario de jornada. Datos con valor probatorio.',
        { x:ML, y:28, size:5.5, font:fontR, color:cGray, maxWidth:CW }
      )

      // ─ Save & show ────────────────────────────────────────────────
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type:'application/pdf' })
      setInformeBlob(blob)
      setInformeUrl(URL.createObjectURL(blob))
    } catch(e) {
      toast('Error al generar el PDF: ' + (e?.message || e))
    } finally {
      setGeneratingPdf(false)
    }
  }

  const exportWeekPDF = async () => {
    setGeneratingWeekPdf(true)
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const now2 = new Date()
      const ws2 = wkStart(now2)
      const weekRecs2 = (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio && new Date(r.inicio) >= ws2).sort((a,b) => a.inicio.localeCompare(b.inicio))
      const totalMin2 = weekRecs2.reduce((s,r) => s + calcMin(r), 0)
      const weekLabel = `Semana del ${ws2.toLocaleDateString('es-ES', { day:'numeric', month:'long' })} al ${now2.toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' })}`

      const pdfDoc  = await PDFDocument.create()
      const fontR   = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const fontB   = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

      const PW = 595, PH = 842
      const ML = 35, MR = 35
      const CW = PW - ML - MR
      const COLS = [
        { label:'Fecha', w: 72 },
        { label:'Entrada', w: 52 },
        { label:'Salida', w: 52 },
        { label:'Centro / Obra', w: 279 },
        { label:'Horas netas', w: 70 },
      ]
      const ROW_H = 15, HEAD_H = 17, SIG_AREA = 110
      const cPri    = rgb(0.36,0.38,0.82)
      const cPriLt  = rgb(0.94,0.93,1.0)
      const cDark   = rgb(0.10,0.10,0.15)
      const cGray   = rgb(0.55,0.55,0.60)
      const cLtGray = rgb(0.96,0.96,0.98)
      const cBorder = rgb(0.82,0.82,0.88)
      const cWhite  = rgb(1,1,1)
      const cGreen  = rgb(0.10,0.62,0.46)

      let page, y, pageNum = 0
      const newPage = () => {
        page = pdfDoc.addPage([PW, PH]); pageNum++; y = PH - 30
        page.drawRectangle({ x:ML, y:y-64, width:CW, height:64, color:cPriLt, borderColor:cPri, borderWidth:0.8 })
        page.drawText(u.empresa || 'Empresa', { x:ML+10, y:y-18, size:10, font:fontB, color:cPri })
        page.drawText('REGISTRO DE JORNADA LABORAL — INFORME SEMANAL', { x:ML+10, y:y-31, size:8.5, font:fontB, color:cDark })
        const obras = u.obrasAsignadas?.length ? u.obrasAsignadas.join(', ') : (u.centroTrabajo || '—')
        page.drawText(`Trabajador: ${u.name}   ·   ${weekLabel}   ·   Obras: ${obras}`, { x:ML+10, y:y-44, size:7.5, font:fontR, color:cGray, maxWidth:CW-80 })
        page.drawText(`Pág. ${pageNum}   ·   ${new Date().toLocaleDateString('es-ES')}`, { x:PW-MR-85, y:y-18, size:7.5, font:fontR, color:cGray })
        y -= 74
      }
      const tableHeader = () => {
        let xc = ML
        page.drawRectangle({ x:ML, y:y-HEAD_H, width:CW, height:HEAD_H, color:cPri })
        COLS.forEach(c => {
          page.drawText(c.label, { x:xc+4, y:y-HEAD_H+5, size:7.5, font:fontB, color:cWhite, maxWidth:c.w-6 })
          xc += c.w
        })
        y -= HEAD_H
      }
      newPage(); tableHeader()
      weekRecs2.forEach((r, i) => {
        if (y - ROW_H < 35 + SIG_AREA) { newPage(); tableHeader() }
        const wm = Math.floor(recWorkSecs(r) / 60)
        const centroObra = [r.centro, r.obra].filter(Boolean).join(' / ') || u.centroTrabajo || '—'
        const vals = [ r.inicio.slice(0,10), ftime(r.inicio), r.fin ? ftime(r.fin) : '—', centroObra, mhm(wm) ]
        page.drawRectangle({ x:ML, y:y-ROW_H, width:CW, height:ROW_H, color: i%2===0 ? cWhite : cLtGray })
        page.drawLine({ start:{x:ML, y:y-ROW_H}, end:{x:ML+CW, y:y-ROW_H}, thickness:0.3, color:cBorder })
        let xc = ML
        vals.forEach((v, ci) => {
          const isHours = ci === 4
          page.drawText(String(v), { x:xc+4, y:y-ROW_H+4, size:7.5, font: isHours?fontB:fontR, color: isHours?cPri:cDark, maxWidth:COLS[ci].w-8 })
          xc += COLS[ci].w
        })
        let xs = ML
        COLS.forEach((c,ci) => { if(ci<COLS.length-1) { page.drawLine({ start:{x:xs+c.w,y:y}, end:{x:xs+c.w,y:y-ROW_H}, thickness:0.3, color:cBorder }); xs+=c.w } })
        y -= ROW_H
      })
      if (y - 40 < 35 + SIG_AREA) { newPage() }
      const targetMin2 = weekRecs2.length * 480
      const diffMin2 = totalMin2 - targetMin2
      const diffSign = diffMin2 >= 0 ? '+' : ''
      const cDiff = diffMin2 >= 0 ? cGreen : rgb(0.87,0.27,0.27)
      page.drawRectangle({ x:ML, y:y-40, width:CW, height:40, color:cPriLt, borderColor:cPri, borderWidth:0.6 })
      page.drawText(`TOTAL: ${mhm(totalMin2)}   ·   ${weekRecs2.length} jornada${weekRecs2.length!==1?'s':''} registrada${weekRecs2.length!==1?'s':''}`, { x:ML+8, y:y-14, size:8.5, font:fontB, color:cPri })
      page.drawText(`Objetivo: ${mhm(targetMin2)}   Desviación: ${diffSign}${mhm(Math.abs(diffMin2))}`, { x:ML+8, y:y-30, size:7.5, font:fontR, color:cDiff, maxWidth:CW-16 })
      y -= 48
      if (y - SIG_AREA < 30) { newPage() }
      y -= 10
      page.drawText('FIRMA DEL TRABAJADOR', { x:ML, y:y-11, size:6.5, font:fontB, color:cGray })
      const firma = db.firmas?.[u?.id]?.main
      if (firma?.data) {
        try {
          const printable = await makePrintableSignature(firma.data)
          const b64 = printable.split(',')[1]
          const bin = atob(b64)
          const bytes = new Uint8Array(bin.length)
          for (let i=0; i<bin.length; i++) bytes[i] = bin.charCodeAt(i)
          const sigImg = await pdfDoc.embedPng(bytes.buffer)
          const sigW = 130, sigH = sigW * (sigImg.height / sigImg.width)
          page.drawImage(sigImg, { x:ML, y:y-18-sigH, width:sigW, height:sigH })
          page.drawLine({ start:{x:ML,y:y-22-sigH}, end:{x:ML+170,y:y-22-sigH}, thickness:0.5, color:cGray })
          page.drawText(`${u.name}   ·   Firmado digitalmente   ·   ${new Date().toLocaleString('es-ES')}`, { x:ML, y:y-31-sigH, size:6.5, font:fontR, color:cGray, maxWidth:260 })
          page.drawText('✓ Firma verificada', { x:ML+175, y:y-25-sigH, size:7, font:fontB, color:cGreen })
        } catch {
          page.drawLine({ start:{x:ML,y:y-65}, end:{x:ML+170,y:y-65}, thickness:0.5, color:cGray })
          page.drawText(u.name, { x:ML, y:y-73, size:7, font:fontR, color:cGray })
        }
      } else {
        page.drawRectangle({ x:ML, y:y-16-70, width:170, height:70, color:cLtGray, borderColor:rgb(0.87,0.27,0.27), borderWidth:0.5 })
        page.drawText('⚠ Sin firma digital', { x:ML+10, y:y-32, size:7.5, font:fontB, color:rgb(0.87,0.27,0.27) })
        page.drawText('Configúrala en Perfil › Firma digital', { x:ML+10, y:y-44, size:6.5, font:fontR, color:cGray })
        page.drawLine({ start:{x:ML,y:y-16-70+10}, end:{x:ML+170,y:y-16-70+10}, thickness:0.5, color:cBorder })
        page.drawText(u.name, { x:ML, y:y-16-70+4, size:6.5, font:fontR, color:cGray })
      }
      page.drawText('Documento generado automáticamente por TIMES INC conforme al RDL 8/2019 de registro diario de jornada. Datos con valor probatorio.', { x:ML, y:28, size:5.5, font:fontR, color:cGray, maxWidth:CW })
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type:'application/pdf' })
      setInformeBlob(blob)
      setInformeUrl(URL.createObjectURL(blob))
    } catch(e) {
      toast('Error al generar el PDF: ' + (e?.message || e))
    } finally {
      setGeneratingWeekPdf(false)
    }
  }

  return (
    <>
    <PullToRefresh>
      <div style={{ padding:'14px 16px 14px', background:'linear-gradient(160deg,rgba(108,99,255,.08) 0%,transparent 100%)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 }}>
          <div style={{ fontSize:20, fontWeight:800, letterSpacing:'-.5px' }}>Mi Jornada</div>
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
        <div className={`jor-stat-card${weekMin > WK ? ' orange' : ' primary'}`}>
          <div className="jor-stat-ico">{weekMin > WK ? '🔴' : '⏱️'}</div>
          <div className="jor-stat-val">{mhm(Math.floor(weekMin))}</div>
          <div className="jor-stat-lbl">Esta semana{weekMin > WK ? ' ↑' : ''}</div>
        </div>
        <div className="jor-stat-card">
          <div className="jor-stat-ico">✅</div>
          <div className="jor-stat-val">{mhm(normMin)}</div>
          <div className="jor-stat-lbl">Normal hoy</div>
        </div>
        <div className="jor-stat-card orange">
          <div className="jor-stat-ico">⚡</div>
          <div className="jor-stat-val">{mhm(extraMin)}</div>
          <div className="jor-stat-lbl">Extra hoy</div>
        </div>
      </div>

      {/* Total card + Weekly chart */}
      <div style={{ padding:'0 16px 12px' }}>
        <div className="card" style={{ marginBottom:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
            <div style={{ fontSize:11, color:'var(--text3)', fontWeight:500 }}>Total trabajado hoy</div>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--primary-light)', background:'var(--primary-dim)', padding:'2px 8px', borderRadius:12 }}>
              {Math.round(totMin / (WD || 480) * 100)}%
            </div>
          </div>
          <div className="gradient-text" style={{ fontSize:36, fontWeight:800, letterSpacing:'-1.5px', marginBottom:12 }}>{mhm(totMin)}</div>

          {/* Weekly mini bar chart */}
          <WeeklyBars db={db} u={u} timer={timer} />

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

      {/* PDF export buttons */}
      <div style={{ padding:'0 16px 6px', display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button className="btn btn-secondary btn-sm" onClick={exportWeekPDF} disabled={generatingWeekPdf} style={{ opacity: generatingWeekPdf ? 0.7 : 1 }}>
          {generatingWeekPdf
            ? <><span className="login-spinner" style={{ width:11, height:11, borderWidth:1.5, borderColor:'rgba(108,99,255,.2)', borderTopColor:'var(--primary-light)', marginRight:6, display:'inline-block', verticalAlign:'middle' }} />Generando…</>
            : <>📅 Informe semanal</>
          }
        </button>
        <button className="btn btn-secondary btn-sm" onClick={exportMonthPDF} disabled={generatingPdf} style={{ opacity: generatingPdf ? 0.7 : 1 }}>
          {generatingPdf
            ? <><span className="login-spinner" style={{ width:11, height:11, borderWidth:1.5, borderColor:'rgba(108,99,255,.2)', borderTopColor:'var(--primary-light)', marginRight:6, display:'inline-block', verticalAlign:'middle' }} />Generando…</>
            : <><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:4 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Informe firmado PDF</>
          }
        </button>
      </div>

      {/* ── Pomodoro ─────────────────────────────────────────── */}
      {o && (
        <div style={{ padding:'0 16px 12px' }}>
          <PomodoroWidget />
        </div>
      )}

      {/* Premium social-feed timeline */}
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 14 }}>
          Actividad de hoy
        </div>
        {!tlItems.length ? (
          <div className="empty-premium">
            <div className="empty-premium-icon">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </div>
            <div className="empty-premium-title">Sin actividad hoy</div>
            <div className="empty-premium-sub">Inicia tu jornada desde Inicio para ver tu actividad aquí</div>
          </div>
        ) : (
          <div className="tl-premium">
            {tlItems.map(({ r, isCurrent }) => {
              const ws2 = isCurrent ? timer.ws : recWorkSecs(r)
              const bk = isCurrent ? timer.bs : (r.breakSecs || 0)
              const iconClass = isCurrent ? 'live' : r.fin ? 'salida' : 'pausa'
              const icon = isCurrent ? '▶️' : r.fin ? '✅' : '⏸️'
              return (
                <div key={r.id} className="tl-prem-item">
                  <div className={`tl-prem-icon ${iconClass}`}>{icon}</div>
                  <div className="tl-prem-body">
                    <div className="tl-prem-time">{ftime(r.inicio)}{r.fin ? ` → ${ftime(r.fin)}` : ' → ahora'}</div>
                    <div className="tl-prem-title">{isCurrent ? 'En progreso' : 'Completado'}</div>
                    <div className="tl-prem-sub">{r.centro || u.centroTrabajo || 'Sin centro'}{bk > 30 ? ` · Pausa: ${mhm(Math.floor(bk / 60))}` : ''}</div>
                    <span className="tl-prem-duration">{isCurrent ? s2t(ws2) : mhm(Math.floor(ws2 / 60))}</span>
                  </div>
                </div>
              )
            })}
            {/* Estimated end */}
            {o && (() => {
              const estEnd = new Date(new Date(o.inicio).getTime() + WD * 60000)
              const estHH = p2(estEnd.getHours()), estMM = p2(estEnd.getMinutes())
              return (
                <div className="tl-prem-item" style={{ opacity: .4 }}>
                  <div className="tl-prem-icon salida" style={{ borderStyle: 'dashed' }}>🔴</div>
                  <div className="tl-prem-body">
                    <div className="tl-prem-time">{estHH}:{estMM} est.</div>
                    <div className="tl-prem-title">Salida estimada</div>
                    <div className="tl-prem-sub">Según horario configurado</div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {/* Banner jornadas pendientes de validar */}
      {(() => {
        const pendVal = (db.records || []).filter(r => r.empId === u.id && r.fin && !r.aceptada)
        if (!pendVal.length) return null
        return (
          <div style={{ margin:'0 16px 4px', padding:'10px 14px', background:'var(--orange-dim)', border:'1px solid rgba(245,158,11,.25)', borderRadius:'var(--r)', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:16 }}>⏳</span>
            <div style={{ flex:1, fontSize:12 }}>
              <span style={{ fontWeight:700, color:'var(--orange)' }}>{pendVal.length} jornada{pendVal.length !== 1 ? 's' : ''} pendiente{pendVal.length !== 1 ? 's' : ''} de validación</span>
              <span style={{ color:'var(--text3)', marginLeft:4 }}>por el encargado</span>
            </div>
          </div>
        )
      })()}

      {/* Historial últimos 30 días */}
      {(() => {
        const histDays = Array.from({ length: 30 }, (_, i) => {
          const d = new Date(now)
          d.setDate(d.getDate() - i - 1)
          return d.toISOString().slice(0, 10)
        })
        const histWithRecs = histDays.map(ds => ({
          ds,
          recs: (db.records || []).filter(r => r.empId === u.id && r.inicio?.startsWith(ds) && r.fin),
        })).filter(h => h.recs.length > 0)
        if (!histWithRecs.length) return null
        return (
          <HistorialReciente histWithRecs={histWithRecs} openModal={openModal} u={u} />
        )
      })()}

      <div style={{ height: 20 }} />
    </PullToRefresh>

    {/* Informe in-app fullscreen overlay */}
    {informeUrl && (() => {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      const dlName = `jornada-${new Date().toISOString().slice(0,7)}.pdf`
      return (
        <div style={{ position:'fixed', inset:0, zIndex:300, background:'var(--bg-800)', display:'flex', flexDirection:'column' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--bg-700)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <button onClick={closeInforme} style={{ display:'flex', alignItems:'center', gap:5, background:'var(--bg-500)', border:'1px solid var(--border)', borderRadius:20, padding:'6px 14px', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:600, color:'var(--text2)', WebkitTapHighlightColor:'transparent' }}>
              ← Volver
            </button>
            <span style={{ fontSize:13, fontWeight:700, flex:1 }}>Registro de jornada</span>
            <a href={informeUrl} download={dlName}
              style={{ display:'flex', alignItems:'center', gap:5, background:'var(--primary)', border:'none', borderRadius:20, padding:'6px 14px', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700, color:'#fff', textDecoration:'none', WebkitTapHighlightColor:'transparent' }}>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Descargar
            </a>
          </div>
          {isMobile ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:18, padding:24 }}>
              <svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="var(--primary-light)" strokeWidth="1.4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--text2)', textAlign:'center', lineHeight:1.5 }}>Tu informe de jornada está listo.<br/>Descárgalo o ábrelo en el navegador.</div>
              <div style={{ display:'flex', gap:10, width:'100%', maxWidth:320 }}>
                <a href={informeUrl} download={dlName} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'13px', background:'var(--primary)', color:'#fff', borderRadius:'var(--r)', fontWeight:700, fontSize:13, textDecoration:'none', WebkitTapHighlightColor:'transparent' }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Descargar PDF
                </a>
                {informeBlob && 'share' in navigator && (
                  <button onClick={() => navigator.share({ files: [new File([informeBlob], dlName, { type:'application/pdf' })], title:'Registro de jornada' }).catch(()=>{})}
                    style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'13px', background:'var(--bg-500)', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:'var(--r)', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit', WebkitTapHighlightColor:'transparent' }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    Compartir
                  </button>
                )}
              </div>
            </div>
          ) : (
            <iframe src={informeUrl} title="Registro de jornada" style={{ flex:1, border:'none', width:'100%', background:'#fff' }} />
          )}
        </div>
      )
    })()}
    </>
  )
}

function HistorialReciente({ histWithRecs, openModal, u }) {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(7)

  const shown = histWithRecs.slice(0, visible)
  const hasMore = visible < histWithRecs.length

  return (
    <div style={{ padding:'0 16px 12px' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', background:'var(--bg-600)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'10px 14px', cursor:'pointer', fontFamily:'inherit', WebkitTapHighlightColor:'transparent', transition:'background .15s' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:14 }}>📅</span>
          <span style={{ fontSize:12, fontWeight:700, color:'var(--text2)' }}>Historial reciente</span>
          <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:10, background:'var(--primary-dim)', color:'var(--primary-light)' }}>{histWithRecs.length} días</span>
        </div>
        <span style={{ fontSize:14, color:'var(--text3)', transition:'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {open && (
        <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6 }}>
          {shown.map(({ ds, recs }) => {
            const totalMin = recs.reduce((s, r) => s + calcMin(r), 0)
            const label = new Date(ds + 'T12:00:00').toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'short' })
            const isUnder = totalMin > 0 && totalMin < 480
            return (
              <div key={ds} style={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'10px 14px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                  <div style={{ fontSize:12, fontWeight:700, textTransform:'capitalize' }}>{label}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    {isUnder && <span style={{ fontSize:9, fontWeight:700, color:'var(--orange)', background:'var(--orange-dim)', padding:'1px 5px', borderRadius:6 }}>↓ objetivo</span>}
                    <div style={{ fontSize:13, fontWeight:800, color: totalMin >= 480 ? 'var(--green)' : 'var(--primary-light)', fontVariantNumeric:'tabular-nums' }}>{mhm(totalMin)}</div>
                  </div>
                </div>
                {recs.map(r => {
                  const wm = Math.floor(recWorkSecs(r) / 60)
                  return (
                    <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:11, color:'var(--text3)', paddingTop:4, borderTop:'1px solid var(--border)', gap:8, flexWrap:'wrap' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                        <span>{ftime(r.inicio)} → {r.fin ? ftime(r.fin) : '—'}</span>
                        {!r.aceptada && <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:8, background:'var(--orange-dim)', color:'var(--orange)', border:'1px solid rgba(245,158,11,.2)', textTransform:'uppercase', letterSpacing:'.3px' }}>⏳ Por validar</span>}
                        {r.aceptada  && <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:8, background:'var(--green-dim)', color:'var(--green)', border:'1px solid rgba(54,178,126,.2)', textTransform:'uppercase', letterSpacing:'.3px' }}>✓ Validada</span>}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontWeight:600 }}>{mhm(wm)}</span>
                        <button
                          onClick={() => openModal('correccion', { rec: r, empName: u?.name })}
                          title="Solicitar corrección"
                          style={{ background:'var(--bg-500)', border:'1px solid var(--border)', borderRadius:6, padding:'2px 7px', cursor:'pointer', fontSize:10, color:'var(--text3)', fontFamily:'inherit', lineHeight:1.5 }}>
                          ✏️
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
          {hasMore && (
            <button onClick={() => setVisible(v => v + 7)}
              style={{ background:'none', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'9px', cursor:'pointer', fontSize:12, color:'var(--text3)', fontFamily:'inherit', fontWeight:600, transition:'background .15s' }}>
              Ver {Math.min(7, histWithRecs.length - visible)} días más…
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── TAB MENSAJES ──────────────────────────────────────────────────────────────
function TabMensajes({ db, u, toast, saveDB }) {
  const chats = db.chats || []
  const adminId = 'admin'
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  const conv = chats
    .filter(m => (m.from === u.id && m.to === adminId) || (m.from === adminId && m.to === u.id))
    .sort((a, b) => a.ts - b.ts)

  useEffect(() => {
    const hasUnread = chats.some(m => m.from === adminId && m.to === u.id && !m.leido)
    if (hasUnread) {
      saveDB({ chats: chats.map(m => m.from === adminId && m.to === u.id ? { ...m, leido: true } : m) })
    }
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }, [conv.length])

  const send = () => {
    const t = text.trim()
    if (!t) return
    const msg = { id: gid(), from: u.id, to: adminId, text: t, ts: Date.now(), leido: false }
    saveDB({ chats: [...chats, msg] })
    queuePush('__admin__', `Mensaje de ${u.name}`, t, 'chat', '/?go=admin:mensajes')
    setText('')
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }

  return (
    <div style={{ position:'absolute', top:0, left:0, right:0, bottom:'90px', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ padding:'14px 16px 12px', background:'linear-gradient(160deg,rgba(108,99,255,.08) 0%,transparent 100%)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'var(--primary-dim)', border:'1px solid var(--primary-glow)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--primary-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div>
            <div style={{ fontSize:20, fontWeight:800, letterSpacing:'-.5px' }}>Mensajes</div>
            <div style={{ fontSize:13, color:'var(--text3)' }}>Chat con administración</div>
          </div>
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:8, minHeight:0 }}>
        <div style={{ marginTop:'auto' }} />
        {!conv.length && (
          <div className="empty-premium">
            <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
            <div className="empty-premium-title">Sin mensajes aún</div>
            <div className="empty-premium-sub">Escríbele a la administración y responderá lo antes posible</div>
          </div>
        )}
        {conv.map(m => {
          const isMe = m.from === u.id
          const hora = new Date(m.ts).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })
          const dia  = new Date(m.ts).toLocaleDateString('es-ES', { day:'numeric', month:'short' })
          return (
            <div key={m.id} style={{ display:'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', alignItems:'flex-end', gap:7 }}>
              {!isMe && (
                <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginBottom:2, fontSize:9, fontWeight:800, color:'#fff', letterSpacing:'-.5px' }}>
                  Adm
                </div>
              )}
              <div style={{
                maxWidth:'78%', padding:'9px 13px',
                borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: isMe ? 'var(--primary)' : 'var(--bg-600)',
                border: isMe ? 'none' : '1px solid var(--border)',
                fontSize:13, color: isMe ? '#fff' : 'var(--text)', lineHeight:1.45
              }}>
                {!isMe && <div style={{ fontSize:10, fontWeight:700, color:'var(--primary-light)', marginBottom:3 }}>Administración</div>}
                {m.text}
                <div style={{ fontSize:10, color: isMe ? 'rgba(255,255,255,.55)' : 'var(--text4)', marginTop:3, textAlign:'right' }}>
                  {dia} · {hora}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', display:'flex', gap:8, background:'var(--bg-700)', flexShrink:0 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Escribe un mensaje…"
          style={{ flex:1, background:'var(--bg-500)', border:'1px solid var(--border)', borderRadius:22, padding:'10px 16px', fontSize:14, color:'var(--text)', fontFamily:'inherit', outline:'none' }}
        />
        <button
          onClick={send}
          disabled={!text.trim()}
          style={{ width:42, height:42, borderRadius:'50%', background:'var(--primary)', border:'none', cursor:text.trim()?'pointer':'default', opacity:text.trim()?1:.4, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'opacity .15s' }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  )
}

// ─── TAB VACACIONES ────────────────────────────────────────────────────────────
function TabVacaciones({ db, u, vac, toast, saveDB }) {
  const { openModal, showConfirm } = useAppStore()
  const myVacs = (db.vacaciones || []).filter(v => v.empId === u.id).sort((a,b) => b.fechaInicio.localeCompare(a.fechaInicio))

  const cancelVac = (id) => {
    showConfirm('¿Cancelar esta solicitud de vacaciones?', () => {
      saveDB({ vacaciones: (db.vacaciones || []).filter(v => v.id !== id) })
      toast('Solicitud cancelada', 3000, 'warn')
    })
  }

  const downloadVacICS = (v) => {
    const dtFin = new Date(v.fechaFin + 'T00:00:00')
    dtFin.setDate(dtFin.getDate() + 1)
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TIMES INC//ES', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:vac-${v.id}@times-inc`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').split('.')[0]}Z`,
      `DTSTART;VALUE=DATE:${v.fechaInicio.replace(/-/g,'')}`,
      `DTEND;VALUE=DATE:${dtFin.toISOString().slice(0,10).replace(/-/g,'')}`,
      `SUMMARY:Vacaciones ${u.name.split(' ')[0]}`,
      `DESCRIPTION:${v.dias} días de vacaciones aprobadas`,
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Vacaciones mañana', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n')
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `vacaciones-${v.fechaInicio}.ics`; a.click()
    URL.revokeObjectURL(url)
    toast('Archivo .ics descargado — ábrelo para añadir al calendario', 3000, 'ok')
  }
  const pct = vac.generated > 0 ? Math.round((vac.used / vac.generated) * 100) : 0
  const todayVacStr = today()
  const daysFrom = (ds) => Math.ceil((new Date(ds + 'T00:00:00') - new Date(todayVacStr + 'T00:00:00')) / 86400000)

  return (
    <PullToRefresh>
      <div className="vac-wrap2">
        <div className="vac-hero" style={{ paddingTop:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.2)', borderRadius:20, padding:'5px 12px', fontSize:11, fontWeight:700, color:'rgba(255,255,255,.9)', letterSpacing:'.4px', textTransform:'uppercase', marginBottom:8, width:'fit-content' }}>
            Mis Vacaciones
          </div>
          <div className="vac-hero-title">
            <span style={{ fontSize:42, fontWeight:900, letterSpacing:'-2px' }}>{vac.available}</span>
            <span style={{ fontSize:16, fontWeight:600, opacity:.8, marginLeft:6 }}>días disponibles</span>
          </div>
          <div className="vac-hero-sub">{vac.generated} generados · {vac.used} disfrutados · {vac.pending} pendientes</div>
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

          {myVacs.length > 0 ? (
            <>
              <div className="section-header">Mis solicitudes</div>
              <div className="stagger-in" style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {myVacs.map(v => (
                  <div key={v.id} className="vac-list-item card-lift">
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>{fds(v.fechaInicio)} → {fds(v.fechaFin)}</div>
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{v.dias} días · {v.motivo || 'Vacaciones'}</div>
                      {v.estado === 'rechazada' && v.motivoRechazo && (
                        <div style={{ fontSize:11, color:'var(--danger)', marginTop:3, fontStyle:'italic' }}>Motivo: {v.motivoRechazo}</div>
                      )}
                      {v.estado === 'aprobada' && (() => {
                        const until = daysFrom(v.fechaInicio), remaining = daysFrom(v.fechaFin)
                        if (until > 0) return <div style={{ fontSize:10, fontWeight:700, color:'var(--primary-light)', marginTop:3 }}>🗓 En {until} día{until>1?'s':''}</div>
                        if (remaining >= 0) return <div style={{ fontSize:10, fontWeight:700, color:'var(--green)', marginTop:3 }}>🌴 ¡Disfrutando! {remaining} día{remaining!==1?'s':''} restante{remaining!==1?'s':''}</div>
                        return null
                      })()}
                    </div>
                    <div className={`badge${v.estado==='aprobada' ? ' badge-green' : v.estado==='rechazada' ? ' badge-red' : ' badge-orange'}`}>
                      {v.estado === 'aprobada' ? '✓ Aprobada' : v.estado === 'rechazada' ? '✗ Rechazada' : '⏳ Pendiente'}
                    </div>
                    {v.estado === 'aprobada' && (
                      <button onClick={() => downloadVacICS(v)} title="Añadir al calendario"
                        style={{ background:'var(--primary-dim)', border:'1px solid var(--primary-glow)', cursor:'pointer', color:'var(--primary-light)', padding:'4px 7px', borderRadius:6, fontSize:13, lineHeight:1, fontFamily:'inherit' }}>
                        📅
                      </button>
                    )}
                    {v.estado === 'pendiente' && (
                      <button onClick={() => cancelVac(v.id)} title="Cancelar solicitud"
                        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text4)', padding:'4px 6px', borderRadius:6, fontSize:14, lineHeight:1, transition:'color .15s', fontFamily:'inherit' }}
                        onMouseEnter={e => e.currentTarget.style.color='var(--red)'}
                        onMouseLeave={e => e.currentTarget.style.color='var(--text4)'}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-premium">
              <div className="empty-premium-icon">
                <svg viewBox="0 0 24 24"><path d="M12 3c0 0 4 4 4 8s-4 8-4 8"/><path d="M12 3c0 0-4 4-4 8s4 8 4 8"/><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/></svg>
              </div>
              <div className="empty-premium-title">Sin solicitudes</div>
              <div className="empty-premium-sub">Pulsa el botón de arriba para solicitar tus vacaciones</div>
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
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
      const s = new Date((a.fechaInicio || a.fecha) + 'T00:00:00')
      const e = new Date((a.fechaFin || a.fecha) + 'T00:00:00')
      const d = new Date(s)
      while (d <= e) { days.push(lds(d)); d.setDate(d.getDate()+1) }
      return days
    })
  ), [db.ausencias, u.id])

  const medDays = useMemo(() => new Set(
    (db.medicos || []).filter(a => a.empId === u.id).flatMap(a => {
      const days = []
      const s = new Date((a.fechaInicio || a.fecha) + 'T00:00:00')
      const e = new Date((a.fechaFin || a.fecha) + 'T00:00:00')
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
    if (FESTIVOS_MADRID_2026[ds]) return 'festivo'
    if (absDays.has(ds) || medDays.has(ds)) return 'absence'
    const mins = workedMap[ds] || 0
    if (mins >= WD * 0.9) return 'complete'
    if (mins > 0) return 'pending'
    if (ds < todayStr) return 'missing'
    return 'future'
  }

  const monthStats = { complete: 0, pending: 0, absence: 0, vacation: 0, missing: 0, festivo: 0 }
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
              !isToday && status === 'vacation' ? 'vacation' : '',
              !isToday && status === 'weekend' ? 'weekend' : '',
              !isToday && status === 'missing' ? 'cal-missing' : '',
              !isToday && status === 'festivo' ? 'cal-festivo' : '',
              selDay === ds ? 'cal-selected' : '',
            ].filter(Boolean).join(' ')

            return (
              <div key={i} className={cls} onClick={() => setSelDay(selDay === ds ? null : ds)} title={FESTIVOS_MADRID_2026[ds] || undefined}>
                {date.getDate()}
                {mins > 0 && !isToday && <div className="cal-hrs">{Math.floor(mins/60)}h</div>}
                {status === 'absence' && !isToday && <div className="cal-hrs">✕</div>}
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
          const statusLabels = { complete:'Jornada completa', pending:'Jornada incompleta', absence:'Ausencia', vacation:'Vacaciones', missing:'Sin fichaje', weekend:'Fin de semana', festivo: FESTIVOS_MADRID_2026[selDay] || 'Festivo', future:'' }
          const statusColors = { complete:'var(--green)', pending:'var(--orange)', absence:'var(--red)', vacation:'var(--blue)', missing:'var(--text4)', weekend:'var(--text4)', festivo:'#e879f9', future:'var(--text4)' }
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
                    {status === 'absence' ? 'Día de ausencia registrado' : status === 'vacation' ? 'Día de vacaciones' : 'Sin registros este día'}
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
          {[['var(--green)','Completo'],['var(--orange)','Parcial'],['var(--red)','Ausencia'],['var(--blue)','Vacaciones']].map(([c,l]) => (
            <div key={l} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--text2)' }}>
              <div style={{ width:10, height:10, borderRadius:3, background:c, flexShrink:0 }} />{l}
            </div>
          ))}
        </div>
      </div>
    </PullToRefresh>
  )
}

// ─── TAB PERFIL ────────────────────────────────────────────────────────────────
function TabPerfil({ u, session, db, saveDB, toast, doLogout, openModal }) {
  if (!db.records) return (
    <div className="emp-tab active">
      <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:12 }}>
        <div className="skeleton" style={{ height:140, borderRadius:14 }} />
        <div className="skeleton" style={{ height:80, borderRadius:14 }} />
        <div className="skeleton" style={{ height:200, borderRadius:14 }} />
      </div>
    </div>
  )
  const initials = u.initials || u.name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  const vac = vacData(u.id, db)
  const now = new Date()
  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
  const monthMin = (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio?.startsWith(mk)).reduce((s, r) => s + calcMin(r), 0)
  const pendingDocs = (db.documentos || []).filter(d => d.empId === u.id && !d.firma).length

  // Personal stats
  const myRecs = useMemo(() => (db.records || []).filter(r => r.empId === u.id && r.fin), [db.records, u.id])
  const yearStr = `${now.getFullYear()}-`
  const yearRecs = myRecs.filter(r => r.inicio?.startsWith(yearStr))
  const yearMin = yearRecs.reduce((s, r) => s + calcMin(r), 0)
  const yearDays = new Set(yearRecs.map(r => r.inicio.slice(0, 10))).size
  const dayMap = {}
  myRecs.forEach(r => { if (!r.inicio) return; const d = r.inicio.slice(0,10); dayMap[d] = (dayMap[d]||0) + calcMin(r) })
  const recordMin = Math.max(0, ...Object.values(dayMap).filter(Boolean))
  let streak = 0
  const sd = new Date(now)
  for (let i = 0; i < 90; i++) {
    const ds = sd.toISOString().slice(0,10)
    const isWeekend = sd.getDay() === 0 || sd.getDay() === 6
    if (!isWeekend) {
      if (dayMap[ds]) streak++
      else if (i > 0) break
    }
    sd.setDate(sd.getDate() - 1)
  }

  const saveAccentColor = useCallback((color) => {
    const emps2 = (db.employees || []).map(e => e.id === u.id ? { ...e, accentColor: color || undefined } : e)
    saveDB({ employees: emps2 })
    if (color) applyBrandColor(color)
  }, [db.employees, u.id, saveDB])

  const saveReminderTime = useCallback((time) => {
    const emps2 = (db.employees || []).map(e => e.id === u.id ? { ...e, reminderTime: time || undefined } : e)
    saveDB({ employees: emps2 })
    if (time && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    toast(time ? `Recordatorio activado a las ${time}` : 'Recordatorio desactivado', 2500, 'ok')
  }, [db.employees, u.id, saveDB, toast])

  return (
    <PullToRefresh>
      <div className="prf-hero">
        <div style={{ position:'relative', marginBottom:14 }}>
          <div className="prf-av-wrap">
            <div className="prf-av" style={{ background: u.color || 'var(--primary)' }}>{initials}</div>
          </div>
        </div>
        <div className="prf-name">{u.name}</div>
        <div className="prf-role">{u.role === 'encargado' ? '⭐ Encargado' : u.role === 'jefe_obra' ? '🏗️ Jefe de Obra' : '👷 Empleado'}</div>
        <div style={{ fontSize:12, color:'var(--text4)', textAlign:'center', marginBottom:10 }}>{u.empresa || u.centroTrabajo || '—'}</div>
        <div className="prf-status-pill"><span className="dot" />Activo</div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:0, margin:'12px 16px 16px', background:'var(--glass-bg)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', border:'1px solid var(--glass-border)', borderRadius:'var(--r-lg)', flexShrink:0 }}>
        {[
          { val: mhm(monthMin), lbl:'Mes actual', color:'var(--primary-light)' },
          { val: vac.available, lbl:'Días vac.', color:'var(--green)' },
          { val: vac.months, lbl:'Antigüedad', color:'var(--teal)' },
        ].map(({ val, lbl, color }, i) => (
          <div key={lbl} style={{ padding:'16px 8px', textAlign:'center', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
            <div className="counter-val" style={{ fontSize:20, fontWeight:800, letterSpacing:'-.4px', color }}>{val}</div>
            <div style={{ fontSize:9, color:'var(--text4)', textTransform:'uppercase', letterSpacing:'.5px', fontWeight:700, marginTop:4 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Personal stats */}
      <div style={{ margin:'0 16px 16px' }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:12 }}>Mis estadísticas</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
          {[
            { val:`${yearDays}`, unit:'días', lbl:'Trabajados (año)', ico:'📅', color:'var(--primary-light)', bg:'var(--primary-dim)' },
            { val:mhm(yearMin), unit:'', lbl:'Horas totales (año)', ico:'⏱️', color:'var(--teal)', bg:'rgba(0,212,255,.1)' },
            { val:`${streak}`, unit:'días', lbl:'Racha actual', ico:'🔥', color:'var(--orange)', bg:'var(--orange-dim)' },
            { val:recordMin > 0 ? mhm(recordMin) : '—', unit:'', lbl:'Récord diario', ico:'🏆', color:'var(--green)', bg:'var(--green-dim)' },
          ].map(({ val, unit, lbl, ico, color, bg }) => (
            <div key={lbl} style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--r-lg)', padding:'14px 12px', backdropFilter:'blur(10px)', WebkitBackdropFilter:'blur(10px)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <div style={{ width:28, height:28, borderRadius:8, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>{ico}</div>
                <div style={{ fontSize:10, color:'var(--text3)', fontWeight:600, lineHeight:1.2 }}>{lbl}</div>
              </div>
              <div style={{ fontSize:22, fontWeight:800, color, letterSpacing:'-.5px' }}>{val}<span style={{ fontSize:12, fontWeight:500, opacity:.7, marginLeft:2 }}>{unit}</span></div>
            </div>
          ))}
        </div>

      </div>

      {/* ── Logros ────────────────────────────────────────────────── */}
      <AchievementsSection myRecs={myRecs} streak={streak} />

      {/* ── Mi actividad — heatmap ─────────────────────────────────── */}
      <div style={{ margin:'0 16px 16px' }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:12 }}>Mi actividad (15 semanas)</div>
        <WorkHeatmap records={db.records} empId={u.id} />
      </div>

      {/* ── Color de acento personal ───────────────────────────────── */}
      <div style={{ margin:'0 16px 16px' }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:12 }}>Mi color personal</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          {ACCENT_PRESETS.map(c => (
            <div key={c} onClick={() => saveAccentColor(u.accentColor === c ? null : c)}
              style={{ width:26, height:26, borderRadius:'50%', background:c, cursor:'pointer', flexShrink:0,
                border: u.accentColor === c ? '2px solid var(--text)' : '2px solid transparent',
                transform: u.accentColor === c ? 'scale(1.25)' : 'scale(1)',
                transition:'transform .15s, border-color .15s' }} />
          ))}
          <label style={{ width:26, height:26, borderRadius:'50%', overflow:'hidden', cursor:'pointer', flexShrink:0, border:'1px dashed var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }} title="Color personalizado">
            🎨
            <input type="color" value={u.accentColor||'#5E6AD2'} onChange={e => saveAccentColor(e.target.value)} style={{ opacity:0, position:'absolute', width:1, height:1 }} />
          </label>
        </div>
        {u.accentColor && (
          <button onClick={() => saveAccentColor(null)} style={{ marginTop:8, fontSize:11, color:'var(--text4)', background:'none', border:'none', cursor:'pointer', padding:0 }}>
            Restaurar color por defecto
          </button>
        )}
      </div>

      {/* ── Recordatorio de fichaje ────────────────────────────────── */}
      <div style={{ margin:'0 16px 16px' }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:12 }}>Recordatorio de fichaje</div>
        <div style={{ padding:'12px 14px', background:'var(--bg-600)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:20 }}>⏰</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--text2)', marginBottom:4 }}>Avísame si a las… no he fichado</div>
            <input type="time" value={u.reminderTime || ''} onChange={e => saveReminderTime(e.target.value)}
              style={{ fontSize:14, fontWeight:700, background:'none', border:'none', color:'var(--primary-light)', padding:0, fontFamily:'inherit', cursor:'pointer' }} />
          </div>
          {u.reminderTime && (
            <button onClick={() => saveReminderTime('')} style={{ fontSize:14, color:'var(--text4)', background:'none', border:'none', cursor:'pointer', padding:4 }}>✕</button>
          )}
        </div>
        <div style={{ fontSize:10, color:'var(--text4)', marginTop:6 }}>Necesitas tener notificaciones activadas para recibir el aviso.</div>
      </div>

      {/* Cierres mensuales pendientes de firma */}
      {(() => {
        const pendingCierres = (db.cierres || []).filter(c => c.empId === u.id && c.estado === 'pendiente')
        if (!pendingCierres.length) return null
        return (
          <div onClick={() => openModal('cierreSign')} style={{ margin:'0 0 14px', padding:'12px 16px', background:'var(--orange-dim)', border:'1px solid rgba(245,158,11,.25)', borderRadius:'var(--r-lg)', cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:22 }}>📋</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--orange)' }}>Cierre mensual pendiente de firma</div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{pendingCierres.map(c => c.mes).join(', ')} · Toca para revisar y firmar</div>
            </div>
            <span style={{ minWidth:20, height:20, borderRadius:10, background:'var(--orange)', color:'#fff', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 5px', flexShrink:0 }}>{pendingCierres.length}</span>
          </div>
        )
      })()}

      <div className="prf-menu">
        {[
          { icon:<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>, label:'Información personal', onClick:()=>openModal('infoPersonal') },
          { icon:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>, label:'Documentos', badge: pendingDocs, onClick:()=>openModal('documentos') },
          { icon:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>, label:'Configuración', onClick:()=>openModal('configuracion') },
          { icon:<><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></>, label:'Firma digital', color:'rgba(124,92,255,.12)', stroke:'#a78bfa', onClick:() => openModal('sign'), noFirma: !db.firmas?.[u?.id]?.main },
        ].map(({ icon, label, color, stroke, onClick, badge, noFirma }) => (
          <div key={label} className="prf-menu-item" onClick={onClick}>
            <div className="prf-menu-ico" style={color ? { background:color } : {}}>
              <svg viewBox="0 0 24 24" style={stroke ? { stroke } : {}}>{icon}</svg>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <span className="prf-menu-lbl">{label}</span>
              {noFirma && <div style={{ fontSize:10, color:'var(--orange)', fontWeight:600, marginTop:1 }}>Sin configurar — toca para añadir</div>}
            </div>
            {badge > 0 && <span style={{ minWidth:18, height:18, borderRadius:9, background:'var(--orange)', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 5px', marginRight:4 }}>{badge}</span>}
            {noFirma && <span style={{ fontSize:10, color:'var(--orange)', marginRight:6 }}>!</span>}
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
    </PullToRefresh>
  )
}

// ─── MODALS ────────────────────────────────────────────────────────────────────
function ModalSelCentro({ visible, data, onConfirm, onClose }) {
  const [sel, setSel] = useState('')
  useEffect(() => { if (data?.current) setSel(data.current) }, [data])
  useModalBack(visible, onClose)
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
  const mensajes = (db.mensajes || []).filter(m => m.to === 'all' || m.to === u?.id).slice(-10).reverse()
  useModalBack(visible, onClose)
  if (!visible) return null
  const markRead = () => {
    const updated = (db.notis || []).map(n => ({ ...n, leido: true }))
    saveDB({ notis: updated })
    try { if ('clearAppBadge' in navigator) navigator.clearAppBadge() } catch {}
  }
  const delNoti = (id) => {
    saveDB({ notis: (db.notis || []).filter(n => n.id !== id) })
  }
  const clearAll = () => {
    saveDB({ notis: (db.notis || []).filter(n => n.empId !== u?.id) })
    try { if ('clearAppBadge' in navigator) navigator.clearAppBadge() } catch {}
  }
  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-drag" />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <h2 style={{ margin:0 }}>🔔 Notificaciones</h2>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {notis.length > 0 && <button onClick={clearAll} style={{ background:'none', border:'none', color:'var(--danger)', fontSize:11, fontWeight:600, cursor:'pointer', padding:'2px 6px' }}>Borrar todo</button>}
            <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:22, cursor:'pointer', lineHeight:1 }}>×</button>
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:'60vh', overflowY:'auto' }}>
          {mensajes.map(m => (
            <div key={'msg-'+m.id} className="nitem" style={{ borderLeft:'3px solid var(--primary)' }}>
              <div className="nitem-ico" style={{ background:'var(--primary-dim)' }}>📢</div>
              <div className="nitem-body">
                <div className="nitem-title" style={{ color:'var(--primary-light)' }}>{m.title}</div>
                <div className="nitem-text">{m.body}</div>
                <div className="nitem-time">Administración · {m.ts ? new Date(m.ts).toLocaleString('es-ES') : ''}</div>
              </div>
            </div>
          ))}
          {!notis.length && !mensajes.length ? (
            <div className="empty">Sin notificaciones</div>
          ) : notis.map(n => (
            <div key={n.id} className={`nitem${!n.leido ? ' unread' : ''}`} style={{ position:'relative' }}>
              <div className="nitem-ico" style={{ background:'rgba(108,99,255,.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#6c63ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              </div>
              <div className="nitem-body">
                <div className="nitem-title">{n.action || n.title || 'Notificación'}</div>
                <div className="nitem-text">{n.detail || n.body || ''}</div>
                <div className="nitem-time">{n.ts ? new Date(n.ts).toLocaleString('es-ES') : ''}</div>
              </div>
              <button onClick={() => delNoti(n.id)} style={{ position:'absolute', top:6, right:6, background:'none', border:'none', color:'var(--text4)', fontSize:16, cursor:'pointer', lineHeight:1, padding:'2px 5px', borderRadius:4 }} title="Eliminar">×</button>
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
  useModalBack(visible, onClose)
  if (!visible) return null

  const submit = () => {
    if (!fi || !ff) { toast('Selecciona fechas'); return }
    const s = new Date(fi + 'T00:00:00'), e = new Date(ff + 'T00:00:00')
    if (s > e) { toast('Fecha fin debe ser posterior'); return }
    const days = Math.round((e - s) / 86400000) + 1  // días naturales (inclusivo)
    const vac = { id: gid(), empId: u.id, empName: u.name, fechaInicio: fi, fechaFin: ff, dias: days, motivo: motivo || 'Vacaciones', estado: 'pendiente', ts: new Date().toISOString() }
    const noti = { id: gid(), empId: '__admin__', action: 'Nueva solicitud de vacaciones', detail: `${u.name}: ${fds(fi)} → ${fds(ff)}`, ts: new Date().toISOString(), leido: false }
    saveDB({ vacaciones: [...(db.vacaciones||[]), vac], notis: [...(db.notis||[]), noti] })
    queuePush('__admin__', noti.action, noti.detail, 'times-vac', '/?go=admin:solicitudes')
    toast('Solicitud enviada', 3000, 'ok')
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
        {fi && ff && new Date(fi+'T00:00:00') <= new Date(ff+'T00:00:00') && (
          <div style={{ background:'var(--primary-dim)', border:'1px solid var(--primary-glow)', borderRadius:'var(--r)', padding:'10px 14px', fontSize:13, fontWeight:600, color:'var(--primary-light)', marginBottom:4 }}>
            🗓 {Math.round((new Date(ff+'T00:00:00') - new Date(fi+'T00:00:00')) / 86400000) + 1} días naturales
          </div>
        )}
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
  const { canvasRef, handlers, clearCanvas, initCanvas, getSignatureData } = useSignatureCanvas()
  const [mode, setMode] = useState('view')

  const existingFirma = db.firmas?.[u?.id]?.main

  useEffect(() => { if (visible) setMode(existingFirma ? 'view' : 'draw') }, [visible])
  useEffect(() => { if (mode === 'draw') initCanvas() }, [mode])

  useModalBack(visible, onClose)
  if (!visible) return null

  const save = () => {
    const data = getSignatureData()
    if (!data) { toast('Dibuja tu firma antes de guardar'); return }
    if (data.length > 200000) { toast('Firma muy grande, simplifica los trazos'); return }
    const firmas = { ...(db.firmas || {}), [u.id]: { ...(db.firmas?.[u.id] || {}), main: { data, updatedAt: new Date().toISOString(), empName: u.name } } }
    saveDB({ firmas })
    toast('Firma guardada correctamente', 3000, 'ok')
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
              <button className="btn btn-secondary" onClick={() => setMode('draw')}>Actualizar firma</button>
              <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom:8 }}>
              <canvas ref={canvasRef} width={640} height={200}
                style={{ width:'100%', height:150, borderRadius:'var(--r)', background:'#0D1218', cursor:'crosshair', touchAction:'none', border:'1px solid var(--border2)', display:'block' }}
                {...handlers} />
            </div>
            <div style={{ fontSize:11, color:'var(--text3)', textAlign:'center', marginBottom:16 }}>Dibuja tu firma con el dedo o ratón</div>
            <div className="modal-btns">
              <button className="btn btn-secondary" onClick={clearCanvas}>Borrar</button>
              {existingFirma && <button className="btn btn-secondary" onClick={() => setMode('view')}>Cancelar</button>}
              <button className="btn btn-primary" onClick={save}>Guardar firma</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Motor de respuestas IA con datos reales (Firebase RTDB).
// Centraliza el análisis para que sea fácil de extender.
function aiAnswer(q, db, u) {
  const ql = q.toLowerCase()
  const now = new Date()
  const mk = `${now.getFullYear()}-${p2(now.getMonth() + 1)}`
  const mine = (db.records || []).filter(r => r.empId === u?.id)
  const fin = mine.filter(r => r.fin)

  // Semana actual y anterior
  const ws = wkStart(now)
  const prevWs = new Date(ws); prevWs.setDate(prevWs.getDate() - 7)
  const weekMin = fin.filter(r => new Date(r.inicio) >= ws).reduce((s, r) => s + calcMin(r), 0)
  const prevWeekMin = fin.filter(r => { const d = new Date(r.inicio); return d >= prevWs && d < ws }).reduce((s, r) => s + calcMin(r), 0)

  const monthMin = fin.filter(r => r.inicio?.startsWith(mk)).reduce((s, r) => s + calcMin(r), 0)
  // Regla TIMES INC: extras = semanas >40h, descontando déficit hasta 160h/mes
  const mExt = u ? monthlyExtras(db.records, u.id, mk) : { netExtraMin: 0, deficitMin: 0, weeklyExtraMin: 0, shortfallMin: 0, workedMin: 0 }
  const vac = u ? vacData(u.id, db) : { available: 0, generated: 0, used: 0 }

  // ¿Por qué trabajé menos esta semana?
  if ((ql.includes('menos') || ql.includes('por qu') || ql.includes('porqu')) && ql.includes('semana')) {
    if (prevWeekMin === 0) return `📊 Esta semana llevas **${mhm(weekMin)}**. No tengo datos de la semana anterior para comparar todavía.`
    const diff = weekMin - prevWeekMin
    const pct = Math.round(Math.abs(diff) / prevWeekMin * 100)
    if (diff >= 0) return `📈 En realidad has trabajado **${mhm(weekMin)}** esta semana, ${pct}% **más** que la anterior (${mhm(prevWeekMin)}). ¡Buen ritmo!`
    return `📉 Esta semana acumulas **${mhm(weekMin)}**, un ${pct}% menos que la semana pasada (${mhm(prevWeekMin)}). La diferencia son ${mhm(Math.abs(diff))} — revisa si algún día saliste antes o faltó un fichaje.`
  }

  // ¿Cuántas horas extra tengo?
  if (ql.includes('extra')) {
    const { netExtraMin, deficitMin, weeklyExtraMin, shortfallMin } = mExt
    if (netExtraMin > 0) {
      const comp = shortfallMin > 0
        ? ` (${mhm(weeklyExtraMin)} semanales − ${mhm(shortfallMin)} de déficit mensual)`
        : ''
      return `⚡ Tienes **${mhm(netExtraMin)}** de horas extra netas este mes${comp}. Llevas **${mhm(monthMin)}** trabajados sobre el objetivo de 160h.`
    }
    if (deficitMin > 0) {
      return `⚠️ Este mes tienes un déficit de **${mhm(deficitMin)}** para llegar a 160h. Llevas **${mhm(monthMin)}** trabajados.${weeklyExtraMin > 0 ? ` Las ${mhm(weeklyExtraMin)} extra semanales ya se usaron para compensar.` : ''}`
    }
    return `✅ Este mes llevas **${mhm(monthMin)}** trabajados. ${monthMin >= 9600 ? '¡Ya has cubierto las 160h objetivo!' : `Te faltan ${mhm(9600 - monthMin)} para llegar a 160h.`} Sin horas extra acumuladas todavía.`
  }

  // ¿Quién olvidó fichar? (visión de equipo si eres admin/encargado)
  if (ql.includes('olvid') || ql.includes('quién') || ql.includes('quien') || ql.includes('sin fichar')) {
    const todayStr = today()
    const emps = (db.employees || []).filter(e => !e.baja)
    const ficharon = new Set((db.records || []).filter(r => r.inicio?.startsWith(todayStr)).map(r => r.empId))
    const sinFichar = emps.filter(e => !ficharon.has(e.id))
    if (!sinFichar.length) return `✅ Hoy todo el equipo ha fichado (${emps.length} personas).`
    return `⚠️ Hoy aún no han fichado ${sinFichar.length} de ${emps.length}:\n${sinFichar.slice(0, 8).map(e => `• ${e.name}`).join('\n')}`
  }

  // Resumen semanal
  if (ql.includes('resumen') || (ql.includes('semana') && (ql.includes('cómo') || ql.includes('como') || ql.includes('va')))) {
    const dias = fin.filter(r => new Date(r.inicio) >= ws).length
    const trend = prevWeekMin > 0 ? (weekMin >= prevWeekMin ? '↑' : '↓') : ''
    return `📋 **Resumen de tu semana**\n• Trabajado: ${mhm(weekMin)} ${trend}\n• Jornadas: ${dias} día(s)\n• Media diaria: ${dias ? mhm(Math.round(weekMin / dias)) : '0h'}\n• Objetivo semanal: ${mhm(WK)}`
  }

  // Horas / trabajado
  if (ql.includes('hora') || ql.includes('trabaj')) {
    return `📊 Este mes llevas **${mhm(monthMin)}** trabajados (referencia: ${mhm(WD * 20)}). Esta semana: ${mhm(weekMin)}.`
  }

  // Vacaciones / cuándo cobro
  if (ql.includes('vac') || ql.includes('cobr')) {
    return `🌴 Tienes **${vac.available} días** de vacaciones disponibles (${vac.generated} generados, ${vac.used} usados este año).`
  }

  // Historial
  if (ql.includes('historial') || ql.includes('registro') || ql.includes('último') || ql.includes('ultimo')) {
    const last = fin.slice(-3).reverse()
    if (last.length) return `📋 Tus últimos registros:\n${last.map(r => `• ${r.inicio?.slice(0, 10) || '—'}: ${mhm(calcMin(r))}`).join('\n')}`
    return '📋 Aún no tienes registros completados.'
  }

  if (ql.includes('hola') || ql.includes('puedes') || ql.includes('ayuda')) {
    return `👋 ¡Hola ${u?.name.split(' ')[0]}! Soy Times AI. Puedo analizar tu jornada en tiempo real:\n• Horas trabajadas y extra\n• Comparar semanas\n• Balance de vacaciones\n• Quién olvidó fichar hoy`
  }

  return '🤖 Puedo ayudarte con tus horas, horas extra, comparar semanas, vacaciones, historial o quién olvidó fichar. ¿Qué necesitas?'
}

const AI_CHIPS = [
  '¿Por qué trabajé menos esta semana?',
  '¿Cuántas horas extra tengo?',
  '¿Quién olvidó fichar?',
  'Resumen semanal',
  '¿Cuándo cobro vacaciones?',
]

function ModalAI({ visible, db, u, onClose }) {
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const chatRef = useRef(null)

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [msgs, thinking])

  useModalBack(visible, onClose)
  if (!visible) return null

  const ask = (q) => {
    const text = (q || input).trim()
    if (!text || thinking) return
    setInput('')
    setMsgs(m => [...m, { role: 'user', text }])
    setThinking(true)
    setTimeout(() => {
      const ans = aiAnswer(text, db, u)
      setThinking(false)
      setMsgs(m => [...m, { role: 'bot', text: ans }])
      try { navigator.vibrate(6) } catch {}
    }, 520)
  }

  // Renderiza **negritas** simples
  const fmt = (t) => t.split('**').map((part, i) => i % 2 === 1
    ? <strong key={i} style={{ color: 'var(--primary-light)' }}>{part}</strong>
    : <span key={i}>{part}</span>)

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-drag" />

        {/* Header estilo asistente */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 14, background: 'linear-gradient(135deg,#2563EB,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, boxShadow: '0 4px 14px rgba(37,99,235,.4)' }}>✨</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.3px' }}>Times AI</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Asistente de jornada · datos en vivo</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }} aria-label="Cerrar">×</button>
        </div>

        {/* Chat */}
        <div className="ai-chat" ref={chatRef} style={{ maxHeight: '42vh' }}>
          {!msgs.length && (
            <div className="ai-msg-bot" style={{ whiteSpace: 'pre-line' }}>
              {fmt(`👋 ¡Hola ${u?.name.split(' ')[0] || ''}! Soy **Times AI**. Pregúntame lo que quieras sobre tu jornada o usa una sugerencia.`)}
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'ai-msg-user' : 'ai-msg-bot'} style={{ whiteSpace: 'pre-line' }}>
              {m.role === 'user' ? m.text : fmt(m.text)}
            </div>
          ))}
          {thinking && (
            <div className="ai-msg-bot ai-typing"><span /><span /><span /></div>
          )}
        </div>

        {/* Chips sugerencias */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0 12px' }}>
          {AI_CHIPS.map(c => (
            <button key={c} onClick={() => ask(c)} className="ai-chip-btn">{c}</button>
          ))}
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" placeholder="Pregúntame sobre tu jornada…" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} />
          <button className="btn btn-primary" onClick={() => ask()} style={{ minWidth: 44 }} aria-label="Enviar">↑</button>
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

  useModalBack(visible, onClose)
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
          background: readonly ? 'var(--bg-700)' : 'var(--bg-800)', color:'var(--text)',
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
  const [stamping, setStamping] = useState(false)
  const [viewing, setViewing] = useState(null) // doc being previewed (read-only)
  // Cuando hay sub-vista (ver/firmar), el botón atrás cierra la sub-vista,
  // no el modal completo. closeRef en useModalBack se actualiza cada render
  // por lo que siempre captura el estado actual de viewing/signing.
  useModalBack(visible, () => {
    if (viewing || signing) { setViewing(null); setSigning(null) }
    else onClose()
  })
  if (!visible) return null

  const myDocs = (db.documentos || []).filter(d => d.empId === u?.id)
  const pendientes = myDocs.filter(d => !d.firma)
  const firmados = myDocs.filter(d => d.firma)
  const myFirma = db.firmas?.[u?.id]?.main

  const TIPO_LABELS = { nomina:'Nómina', contrato:'Contrato', jornada:'Jornada mensual' }
  const TIPO_COLORS = { nomina:'var(--primary-light)', contrato:'var(--teal)', jornada:'var(--orange)' }

  const firmarDoc = async (doc) => {
    if (!myFirma) { toast('Necesitas guardar tu firma primero en Perfil → Firma digital'); return }
    setStamping(true)
    const firmadoAt = new Date().toISOString()
    let fileData = doc.fileData
    try {
      const printable = await makePrintableSignature(myFirma.data)
      const label = `Firmado digitalmente por ${u.name} · ${new Date(firmadoAt).toLocaleString('es-ES')}`
      if (doc.fileData?.startsWith('data:application/pdf')) {
        fileData = await stampSignatureOnPdf(doc.fileData, printable, label)
      } else if (doc.fileData?.startsWith('data:image')) {
        fileData = await stampSignatureOnImage(doc.fileData, printable, label)
      }
    } catch (e) {
      console.warn('[FIRMA] No se pudo estampar la firma en el archivo:', e)
      toast('⚠️ No se pudo insertar la firma en el archivo, se guardó solo el registro')
    }
    const updated = (db.documentos || []).map(d => d.id === doc.id ? {
      ...d, fileData, firma: { firmadoAt, signatureData: myFirma.data, empName: u.name }
    } : d)
    const noti = { id: gid(), empId: '__admin__', action: 'Documento firmado', detail: `${u.name} firmó "${doc.titulo}"`, ts: firmadoAt, leido: false }
    const withAudit = auditLog(db, 'Documento firmado', `${u.name}: "${doc.titulo}"`, u.name)
    saveDB({ documentos: updated, notis: [...(db.notis || []), noti], audit: withAudit.audit })
    queuePush('__admin__', noti.action, noti.detail, 'times-doc', '/?go=admin:documentos')
    setStamping(false)
    toast('Documento firmado correctamente', 3000, 'ok')
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
        <button className="btn btn-sm btn-secondary" onClick={() => setViewing(d)}>
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:3 }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Ver
        </button>
        {!d.firma && <button className="btn btn-sm btn-primary" onClick={() => setSigning(d)}>Firmar</button>}
        {d.firma && d.firma.signatureData && <img src={d.firma.signatureData} alt="firma" style={{ height:28, borderRadius:4, border:'1px solid var(--border)', background:'var(--bg-500)' }} />}
      </div>
    </div>
  )

  return (
    <div className="modal-ov" onClick={(signing || viewing) ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:560 }}>
        <div className="modal-drag" />
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
          {(viewing || signing) && (
            <button onClick={() => { setViewing(null); setSigning(null) }} style={{ background:'var(--bg-500)', border:'1px solid var(--border)', color:'var(--text2)', width:32, height:32, borderRadius:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          )}
          <h2 style={{ margin:0, fontSize:18, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{viewing ? viewing.titulo : signing ? signing.titulo : 'Mis documentos'}</h2>
          <button onClick={() => { setViewing(null); setSigning(null); onClose() }} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:22, cursor:'pointer', flexShrink:0 }}>×</button>
        </div>

        {/* Read-only viewer */}
        {viewing && !signing && (
          <div style={{ marginBottom:16 }}>
            <DocPreview d={viewing} db={db} empId={u.id} />
            <div className="modal-btns" style={{ marginTop:12 }}>
              {!viewing.firma && <button className="btn btn-primary" onClick={() => { setSigning(viewing); setViewing(null) }}>Firmar</button>}
            </div>
          </div>
        )}

        {/* Confirm signing */}
        {signing && (
          <div style={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:16, marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>{signing.titulo}</div>
            <div style={{ marginBottom:12 }}><DocPreview d={signing} db={db} empId={u.id} /></div>
            {myFirma ? (
              <>
                <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6 }}>Tu firma guardada:</div>
                <img src={myFirma.data} alt="tu firma" style={{ width:'100%', height:80, objectFit:'contain', background:'#0D1218', borderRadius:8, border:'1px solid var(--border)', marginBottom:12 }} />
                <div style={{ fontSize:11, color:'var(--text3)', marginBottom:12 }}>Al confirmar, esta firma se insertará en el documento de forma permanente.</div>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-secondary" disabled={stamping} onClick={() => setSigning(null)}>Cancelar</button>
                  <button className="btn btn-primary" disabled={stamping} onClick={() => firmarDoc(signing)}>{stamping ? 'Firmando…' : 'Confirmar y firmar'}</button>
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

        {!signing && !viewing && (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}

function ModalConfiguracion({ visible, u, db, onClose, toast, saveDB }) {
  const [notiFichaje, setNotiFichaje] = useState(() => getCfg('notiFichaje', true))
  const [notiSalida, setNotiSalida] = useState(() => getCfg('notiSalida', true))
  const [gpsAuto, setGpsAuto] = useState(() => getCfg('gpsAuto', true))
  const [reminderTime, setReminderTime] = useState(() => getCfg('reminderTime', '20:00'))
  const [salidaTime, setSalidaTime] = useState(() => getCfg('salidaTime', '21:00'))
  const [idioma, setIdioma] = useState(() => getCfg('idioma', 'es'))
  const [formato, setFormato] = useState(() => getCfg('formato', '24h'))
  const [isLight, setIsLight] = useState(() => document.documentElement.getAttribute('data-theme') === 'light')

  useModalBack(visible, onClose)
  if (!visible) return null

  const save = () => {
    setCfg('notiFichaje', notiFichaje)
    setCfg('notiSalida', notiSalida)
    setCfg('gpsAuto', gpsAuto)
    setCfg('reminderTime', reminderTime)
    setCfg('salidaTime', salidaTime)
    setCfg('idioma', idioma)
    setCfg('formato', formato)
    if (u?.id && saveDB && db) {
      const updEmps = (db.employees || []).map(e => e.id === u.id ? { ...e, reminderTime } : e)
      saveDB({ employees: updEmps })
    }
    toast('Configuración guardada')
    onClose()
  }

  const toggle = (label, value, onChange) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:14, color:'var(--text)' }}>{label}</span>
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
        {/* Notificaciones del sistema (permiso del navegador) */}
        {(() => {
          const perm = typeof Notification !== 'undefined' ? Notification.permission : 'granted'
          if (perm === 'denied') return (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontSize:14, color:'var(--text)' }}>Notificaciones del sistema</span>
              <span style={{ fontSize:11, color:'var(--danger)', fontWeight:600 }}>Bloqueadas — activa en ajustes del navegador</span>
            </div>
          )
          if (perm === 'granted') return (
            <>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:14, color:'var(--text)' }}>Notificaciones del sistema</span>
                <span style={{ fontSize:11, color:'var(--green)', fontWeight:600 }}>✓ Activadas</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontSize:14, color:'var(--text)' }}>Probar notificación</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>Envía un push a este dispositivo</div>
                </div>
                <button onClick={async () => {
                  try {
                    const r = await pushSubscribe(u.id, VAPID_PUB)
                    if (!r?.ok) { toast(r?.error || r?.reason || 'No se pudo suscribir', 7000, 'err'); return }
                    const res = await queuePush(u.id, '🔔 Prueba de notificación', 'Si ves esto, el sistema funciona correctamente.', 'test-' + Date.now(), '/')
                    if (res?.ok) toast('Push enviado — revisa la barra de estado', 4000, 'ok')
                    else toast('Push falló: ' + (res?.error || res?.status || 'desconocido'), 7000, 'err')
                  } catch (e) { toast('Error: ' + e.message, 6000, 'err') }
                }} style={{ background:'var(--primary)', color:'#fff', border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0 }}>Probar</button>
              </div>
            </>
          )
          return (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontSize:14, color:'var(--text)' }}>Notificaciones del sistema</span>
              <button onClick={async () => {
                try {
                  const p = await Notification.requestPermission()
                  if (p === 'granted') { toast('Notificaciones activadas', 3000, 'ok'); onClose() }
                  else toast('Permiso denegado', 3000, 'err')
                } catch { toast('No soportado en este dispositivo', 3000) }
              }} style={{ background:'var(--primary)', color:'#fff', border:'none', borderRadius:8, padding:'5px 12px', fontSize:12, fontWeight:700, cursor:'pointer' }}>Activar</button>
            </div>
          )
        })()}
        {toggle('Notificaciones de fichaje', notiFichaje, setNotiFichaje)}
        {toggle('Recordatorio de salida', notiSalida, setNotiSalida)}
        {toggle('GPS automático', gpsAuto, setGpsAuto)}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
          <span style={{ fontSize:14, color:'var(--text)' }}>Modo claro</span>
          <div
            onClick={() => { toggleTheme(); setIsLight(l => !l); toast(isLight ? 'Modo oscuro activado' : 'Modo claro activado') }}
            style={{ width:44, height:24, borderRadius:12, background: isLight ? 'var(--primary)' : 'var(--bg-600)', cursor:'pointer', position:'relative', transition:'background .2s' }}
          >
            <div style={{ position:'absolute', top:3, left: isLight ? 23 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s' }} />
          </div>
        </div>
        <div style={{ padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:14, color:'var(--text)', marginBottom:4 }}>Recordatorio de entrada</div>
          <div style={{ fontSize:11, color:'var(--text3)', marginBottom:8 }}>Avisa si no has fichado a esta hora</div>
          <input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-700)', color:'var(--text)', fontSize:14 }} />
        </div>
        <div style={{ padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:14, color:'var(--text)', marginBottom:4 }}>Recordatorio de salida</div>
          <div style={{ fontSize:11, color:'var(--text3)', marginBottom:8 }}>Avisa si tienes jornada abierta a esta hora</div>
          <input type="time" value={salidaTime} onChange={e => setSalidaTime(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-700)', color:'var(--text)', fontSize:14 }} />
        </div>
        <div style={{ padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:14, color:'var(--text)', marginBottom:8 }}>Idioma</div>
          <select value={idioma} onChange={e => setIdioma(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-700)', color:'var(--text)', fontSize:14, width:'100%' }}>
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
          </select>
        </div>
        <div style={{ padding:'14px 0' }}>
          <div style={{ fontSize:14, color:'var(--text)', marginBottom:8 }}>Formato de hora</div>
          <select value={formato} onChange={e => setFormato(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-700)', color:'var(--text)', fontSize:14, width:'100%' }}>
            <option value="24h">24 horas</option>
            <option value="12h">12 horas (AM/PM)</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={save} style={{ width:'100%', marginTop:8 }}>Guardar</button>
      </div>
    </div>
  )
}

function WeeklyBars({ db, u, timer }) {
  const DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
  const now = new Date()
  const dow = (now.getDay() + 6) % 7
  const ws = wkStart(now)
  const bars = DAYS.map((label, i) => {
    const d = new Date(ws)
    d.setDate(d.getDate() + i)
    const ds = d.toISOString().slice(0, 10)
    let min = (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio?.startsWith(ds))
      .reduce((s, r) => s + calcMin(r), 0)
    if (i === dow && timer.state !== 'idle') min += Math.floor(timer.ws / 60)
    return { label, min, isToday: i === dow }
  })
  const maxMin = Math.max(1, ...bars.map(b => b.min))

  return (
    <div style={{ marginBottom: 12 }}>
      <div className="week-bars">
        {bars.map(({ label, min, isToday }) => (
          <div key={label} className={`week-bar${isToday ? ' today-bar' : ''}`}
            style={{ height: min > 0 ? Math.max(6, min / maxMin * 100) + '%' : '3px', opacity: min > 0 ? 1 : 0.3 }}>
            <span className="week-bar-label">{label}</span>
          </div>
        ))}
      </div>
      <div style={{ height: 22 }} />
    </div>
  )
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'
  if (next === 'dark') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', 'light')
  try { localStorage.setItem('theme', next) } catch {}
}

// ─── FIRMA DE CIERRE MENSUAL (empleado) ────────────────────────────────────────
function ModalCierreSign({ visible, db, u, onClose, toast, saveDB }) {
  const { canvasRef, handlers, clearCanvas, initCanvas, getSignatureData } = useSignatureCanvas()
  const [selIdx, setSelIdx] = useState(0)
  const pendingCierres = (db.cierres || []).filter(c => c.empId === u?.id && c.estado === 'pendiente')
  const selCierre = pendingCierres[selIdx] || null

  useEffect(() => { if (visible && selCierre) initCanvas() }, [visible, selCierre])

  useModalBack(visible, onClose)
  if (!visible || !selCierre) return null

  const firmar = () => {
    const signatureData = getSignatureData()
    if (!signatureData) { toast('Dibuja tu firma antes de confirmar'); return }
    const firmadoAt = new Date().toISOString()
    const updatedCierres = (db.cierres || []).map(ci => ci.id === selCierre.id
      ? { ...ci, estado:'firmado', firma:{ signatureData, firmadoAt, empName:u.name } } : ci)
    const noti = { id: gid(), empId:'__admin__', action:'Cierre firmado', detail:`${u.name} firmó el cierre de ${selCierre.mes}`, ts: firmadoAt, leido:false }
    saveDB({ cierres: updatedCierres, notis:[...(db.notis||[]), noti] })
    queuePush('__admin__', noti.action, noti.detail, 'cierre', '/?go=admin:informes')
    toast('Cierre mensual firmado correctamente', 3000, 'ok')
    onClose()
  }

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-drag" />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
          <h2 style={{ margin:0, fontSize:16 }}>📋 Cierre mensual · {selCierre.mes}</h2>
          {pendingCierres.length > 1 && (
            <div style={{ display:'flex', gap:4 }}>
              {pendingCierres.map((_, i) => (
                <button key={i} onClick={() => setSelIdx(i)} style={{ width:8, height:8, borderRadius:'50%', border:'none', cursor:'pointer', background: i===selIdx?'var(--primary)':'var(--bg-400)', padding:0 }} />
              ))}
            </div>
          )}
        </div>
        <div style={{ fontSize:12, color:'var(--text3)', marginBottom:12 }}>
          Generado por {selCierre.generadoPor} · {selCierre.dias} días trabajados · {mhm(selCierre.totalMin)}
        </div>

        {/* Records snapshot */}
        <div style={{ background:'var(--bg-600)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'10px 12px', marginBottom:14, maxHeight:160, overflowY:'auto' }}>
          {(selCierre.records_snapshot || []).map((r, i) => {
            const d = new Date(r.inicio)
            return (
              <div key={i} style={{ display:'flex', gap:8, fontSize:12, color:'var(--text2)', padding:'3px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ width:90, flexShrink:0, color:'var(--text3)' }}>{d.toLocaleDateString('es-ES',{day:'numeric',month:'short',weekday:'short'})}</span>
                <span style={{ flex:1, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.centro||'—'}</span>
                <span style={{ fontWeight:700, color:'var(--primary-light)', flexShrink:0 }}>{mhm(Math.floor((r.workSecs||0)/60))}</span>
              </div>
            )
          })}
        </div>

        <div style={{ fontSize:12, fontWeight:700, marginBottom:6, color:'var(--text2)' }}>Firma digital</div>
        <canvas ref={canvasRef} width={640} height={180}
          style={{ width:'100%', height:120, borderRadius:'var(--r)', background:'#0D1218', cursor:'crosshair', touchAction:'none', border:'1px solid var(--border2)', display:'block', marginBottom:6 }}
          {...handlers} />
        <button className="btn btn-secondary btn-sm" onClick={clearCanvas} style={{ marginBottom:14 }}>Borrar</button>
        <div className="modal-btns">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={firmar}>✅ Firmar y enviar</button>
        </div>
      </div>
    </div>
  )
}

// ─── CONFETTI (celebración al cerrar jornada) ──────────────────────────────────
function Confetti({ visible }) {
  const particles = useMemo(() => {
    const COLORS = ['#6C63FF', '#22c55e', '#f59e0b', '#06b6d4', '#ec4899', '#a78bfa', '#f472b6', '#34d399']
    return Array.from({ length: 48 }).map((_, i) => ({
      color: COLORS[i % COLORS.length],
      left: `${(i * 7.3 + 3) % 100}%`,
      delay: `${(i * 0.05) % 1.4}s`,
      size: 5 + (i % 5),
      shape: i % 3,
      rot: (i * 47) % 360,
      dur: 1.4 + (i % 6) * 0.18,
    }))
  }, [])

  if (!visible) return null
  return (
    <div style={{ position:'fixed', inset:0, pointerEvents:'none', overflow:'hidden', zIndex:9998 }}>
      {particles.map((p, i) => (
        <div key={i} style={{
          position:'absolute', top:-16, left:p.left,
          width:p.size, height:p.size,
          background:p.color,
          borderRadius: p.shape === 0 ? '50%' : p.shape === 1 ? '2px' : '0',
          transform:`rotate(${p.rot}deg)`,
          animation:`confettiFall ${p.dur}s cubic-bezier(.36,.07,.19,.97) ${p.delay} forwards`,
        }} />
      ))}
    </div>
  )
}

// ─── WELCOME SLIDES (intro animado, primera vez en la app) ─────────────────────
function WelcomeSlides() {
  const [visible, setVisible] = useState(() => {
    try { return !localStorage.getItem('an_welcome_v1') } catch { return false }
  })
  const [slide, setSlide] = useState(0)
  const [exiting, setExiting] = useState(false)

  const dismiss = () => {
    setExiting(true)
    setTimeout(() => {
      try { localStorage.setItem('an_welcome_v1', '1') } catch {}
      setVisible(false)
    }, 350)
  }

  if (!visible) return null

  const SLIDES = [
    {
      emoji: '⏱️',
      color: '#2563EB',
      title: 'Registra tu jornada',
      sub: 'Ficha entrada y salida desde tu móvil. Tu historial siempre disponible, en cualquier lugar.',
    },
    {
      emoji: '🌴',
      color: '#16a34a',
      title: 'Solicita vacaciones',
      sub: 'Gestiona tus días libres fácilmente. Consulta el estado en tiempo real.',
    },
    {
      emoji: '🏗️',
      color: '#7c3aed',
      title: 'Conecta con tu empresa',
      sub: 'Mensajes, documentos y avisos de tu empresa, todo en un solo lugar.',
    },
  ]

  const s = SLIDES[slide]
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'flex-end',
      background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)',
      animation: exiting ? 'wsFadeOut .35s forwards' : 'wsFadeIn .3s',
    }}>
      <div style={{
        width:'100%', maxWidth:480, margin:'0 auto',
        background:'var(--bg-700)', borderRadius:'24px 24px 0 0',
        border:'1px solid var(--border2)', borderBottom:'none',
        padding:'28px 24px 32px',
        animation: exiting ? 'wsSlideOut .35s forwards' : 'slideUp .3s cubic-bezier(.16,1,.3,1)',
        boxShadow:'0 -20px 60px rgba(0,0,0,.4)',
      }}>
        {/* Slide dots */}
        <div style={{ display:'flex', justifyContent:'center', gap:6, marginBottom:28 }}>
          {SLIDES.map((_, i) => (
            <div key={i} onClick={() => setSlide(i)} style={{ height:6, borderRadius:3, cursor:'pointer', transition:'all .3s',
              width: i === slide ? 24 : 6,
              background: i === slide ? s.color : 'var(--bg-500)' }} />
          ))}
        </div>

        {/* Content */}
        <div key={slide} style={{ textAlign:'center', animation:'slideUp .3s cubic-bezier(.16,1,.3,1)' }}>
          <div style={{ width:80, height:80, borderRadius:22, background:`${s.color}22`, border:`2px solid ${s.color}44`,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:38, margin:'0 auto 20px' }}>
            {s.emoji}
          </div>
          <div style={{ fontSize:22, fontWeight:800, color:'var(--text)', marginBottom:10, letterSpacing:'-.4px' }}>{s.title}</div>
          <div style={{ fontSize:14, color:'var(--text3)', lineHeight:1.65, marginBottom:32 }}>{s.sub}</div>
        </div>

        {/* Buttons */}
        {slide < SLIDES.length - 1 ? (
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-secondary" style={{ flex:1 }} onClick={dismiss}>Omitir</button>
            <button className="btn btn-primary" style={{ flex:2, background:s.color, borderColor:s.color }} onClick={() => setSlide(slide + 1)}>Siguiente →</button>
          </div>
        ) : (
          <button className="btn btn-primary" style={{ width:'100%', background:s.color, borderColor:s.color }} onClick={dismiss}>
            Empezar →
          </button>
        )}
      </div>
    </div>
  )
}

// ─── ONBOARDING (primer login empleado) ────────────────────────────────────────
function OnboardingModal({ visible, u, db, saveDB, toast }) {
  const { canvasRef, handlers, clearCanvas, initCanvas, getSignatureData } = useSignatureCanvas()
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [notifGranted, setNotifGranted] = useState(() => typeof Notification !== 'undefined' && Notification.permission === 'granted')
  const [reminderTime, setReminderTime] = useState(() => getCfg('reminderTime', '20:00'))

  useEffect(() => { if (step === 1) initCanvas() }, [step])

  if (!visible || done) return null

  const requestNotif = async () => {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setNotifGranted(perm === 'granted')
    if (perm === 'granted' && u?.id) {
      pushSubscribe(u.id, VAPID_PUB).catch(() => {})
    }
  }

  const finish = () => {
    const signatureData = getSignatureData()
    const firma = signatureData ? { data: signatureData, ts: new Date().toISOString() } : null
    const updatedEmps = (db.employees || []).map(e => e.id === u.id ? { ...e, onboardingDone: true, reminderTime } : e)
    const updatedFirmas = firma ? { ...(db.firmas || {}), [u.id]: { main: firma } } : (db.firmas || {})
    saveDB({ employees: updatedEmps, firmas: updatedFirmas })
    try { localStorage.setItem('cfg_reminderTime', reminderTime) } catch {}
    setDone(true)
    toast('¡Configuración lista! Ya puedes usar la app.', 3000, 'ok')
  }

  const STEPS = ['Notificaciones', 'Tu firma', 'Recordatorio']

  return (
    <div className="modal-ov center" style={{ zIndex:1100 }}>
      <div className="modal center-modal" style={{ maxWidth:400, width:'calc(100% - 32px)' }}>
        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>👋</div>
          <div style={{ fontSize:17, fontWeight:800, color:'var(--text)' }}>Bienvenido, {u.name.split(' ')[0]}</div>
          <div style={{ fontSize:12, color:'var(--text3)', marginTop:3 }}>Configura tu cuenta en {STEPS.length} pasos rápidos</div>
        </div>

        {/* Step indicator */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:0, marginBottom:24 }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center' }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, transition:'all .25s',
                  background: i < step ? 'var(--green)' : i === step ? 'var(--primary)' : 'var(--bg-500)',
                  color: i <= step ? '#fff' : 'var(--text4)', boxShadow: i === step ? '0 0 0 3px var(--primary-glow)' : 'none' }}>
                  {i < step ? '✓' : i + 1}
                </div>
                <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color: i===step?'var(--primary-light)':'var(--text4)', whiteSpace:'nowrap' }}>{s}</div>
              </div>
              {i < STEPS.length - 1 && <div style={{ width:28, height:2, background: i < step ? 'var(--green)' : 'var(--bg-400)', margin:'0 4px', transition:'all .25s', marginBottom:16 }} />}
            </div>
          ))}
        </div>

        {/* Step 0: Notifications */}
        {step === 0 && (
          <div>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:10 }}>🔔</div>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Activar notificaciones</div>
              <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.7 }}>Recibe alertas de jornadas largas, vacaciones aprobadas y comunicados del administrador.</div>
            </div>
            {notifGranted ? (
              <div style={{ background:'var(--green-dim)', border:'1px solid rgba(16,185,129,.2)', borderRadius:'var(--r)', padding:'12px 16px', display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                <span style={{ fontSize:20 }}>✅</span>
                <span style={{ fontSize:13, color:'var(--green)', fontWeight:600 }}>Notificaciones activadas</span>
              </div>
            ) : (
              <button className="btn btn-primary" style={{ width:'100%', marginBottom:10 }} onClick={requestNotif}>
                🔔 Activar notificaciones
              </button>
            )}
            <button className="btn btn-secondary" style={{ width:'100%' }} onClick={() => setStep(1)}>
              {notifGranted ? 'Continuar →' : 'Omitir por ahora →'}
            </button>
          </div>
        )}

        {/* Step 1: Signature */}
        {step === 1 && (
          <div>
            <div style={{ textAlign:'center', marginBottom:14 }}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Dibuja tu firma</div>
              <div style={{ fontSize:12, color:'var(--text3)' }}>Se usará para firmar documentos y cierres mensuales</div>
            </div>
            <canvas ref={canvasRef} width={640} height={180}
              style={{ width:'100%', height:120, borderRadius:'var(--r)', background:'#0D1218', cursor:'crosshair', touchAction:'none', border:'1px solid var(--border2)', display:'block', marginBottom:8 }}
              {...handlers} />
            <div style={{ display:'flex', gap:8, marginBottom:4 }}>
              <button className="btn btn-secondary btn-sm" onClick={clearCanvas}>Borrar</button>
              <button className="btn btn-secondary" style={{ flex:1 }} onClick={() => setStep(2)}>Omitir →</button>
              <button className="btn btn-primary" onClick={() => setStep(2)}>Guardar →</button>
            </div>
          </div>
        )}

        {/* Step 2: Reminder */}
        {step === 2 && (
          <div>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:10 }}>⏰</div>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Recordatorio diario</div>
              <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.7 }}>Te avisaremos a esta hora si no has fichado entrada hoy. Podrás cambiarlo desde Configuración.</div>
            </div>
            <div className="field" style={{ marginBottom:20 }}>
              <label>Hora del recordatorio</label>
              <input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)}
                style={{ fontSize:20, fontWeight:700, textAlign:'center', letterSpacing:2 }} />
            </div>
            <button className="btn btn-primary" style={{ width:'100%' }} onClick={finish}>
              ✅ Finalizar — Empezar a usar la app
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MODAL CHAT ────────────────────────────────────────────────────────────────
function ModalChat({ visible, db, u, onClose, saveDB, toast }) {
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  const chats   = db.chats || []
  const adminId = 'admin'
  const conv    = u ? chats
    .filter(m => (m.from === u.id && m.to === adminId) || (m.from === adminId && m.to === u.id))
    .sort((a, b) => a.ts - b.ts) : []

  // Marcar mensajes de admin como leídos al abrir.
  // El return temprano va DESPUÉS de todos los hooks (Rules of Hooks).
  useEffect(() => {
    if (!visible || !u) return
    const hasUnread = chats.some(m => m.from === adminId && m.to === u.id && !m.leido)
    if (hasUnread) saveDB({ chats: chats.map(m => m.from === adminId && m.to === u.id ? { ...m, leido: true } : m) })
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 80)
  }, [visible, chats.length])

  useModalBack(visible, onClose)
  if (!visible || !u) return null

  const send = () => {
    const t = text.trim()
    if (!t) return
    const msg = { id: gid(), from: u.id, to: adminId, text: t, ts: Date.now(), leido: false }
    saveDB({ chats: [...chats, msg] })
    queuePush('__admin__', `Mensaje de ${u.name}`, t, 'chat', '/?go=admin:mensajes')
    setText('')
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 50)
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:120, background:'rgba(0,0,0,.5)', display:'flex', flexDirection:'column' }}>
      <div style={{ background:'var(--bg-700)', flex:1, display:'flex', flexDirection:'column', maxHeight:'100%' }}>
        {/* Cabecera */}
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 20px', borderBottom:'1px solid var(--border)' }}>
          <button onClick={onClose} style={{ background:'var(--bg-500)', border:'1px solid var(--border)', borderRadius:10, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontSize:15, fontWeight:700 }}>Chat con Administración</div>
            <div style={{ fontSize:11, color:'var(--text3)' }}>Responden en horario de oficina</div>
          </div>
        </div>

        {/* Mensajes */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ flex:1 }} />
          {!conv.length && (
            <div style={{ textAlign:'center', color:'var(--text3)', fontSize:13 }}>
              <div style={{ fontSize:32, marginBottom:8 }}>💬</div>
              Sin mensajes. Escribe tu primera consulta al administrador.
            </div>
          )}
          {conv.map(m => {
            const isMe = m.from === u.id
            return (
              <div key={m.id} style={{ display:'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', alignItems:'flex-end', gap:8 }}>
                {!isMe && (
                  <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--primary-dim)', border:'1px solid var(--primary-glow)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginBottom:2 }}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--primary-light)" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                )}
                <div style={{ maxWidth:'80%', padding:'10px 14px', borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: isMe ? 'var(--primary)' : 'var(--bg-500)',
                  border: isMe ? 'none' : '1px solid var(--border)',
                  fontSize:14, color: isMe ? '#fff' : 'var(--text)' }}>
                  {!isMe && <div style={{ fontSize:10, fontWeight:700, color:'var(--primary-light)', marginBottom:4 }}>Administración</div>}
                  {m.text}
                  <div style={{ fontSize:10, marginTop:5, opacity:.6, textAlign:'right' }}>
                    {new Date(m.ts).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}
                  </div>
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
            style={{ flex:1, padding:'11px 16px', borderRadius:24, border:'1px solid var(--border)', background:'var(--bg-500)', color:'var(--text)', fontSize:14, fontFamily:'inherit' }} />
          <button onClick={send} disabled={!text.trim()}
            style={{ width:44, height:44, borderRadius:'50%', background:'var(--primary)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, opacity: text.trim() ? 1 : .4 }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MODAL CORRECCIÓN ──────────────────────────────────────────────────────────
function ModalCorreccion({ visible, data, db, u, onClose, saveDB, toast }) {
  const rec = data?.rec
  const [inicio, setInicio]   = useState('')
  const [fin, setFin]         = useState('')
  const [motivo, setMotivo]   = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (visible && rec) {
      setInicio(rec.inicio ? rec.inicio.slice(0, 16) : '')
      setFin(rec.fin ? rec.fin.slice(0, 16) : '')
      setMotivo('')
    }
  }, [visible, rec])

  useModalBack(visible, onClose)
  if (!visible || !rec) return null

  const send = () => {
    if (!motivo.trim()) { toast('Añade un motivo para la corrección'); return }
    if (!inicio) { toast('Indica la hora de entrada correcta'); return }
    setSending(true)
    const corr = {
      id: gid(),
      empId: u.id, empName: u.name,
      recId: rec.id,
      recInicio: rec.inicio, recFin: rec.fin || null,
      propInicio: new Date(inicio).toISOString(),
      propFin: fin ? new Date(fin).toISOString() : null,
      motivo: motivo.trim(),
      estado: 'pendiente',
      ts: Date.now()
    }
    const withAudit = auditLog(db,
      'correccion_solicitada',
      `Corrección fichaje ${rec.inicio.slice(0,10)}: ${motivo.trim()}`,
      u.name
    )
    saveDB({
      correccionesFichaje: [...(db.correccionesFichaje || []), corr],
      audit: withAudit.audit
    })
    queuePush('__admin__', `✏️ Corrección de fichaje`, `${u.name} solicita corregir la jornada del ${rec.inicio.slice(0,10)}.`, 'correccion', '/?go=admin:solicitudes')
    toast('Solicitud enviada al administrador', 3000, 'ok')
    setSending(false)
    onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:130, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width:'100%', maxWidth:480, background:'var(--bg-700)', borderRadius:'20px 20px 0 0', padding:'24px 20px 28px', border:'1px solid var(--border2)', animation:'slideUp .22s ease' }}>
        <div style={{ width:36, height:4, borderRadius:2, background:'var(--border3)', margin:'0 auto 20px' }} />
        <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Solicitar corrección de fichaje</div>
        <div style={{ fontSize:12, color:'var(--text3)', marginBottom:20 }}>
          Original: {ftime(rec.inicio)} → {rec.fin ? ftime(rec.fin) : '—'}
        </div>

        <div className="field" style={{ marginBottom:12 }}>
          <label>Nueva hora de entrada</label>
          <input type="datetime-local" value={inicio} onChange={e => setInicio(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom:12 }}>
          <label>Nueva hora de salida</label>
          <input type="datetime-local" value={fin} onChange={e => setFin(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom:20 }}>
          <label>Motivo de la corrección *</label>
          <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Me olvidé de fichar la salida..." />
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" style={{ flex:1 }} onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={send} disabled={sending}>
            {sending ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  )
}
