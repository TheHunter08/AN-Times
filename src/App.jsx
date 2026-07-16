import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react'
import { useAppStore } from './store/appStore.js'
import { ToastContainer } from './components/Toast.jsx'
import PrivacyModal from './components/PrivacyModal.jsx'
import { useSwipeDismiss } from './hooks/useSwipeDismiss.js'
import { parseNavigationTarget, resolveEmployeeNotificationDestination } from './utils/notificationNavigation.js'
import { flushPushQueue, broadcastSync, uploadPendingIfAny, sendHeartbeat, _updateLastSync } from './services/dataService.js'
import { getAuthSession, onAuthStateChange } from './services/authService.js'
// v2 UI — nuevas pantallas con datos reales
import LoginV2 from './ui-v2/LoginV2.tsx'
const AppV2Admin = lazy(() => import('./ui-v2/AppV2Admin.tsx'))

// ── In-app push notification banner (mostrado cuando la app está en primer plano) ─
function InAppNotification() {
  const [notif, setNotif] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type !== 'PUSH_RECEIVED') return
      // Solo mostrar banner in-app si la app está realmente en foreground
      if (document.visibilityState !== 'visible') return
      setNotif({ title: e.data.title, body: e.data.body, url: e.data.url, tag: e.data.tag })
      // Pedir al SW que cierre la notificación OS para no duplicar (solo si app visible)
      try { navigator.serviceWorker?.controller?.postMessage({ type: 'PUSH_DISMISS', tag: e.data.tag }) } catch {}
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setNotif(null), 5000)
    }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => { navigator.serviceWorker?.removeEventListener('message', onMsg); clearTimeout(timerRef.current) }
  }, [])

  if (!notif) return null
  return (
    <div
      onClick={() => { if (notif.url && notif.url !== '/') window.dispatchEvent(new CustomEvent('push-deeplink', { detail: notif.url })); setNotif(null) }}
      style={{
        position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:99998,
        minWidth:280, maxWidth:'calc(100vw - 32px)',
        background:'var(--bg-600)', border:'1px solid var(--border2)',
        borderRadius:14, boxShadow:'0 8px 32px rgba(0,0,0,.45)',
        display:'flex', alignItems:'center', gap:12, padding:'12px 14px',
        cursor: notif.url && notif.url !== '/' ? 'pointer' : 'default',
        animation:'slideDown .3s cubic-bezier(.16,1,.3,1)'
      }}>
      <div style={{ width:36, height:36, borderRadius:10, background:'var(--primary-dim)', border:'1px solid var(--primary-glow)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--primary-light)" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{notif.title}</div>
        {notif.body && <div style={{ fontSize:12, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{notif.body}</div>}
      </div>
      <button onClick={e => { e.stopPropagation(); setNotif(null) }}
        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text4)', fontSize:16, lineHeight:1, padding:2, flexShrink:0 }}>✕</button>
    </div>
  )
}

// Actualización silenciosa y segura de la PWA. Si hay cambios locales pendientes,
// los sincroniza antes de activar el nuevo service worker; sin conexión, pospone
// la recarga y reintenta automáticamente al volver a estar online.
function UpdateBanner() {
  const [waitingSW, setWaitingSW] = useState(null)
  const [phase, setPhase] = useState('waiting')
  const reloading   = useRef(false)
  const waitingRef  = useRef(null)
  const applyingRef = useRef(false)
  const attemptRef  = useRef(false)

  const _setSW = (sw) => {
    if (!sw || waitingRef.current === sw) return
    waitingRef.current = sw
    setWaitingSW(sw)
    setPhase('waiting')
  }

  const applySafely = useCallback(async () => {
    const sw = waitingRef.current
    if (!sw || applyingRef.current || attemptRef.current || reloading.current) return
    attemptRef.current = true
    try {
      const initialState = useAppStore.getState()
      // No interrumpir una escritura que todavía está llegando a Supabase.
      if (!initialState.offlinePending && initialState.syncStatus === 'syncing') {
        setPhase('syncing')
        return
      }
      if (initialState.offlinePending) {
        setPhase('syncing')
        try { await uploadPendingIfAny() } catch {}
        if (useAppStore.getState().offlinePending) { setPhase('waiting'); return }
      }

      applyingRef.current = true
      setPhase('applying')
      sw.postMessage({ type: 'SKIP_WAITING' })

      // iOS puede activar el worker sin emitir controllerchange en una PWA abierta.
      setTimeout(() => {
        if (!reloading.current) { reloading.current = true; window.location.reload() }
      }, 1800)
      setTimeout(() => {
        if (!reloading.current) {
          applyingRef.current = false
          setPhase('waiting')
        }
      }, 8000)
    } finally {
      attemptRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let updateInterval = null
    let registration = null
    const onControllerChange = () => {
      if (reloading.current) return
      reloading.current = true
      window.location.reload()
    }
    const checkNow = () => {
      if (document.visibilityState !== 'visible') return
      if (registration) registration.update().catch(() => {})
      if (registration?.waiting) _setSW(registration.waiting)
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    navigator.serviceWorker.ready.then(reg => {
      registration = reg
      // 1. SW ya esperando al montar (recarga tras deploy sin clic del usuario)
      if (reg.waiting) _setSW(reg.waiting)

      const check = (sw) => {
        if (!sw) return
        // Comprobar estado ya alcanzado ANTES de añadir el listener (race condition)
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          _setSW(sw); return
        }
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) _setSW(sw)
        })
      }

      if (reg.installing) check(reg.installing)
      reg.addEventListener('updatefound', () => {
        // reg.installing puede cambiar entre updatefound y el listener → usar ref
        const sw = reg.installing
        check(sw)
      })

      // Comprobación inmediata, periódica y al volver a abrir/recuperar conexión.
      checkNow()
      updateInterval = setInterval(checkNow, 60 * 1000)
    }).catch(() => {})
    window.addEventListener('online', checkNow)
    document.addEventListener('visibilitychange', checkNow)
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      window.removeEventListener('online', checkNow)
      document.removeEventListener('visibilitychange', checkNow)
      if (updateInterval) clearInterval(updateInterval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!waitingSW) return
    const initial = setTimeout(applySafely, 500)
    const retry = setInterval(applySafely, 10 * 1000)
    const onOnline = () => applySafely()
    window.addEventListener('online', onOnline)
    return () => {
      clearTimeout(initial)
      clearInterval(retry)
      window.removeEventListener('online', onOnline)
    }
  }, [waitingSW, applySafely])

  // Mientras espera conexión o sincronización, la app sigue operativa. Solo se
  // cubre la pantalla durante los pocos segundos de activación/recarga.
  if (!waitingSW || phase !== 'applying') return null
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:999999,
      background:'rgba(8,8,18,.92)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:20
    }}>
      <div style={{
        width:'100%', maxWidth:360, textAlign:'center',
        background:'var(--bg-700)', border:'1px solid var(--border2)', borderRadius:18,
        padding:'30px 24px', boxShadow:'0 20px 60px rgba(0,0,0,.5)'
      }}>
        <div style={{
          width:56, height:56, margin:'0 auto 16px', borderRadius:16,
          background:'linear-gradient(135deg,#6C63FF,#5E6AD2)',
          display:'flex', alignItems:'center', justifyContent:'center'
        }}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </div>
        <div style={{ fontSize:17, fontWeight:800, color:'var(--text)', marginBottom:8 }}>Actualizando automáticamente</div>
        <div style={{ fontSize:13, color:'var(--text3)', lineHeight:1.6, marginBottom:22 }}>
          Instalando la última versión de TIMES INC. La app se abrirá de nuevo en unos segundos.
        </div>
        <div role="status" aria-live="polite" style={{ fontSize:13, fontWeight:800, color:'var(--primary-light)' }}>Actualizando…</div>
      </div>
    </div>
  )
}

function SyncBanner() {
  const syncStatus     = useAppStore(s => s.syncStatus)
  const syncError      = useAppStore(s => s.syncError)
  const offlinePending = useAppStore(s => s.offlinePending)
  const lastSyncTime   = useAppStore(s => s.lastSyncTime)
  const fetchDB        = useAppStore(s => s.fetchDB)
  const currentScreen  = useAppStore(s => s.currentScreen)
  const [retrying, setRetrying] = useState(false)

  const handleRetry = useCallback(async () => {
    setRetrying(true)
    try {
      const result = offlinePending ? await uploadPendingIfAny() : { ok: true, pending: false }
      if (result?.ok && !result.pending) await fetchDB()
    } finally { setRetrying(false) }
  }, [fetchDB, offlinePending])

  // En pantalla de empleado, OfflineBanner ya muestra "Modo sin cobertura" con datos
  // pendientes — suprimir SyncBanner para evitar dos banners simultáneos.
  // En admin no hay OfflineBanner, así que SyncBanner sigue mostrándose allí.
  if (syncStatus !== 'error' || currentScreen === 'login') return null
  if (offlinePending && currentScreen === 'emp') return null
  if (syncError === 'no_config') return null

  const sinceText = lastSyncTime
    ? (() => {
        const mins = Math.floor((Date.now() - lastSyncTime) / 60000)
        return mins < 1 ? 'hace un momento' : `hace ${mins} min`
      })()
    : null

  return (
    <div className="sync-banner" role="alert">
      <span className="sync-banner-icon">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 6.58A11 11 0 0 0 3.8 8m3.6-4.43A11 11 0 0 1 12 3c5.5 0 10 3.86 10 8.64 0 1.26-.28 2.46-.78 3.54M2 2l20 20M8.85 15.1A3 3 0 0 0 12 18a3 3 0 0 0 2.96-2.54"/>
        </svg>
      </span>
      <span className="sync-banner-text">
        Problema de sincronización{sinceText ? ` · ${sinceText}` : ''}
      </span>
      <button className="sync-banner-btn" onClick={handleRetry} disabled={retrying}>
        {retrying
          ? <span className="sync-banner-spin" />
          : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        }
        {retrying ? 'Reintentando…' : 'Reintentar'}
      </button>
    </div>
  )
}


const EmployeePage = lazy(() => import('./pages/EmployeePage.jsx'))

const EMP_TABS = ['inicio', 'jornada', 'vacaciones', 'calendario', 'turnos', 'perfil']

function applyDeepLink(url) {
  try {
    const parsed = parseNavigationTarget(url)
    if (!parsed) return
    const { setScreen, setAdminPage, setEmpTab, openModal } = useAppStore.getState()
    if (parsed.role === 'admin') {
      setScreen('admin', true)
      if (parsed.target) setAdminPage(parsed.target)
      if (parsed.subtab) window.dispatchEvent(new CustomEvent('admin-panel-subtab', { detail: { panel: parsed.target, tab: parsed.subtab } }))
    } else if (parsed.role === 'emp' || EMP_TABS.includes(parsed.target)) {
      const destination = resolveEmployeeNotificationDestination({ url })
      setScreen('emp', true)
      setEmpTab(destination.tab)
      if (destination.modal) openModal(destination.modal)
    }
    window.history.replaceState({}, '', window.location.pathname)
  } catch {}
}

function ScreenLoader() {
  return (
    <div style={{ position:'fixed', inset:0, background:'var(--bg-800)' }} />
  )
}

function GlobalConfirm() {
  const confirmDialog = useAppStore(s => s.confirmDialog)
  const closeConfirm  = useAppStore(s => s.closeConfirm)
  const { dragHandlers, modalStyle } = useSwipeDismiss(() => confirmDialog && closeConfirm())
  if (!confirmDialog) return null
  return (
    <div onClick={closeConfirm} style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center', background:'rgba(0,0,0,.45)', backdropFilter:'blur(4px)', WebkitBackdropFilter:'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width:'100%', maxWidth:480, padding:'24px 20px 32px',
          background:'var(--bg-700)', borderRadius:'20px 20px 0 0',
          border:'1px solid var(--border2)', boxShadow:'0 -8px 40px rgba(0,0,0,.5)',
          animation:'slideUp .2s cubic-bezier(.16,1,.3,1)', ...modalStyle }}>
        <div className="modal-drag" {...dragHandlers} style={{ width:36, height:4 }} />
        <div style={{ fontSize:15, fontWeight:600, color:'var(--text)', marginBottom:24, textAlign:'center', lineHeight:1.5 }}>
          {confirmDialog.msg}
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" style={{ flex:1, padding:'13px' }} onClick={() => { try { navigator.vibrate?.(8) } catch {}; closeConfirm() }}>Cancelar</button>
          <button className="btn btn-danger"    style={{ flex:1, padding:'13px' }} onClick={() => { try { navigator.vibrate?.([15,40,15]) } catch {}; confirmDialog.onConfirm(); closeConfirm() }}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}

function LoadingBar() { return null }

export default function App() {
  const currentScreen  = useAppStore(s => s.currentScreen)
  const session        = useAppStore(s => s.session)
  const logout         = useAppStore(s => s.logout)
  const fetchDB        = useAppStore(s => s.fetchDB)
  const initRealtime       = useAppStore(s => s.initRealtime)
  const stopRealtime       = useAppStore(s => s.stopRealtime)
  const initTableRealtime  = useAppStore(s => s.initTableRealtime)
  const stopTableRealtime  = useAppStore(s => s.stopTableRealtime)
  const initPresence       = useAppStore(s => s.initPresence)
  const toast          = useAppStore(s => s.toast)

  // Las sesiones iniciadas mediante Supabase deben seguir respaldadas por una
  // sesión Auth válida. El PIN y la biometría mantienen su funcionamiento
  // offline y no pasan por este guard.
  useEffect(() => {
    if (!['email', 'oauth'].includes(session?.authMethod)) return
    let active = true
    getAuthSession().then(authSession => {
      if (active && !authSession && navigator.onLine) logout()
    }).catch(() => {})
    const { data: { subscription } } = onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT' || !active) return
      setTimeout(() => {
        const current = useAppStore.getState().session
        if (['email', 'oauth'].includes(current?.authMethod)) useAppStore.getState().logout()
      }, 0)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [session?.authMethod, logout])

  // Aviso cuando el servidor reconcilia datos de otro usuario con los nuestros
  useEffect(() => {
    const handler = (e) => {
      const count = e.detail?.count || 1
      toast(`Datos actualizados por otro usuario (${count} fichaje${count > 1 ? 's' : ''})`, 4500, 'warn')
    }
    window.addEventListener('times-conflict', handler)
    return () => window.removeEventListener('times-conflict', handler)
  }, [toast])

  useEffect(() => {
    fetchDB()
    initRealtime()
    initTableRealtime()
    initPresence()
    // Al arrancar: pedir al SW que suba cualquier dato IDB pendiente de sesiones anteriores
    // (iOS/Android puede matar la app mientras hay datos offline sin sincronizar).
    // Usamos serviceWorker.ready en vez de controller?.postMessage porque controller
    // puede ser null en el instante del arranque (el SW aún no ha reclamado la página
    // con clients.claim()) — el mensaje se perdería en silencio.
    // No se comprueba navigator.onLine antes de estas dos llamadas: en iOS es
    // poco fiable (puede quedarse en `false` con red real disponible) y
    // saltárselas dejaba datos pendientes de sesiones anteriores sin ni
    // siquiera intentar subirse al arrancar. Ambas comprueban IDB primero y
    // salen gratis si no hay nada pendiente.
    navigator.serviceWorker?.ready.then(reg => {
      reg.active?.postMessage({ type: 'FORCE_SYNC' })
    }).catch(() => {})
    // Hilo principal: por si el proceso fue matado offline en iOS (sin Background Sync API).
    // uploadPendingIfAny() comprueba IDB — sale inmediato si está vacío, sube si hay datos.
    uploadPendingIfAny()

    // onResume: refresca datos y WebSocket cuando la PWA vuelve al primer plano.
    // Se dispara desde tres fuentes porque cada plataforma usa un evento diferente:
    //   - visibilitychange: Chrome/Firefox/Android WebView
    //   - pageshow:         iOS PWA standalone (visibilitychange no siempre dispara)
    //   - focus:            Android PWA cuando otra app volvía al frente
    // Throttle 2s para que los tres no lancen tres fetchDB() simultáneos.
    let _resumeTs = 0
    const onResume = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - _resumeTs < 2000) return
      _resumeTs = now
      fetchDB()
      initRealtime()
      initTableRealtime()
      // Intentar siempre (no solo si onLine): en iOS visibilitychange puede
      // llegar antes de que navigator.onLine se actualice. El retry a 1.5s
      // cubre ese caso (cuando la red ya existe pero onLine aún es false).
      uploadPendingIfAny()
      setTimeout(() => uploadPendingIfAny(), 1500)
      // Usar serviceWorker.ready en vez de controller: en iOS el SW puede
      // haber sido matado, controller es null y el mensaje se pierde en silencio.
      navigator.serviceWorker?.ready.then(reg => {
        reg.active?.postMessage({ type: 'FORCE_SYNC' })
        reg.update().catch(() => {})
      }).catch(() => {})
      if (navigator.onLine) sendHeartbeat()
    }
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('pageshow', onResume)
    window.addEventListener('focus', onResume)

    return () => {
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('pageshow', onResume)
      window.removeEventListener('focus', onResume)
      stopRealtime()
      stopTableRealtime()
    }
  }, [])

  // Háptica global: cualquier tap en botón vibra brevemente (throttled a 60ms)
  useEffect(() => {
    if (!('vibrate' in navigator)) return
    let last = 0
    const onTap = (e) => {
      const t = e.target?.closest?.('button, [role="button"], a.btn, .pressable')
      if (!t || t.disabled) return
      const now = Date.now()
      if (now - last < 60) return
      last = now
      try { navigator.vibrate(6) } catch {}
    }
    document.addEventListener('pointerdown', onTap, { passive: true })
    return () => document.removeEventListener('pointerdown', onTap)
  }, [])


  // Auto-logout tras 30 min de inactividad
  useEffect(() => {
    const TIMEOUT = 30 * 60 * 1000
    let timer = null
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const { currentScreen: sc, logout, db, session } = useAppStore.getState()
        if (sc === 'login') return
        // No cerrar sesión si hay una jornada activa en curso
        const userId = session?.user?.id
        const hasActiveRecord = userId && (db?.records || []).some(r => r.empId === userId && !r.fin)
        if (!hasActiveRecord) logout()
      }, TIMEOUT)
    }
    const events = ['mousemove', 'touchstart', 'keydown', 'click', 'scroll']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)) }
  }, [])

  useEffect(() => {
    try {
      const u = new URL(window.location.href)
      const qrEmpId = u.searchParams.get('emp')
      if (qrEmpId) {
        localStorage.setItem('an_qr_emp', qrEmpId)
        u.searchParams.delete('emp')
        window.history.replaceState({}, '', u.pathname + (u.search !== '?' ? u.search : ''))
      }
    } catch {}
  }, [])

  useEffect(() => {
    applyDeepLink(window.location.href)
    const onMsg = (event) => {
      if (event.data?.type === 'PUSH_CLICK') applyDeepLink(event.data.url)
      if (event.data?.type === 'BG_SYNC_DONE') {
        useAppStore.setState({ offlinePending: false, syncStatus: 'syncing' })
        fetchDB().then(() => broadcastSync(useAppStore.getState().db._ts))
        _updateLastSync()
      }
      if (event.data?.type === 'BG_SYNC_FAILED') {
        useAppStore.setState({ syncStatus: 'error', syncError: 'bg_sync' })
        // El SW falló — reintento desde hilo principal (cubre iOS sin Background Sync API)
        setTimeout(() => uploadPendingIfAny(), 5000)
      }
    }
    const onDeepLink = (event) => applyDeepLink(event.detail)
    const onSynced = () => {
      fetchDB()
      useAppStore.setState({ syncStatus: 'synced', offlinePending: false })
    }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    window.addEventListener('push-deeplink', onDeepLink)
    window.addEventListener('times-synced', onSynced)
    // El evento se dispara cuando cloudPush agota sus reintentos — pero eso
    // solo significa que aún no llegó al servidor. El dato YA está guardado
    // en el dispositivo (saveLocal, síncrono, antes de intentar la red) y
    // queda en cola para sincronizar solo en cuanto mejore la señal
    // (_storeForBgSync + Background Sync del service worker). El aviso
    // anterior ("No se pudo guardar…") era falso y alarmaba a los
    // empleados con poca cobertura haciéndoles creer que su fichaje se
    // había perdido cuando en realidad estaba a salvo.
    const onSaveFailed = () => useAppStore.getState().toast('Poca cobertura: tus datos están guardados en el dispositivo y se sincronizarán solos en cuanto mejore la señal.', 6000, 'warn')
    window.addEventListener('times-save-failed', onSaveFailed)
    // Cuando vuelva internet: sincronizar inmediatamente
    const onOnline = () => {
      useAppStore.setState(s => s.offlinePending ? { syncStatus: 'syncing' } : {})
      // Hilo principal: sube IDB pendiente directamente (clave para iOS sin BgSync API)
      uploadPendingIfAny()
      // SW: también intenta desde el service worker (Android, Chrome)
      flushPushQueue()
      navigator.serviceWorker?.controller?.postMessage({ type: 'FORCE_SYNC' })
      // Reiniciar Realtime: Android cierra el WS al perder señal
      initRealtime()
      initTableRealtime()
      sendHeartbeat()
      // Delay: esperar a que los cambios offline suban antes de bajar del servidor
      setTimeout(() => {
        if (!useAppStore.getState().offlinePending) fetchDB()
      }, 3000)
    }
    window.addEventListener('online', onOnline)
    flushPushQueue()
    // Sondeo de seguridad: los cron jobs del servidor (recordatorios, auto-cierre...)
    // escriben directo en Supabase sin pasar por el broadcast de realtime, así que
    // sus cambios no llegan al instante a las pestañas abiertas. fetchDB() ya
    // comprueba el timestamp antes de traer nada (unos bytes si no hay cambios),
    // así que este intervalo no pesa — solo evita quedarse desactualizado mucho
    // rato esperando a que otro empleado haga algo que sí dispare el broadcast.
    // No se comprueba navigator.onLine: en iOS es poco fiable (puede quedarse
    // pegado en `false` con red real disponible), y fetchDB()/uploadPendingIfAny()
    // ya son baratos y fallan rápido si de verdad no hay red.
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && !useAppStore.getState().offlinePending) fetchDB()
    }, 5 * 60 * 1000)
    // Con cobertura débil (o en iOS, donde navigator.onLine es especialmente
    // poco fiable — puede quedarse pegado en `false` o en `true` sin reflejar
    // la realidad), el evento 'online' del navegador puede no llegar a
    // dispararse nunca, así que offlinePending se quedaba atascado en true
    // indefinidamente hasta que el usuario cerraba y reabría la app varias
    // veces (cada apertura sí fuerza un intento, vía onResume, sin comprobar
    // onLine). Intervalo dedicado y bastante más corto que el sondeo general
    // de arriba para que el reintento automático sea, en la práctica, tan
    // rápido como reabrir la app a mano — y sin el gate de onLine, para que
    // funcione igual en iOS que en cualquier otra plataforma.
    const pendingRetryInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && useAppStore.getState().offlinePending) uploadPendingIfAny()
    }, 8 * 1000)
    // Heartbeat para iOS background sync: actualiza push_subs.last_online cada 3 min
    // mientras el empleado tiene la app abierta y hay red. El cron /api/sync-ping
    // usa este timestamp para detectar dispositivos activos que podrían tener datos
    // offline pendientes y les envía un push para despertar el Service Worker.
    sendHeartbeat()
    const heartbeatInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) sendHeartbeat()
    }, 3 * 60 * 1000)
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMsg)
      window.removeEventListener('push-deeplink', onDeepLink)
      window.removeEventListener('times-synced', onSynced)
      window.removeEventListener('times-save-failed', onSaveFailed)
      window.removeEventListener('online', onOnline)
      clearInterval(pollInterval)
      clearInterval(pendingRetryInterval)
      clearInterval(heartbeatInterval)
    }
  }, [])

  useEffect(() => {
    const applyTheme = (prefersDark) => {
      try {
        const saved = localStorage.getItem('theme')
        if (saved === 'light') {
          document.documentElement.setAttribute('data-theme', 'light')
        } else if (saved === 'dark') {
          document.documentElement.removeAttribute('data-theme')
        } else {
          if (prefersDark) document.documentElement.removeAttribute('data-theme')
          else document.documentElement.setAttribute('data-theme', 'light')
        }
      } catch {}
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    applyTheme(mq.matches)
    const onChange = (e) => { try { if (!localStorage.getItem('theme')) applyTheme(e.matches) } catch { applyTheme(e.matches) } }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Sincronizar theme-color meta con el tema activo (dark/light toggle en app)
  useEffect(() => {
    const updateThemeColor = () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light'
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.content = isLight ? '#ffffff' : '#0d0d18'
    }
    const observer = new MutationObserver(updateThemeColor)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    updateThemeColor()
    return () => observer.disconnect()
  }, [])

  // Registrar Periodic Background Sync (Chrome/Android — sincroniza datos aunque la app esté cerrada)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready.then(reg => {
      if (!('periodicSync' in reg)) return
      navigator.permissions.query({ name: 'periodic-background-sync' }).then(perm => {
        if (perm.state === 'granted') {
          reg.periodicSync.register('periodic-sync-data', { minInterval: 60 * 60 * 1000 }).catch(() => {})
        }
      }).catch(() => {})
    }).catch(() => {})
  }, [])

  return (
    <>
      <LoadingBar />
      <UpdateBanner />
      <SyncBanner />
      <InAppNotification />
      {currentScreen === 'login' && <LoginV2 />}
      <Suspense fallback={<ScreenLoader />}>
        {currentScreen === 'emp'   && <EmployeePage />}
        {currentScreen === 'admin' && <AppV2Admin />}
      </Suspense>
      <ToastContainer />
      <GlobalConfirm />
      <PrivacyModal />
    </>
  )
}
