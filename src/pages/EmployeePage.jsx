import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAppStore } from '../store/appStore.js'
import { useTimer } from '../hooks/useTimer.js'
import { mhm, p2, calcSecs, calcMin, gid, vacData, wkStart, today, fds, ftime, localDateStr } from '../utils/time.js'
import { calcStreak } from '../utils/streaks.js'
import { WK } from '../config/constants.js'
import { EmployeeHome } from '../ui-v2/pages/EmployeeHome.tsx'
import { VAPID_PUB } from '../config/constants.js'
import { auditLog, pushSubscribe, queuePush } from '../services/dataService.js'
import { PWAInstall } from '../components/PWAInstall.jsx'
import WellbeingModal from '../components/WellbeingModal.jsx'
import TabTurnos from '../components/TabTurnos.jsx'
import { startedInHorizontalScroller } from '../utils/gesture.js'
import { applyBrandColor, removeBrandColor } from '../utils/webauthn.js'
import { useWindowWidth } from '../hooks/useWindowWidth.js'
import { haversine } from '../utils/geo.js'
import { getCfg, toggleTheme } from '../utils/userConfig.js'
import { TopbarClock } from '../components/employee/TopbarClock.jsx'
import { OfflineBanner } from '../components/employee/OfflineBanner.jsx'
import { ModalSelCentro } from '../components/employee/ModalSelCentro.jsx'
import { ModalQRScan } from '../components/employee/ModalQRScan.jsx'
import { ModalMyQR } from '../components/employee/ModalMyQR.jsx'
import { decodeCentroQR, decodeEmployeeQR } from '../utils/qr.js'
import { ModalNotis } from '../components/employee/ModalNotis.jsx'
import { ModalVacForm } from '../components/employee/ModalVacForm.jsx'
import { ModalSign } from '../components/employee/ModalSign.jsx'
import { ModalAI } from '../components/employee/ModalAI.jsx'
import { ModalInfoPersonal } from '../components/employee/ModalInfoPersonal.jsx'
import { ModalDocumentos } from '../components/employee/ModalDocumentos.jsx'
import { ModalConfiguracion } from '../components/employee/ModalConfiguracion.jsx'
import { ModalCierreSign } from '../components/employee/ModalCierreSign.jsx'
import { Confetti } from '../components/employee/Confetti.jsx'
import { ModalLogros } from '../components/employee/ModalLogros.jsx'
import { ModalTemas } from '../components/employee/ModalTemas.jsx'
import { WelcomeSlides } from '../components/employee/WelcomeSlides.jsx'
import { OnboardingModal } from '../components/employee/OnboardingModal.jsx'
import { ModalChat } from '../components/employee/ModalChat.jsx'
import { ModalCorreccion } from '../components/employee/ModalCorreccion.jsx'
import { TabMensajes } from '../components/employee/TabMensajes.jsx'
import { TabVacaciones } from '../components/employee/TabVacaciones.jsx'
import { TabCalendario } from '../components/employee/TabCalendario.jsx'
import { TabPerfil } from '../components/employee/TabPerfil.jsx'
import { TabInicio } from '../components/employee/TabInicio.jsx'
import { TabJornada } from '../components/employee/TabJornada.jsx'

// Opciones de geolocalización para el fichaje — timeout más generoso y
// maximumAge no-cero. `enableHighAccuracy` pide al chip GPS un fix preciso,
// pero sin cobertura de red el dispositivo no tiene asistencia (A-GPS) para
// acelerarlo: un fix "en frío" puede tardar bien por encima de los 10s que
// había antes, así que en obras con GPS obligatorio el fichaje se bloqueaba
// sistemáticamente en modo sin cobertura. maximumAge:120000 permite
// reutilizar una posición de hasta 2 minutos (p.ej. la que ya tenga el
// vigilante de geocerca de TabJornada) en vez de exigir siempre un fix nuevo.
const GEO_OPTS = { enableHighAccuracy: true, timeout: 25000, maximumAge: 120000 }
// El bloqueo anti-doble-toque debe cubrir como mínimo el timeout de GPS de
// arriba — si se soltara antes, un segundo toque mientras la primera
// petición de ubicación sigue en curso dispararía una jornada duplicada.
const STARTING_LOCK_MS = GEO_OPTS.timeout + 2000

export default function EmployeePage() {
  const { db, session, currentEmpTab, setEmpTab, saveDB, logout, toast, showConfirm, setScreen, openModal, closeModal, activeModal, modalData, syncStatus, realtimeStatus } = useAppStore()
  const winW = useWindowWidth()
  const timer = useTimer()
  // Derivar siempre desde db.employees para que onboardingDone y otros campos
  // se actualicen reactivamente sin depender del snapshot estático de la sesión.
  const u = useMemo(() => {
    const su = session.user
    if (!su) return null
    return (db.employees || []).find(e => e.id === su.id) || su
  }, [session.user?.id, db.employees])
  // Usar session.isEnc/isJO como fallback cuando u.role no está actualizado post-reconcile
  const isSuper = u ? (u.role === 'encargado' || u.role === 'jefe_obra' || session.isEnc || session.isJO) : false
  const isJefeObra = u ? (u.role === 'jefe_obra' || session.isJO) : false
  const [pendingGPS, setPendingGPS] = useState(null)
  const [gpsStatus, setGpsStatus] = useState('idle') // 'idle' | 'pending' | 'ok' | 'fail'
  const [qrScanOpen, setQrScanOpen] = useState(false)
  const [calMonth, setCalMonth] = useState(new Date())
  const [showWellbeing, setShowWellbeing] = useState(false)
  const [wellbeingRecId, setWellbeingRecId] = useState(null)
  const [geoPrompt, setGeoPrompt] = useState(null) // { obraName, dist }
  const [geoExitPrompt, setGeoExitPrompt] = useState(null) // { obraName, recId }
  const geoWatchRef = useRef(null)
  const geoDismissedRef = useRef(false)
  const geoWasInsideRef = useRef(null)     // rec.id de la jornada que estuvo dentro del radio
  const geoExitDismissedRef = useRef(null) // rec.id cuyo aviso de salida se descartó
  const [showConfetti, setShowConfetti] = useState(false)
  const [perfilSubTab, setPerfilSubTab] = useState('perfil') // 'perfil' | 'gastos' | 'denuncia'
  // Bug fix: derive from DOM so initial icon matches actual theme (dark=☀️, light=🌙)
  const [isLight, setIsLight] = useState(() => document.documentElement.getAttribute('data-theme') === 'light')
  const dbRef = useRef(db)
  const geoAbortRef = useRef(false)
  // Contador de generación: cada nueva solicitud GPS incrementa el nonce y
  // captura su valor. El callback solo procede si el nonce sigue siendo el
  // actual — invalida automáticamente callbacks de solicitudes anteriores.
  const geoNonceRef = useRef(0)
  const startingRef = useRef(false)
  const breakingRef = useRef(false)
  const notisRunningRef = useRef(false)
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
      const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
      const worked = (dbRef.current?.records || []).some(r => r.empId === u.id && r.inicio && localDateStr(new Date(r.inicio)) === todayStr)
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
    return () => { if (typeof removeBrandColor === 'function') removeBrandColor() }
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


  // ── Geofencing: aviso al entrar (iniciar jornada) y al salir (fichar salida) ──
  useEffect(() => {
    if (!u?.id || !navigator.geolocation) return
    const obras = (dbRef.current?.obras || []).filter(o => o.coords && o.radio)
    if (!obras.length) return
    const distTo = (lat, lng, o) => {
      const R = 6371e3
      const φ1 = lat * Math.PI/180, φ2 = o.coords.lat * Math.PI/180
      const Δφ = (o.coords.lat - lat) * Math.PI/180, Δλ = (o.coords.lng - lng) * Math.PI/180
      const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2
      return 2*R*Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    }
    const checkPos = (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude
      const openRec = (dbRef.current?.records || []).find(r => r.empId === u.id && !r.fin)

      if (openRec) {
        setGeoPrompt(null)
        // Aviso de SALIDA: la obra de la jornada abierta (por nombre de centro, o si no,
        // la obra con geovalla más cercana). Histéresis de radio+150m para evitar que el
        // vaivén del GPS dispare falsos avisos en el borde del radio.
        const obra = obras.find(o => o.nombre === openRec.centro)
          || obras.reduce((best, o) => {
               const d = distTo(lat, lng, o)
               return !best || d < best.d ? { o, d } : best
             }, null)?.o
        if (!obra) return
        const dist = distTo(lat, lng, obra)
        const radio = obra.radio != null ? obra.radio : 200
        if (dist <= radio) {
          geoWasInsideRef.current = openRec.id
          setGeoExitPrompt(null)
        } else if (dist > radio + Math.max(150, radio * 0.5)
                   && geoWasInsideRef.current === openRec.id
                   && geoExitDismissedRef.current !== openRec.id) {
          setGeoExitPrompt(prev => prev?.recId === openRec.id ? prev : (() => {
            try { navigator.vibrate([120, 60, 120]) } catch {}
            return { obraName: obra.nombre, recId: openRec.id }
          })())
        }
        return
      }

      // Sin jornada abierta: aviso de ENTRADA (comportamiento original)
      setGeoExitPrompt(null)
      geoWasInsideRef.current = null
      if (geoDismissedRef.current) return
      const inRange = obras.find(o => distTo(lat, lng, o) <= (o.radio != null ? o.radio : 200))
      setGeoPrompt(inRange ? { obraName: inRange.nombre } : null)
    }
    geoWatchRef.current = navigator.geolocation.watchPosition(checkPos, (err) => { console.warn('[geo] watchPosition error:', err.code, err.message) }, { enableHighAccuracy: false, maximumAge: 60000 })
    return () => { if (geoWatchRef.current != null) navigator.geolocation.clearWatch(geoWatchRef.current) }
  }, [u?.id])

  const empBodyRef = useRef(null)
  const prevTabRef = useRef(currentEmpTab)
  const currentTabRef = useRef(currentEmpTab)
  const TAB_ORDER = ['inicio', 'jornada', 'vacaciones', 'calendario', 'turnos', 'perfil']
  useEffect(() => {
    const prev = prevTabRef.current
    if (prev !== currentEmpTab && empBodyRef.current) {
      const pi = TAB_ORDER.indexOf(prev), ci = TAB_ORDER.indexOf(currentEmpTab)
      empBodyRef.current.dataset.dir = ci >= pi ? 'right' : 'left'
    }
    prevTabRef.current = currentEmpTab
    currentTabRef.current = currentEmpTab
    if (prev !== currentEmpTab && prev === 'perfil') setPerfilSubTab('perfil')
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

  // Manejar shortcuts del manifest PWA (?tab=...) y deep links de notificaciones (?go=emp:vacaciones)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    const go = params.get('go')
    const VALID = ['inicio','jornada','vacaciones','calendario','turnos','perfil']
    if (tab && VALID.includes(tab)) {
      setEmpTab(tab)
      window.history.replaceState({}, '', window.location.pathname)
    } else if (go?.startsWith('emp:')) {
      const target = go.slice(4)
      if (VALID.includes(target)) {
        setEmpTab(target)
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [])

  useEffect(() => {
    if (!u) return

    // Smart notifications: check every 60s if any reminder should fire
    // Bug fix #8: claves de notificaciones en db.notisSent (sincronizado entre dispositivos)
    const checkSmartNotis = () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      if (notisRunningRef.current) return
      notisRunningRef.current = true
      try {
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
          id: 'sn_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).slice(2, 9)),
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
          const hasFichado = (db.records || []).some(r => r.empId === u.id && r.inicio && localDateStr(new Date(r.inicio)) === todayStr)
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
      const pendCierres = (db.cierres || []).filter(c => c.empId === u.id && c.estado === 'pendiente' && !c.desactualizado)
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
            const closeTime = new Date().toISOString()
            const breaks2 = [...(freshRec.breaks || [])]
            const t2 = calcSecs({ ...freshRec, fin: closeTime, breaks: breaks2 })
            const closed2 = { ...freshRec, fin: closeTime, breaks: breaks2, workSecs: t2.work, breakSecs: t2.brk, closed: true, autoClosedAt: closeTime, _upd: closeTime }
            const _msgAc = `Tu jornada del ${freshRec.inicio.slice(0,10)} se cerró por inactividad (${mhm(Math.floor(t2.work/60))}).`
            addBell('⏱️ Jornada cerrada automáticamente', _msgAc)
            const bellSnapshot = [...bellNotis]
            bellNotis.length = 0
            saveDB(latestDb => {
              const updRecs = latestDb.records.map(r => r.id === freshRec.id ? closed2 : r)
              const dbWithAudit = auditLog(latestDb, 'Auto-cierre jornada', `${u.name} · ${freshRec.inicio.slice(0,10)} · ${mhm(Math.floor(t2.work/60))}`, u.name)
              return { records: updRecs, notisSent: { ...(latestDb.notisSent || {}), ...notisSent }, audit: dbWithAudit.audit, notis: [...(latestDb.notis || []), ...bellSnapshot] }
            })
            sendPush(u.id, '⏱️ Jornada cerrada automáticamente', _msgAc, 'jornada', '/?tab=jornada')
            return
          }
        }
      })

      // 8. Horas extra: aviso cuando se superan 9h en un día o 45h en la semana
      {
        const openR = (db.records || []).find(r => r.empId === u.id && !r.fin)
        if (openR) {
          const elapsed = (Date.now() - new Date(openR.inicio).getTime()) / 60000
          // Aviso a las 9h exactas del día (una vez por jornada)
          if (elapsed >= 540 && elapsed < 550) {
            const key9h = 'an_extra9h_' + openR.id
            if (!hasSent(key9h)) {
              markSent(key9h)
              const _msg9h = 'Llevas 9 horas trabajando hoy. Recuerda descansar.'
              sendPush(u.id, '⚡ 9 horas trabajadas', _msg9h, 'jornada', '/?tab=inicio')
              addBell('⚡ 9 horas trabajadas', _msg9h)
            }
          }
        }
        // Aviso semanal: si las horas semanales superan 45h
        const wkKey = 'an_extra45h_' + todayStr.slice(0, 7)
        if (!hasSent(wkKey, 'week_' + todayStr)) {
          const ws = wkStart(new Date())
          const weekMin = (db.records || [])
            .filter(r => r.empId === u.id && r.fin && new Date(r.inicio) >= ws)
            .reduce((s, r) => s + calcMin(r), 0)
          if (weekMin >= 2700) {  // 45h = 2700 min
            markSent(wkKey, 'week_' + todayStr)
            const _msg45h = `Llevas ${mhm(weekMin)} esta semana. Has superado las 45h semanales.`
            sendPush(u.id, '⚡ Semana de horas extra', _msg45h, 'jornada', '/?tab=inicio')
            addBell('⚡ Semana de horas extra', _msg45h)
          }
        }
      }

      // Batch save: una sola escritura por ciclo. Combina notisSent + bell notis.
      // Merge new keys into current dbRef to avoid stale-snapshot overwrites.
      if (dirty || bellNotis.length) {
        const partial = {}
        if (dirty) partial.notisSent = { ...(dbRef.current.notisSent || {}), ...notisSent }
        if (bellNotis.length) partial.notis = [...(dbRef.current.notis || []), ...bellNotis]
        saveDB(partial)
      }
      } catch(e) { console.error('[smartNotis]', e) }
      finally { notisRunningRef.current = false }
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
    const total = (db.notis || []).filter(n => n.empId === u.id && !n.leido && !n.deleted).length
    try {
      if (total > 0) navigator.setAppBadge(total)
      else navigator.clearAppBadge()
    } catch {}
  }, [db.notis, u])

  const openRec = useCallback(
    () => (db.records || []).find(r => r.empId === u?.id && !r.fin),
    [db.records, u?.id]
  )

  // === TIMER ACTIONS ===

  // Precondiciones comunes a doStart y doStartWithCentro — centralizar aquí
  // garantiza que cualquier nueva regla (periodo cerrado, bloqueo admin, etc.)
  // se aplique a ambos flujos de fichaje sin tener que actualizar dos sitios.
  const checkFichajePreconditions = useCallback(() => {
    if (timer.state !== 'idle' || startingRef.current) return false
    const todayStr = today()
    const activeVac = (db.vacaciones || []).find(v =>
      v.empId === u?.id && v.estado === 'aprobada' && v.fechaInicio <= todayStr && v.fechaFin >= todayStr
    )
    if (activeVac) {
      toast(`🌴 Estás de vacaciones hasta el ${fds(activeVac.fechaFin)}. No puedes fichar hasta que terminen.`, 5000, 'warn')
      return false
    }
    return true
  }, [timer.state, db.vacaciones, u?.id, toast])

  const doStart = () => {
    if (!checkFichajePreconditions()) return
    if (activeModal === 'selCentro') return
    startingRef.current = true
    setTimeout(() => { startingRef.current = false }, STARTING_LOCK_MS)
    const cs = db.centrosTrabajo || []
    openModal('selCentro', { centros: cs, current: u?.centroTrabajo || '' })
    geoAbortRef.current = false
    const myNonce = ++geoNonceRef.current
    setPendingGPS(null)
    setGpsStatus('pending')
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (geoAbortRef.current || geoNonceRef.current !== myNonce) return
          const lat = +pos.coords.latitude.toFixed(5)
          const lng = +pos.coords.longitude.toFixed(5)
          if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0)) {
            setPendingGPS({ lat, lng, acc: Math.round(pos.coords.accuracy), ts: new Date().toISOString() })
            setGpsStatus('ok')
          }
        },
        () => { if (!geoAbortRef.current && geoNonceRef.current === myNonce) setGpsStatus('fail') },
        GEO_OPTS
      )
    }
  }

  // forcedGpsStatus/forcedGPS: usados por el flujo de fichaje por QR, que
  // llama a confirmarCentro justo cuando el propio callback de geolocalización
  // resuelve — leer gpsStatus/pendingGPS del estado del componente en ese
  // instante sería una carrera (el cierre de este useCallback puede no llevar
  // aún el valor recién puesto). El flujo manual (ModalSelCentro) no pasa
  // estos parámetros y se comporta exactamente igual que antes.
  const confirmarCentro = useCallback((centro, forcedGpsStatus, forcedGPS) => {
    startingRef.current = false
    if (!centro) { toast('Selecciona un centro de trabajo'); return }
    const effectiveGpsStatus = forcedGpsStatus !== undefined ? forcedGpsStatus : gpsStatus
    const effectiveGPS = forcedGPS !== undefined ? forcedGPS : pendingGPS
    // GPS obligatorio: bloquear si la obra lo requiere y no hay ubicación
    const obraReq = (db.obras || []).find(o => o.nombre === centro)
    if (obraReq?.gpsRequired) {
      if (effectiveGpsStatus === 'pending') {
        toast('⏳ Obteniendo ubicación GPS, espera un momento y vuelve a intentarlo…', 5000, 'warn')
        startingRef.current = false
        return
      }
      if (effectiveGpsStatus !== 'ok') {
        toast('📍 GPS obligatorio en esta obra. Activa la ubicación del dispositivo e inténtalo de nuevo.', 6000, 'err')
        startingRef.current = false
        return
      }
    }
    geoAbortRef.current = true
    setGpsStatus('idle')
    closeModal()
    const rec = {
      id: gid(), empId: u.id, empName: u.name, empresa: u.empresa || '',
      centro, inicio: new Date().toISOString(), fin: null,
      workSecs: 0, breakSecs: 0, enDescanso: false, bStartTs: null, breaks: [], closed: false,
      _upd: new Date().toISOString()
    }
    if (effectiveGPS) rec.locInicio = effectiveGPS
    // Geofencing: warn if employee is outside the obra's defined radius
    if (effectiveGPS) {
      const obraGeo = (db.obras || []).find(o => o.nombre === centro)
      if (obraGeo?.coords) {
        const dist = haversine(effectiveGPS.lat, effectiveGPS.lng, obraGeo.coords.lat, obraGeo.coords.lng)
        const radio = obraGeo.radio != null ? obraGeo.radio : 200
        if (dist > radio) {
          rec.geoAlert = { dist, radio, ts: new Date().toISOString() }
          setTimeout(() => toast(`⚠️ Estás a ${dist}m de la obra (radio ${radio}m)`, 6000, 'warn'), 600)
        }
      }
    }
    saveDB(freshDb => ({
      records: [...freshDb.records, rec],
      employees: freshDb.employees.map(e => e.id === u.id ? { ...e, centroTrabajo: centro } : e)
    }))
    try { navigator.vibrate(15) } catch {}
    toast('Jornada iniciada en ' + centro, 3000, 'ok')
  }, [u, db, pendingGPS, closeModal, saveDB, toast])

  // Fichaje de entrada vía QR — mismas comprobaciones que doStart (jornada
  // idle, sin vacaciones activas), pero el centro ya viene decidido por el
  // código escaneado en vez de un desplegable, y confirmarCentro se llama
  // con el resultado del GPS recién resuelto (ver comentario más arriba).
  const doStartWithCentro = useCallback((centro) => {
    if (!checkFichajePreconditions()) return
    startingRef.current = true
    setTimeout(() => { startingRef.current = false }, STARTING_LOCK_MS)
    geoAbortRef.current = false
    // Nonce propio: invalida cualquier callback GPS del flujo manual (doStart)
    // que pudiera estar aún en vuelo, sin depender de geoAbortRef compartido.
    const myNonce = ++geoNonceRef.current
    setPendingGPS(null)
    if (!navigator.geolocation) {
      setGpsStatus('fail')
      confirmarCentro(centro, 'fail', null)
      return
    }
    setGpsStatus('pending')
    navigator.geolocation.getCurrentPosition(
      pos => {
        if (geoNonceRef.current !== myNonce) return
        const lat = +pos.coords.latitude.toFixed(5)
        const lng = +pos.coords.longitude.toFixed(5)
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0)) {
          const gps = { lat, lng, acc: Math.round(pos.coords.accuracy), ts: new Date().toISOString() }
          setPendingGPS(gps)
          setGpsStatus('ok')
          confirmarCentro(centro, 'ok', gps)
        } else {
          setGpsStatus('fail')
          confirmarCentro(centro, 'fail', null)
        }
      },
      () => {
        if (geoNonceRef.current !== myNonce) return
        setGpsStatus('fail')
        confirmarCentro(centro, 'fail', null)
      },
      GEO_OPTS
    )
  }, [checkFichajePreconditions, confirmarCentro])

  const doStop = useCallback(() => {
    const o = openRec()
    if (!o) return
    showConfirm('¿Terminar la jornada ahora?', () => {
      const now = new Date().toISOString()
      const breaks = [...(o.breaks || [])]
      let enDescanso = o.enDescanso
      let bStartTs = o.bStartTs
      if (enDescanso && bStartTs) { breaks.push({ start: bStartTs, end: now }); enDescanso = false; bStartTs = null }
      const closed = { ...o, fin: now, enDescanso, bStartTs, breaks, closed: true, _upd: now }
      const t = calcSecs(closed)
      closed.workSecs = t.work; closed.breakSecs = t.brk
      saveDB(freshDb => ({ records: freshDb.records.map(r => r.id === o.id ? closed : r) }))
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
            useAppStore.getState().saveDB(freshDb => ({
              records: freshDb.records.map(r => r.id === stopId ? { ...r, locFin, _upd: new Date().toISOString() } : r)
            }))
          },
          () => {},
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        )
      }
    })
  }, [db, openRec, saveDB, toast, showConfirm])

  const doBreak = useCallback(() => {
    if (breakingRef.current) return
    breakingRef.current = true
    setTimeout(() => { breakingRef.current = false }, 2000)
    const o = openRec()
    if (!o) { breakingRef.current = false; return }
    const now = new Date().toISOString()
    let updated
    if (o.enDescanso) {
      const breaks = [...(o.breaks || []), { start: o.bStartTs, end: now }]
      updated = { ...o, breaks, breakSecs: calcSecs({ ...o, breaks }).brk, enDescanso: false, bStartTs: null, _upd: now }
      try { navigator.vibrate(10) } catch {}
      toast('▶️ Descanso finalizado')
    } else {
      updated = { ...o, enDescanso: true, bStartTs: now, _upd: now }
      try { navigator.vibrate(10) } catch {}
      toast('⏸️ Descanso iniciado')
    }
    saveDB(freshDb => ({ records: freshDb.records.map(r => r.id === o.id ? updated : r) }))
  }, [openRec, saveDB, toast])

  // Fichaje por QR — dos formatos posibles según lo que se escanea:
  // 1) QR de centro de trabajo → ficha tu propia entrada/salida (igual que
  //    el flujo manual, reutilizando confirmarCentro/doStop tal cual).
  // 2) QR de empleado (el mismo que ya genera PanelEmpleados.jsx para
  //    consulta rápida) → si quien escanea es jefe de obra o encargado,
  //    inicia la jornada de ESE trabajador — mismo comportamiento y mismo
  //    ámbito de autorización que el botón "▶ Iniciar jornada" que ya
  //    existe en la tarjeta de "Mi equipo" (teamStartJornada en TabInicio),
  //    solo que disparado por QR en vez de por lista.
  const handleQRScan = useCallback((text) => {
    setQrScanOpen(false)
    const centro = decodeCentroQR(text)
    if (centro) {
      const cs = db.centrosTrabajo || []
      if (!cs.includes(centro)) { toast(`"${centro}" no es un centro de trabajo registrado`, 4000, 'err'); return }
      const o = openRec()
      if (!o) {
        doStartWithCentro(centro)
      } else if (o.centro !== centro) {
        toast(`Este QR es de "${centro}", pero tu jornada está abierta en "${o.centro}"`, 5000, 'warn')
      } else {
        doStop()
      }
      return
    }

    const empId = decodeEmployeeQR(text)
    if (empId) {
      if (!isSuper) {
        toast('No tienes permiso para fichar a otro empleado', 4000, 'err')
        return
      }
      if (empId === u.id) { toast('Este es tu propio QR — usa "Fichar con QR" para tu jornada', 4000, 'warn'); return }
      const isJO = isJefeObra
      const encCentros = [...new Set([...(u.obrasAsignadas || []), ...(u.centroTrabajo ? [u.centroTrabajo] : [])])]
      const emp = (db.employees || []).find(e =>
        e.id === empId && !e.isAdmin && !e.baja &&
        (isJO || !encCentros.length || !e.centroTrabajo || encCentros.includes(e.centroTrabajo) || (e.obrasAsignadas || []).some(o => encCentros.includes(o)))
      )
      if (!emp) { toast('No tienes permiso para fichar a este empleado', 4000, 'err'); return }
      const todayQR = today()
      const empVac = (db.vacaciones || []).find(v => v.empId === emp.id && v.estado === 'aprobada' && v.fechaInicio <= todayQR && v.fechaFin >= todayQR)
      if (empVac) { toast(`${emp.name} está de vacaciones hasta el ${fds(empVac.fechaFin)}`, 4000, 'warn'); return }
      const recs = db.records || []
      if (recs.some(r => r.empId === emp.id && !r.fin)) { toast(`${emp.name} ya tiene jornada abierta`, 3000, 'warn'); return }
      const newRec = { id: gid(), empId: emp.id, empName: emp.name, inicio: new Date().toISOString(), fin: null, centro: emp.centroTrabajo || '', breaks: [], workSecs: 0, creadoPor: u.name, _upd: new Date().toISOString() }
      saveDB(freshDb => ({ records: [...(freshDb.records || []), newRec] }))
      queuePush(emp.id, '▶ Jornada iniciada', `${u.name} ha iniciado tu jornada laboral.`, 'jornada', '/?tab=inicio')
      toast(`Jornada iniciada para ${emp.name}`, 3000, 'ok')
      return
    }

    toast('Código QR no reconocido', 4000, 'err')
  }, [db, openRec, doStartWithCentro, doStop, toast, u, saveDB])

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
  const unread = useMemo(() => (db.notis || []).filter(n => n.empId === u?.id && !n.leido && !n.deleted).length, [db.notis, u?.id])
  const chatUnread = useMemo(() => (db.chats || []).filter(m => m.from === 'admin' && m.to === u?.id && !m.leido).length, [db.chats, u?.id])

  const [greetHour, setGreetHour] = useState(new Date().getHours())
  useEffect(() => {
    const id = setInterval(() => setGreetHour(new Date().getHours()), 60000)
    return () => clearInterval(id)
  }, [])
  const greeting = useMemo(() => {
    const firstName = u.name.split(' ')[0]
    if (greetHour >= 6 && greetHour < 14) return `Buenos días, ${firstName}`
    if (greetHour >= 14 && greetHour < 21) return `Buenas tardes, ${firstName}`
    return `Buenas noches, ${firstName}`
  }, [u.name, greetHour])

  const homeData = useMemo(() => {
    const now = new Date()
    const todayD = localDateStr(now)
    const empWKmin = (u.horasSemanales || WK / 60) * 60
    const dayMin = Math.round(empWKmin / 5)

    // Hoy: registros cerrados + timer vivo
    const todayRecs = (db.records || []).filter(r => r.empId === u.id && r.inicio && localDateStr(new Date(r.inicio)) === todayD && r.fin)
    const closedMin = todayRecs.reduce((s, r) => s + calcMin(r), 0)
    const liveMin = timer.state !== 'idle' ? Math.floor(timer.ws / 60) : 0
    const totMin = closedMin + liveMin
    const liveSec = timer.state !== 'idle' ? timer.ws % 60 : 0
    const totSecs = totMin * 60 + liveSec
    const pct = Math.min(100, Math.round(totMin / (dayMin || 480) * 100))
    const remainMin = Math.max(0, dayMin - totMin)

    // Semana L-D
    const ws = wkStart(now)
    const weekDayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
    let weekMin = 0
    const week = weekDayLabels.map((label, i) => {
      const d = new Date(ws)
      d.setDate(ws.getDate() + i)
      const ds = localDateStr(d)
      const isToday = ds === todayD
      const dayRecs = (db.records || []).filter(r => r.empId === u.id && r.inicio && localDateStr(new Date(r.inicio)) === ds && r.fin)
      let dm = dayRecs.reduce((s, r) => s + calcMin(r), 0)
      if (isToday && timer.state !== 'idle') dm += Math.floor(timer.ws / 60)
      weekMin += dm
      return {
        label,
        pct: Math.min(100, Math.round(dm / (dayMin || 480) * 100)),
        hours: dm >= 60 ? `${Math.floor(dm / 60)}h` : dm > 0 ? `${dm}m` : '',
        isToday,
      }
    })

    // Últimas acciones de hoy
    const allTodayRecs = (db.records || []).filter(r => r.empId === u.id && r.inicio && localDateStr(new Date(r.inicio)) === todayD)
    const recent = []
    allTodayRecs.forEach(r => {
      if (r.inicio) recent.push({ id: r.id + '-e', label: 'Entrada', time: ftime(r.inicio), tone: 'green', type: 'entrada' })
      if (r.fin)    recent.push({ id: r.id + '-s', label: 'Salida',  time: ftime(r.fin),    tone: 'red',   type: 'salida'  })
      ;(r.breaks || []).forEach((b, bi) => {
        if (b.start) recent.push({ id: r.id + '-bp' + bi, label: 'Pausa',   time: ftime(b.start), tone: 'orange', type: 'pausa'  })
        if (b.end)   recent.push({ id: r.id + '-br' + bi, label: 'Reanuda', time: ftime(b.end),   tone: 'green',  type: 'reanuda' })
      })
    })
    recent.sort((a, b) => a.time.localeCompare(b.time))

    const streak = calcStreak(db.records, u.id, todayD)
    const currentRec = (db.records || []).find(r => r.empId === u.id && !r.fin)
    const siteLabel = currentRec?.centro || u.centroTrabajo || undefined
    const dateLabel = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    const extraMin = Math.max(0, weekMin - empWKmin)
    const overtimeLabel = extraMin > 0 ? `+${Math.floor(extraMin / 60)}h ${p2(extraMin % 60)}m extra esta semana` : undefined

    return {
      time: `${p2(Math.floor(totSecs / 3600))}:${p2(Math.floor((totSecs % 3600) / 60))}`,
      seconds: `:${p2(totSecs % 60)}`,
      dateLabel,
      state: timer.state,
      workedLabel: mhm(totMin),
      remainingLabel: mhm(remainMin),
      progressPct: pct,
      siteLabel,
      streakDays: streak > 0 ? streak : undefined,
      week,
      weeklyTotal: `${Math.floor(weekMin / 60)}h ${p2(weekMin % 60)}m`,
      recent: recent.slice(-6).reverse(),
      greeting,
      overtimeLabel,
    }
  }, [db.records, timer.state, timer.ws, u.id, u.horasSemanales, u.centroTrabajo, greeting])

  const handleWellbeingSubmit = ({ mood, nota }) => {
    if (!mood || !wellbeingRecId) return
    const entry = { id: gid(), empId: u.id, mood, nota: nota || '', ts: new Date().toISOString(), recordId: wellbeingRecId }
    saveDB(freshDb => ({ wellbeing: [...(freshDb.wellbeing || []), entry] }))
  }

  // Cierres pendientes de firma del empleado actual
  const pendingCierresEmp = useMemo(
    () => (db.cierres || []).filter(c => c.empId === u.id && !c.firma && !c.firmaEmp && c.estado !== 'rechazado'),
    [db.cierres, u.id]
  )

  // Cierres del equipo pendientes de firma del supervisor (encargado/jefe de obra)
  const teamCierresPendientes = useMemo(() => {
    if (!isSuper) return []
    const centro = u.centroTrabajo || ''
    const empMap = new Map((db.employees || []).map(e => [e.id, e]))
    const teamIds = new Set(
      (db.employees || [])
        .filter(e => !e.isAdmin && !e.baja && e.centroTrabajo === centro && e.id !== u.id)
        .map(e => e.id)
    )
    // Fallback: también excluir IDs guardados en config para cuando firmaSupervisor
    // se pierde en el sync de Supabase (el blob lo preserva, la tabla individual no)
    const firmadosSet = new Set(db.config?._firmadosSupervisor || [])
    return (db.cierres || [])
      .filter(c => teamIds.has(c.empId) && !c.firmaSupervisor && !firmadosSet.has(c.id))
      .map(c => ({ id: c.id, empName: c.empName || empMap.get(c.empId)?.name || c.empId, mes: c.mes || '' }))
  }, [db.cierres, db.employees, db.config, isSuper, u.centroTrabajo, u.id])

  // Planning semanal del equipo para encargados/jefes de obra
  const weekPlanningData = useMemo(() => {
    if (!isSuper) return null
    const centro = u.centroTrabajo || ''
    const team = (db.employees || []).filter(e => !e.isAdmin && !e.baja && e.centroTrabajo === centro && e.id !== u.id)
    if (!team.length) return null
    const todayD = new Date()
    const dow = todayD.getDay()
    const monday = new Date(todayD)
    monday.setDate(todayD.getDate() - (dow === 0 ? 6 : dow - 1))
    const todayStr2 = localDateStr(todayD)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const ds = localDateStr(d)
      return { label: ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][i], dateStr: ds, isToday: ds === todayStr2, isWeekend: i >= 5 }
    })
    const members = team.map(e => {
      const initials = e.name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()
      const dayData = days.map(d => {
        const dayRecs = (db.records || []).filter(r => r.empId === e.id && r.inicio && localDateStr(new Date(r.inicio)) === d.dateStr)
        const open = dayRecs.find(r => !r.fin)
        const done = dayRecs.filter(r => r.fin)
        const totalMins = done.reduce((s, r) => s + (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000, 0)
        return { status: open ? 'active' : done.length ? 'done' : 'absent', hours: totalMins > 0 ? `${Math.floor(totalMins/60)}h${Math.round(totalMins%60)>0?Math.round(totalMins%60)+'m':''}` : '' }
      })
      return { id: e.id, name: e.name, initials, days: dayData }
    })
    return { days, members }
  }, [db.records, db.employees, u.role, u.centroTrabajo, u.id])

  const handleSignSupervisor = (cierreId) => {
    saveDB(freshDb => ({
      cierres: (freshDb.cierres || []).map(c =>
        c.id === cierreId
          ? { ...c, firmaSupervisor: true, firmaSupervisorAt: new Date().toISOString(), firmaSupervisorBy: u.name }
          : c
      ),
      // Guardar el ID en config como fallback por si firmaSupervisor se pierde en reconcile
      config: {
        ...(freshDb.config || {}),
        _firmadosSupervisor: [...new Set([...(freshDb.config?._firmadosSupervisor || []), cierreId])],
      },
    }))
    toast('Cierre firmado como supervisor', 2500, 'ok')
  }

  const handleGeoStart = () => {
    geoDismissedRef.current = true
    setGeoPrompt(null)
    doStart()
  }

  const dskNavItems = [
    { id:'inicio',     label:'Inicio',      icon:<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>, extra:<polyline points="9 22 9 12 15 12 15 22"/>, live: timer.state !== 'idle' },
    { id:'jornada',    label:'Jornada',     icon:<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></> },
    { id:'vacaciones', label:'Vacaciones',  icon:<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><path d="M12 3c0 0 4 4 4 8s-4 8-4 8"/><path d="M12 3c0 0-4 4-4 8s4 8 4 8"/></> },
    { id:'calendario', label:'Calendario', icon:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></> },
    { id:'turnos',     label:'Turnos',     icon:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="15" x2="15" y2="15"/></> },
    { id:'perfil',     label:'Perfil',     icon:<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></> },
  ]

  if (winW >= 1024) return (
    <div className="screen active emp-dsk" id="sEmp">
      <aside className="emp-dsk-sidebar">
        <div className="emp-dsk-brand">
          <span className="emp-dsk-brand-icon">T</span>
          <span className="emp-dsk-brand-name">TIMES INC</span>
        </div>

        <nav className="emp-dsk-nav" aria-label="Navegación principal">
          {dskNavItems.map(({ id, label, icon, extra, badge, live }) => (
            <button key={id} type="button"
              className={`emp-dsk-nav-item${currentEmpTab === id ? ' on' : ''}`}
              onClick={() => setEmpTab(id)} aria-current={currentEmpTab === id}>
              <span className="emp-dsk-nav-icon-wrap">
                <svg viewBox="0 0 24 24" aria-hidden="true">{icon}{extra}</svg>
                {badge > 0 && <span className="emp-dsk-badge">{badge > 9 ? '9+' : badge}</span>}
                {live && !badge && <span className="emp-dsk-live-dot" />}
              </span>
              {label}
            </button>
          ))}
        </nav>


        <div className="emp-dsk-sidebar-footer">
          <div className="emp-dsk-footer-user">
            <div className="emp-dsk-avatar" style={{ background: u.color || 'var(--primary)' }}>{initials}</div>
            <div className="emp-dsk-footer-info">
              <div className="emp-dsk-footer-name">{u.name}</div>
              <div className="emp-dsk-footer-role">{u.role || 'Empleado'}</div>
            </div>
          </div>
          <button className="emp-dsk-logout-btn" onClick={doLogout} title="Cerrar sesión" aria-label="Cerrar sesión">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </aside>

      <div className="emp-dsk-main">
        <header className="emp-dsk-topbar">
          <div className="emp-dsk-greeting-block">
            <TopbarClock />
          </div>
          <div className="emp-dsk-topbar-actions">
            {isSuper && (
              <button className="enc-chip" onClick={() => setScreen('admin')}>
                Panel
              </button>
            )}
            <button className="theme-toggle-btn" onClick={() => { toggleTheme(); setIsLight(l => !l) }} title="Tema" aria-label="Cambiar tema">
              {isLight
                ? <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                : <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>}
            </button>
            <button className="icon-btn ai-btn" onClick={() => openModal('ai')} title="IA" aria-label="Asistente IA">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/></svg>
            </button>
            <button className="icon-btn" onClick={() => openModal('chat')} style={{ position:'relative' }} aria-label="Chat">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              {chatUnread > 0 && <span className="emp-dsk-badge" style={{ position:'absolute', top:-4, right:-4 }}>{chatUnread > 9 ? '9+' : chatUnread}</span>}
            </button>
            <button className="icon-btn" onClick={() => openModal('notis')} style={{ position:'relative' }} aria-label="Notificaciones">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {unread > 0 && <span className="emp-dsk-badge" style={{ position:'absolute', top:-4, right:-4 }}>{unread > 9 ? '9+' : unread}</span>}
            </button>
          </div>
        </header>

        <PWAInstall />
        <OfflineBanner />
        {showNotifBanner && (
          <div className="v3-notif-banner" style={{ borderRadius:0, borderLeft:'none', borderRight:'none', borderTop:'none' }}>
            <div className="v3-notif-banner-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>
            <div className="v3-notif-banner-text">
              <div className="v3-notif-banner-title">Activa las notificaciones</div>
              <div className="v3-notif-banner-sub">Recibe avisos de jornada, documentos y mensajes</div>
            </div>
            <button className="v3-notif-banner-btn" onClick={handleNotifActivate}>Activar</button>
            <button className="v3-notif-banner-close" onClick={handleNotifDismiss} aria-label="Cerrar">×</button>
          </div>
        )}

        {geoPrompt && (
          <div style={{ background:'rgba(99,102,241,.15)', borderBottom:'1px solid rgba(99,102,241,.3)', padding:'10px 20px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
            <span style={{ fontSize:18 }}>📍</span>
            <span style={{ flex:1, fontSize:13, color:'var(--primary-light)' }}>Pareces estar en <strong>{geoPrompt.obraName}</strong> — ¿iniciar jornada?</span>
            <button onClick={handleGeoStart} style={{ background:'var(--primary)', color:'#fff', border:'none', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>Iniciar</button>
            <button onClick={() => { geoDismissedRef.current = true; setGeoPrompt(null) }} style={{ background:'none', border:'none', color:'var(--text4)', fontSize:18, cursor:'pointer' }}>×</button>
          </div>
        )}
        {geoExitPrompt && (
          <div style={{ background:'rgba(245,158,11,.15)', borderBottom:'1px solid rgba(245,158,11,.35)', padding:'10px 20px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
            <span style={{ fontSize:18 }}>🚶</span>
            <span style={{ flex:1, fontSize:13, color:'var(--orange)' }}>Te estás alejando de <strong>{geoExitPrompt.obraName}</strong> con la jornada abierta — ¿fichar salida?</span>
            <button onClick={() => { setGeoExitPrompt(null); doStop() }} style={{ background:'var(--orange)', color:'#fff', border:'none', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>Fichar salida</button>
            <button onClick={() => { geoExitDismissedRef.current = geoExitPrompt.recId; setGeoExitPrompt(null) }} style={{ background:'none', border:'none', color:'var(--text4)', fontSize:18, cursor:'pointer' }}>×</button>
          </div>
        )}
        <div className="emp-dsk-content" ref={empBodyRef}>
          {currentEmpTab === 'inicio' && (
            <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 100 }}>
              {pendingCierresEmp.length > 0 && (
                <div style={{ margin: '16px 20px 0', padding: '12px 16px', borderRadius: 12, background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.35)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ display:'flex', color:'var(--warning)' }}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4z"/></svg></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange)' }}>
                      {pendingCierresEmp.length === 1 ? 'Tienes 1 cierre mensual pendiente de firma' : `Tienes ${pendingCierresEmp.length} cierres mensuales pendientes de firma`}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text4)', marginTop: 2 }}>Tu firma es obligatoria para cerrar el mes</div>
                  </div>
                  <button onClick={() => openModal('cierreSign')} style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--orange)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Firmar
                  </button>
                </div>
              )}
              <div style={{ padding: '16px 20px' }}>
                <EmployeeHome {...homeData} onStartAction={doStart} onBreakAction={doBreak} onStopAction={doStop}
                  extraAction={isSuper ? (
                    <button onClick={() => setQrScanOpen(true)} style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '11px 16px', borderRadius: 12, border: '1px solid rgba(177,138,82,.3)',
                      background: 'rgba(177,138,82,.08)', color: 'var(--primary-light)', fontSize: 13,
                      fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                      Fichar a un empleado
                    </button>
                  ) : undefined}
                />
              </div>
              {false && weekPlanningData && (
                <div style={{ padding: '0 20px 20px' }}>
                  <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.08)', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: 'rgba(177,138,82,.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary-light)" strokeWidth="2" width="15" height="15"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-light)' }}>Planning semanal del equipo</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text4)' }}>{weekPlanningData.members.length} miembros</span>
                    </div>
                    <div className="emp-planning-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      <table className="emp-planning-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--text4)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,.06)', position: 'sticky', left: 0, background: 'var(--bg-700)', zIndex: 1 }}>Empleado</th>
                            {weekPlanningData.days.map(d => (
                              <th key={d.dateStr} style={{ padding: '8px 6px', textAlign: 'center', color: d.isToday ? 'var(--primary-light)' : d.isWeekend ? 'var(--text5)' : 'var(--text4)', fontWeight: d.isToday ? 800 : 600, borderBottom: '1px solid rgba(255,255,255,.06)', minWidth: 44 }}>{d.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {weekPlanningData.members.map((m, mi) => (
                            <tr key={m.id} style={{ borderTop: mi > 0 ? '1px solid rgba(255,255,255,.04)' : 'none' }}>
                              <td style={{ padding: '8px 14px', color: 'var(--text1)', fontWeight: 500, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--bg-700)', zIndex: 1 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontSize: 9, fontWeight: 800, marginRight: 7 }}>{m.initials}</span>
                                {m.name.split(' ')[0]}
                              </td>
                              {m.days.map((d, di) => (
                                <td key={di} style={{ padding: '6px 4px', textAlign: 'center' }}>
                                  {d.status === 'active' ? <span title="Trabajando ahora" style={{ color: 'var(--green)', fontSize: 14 }}>●</span>
                                    : d.status === 'done' ? <span title={d.hours} style={{ color: 'rgba(177,138,82,.7)', fontSize: 10, fontWeight: 700 }}>{d.hours || '✓'}</span>
                                    : <span style={{ color: 'rgba(255,255,255,.1)', fontSize: 12 }}>—</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {currentEmpTab === 'jornada' && <TabJornada timer={timer} db={db} u={u} toast={toast} saveDB={saveDB} openModal={openModal} closeModal={closeModal} activeModal={activeModal} modalData={modalData} openCorreccion={openModal} />}
          {currentEmpTab === 'vacaciones' && <TabVacaciones db={db} u={u} vac={vac} toast={toast} saveDB={saveDB} />}
          {currentEmpTab === 'calendario' && <TabCalendario db={db} u={u} calMonth={calMonth} setCalMonth={setCalMonth} />}
          {currentEmpTab === 'mensajes' && <TabMensajes db={db} u={u} toast={toast} saveDB={saveDB} />}
          {currentEmpTab === 'turnos' && <TabTurnos db={db} u={u} />}
          {currentEmpTab === 'perfil' && <TabPerfil u={u} session={session} db={db} saveDB={saveDB} toast={toast} doLogout={doLogout} openModal={openModal} perfilView={perfilSubTab} setPerfilView={setPerfilSubTab} />}
        </div>
      </div>

      <WellbeingModal visible={showWellbeing} onClose={() => setShowWellbeing(false)} onSubmit={handleWellbeingSubmit} userName={u.name.split(' ')[0]} />
      <ModalSelCentro visible={activeModal==='selCentro'} data={modalData} onConfirm={confirmarCentro} onClose={() => { startingRef.current = false; geoAbortRef.current = true; closeModal() }} />
      <ModalQRScan visible={qrScanOpen} onScan={handleQRScan} onClose={() => setQrScanOpen(false)} />
      <ModalMyQR visible={activeModal==='miQR'} u={u} onClose={closeModal} />
      <ModalNotis visible={activeModal==='notis'} db={db} onClose={closeModal} toast={toast} saveDB={saveDB} u={u} />
      <ModalAI visible={activeModal==='ai'} db={db} u={u} onClose={closeModal} />
      <ModalVacForm visible={activeModal==='vacForm'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalSign visible={activeModal==='sign'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalInfoPersonal visible={activeModal==='infoPersonal'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalDocumentos visible={activeModal==='documentos'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalConfiguracion visible={activeModal==='configuracion'} u={u} db={db} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalLogros visible={activeModal==='logros'} db={db} u={u} onClose={closeModal} saveDB={saveDB} />
      <ModalTemas visible={activeModal==='temas'} db={db} u={u} onClose={closeModal} saveDB={saveDB} />
      <ModalCierreSign visible={activeModal==='cierreSign'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalChat visible={activeModal==='chat'} db={db} u={u} onClose={closeModal} saveDB={saveDB} toast={toast} />
      <ModalCorreccion visible={activeModal==='correccion'} data={modalData} db={db} u={u} onClose={closeModal} saveDB={saveDB} toast={toast} />
      <Confetti visible={showConfetti} />
      {u.onboardingDone && <WelcomeSlides />}
      <OnboardingModal visible={!u.onboardingDone} u={u} db={db} saveDB={saveDB} toast={toast} />
    </div>
  )

  return (
    <div className="screen active" id="sEmp">
      {/* Topbar */}
      <div className="emp-topbar">
        <div className="emp-top-left">
          <div className="emp-avatar" style={{ background: u.color || 'var(--primary)', position:'relative' }}>
            {initials}
            {syncStatus === 'syncing'
              ? <span title="Sincronizando" style={{ position:'absolute', bottom:-2, right:-2, width:9, height:9, borderRadius:'50%', background:'var(--primary-light)', border:'2px solid var(--bg-700)', animation:'pulse 1.2s ease-in-out infinite' }} />
              : realtimeStatus === 'SUBSCRIBED'
              ? <span title="Tiempo real activo" style={{ position:'absolute', bottom:-2, right:-2, width:9, height:9, borderRadius:'50%', background:'#10b981', border:'2px solid var(--bg-700)', boxShadow:'0 0 5px #10b981' }} />
              : null}
          </div>
          <div style={{ minWidth:0, overflow:'hidden' }}>
            <TopbarClock />
          </div>
        </div>
        <div className="emp-top-right">
          {/* Pill de acciones agrupadas — todo en un único contenedor para no competir por espacio */}
          <div style={{ display:'flex', alignItems:'center', gap:2, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.08)', borderRadius:22, padding:'3px 4px' }}>
            {/* Panel — encargados y jefes de obra */}
            {isSuper && (
              <>
                <button onClick={() => setScreen('admin')} title="Panel de administración" aria-label="Ir al panel" style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:18, border:'none', background:'rgba(177,138,82,.16)', color:'var(--primary-light)', cursor:'pointer', transition:'background .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(177,138,82,.28)'}
                  onMouseLeave={e => e.currentTarget.style.background='rgba(177,138,82,.16)'}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
                </button>
                <div style={{ width:1, height:16, background:'rgba(255,255,255,.1)', margin:'0 2px' }} />
              </>
            )}
            {/* IA */}
            <button onClick={() => openModal('ai')} title="Asistente IA" aria-label="Abrir asistente de IA" style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:18, border:'none', background:'transparent', color:'var(--primary-light)', cursor:'pointer', transition:'background .15s' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(177,138,82,.18)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
              </svg>
            </button>

            {/* Chat */}
            <button onClick={() => openModal('chat')} title="Chat con admin" aria-label="Chat con administrador" style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:18, border:'none', background:'transparent', color:'rgba(255,255,255,.55)', cursor:'pointer', transition:'background .15s' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,.07)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              {chatUnread > 0 && <span style={{ position:'absolute', top:2, right:2, minWidth:14, height:14, borderRadius:7, background:'var(--danger)', color:'#fff', fontSize:8, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 2px', pointerEvents:'none', lineHeight:1 }} aria-hidden="true">{chatUnread > 9 ? '9+' : chatUnread}</span>}
            </button>

            {/* Notificaciones */}
            <button onClick={() => openModal('notis')} title="Notificaciones" aria-label={`Notificaciones${unread > 0 ? ` (${unread})` : ''}`} style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:18, border:'none', background:'transparent', color:'rgba(255,255,255,.55)', cursor:'pointer', transition:'background .15s' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,.07)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {unread > 0 && <span style={{ position:'absolute', top:2, right:2, minWidth:14, height:14, borderRadius:7, background:'var(--danger)', color:'#fff', fontSize:8, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 2px', lineHeight:1, pointerEvents:'none' }} aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
            </button>

            {/* Separador */}
            <div style={{ width:1, height:16, background:'rgba(255,255,255,.1)', margin:'0 2px' }} />

            {/* Tema */}
            <button onClick={() => { toggleTheme(); setIsLight(l => !l) }} title={isLight ? 'Modo oscuro' : 'Modo claro'} aria-label="Cambiar tema claro/oscuro" style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:18, border:'none', background:'transparent', color:'rgba(255,255,255,.45)', cursor:'pointer', fontSize:14, transition:'background .15s' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,.07)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              {isLight
                ? <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                : <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>}
            </button>

            <div style={{ width:1, height:16, background:'rgba(255,255,255,.1)', margin:'0 2px' }} />

            {/* Logout */}
            <button onClick={doLogout} title="Cerrar sesión" aria-label="Cerrar sesión" style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:18, border:'none', background:'transparent', color:'rgba(239,68,68,.75)', cursor:'pointer', transition:'background .15s' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(239,68,68,.16)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </div>

      <PWAInstall />
      <OfflineBanner />

      {/* Notificaciones push v3 */}
      {showNotifBanner && (
        <div className="v3-notif-banner" style={{ margin:'0', borderRadius:0, borderBottom:'1px solid rgba(177,138,82,.2)', borderTop:'none', borderLeft:'none', borderRight:'none' }}>
          <div className="v3-notif-banner-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>
          <div className="v3-notif-banner-text">
            <div className="v3-notif-banner-title">Activa las notificaciones</div>
            <div className="v3-notif-banner-sub">Recibe avisos de jornada, documentos y mensajes</div>
          </div>
          <button className="v3-notif-banner-btn" onClick={handleNotifActivate}>Activar</button>
          <button className="v3-notif-banner-close" onClick={handleNotifDismiss} aria-label="Cerrar">×</button>
        </div>
      )}

      {/* Geofencing banner */}
      {geoPrompt && (
        <div style={{ background:'rgba(99,102,241,.15)', borderBottom:'1px solid rgba(99,102,241,.3)', padding:'8px 14px', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:16 }}>📍</span>
          <span style={{ flex:1, fontSize:12, color:'var(--primary-light)' }}>Cerca de <strong>{geoPrompt.obraName}</strong> — ¿iniciar jornada?</span>
          <button onClick={handleGeoStart} style={{ background:'var(--primary)', color:'#fff', border:'none', borderRadius:8, padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer' }}>Iniciar</button>
          <button onClick={() => { geoDismissedRef.current = true; setGeoPrompt(null) }} style={{ background:'none', border:'none', color:'var(--text4)', fontSize:18, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>
      )}
      {geoExitPrompt && (
        <div style={{ background:'rgba(245,158,11,.15)', borderBottom:'1px solid rgba(245,158,11,.35)', padding:'8px 14px', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:16 }}>🚶</span>
          <span style={{ flex:1, fontSize:12, color:'var(--orange)' }}>Te alejas de <strong>{geoExitPrompt.obraName}</strong> — ¿fichar salida?</span>
          <button onClick={() => { setGeoExitPrompt(null); doStop() }} style={{ background:'var(--orange)', color:'#fff', border:'none', borderRadius:8, padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer' }}>Fichar salida</button>
          <button onClick={() => { geoExitDismissedRef.current = geoExitPrompt.recId; setGeoExitPrompt(null) }} style={{ background:'none', border:'none', color:'var(--text4)', fontSize:18, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>
      )}

      {/* Body */}
      <div className="emp-body" ref={empBodyRef}>
        {currentEmpTab === 'inicio' && (
          <div style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 116, boxSizing: 'border-box' }}>
            {pendingCierresEmp.length > 0 && (
              <div style={{ margin: '12px 16px 0', padding: '12px 14px', borderRadius: 12, background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.35)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display:'flex', color:'var(--warning)' }}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4z"/></svg></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>
                    {pendingCierresEmp.length === 1 ? 'Cierre mensual pendiente de firma' : `${pendingCierresEmp.length} cierres pendientes de firma`}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 1 }}>Tu firma es obligatoria</div>
                </div>
                <button onClick={() => openModal('cierreSign')} style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 7, border: 'none', background: 'var(--orange)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Firmar
                </button>
              </div>
            )}
            <div style={{ padding: '16px' }}>
              <EmployeeHome {...homeData} onStartAction={doStart} onBreakAction={doBreak} onStopAction={doStop}
                extraAction={isSuper ? (
                  <button onClick={() => setQrScanOpen(true)} style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '11px 16px', borderRadius: 12, border: '1px solid rgba(177,138,82,.3)',
                    background: 'rgba(177,138,82,.08)', color: 'var(--primary-light)', fontSize: 13,
                    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    Fichar a un empleado
                  </button>
                ) : undefined}
              />
            </div>
            {false && weekPlanningData && (
              <div style={{ padding: '0 16px 16px' }}>
                <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,.08)', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 12px', background: 'rgba(177,138,82,.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ display:'flex', color:'var(--primary-light)' }}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-light)' }}>Planning semanal</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text4)' }}>{weekPlanningData.members.length} miembros</span>
                  </div>
                  <div className="emp-planning-wrap" style={{ overflowX: 'auto' }}>
                    <table className="emp-planning-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text4)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,.06)' }}>Empleado</th>
                          {weekPlanningData.days.map(d => (
                            <th key={d.dateStr} style={{ padding: '6px 4px', textAlign: 'center', color: d.isToday ? 'var(--primary-light)' : d.isWeekend ? 'var(--text5)' : 'var(--text4)', fontWeight: d.isToday ? 800 : 600, borderBottom: '1px solid rgba(255,255,255,.06)', minWidth: 32 }}>{d.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {weekPlanningData.members.map((m, mi) => (
                          <tr key={m.id} style={{ borderTop: mi > 0 ? '1px solid rgba(255,255,255,.04)' : 'none' }}>
                            <td style={{ padding: '6px 10px', color: 'var(--text1)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontSize: 8, fontWeight: 800, marginRight: 6 }}>{m.initials}</span>
                              {m.name.split(' ')[0]}
                            </td>
                            {m.days.map((d, di) => (
                              <td key={di} style={{ padding: '5px 3px', textAlign: 'center' }}>
                                {d.status === 'active' ? <span title="Trabajando ahora" style={{ color: 'var(--green)', fontSize: 12 }}>●</span>
                                  : d.status === 'done' ? <span title={d.hours} style={{ color: 'rgba(177,138,82,.7)', fontSize: 9, fontWeight: 700 }}>{d.hours || '✓'}</span>
                                  : <span style={{ color: 'rgba(255,255,255,.1)', fontSize: 10 }}>—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {currentEmpTab === 'jornada' && <TabJornada timer={timer} db={db} u={u} toast={toast} saveDB={saveDB} openModal={openModal} closeModal={closeModal} activeModal={activeModal} modalData={modalData} openCorreccion={openModal} />}
        {currentEmpTab === 'vacaciones' && <TabVacaciones db={db} u={u} vac={vac} toast={toast} saveDB={saveDB} />}
        {currentEmpTab === 'calendario' && <TabCalendario db={db} u={u} calMonth={calMonth} setCalMonth={setCalMonth} />}
        {currentEmpTab === 'mensajes' && <TabMensajes db={db} u={u} toast={toast} saveDB={saveDB} />}
        {currentEmpTab === 'turnos' && <TabTurnos db={db} u={u} />}
        {currentEmpTab === 'perfil' && <TabPerfil u={u} session={session} db={db} saveDB={saveDB} toast={toast} doLogout={doLogout} openModal={openModal} perfilView={perfilSubTab} setPerfilView={setPerfilSubTab} />}
      </div>

      {/* Bottom nav */}
      <div className="emp-nav emp-nav-scroll">
        {[
          { id:'inicio',     label:'Inicio',     icon:<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>, extra:<polyline points="9 22 9 12 15 12 15 22"/> },
          { id:'jornada',    label:'Jornada',    icon:<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>, live: timer.state !== 'idle' },
          { id:'vacaciones', label:'Vacaciones', icon:<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><path d="M12 3c0 0 4 4 4 8s-4 8-4 8"/><path d="M12 3c0 0-4 4-4 8s4 8 4 8"/></> },
          { id:'calendario', label:'Calendario', icon:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></> },
          { id:'turnos',     label:'Turnos',     icon:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="15" x2="15" y2="15"/></> },
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

      {/* Modals */}
      <WellbeingModal visible={showWellbeing} onClose={() => setShowWellbeing(false)} onSubmit={handleWellbeingSubmit} userName={u.name.split(' ')[0]} />
      <ModalSelCentro visible={activeModal==='selCentro'} data={modalData} onConfirm={confirmarCentro} onClose={() => { startingRef.current = false; geoAbortRef.current = true; closeModal() }} />
      <ModalQRScan visible={qrScanOpen} onScan={handleQRScan} onClose={() => setQrScanOpen(false)} />
      <ModalMyQR visible={activeModal==='miQR'} u={u} onClose={closeModal} />
      <ModalNotis visible={activeModal==='notis'} db={db} onClose={closeModal} toast={toast} saveDB={saveDB} u={u} />
      <ModalAI visible={activeModal==='ai'} db={db} u={u} onClose={closeModal} />
      <ModalVacForm visible={activeModal==='vacForm'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalSign visible={activeModal==='sign'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalInfoPersonal visible={activeModal==='infoPersonal'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalDocumentos visible={activeModal==='documentos'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalConfiguracion visible={activeModal==='configuracion'} u={u} db={db} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalLogros visible={activeModal==='logros'} db={db} u={u} onClose={closeModal} saveDB={saveDB} />
      <ModalTemas visible={activeModal==='temas'} db={db} u={u} onClose={closeModal} saveDB={saveDB} />
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

