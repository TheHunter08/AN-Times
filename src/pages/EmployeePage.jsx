import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAppStore } from '../store/appStore.js'
import { useTimer } from '../hooks/useTimer.js'
import { today, s2t, mhm, p2, ftime, fds, calcSecs, calcMin, gid, vacData, wkStart, recWorkSecs, sortedEmps } from '../utils/time.js'
import { WD, WK, FESTIVOS_MADRID_2026, VAPID_PUB } from '../config/constants.js'
import { requestPushPermission, isNativePlatform } from '../services/nativeNotifications.js'
import { auditLog, pushSubscribe, queuePush } from '../services/dataService.js'
import { DocPreview } from '../components/DocPreview.jsx'
import { makePrintableSignature, stampSignatureOnPdf, stampSignatureOnImage } from '../utils/pdfSign.js'
import { startedInHorizontalScroller } from '../utils/gesture.js'
import { useModalBack } from '../hooks/useModalBack.js'

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
  return (
    <div className="emp-subdate">
      {clockDate} · <span style={{ color:'var(--primary-light)', fontWeight:600 }}>{clockTime}</span>
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

export default function EmployeePage() {
  const { db, session, currentEmpTab, setEmpTab, saveDB, logout, toast, setScreen, openModal, closeModal, activeModal, modalData } = useAppStore()
  const timer = useTimer()
  const u = session.user
  const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  const [pendingGPS, setPendingGPS] = useState(null)
  const [calMonth, setCalMonth] = useState(new Date())
  const dbRef = useRef(db)
  useEffect(() => { dbRef.current = db }, [db])

  // Auto-subscribe to push notifications on login (PWA only)
  useEffect(() => { if (u?.id && isPWA) pushSubscribe(u.id, VAPID_PUB) }, [u?.id])

  // In browser/web mode, silently mark onboarding done so the wizard never shows
  useEffect(() => {
    if (u?.id && !u.onboardingDone && !isPWA) {
      saveDB({ employees: (db.employees || []).map(e => e.id === u.id ? { ...e, onboardingDone: true } : e) })
    }
  }, [u?.id])

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

    // Solicitar permiso de notificaciones: nativo (Capacitor) o PWA web
    setTimeout(async () => {
      const native = await isNativePlatform()
      if (native || isPWA) await requestPushPermission()
    }, 3000)

    // Smart notifications: check every 60s if any reminder should fire
    const checkSmartNotis = () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      const now = new Date()
      // Usar fecha local (no UTC) para evitar desfase de zona horaria
      const todayStr = `${now.getFullYear()}-${p2(now.getMonth()+1)}-${p2(now.getDate())}`
      const hh = now.getHours()
      const mm = now.getMinutes()
      const db = dbRef.current

      // 1. Recordatorio diario de fichaje (hora configurada por el usuario)
      if (getCfg('notiFichaje', true)) {
        const [rh, rm] = (getCfg('reminderTime', '20:00')).split(':').map(Number)
        // Ventana de 5 minutos: si han pasado entre 0 y 4 minutos desde la hora configurada
        const minsPast = (hh - rh) * 60 + (mm - rm)
        if (minsPast >= 0 && minsPast < 5) {
          const hasFichado = (db.records || []).some(r => r.empId === u.id && r.inicio.startsWith(todayStr))
          const lastKey = 'an_rem_' + u.id
          if (!hasFichado && localStorage.getItem(lastKey) !== todayStr) {
            localStorage.setItem(lastKey, todayStr)
            const rTitle = '⏰ Recordatorio de fichaje'
            const rBody  = '¿Has fichado hoy? No olvides registrar tu jornada laboral.'
            queuePush(u.id, rTitle, rBody, 'reminder-fichar', '/?tab=inicio')
          }
        }
      }

      // 2. Notificación cuando se acerca el fin de jornada (15 min antes de 8h)
      const openRec = (db.records || []).find(r => r.empId === u.id && !r.fin)
      if (openRec) {
        const elapsed = (Date.now() - new Date(openRec.inicio).getTime()) / 60000
        const warn14h = 'an_warn_14h_' + openRec.id
        if (elapsed >= 465 && elapsed < 475 && !localStorage.getItem(warn14h)) {
          localStorage.setItem(warn14h, '1')
          const jTitle = '⏳ Jornada larga'
          const jBody  = 'Llevas más de 7h 45min trabajando. Recuerda fichar la salida.'
          queuePush(u.id, jTitle, jBody, 'jornada', '/')
        }
      }

      // 3. Recordatorio "¿Olvidaste fichar la salida?" a la hora de salida configurada
      if (getCfg('notiSalida', true) && openRec) {
        const [sh, sm] = (getCfg('salidaTime', '21:00')).split(':').map(Number)
        const salidaMinsPast = (hh - sh) * 60 + (mm - sm)
        if (salidaMinsPast >= 0 && salidaMinsPast < 5) {
          const sKey = 'an_salida_' + openRec.id
          if (!localStorage.getItem(sKey)) {
            localStorage.setItem(sKey, '1')
            const elapsedSalida = Math.floor((Date.now() - new Date(openRec.inicio).getTime()) / 60000)
            const sTitle = '🔔 ¿Olvidaste fichar la salida?'
            const sBody  = `Llevas ${mhm(elapsedSalida)} con la jornada abierta. ¿Ya has terminado?`
            queuePush(u.id, sTitle, sBody, 'jornada', '/?tab=inicio')
          }
        }
      }

      // 4. Notificación de vacaciones aprobadas/rechazadas (una vez por solicitud)
      ;(db.vacaciones || []).filter(v => v.empId === u.id && (v.estado === 'aprobada' || v.estado === 'rechazada')).forEach(v => {
        const key = 'an_vac_res_' + v.id
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, '1')
          if (v.estado === 'aprobada') {
            queuePush(u.id, '🎉 Vacaciones aprobadas', `Tu solicitud de ${v.dias} día(s) ha sido aprobada.`, 'vacaciones', '/?go=emp:vacaciones')
          } else {
            queuePush(u.id, '❌ Vacaciones rechazadas', `Tu solicitud de ${v.dias} día(s) ha sido rechazada.`, 'vacaciones', '/?go=emp:vacaciones')
          }
        }
      })

      // 4. Notificación de documentos pendientes de firma (una vez al día)
      const pendDocs = (db.documentos || []).filter(d => d.empId === u.id && !d.firma)
      if (pendDocs.length > 0) {
        const key = 'an_docs_' + u.id
        if (localStorage.getItem(key) !== todayStr && hh === 9 && mm === 0) {
          localStorage.setItem(key, todayStr)
          queuePush(u.id, '📄 Documentos pendientes',
            `Tienes ${pendDocs.length} documento(s) pendiente(s) de firma.`, 'documentos', '/?go=emp:documentos')
        }
      }

      // 5. Recordatorio de cierre mensual pendiente de firma (una vez al día a las 9h)
      const pendCierres = (db.cierres || []).filter(c => c.empId === u.id && c.estado === 'pendiente')
      if (pendCierres.length > 0) {
        const key = 'an_cierre_' + u.id
        if (localStorage.getItem(key) !== todayStr && hh === 9 && mm === 0) {
          localStorage.setItem(key, todayStr)
          queuePush(u.id, '📋 Cierre mensual pendiente',
            `Tienes ${pendCierres.length} resumen${pendCierres.length > 1 ? 'es' : ''} mensual pendiente${pendCierres.length > 1 ? 's' : ''} de firma.`, 'cierre', '/?go=emp:perfil')
        }
      }

      // 6. Auto-cierre de jornada olvidada (> 12h sin fichar salida)
      const staleRecs = (db.records || []).filter(r => r.empId === u.id && !r.fin)
      staleRecs.forEach(stale => {
        const elapsedStale = (Date.now() - new Date(stale.inicio).getTime()) / 60000
        if (elapsedStale > 720) {
          const acKey = 'an_autoclose_' + stale.id
          if (!localStorage.getItem(acKey)) {
            localStorage.setItem(acKey, '1')
            const closeTime = new Date().toISOString()
            const breaks2 = [...(stale.breaks || [])]
            const t2 = calcSecs({ ...stale, fin: closeTime, breaks: breaks2 })
            const closed2 = { ...stale, fin: closeTime, breaks: breaks2, workSecs: t2.work, breakSecs: t2.brk, closed: true, autoClosedAt: closeTime }
            const updRecs = dbRef.current.records.map(r => r.id === stale.id ? closed2 : r)
            saveDB({ records: updRecs })
            queuePush(u.id, '⏱️ Jornada cerrada automáticamente',
              `Tu jornada del ${stale.inicio.slice(0,10)} se cerró por inactividad (${mhm(Math.floor(t2.work/60))}).`, 'jornada', '/?tab=jornada')
          }
        }
      })
    }

    const iv = setInterval(checkSmartNotis, 60000)
    // Check immediately (after 5s to let permission settle)
    const t = setTimeout(checkSmartNotis, 5000)
    return () => { clearInterval(iv); clearTimeout(t) }
  }, [u])

  // App Badge API — muestra el contador de no leídas en el icono de la app instalada
  useEffect(() => {
    if (!u || !('setAppBadge' in navigator)) return
    const cnt = (db.notis || []).filter(n => n.empId === u.id && !n.leido).length
    const total = cnt
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
    // Get GPS
    setPendingGPS(null)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const lat = +pos.coords.latitude.toFixed(5)
          const lng = +pos.coords.longitude.toFixed(5)
          // Descartar coordenadas inválidas (0,0 = Null Island, fuera de rango)
          if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0)) {
            setPendingGPS({ lat, lng, acc: Math.round(pos.coords.accuracy), ts: new Date().toISOString() })
          }
        },
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
    try { navigator.vibrate(15) } catch {}
    toast('Jornada iniciada en ' + centro, 3000, 'ok')
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
    try { navigator.vibrate(15) } catch {}
    toast('Jornada finalizada — ' + mhm(Math.floor(t.work / 60)), 3000, 'ok')
    // Capturar GPS en background y actualizar el registro cuando resuelva
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const locFin = { lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5), ts: new Date().toISOString() }
          const fresh = dbRef.current
          const updated = fresh.records.map(r => r.id === closed.id ? { ...r, locFin } : r)
          saveDB({ records: updated })
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      )
    }
  }, [db, openRec, saveDB, toast])

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

  const doLogout = () => { logout() }

  if (!u) return null

  const initials = u.initials || u.name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  const vac = vacData(u.id, db)
  const unread = (db.notis || []).filter(n => n.empId === u?.id && !n.leido).length

  return (
    <div className="screen active" id="sEmp">
      {/* Topbar */}
      <div className="emp-topbar">
        <div className="emp-top-left">
          <div className="emp-avatar" style={{ background: u.color || 'var(--primary)' }}>{initials}</div>
          <div style={{ minWidth:0, overflow:'hidden' }}>
            <div className="emp-greeting">👋 {u.name.split(' ')[0]}</div>
            <TopbarClock />
          </div>
        </div>
        <div className="emp-top-right">
          {(session.isEnc || session.isJO) && (
            <button className="enc-chip" onClick={() => setScreen('admin')}>
              {session.isJO ? '🏗️ Panel' : '⭐ Panel'}
            </button>
          )}
          <button className="theme-toggle-btn" onClick={toggleTheme} title="Tema" aria-label="Cambiar tema claro/oscuro">🌙</button>
          <button className="icon-btn ai-btn" onClick={() => openModal('ai')} title="IA" aria-label="Abrir asistente de IA">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/></svg>
          </button>
          <button className="icon-btn" onClick={() => openModal('chat')} style={{ position:'relative' }} aria-label="Chat con administrador">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            {(() => { const un = (db.chats||[]).filter(m => m.from === 'admin' && m.to === u?.id && !m.leido).length; return un > 0 ? <span style={{ position:'absolute', top:-4, right:-4, minWidth:16, height:16, borderRadius:8, background:'var(--danger)', color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px', pointerEvents:'none' }} aria-hidden="true">{un > 9 ? '9+' : un}</span> : null })()}
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

      <OfflineBanner />

      {/* Body */}
      <div className="emp-body" ref={empBodyRef}>
        {currentEmpTab === 'inicio' && <TabInicio timer={timer} doStart={doStart} doStop={doStop} doBreak={doBreak} openRec={openRec} db={db} u={u} openModal={openModal} />}
        {currentEmpTab === 'jornada' && <TabJornada timer={timer} db={db} u={u} toast={toast} saveDB={saveDB} openModal={openModal} closeModal={closeModal} activeModal={activeModal} modalData={modalData} openCorreccion={openModal} />}
        {currentEmpTab === 'vacaciones' && <TabVacaciones db={db} u={u} vac={vac} toast={toast} saveDB={saveDB} />}
        {currentEmpTab === 'calendario' && <TabCalendario db={db} u={u} calMonth={calMonth} setCalMonth={setCalMonth} />}
        {currentEmpTab === 'mensajes' && <TabMensajes db={db} u={u} toast={toast} saveDB={saveDB} />}
        {currentEmpTab === 'perfil' && <TabPerfil u={u} session={session} db={db} saveDB={saveDB} toast={toast} doLogout={doLogout} openModal={openModal} />}
      </div>

      {/* Bottom nav */}
      {(() => {
        const chatUnread = (db.chats || []).filter(m => m.from === 'admin' && m.to === u?.id && !m.leido).length
        return (
      <div className="emp-nav">
        {[
          { id:'inicio',     label:'Inicio',     icon:<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>, extra:<polyline points="9 22 9 12 15 12 15 22"/> },
          { id:'jornada',    label:'Jornada',    icon:<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></> },
          { id:'vacaciones', label:'Vac.',        icon:<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><path d="M12 3c0 0 4 4 4 8s-4 8-4 8"/><path d="M12 3c0 0-4 4-4 8s4 8 4 8"/></> },
          { id:'calendario', label:'Calendario', icon:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></> },
          { id:'mensajes',   label:'Mensajes',   icon:<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>, badge: chatUnread },
          { id:'perfil',     label:'Perfil',     icon:<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></> },
        ].map(({ id, label, icon, extra, badge }) => (
          <button key={id} type="button" className={`emp-nav-item${currentEmpTab===id?' on':''}`} onClick={() => setEmpTab(id)} aria-current={currentEmpTab===id} aria-label={label}>
            <span style={{ position:'relative', display:'inline-flex' }}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{icon}{extra}</svg>
              {badge > 0 && <span style={{ position:'absolute', top:-4, right:-6, minWidth:14, height:14, borderRadius:7, background:'var(--danger)', color:'#fff', fontSize:8, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 2px' }}>{badge}</span>}
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
      <ModalConfiguracion visible={activeModal==='configuracion'} u={u} onClose={closeModal} toast={toast} />
      <ModalCierreSign visible={activeModal==='cierreSign'} db={db} u={u} onClose={closeModal} toast={toast} saveDB={saveDB} />
      <ModalChat visible={activeModal==='chat'} db={db} u={u} onClose={closeModal} saveDB={saveDB} toast={toast} />
      <ModalCorreccion visible={activeModal==='correccion'} data={modalData} db={db} u={u} onClose={closeModal} saveDB={saveDB} toast={toast} />

      {/* Onboarding: primer login */}
      <OnboardingModal visible={!u.onboardingDone} u={u} db={db} saveDB={saveDB} toast={toast} />
    </div>
  )
}

// ─── OFFLINE BANNER ────────────────────────────────────────────────────────────
function OfflineBanner() {
  const syncStatus = useAppStore(s => s.syncStatus)
  const [realOffline, setRealOffline] = useState(() => !navigator.onLine)

  useEffect(() => {
    const on  = () => setRealOffline(false)
    const off = () => setRealOffline(true)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  if (syncStatus !== 'error' && !realOffline) return null
  return (
    <div style={{ background:'linear-gradient(90deg,#ef4444,#dc2626)', color:'#fff', fontSize:12, fontWeight:700, textAlign:'center', padding:'7px 16px', letterSpacing:'.3px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      {realOffline ? 'Sin internet — fichajes guardados localmente' : 'Error de conexión — datos guardados localmente'}
    </div>
  )
}

// ─── PULL TO REFRESH ────────────────────────────────────────────────────────────
function PullToRefresh({ children }) {
  const fetchDB = useAppStore(s => s.fetchDB)
  const tabRef = useRef(null)
  const [pullState, setPullState] = useState({ dist: 0, refreshing: false })
  const ptr = useRef({ startY: 0, active: false, dist: 0, refreshing: false })

  useEffect(() => {
    const el = tabRef.current
    if (!el) return
    const onStart = e => {
      if (el.scrollTop === 0) { ptr.current.startY = e.touches[0].clientY; ptr.current.active = true }
    }
    const onMove = e => {
      if (!ptr.current.active) return
      const d = e.touches[0].clientY - ptr.current.startY
      if (d > 0) { ptr.current.dist = Math.min(d * 0.45, 60); setPullState(s => ({ ...s, dist: ptr.current.dist })) }
      else { ptr.current.active = false }
    }
    const onEnd = async () => {
      if (!ptr.current.active) return
      ptr.current.active = false
      if (ptr.current.dist > 48 && !ptr.current.refreshing) {
        ptr.current.refreshing = true
        setPullState({ dist: 0, refreshing: true })
        try { await fetchDB() } finally { ptr.current.refreshing = false; setPullState({ dist: 0, refreshing: false }) }
      } else { ptr.current.dist = 0; setPullState({ dist: 0, refreshing: false }) }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd) }
  }, [fetchDB])

  const { dist, refreshing } = pullState
  return (
    <div ref={tabRef} className="emp-tab active">
      <div style={{ textAlign:'center', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', gap:5,
        height: refreshing ? 40 : dist > 0 ? Math.round(dist * 0.7) : 0,
        transition: dist === 0 && !refreshing ? 'height .3s' : 'none',
        color:'var(--text3)', fontSize:11, fontWeight:600, flexShrink:0 }}>
        {(refreshing || dist > 0) && (refreshing ? '↻ Actualizando…' : dist > 48 ? '↑ Suelta para actualizar' : '↓ Bajar para actualizar')}
      </div>
      {children}
    </div>
  )
}

// ─── TAB INICIO ────────────────────────────────────────────────────────────────
function TabInicio({ timer, doStart, doStop, doBreak, openRec, db, u, openModal }) {
  const { clockTime, clockDate } = useClock()
  const todayStr = today()
  const recs = (db.records || []).filter(r => r.empId === u.id && r.inicio.startsWith(todayStr))
  const realRecs = recs.filter(r => !r.fin || recWorkSecs(r) >= 30)
  const o = openRec()

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

  // SVG arc
  const ARC_R = 50
  const ARC_C = 2 * Math.PI * ARC_R
  const arcOffset = ARC_C * (1 - pct / 100)

  const handleMainBtn = () => {
    if (timer.state === 'idle') doStart()
    else doStop()
  }

  const statusClass = timer.state === 'idle' ? 'idle' : timer.state === 'break' ? 'break' : ''

  return (
    <PullToRefresh>
      <div className="ini-wrap">

        {/* Hero clock card */}
        <div className="hero-clock-card">
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
              <div className="hero-hour-label">Extra</div>
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

          <button className={`hero-fichar-btn${timer.state !== 'idle' ? ' active' : ''}`} onClick={handleMainBtn}>
            {timer.state === 'idle'
              ? '▶  Iniciar jornada'
              : timer.state === 'break'
                ? '⏹  Terminar jornada'
                : '⏹  Registrar salida'}
          </button>

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {[
            { lbl: 'Entrada', val: entradaRec ? ftime(entradaRec.inicio) : '- -:- -', color: 'var(--primary-light)', bg: 'rgba(37,99,235,.12)' },
            { lbl: 'Salida',  val: o ? '- -:- -' : salidaRec ? ftime(salidaRec.fin) : '- -:- -', color: 'var(--green)', bg: 'var(--green-dim)' },
            { lbl: 'Pausa',   val: brkMin > 0 ? `${Math.floor(brkMin / 60).toString().padStart(2, '0')}:${p2(brkMin % 60)}` : '00:00', color: 'var(--orange)', bg: 'var(--orange-dim)' },
            { lbl: 'Total',   val: totMin > 0 ? `${Math.floor(totMin / 60)}h ${p2(totMin % 60)}m` : '0h 00m', color: 'var(--secondary)', bg: 'rgba(6,182,212,.1)' },
          ].map(({ lbl, val, color, bg }) => (
            <div key={lbl} className="stat-card-premium" style={{ textAlign: 'center' }}>
              <div className="stat-lbl">{lbl}</div>
              <div className="stat-val" style={{ color, fontSize: 14 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* GPS card */}
        {o && (
          <div className="gps-card">
            <div className="gps-ico">
              <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
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
    </PullToRefresh>
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

  const tlItems = realRecs.map(r => ({ r, isCurrent: !r.fin }))

  const [informeUrl, setInformeUrl]     = useState(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)

  const closeInforme = useCallback(() => {
    setInformeUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
  }, [])

  useModalBack(!!informeUrl, closeInforme)

  const exportMonthPDF = async () => {
    setGeneratingPdf(true)
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const now2 = new Date()
      const mk2 = `${now2.getFullYear()}-${p2(now2.getMonth()+1)}`
      const monthRecs = (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio.startsWith(mk2)).sort((a,b) => a.inicio.localeCompare(b.inicio))
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

      // ─ Total + resumen vs objetivo ────────────────────────────────
      if (y - 40 < 35 + SIG_AREA) { newPage() }
      const targetMin2 = monthRecs.length * 480   // 8h/día
      const diffMin2   = totalMin2 - targetMin2
      const diffSign   = diffMin2 >= 0 ? '+' : ''
      const cDiff      = diffMin2 >= 0 ? cGreen : rgb(0.87,0.27,0.27)
      page.drawRectangle({ x:ML, y:y-20, width:CW, height:20, color:cPriLt, borderColor:cPri, borderWidth:0.6 })
      page.drawText(`TOTAL: ${mhm(totalMin2)}   ·   ${monthRecs.length} jornada${monthRecs.length!==1?'s':''} registrada${monthRecs.length!==1?'s':''}`, { x:ML+8, y:y-14, size:8.5, font:fontB, color:cPri })
      page.drawText(`Objetivo: ${mhm(targetMin2)}   Desviación: ${diffSign}${mhm(Math.abs(diffMin2))}`, { x:ML+8, y:y-34, size:7.5, font:fontR, color:cDiff, maxWidth:CW-16 })
      y -= 42

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
        page.drawRectangle({ x:ML, y:y-16-70, width:170, height:70, color:cLtGray, borderColor:cBorder, borderWidth:0.5 })
        page.drawText('Sin firma digital registrada', { x:ML+10, y:y-55, size:7, font:fontR, color:cGray })
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
      setInformeUrl(URL.createObjectURL(blob))
    } catch(e) {
      toast('Error al generar el PDF: ' + (e?.message || e))
    } finally {
      setGeneratingPdf(false)
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
          <div className="jor-stat-lbl">Extra</div>
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

      {/* Monthly PDF export */}
      <div style={{ padding:'0 16px 6px', display:'flex', justifyContent:'flex-end' }}>
        <button className="btn btn-secondary btn-sm" onClick={exportMonthPDF} disabled={generatingPdf} style={{ opacity: generatingPdf ? 0.7 : 1 }}>
          {generatingPdf
            ? <><span className="login-spinner" style={{ width:11, height:11, borderWidth:1.5, borderColor:'rgba(108,99,255,.2)', borderTopColor:'var(--primary-light)', marginRight:6, display:'inline-block', verticalAlign:'middle' }} />Generando…</>
            : <><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:4 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Informe firmado PDF</>
          }
        </button>
      </div>

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
          recs: (db.records || []).filter(r => r.empId === u.id && r.inicio.startsWith(ds) && r.fin),
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
                <button onClick={() => window.open(informeUrl, '_blank')} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'13px', background:'var(--bg-500)', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:'var(--r)', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit', WebkitTapHighlightColor:'transparent' }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  Abrir
                </button>
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
    queuePush(adminId, `Mensaje de ${u.name}`, t, 'chat', '/?go=admin:mensajes')
    setText('')
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
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

      <div style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
        {!conv.length && (
          <div className="empty-premium" style={{ marginTop:50 }}>
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
                <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--primary-dim)', border:'1px solid var(--primary-glow)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginBottom:2 }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--primary-light)" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
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

      <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', display:'flex', gap:8, background:'var(--bg-700)', paddingBottom:'max(10px,env(safe-area-inset-bottom,0px))', flexShrink:0 }}>
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
    <div className="emp-tab active">
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
    (db.records || []).filter(r => r.empId === u.id && r.inicio.startsWith(dateStr) && r.fin)

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
    </div>
  )
}

// ─── TAB PERFIL ────────────────────────────────────────────────────────────────
function TabPerfil({ u, session, db, saveDB, toast, doLogout, openModal }) {
  const initials = u.initials || u.name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  const vac = vacData(u.id, db)
  const now = new Date()
  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
  const monthMin = (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio.startsWith(mk)).reduce((s, r) => s + calcMin(r), 0)
  const pendingDocs = (db.documentos || []).filter(d => d.empId === u.id && !d.firma).length

  // Personal stats
  const myRecs = useMemo(() => (db.records || []).filter(r => r.empId === u.id && r.fin), [db.records, u.id])
  const yearStr = `${now.getFullYear()}-`
  const yearRecs = myRecs.filter(r => r.inicio.startsWith(yearStr))
  const yearMin = yearRecs.reduce((s, r) => s + calcMin(r), 0)
  const yearDays = new Set(yearRecs.map(r => r.inicio.slice(0, 10))).size
  const dayMap = {}
  myRecs.forEach(r => { const d = r.inicio.slice(0,10); dayMap[d] = (dayMap[d]||0) + calcMin(r) })
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

  return (
    <div className="emp-tab active" style={{ background:'var(--bg-800)' }}>
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

  const monthMin = fin.filter(r => r.inicio.startsWith(mk)).reduce((s, r) => s + calcMin(r), 0)
  const extraMonth = Math.max(0, monthMin - WD * 20)
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
    if (extraMonth === 0) return `⚡ Este mes no tienes horas extra acumuladas. Llevas **${mhm(monthMin)}** sobre las ${mhm(WD * 20)} de referencia mensual.`
    return `⚡ Tienes **${mhm(extraMonth)}** de horas extra este mes (${mhm(monthMin)} trabajados sobre ${mhm(WD * 20)} de referencia).`
  }

  // ¿Quién olvidó fichar? (visión de equipo si eres admin/encargado)
  if (ql.includes('olvid') || ql.includes('quién') || ql.includes('quien') || ql.includes('sin fichar')) {
    const todayStr = today()
    const emps = (db.employees || []).filter(e => !e.baja)
    const ficharon = new Set((db.records || []).filter(r => r.inicio.startsWith(todayStr)).map(r => r.empId))
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
    if (last.length) return `📋 Tus últimos registros:\n${last.map(r => `• ${r.inicio.slice(0, 10)}: ${mhm(calcMin(r))}`).join('\n')}`
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

function ModalConfiguracion({ visible, u, onClose, toast }) {
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
    let min = (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio.startsWith(ds))
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
  const current = document.documentElement.getAttribute('data-theme')
  const next = current === 'light' ? 'dark' : 'light'
  if (next === 'dark') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', 'light')
  try { localStorage.setItem('theme', next) } catch {}
  document.querySelectorAll('.theme-toggle-btn').forEach(b => { b.textContent = next === 'light' ? '🌙' : '☀️' })
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

// ─── ONBOARDING (primer login empleado) ────────────────────────────────────────
function OnboardingModal({ visible, u, db, saveDB, toast }) {
  const { canvasRef, handlers, clearCanvas, initCanvas, getSignatureData } = useSignatureCanvas()
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [notifGranted, setNotifGranted] = useState(() => typeof Notification !== 'undefined' && Notification.permission === 'granted')
  const [reminderTime, setReminderTime] = useState('08:00')

  useEffect(() => { if (step === 1) initCanvas() }, [step])

  if (!visible || done) return null

  const requestNotif = async () => {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setNotifGranted(perm === 'granted')
  }

  const finish = () => {
    const signatureData = getSignatureData()
    const firma = signatureData ? { data: signatureData, ts: new Date().toISOString() } : null
    const updatedEmps = (db.employees || []).map(e => e.id === u.id ? { ...e, onboardingDone: true, reminderTime } : e)
    const updatedFirmas = firma ? { ...(db.firmas || {}), [u.id]: { main: firma } } : (db.firmas || {})
    saveDB({ employees: updatedEmps, firmas: updatedFirmas })
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
          {!conv.length && (
            <div style={{ textAlign:'center', color:'var(--text3)', fontSize:13, marginTop:60 }}>
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
        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:8, paddingBottom:`max(16px,env(safe-area-inset-bottom,0px))` }}>
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
    toast('Solicitud enviada al administrador', 3000, 'ok')
    setSending(false)
    onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:130, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width:'100%', maxWidth:480, background:'var(--bg-700)', borderRadius:'20px 20px 0 0', padding:`24px 20px max(28px,env(safe-area-inset-bottom,0px))`, border:'1px solid var(--border2)', animation:'slideUp .22s ease' }}>
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
