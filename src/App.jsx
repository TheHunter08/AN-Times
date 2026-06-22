import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react'
import { useAppStore } from './store/appStore.js'
import { ToastContainer } from './components/Toast.jsx'
import LoginPage from './pages/LoginPage.jsx'
import { isNativePlatform, onPushReceived, onPushTapped } from './services/nativeNotifications.js'

// ── In-app push notification banner (mostrado cuando la app está en primer plano) ─
function InAppNotification() {
  const [notif, setNotif] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type !== 'PUSH_RECEIVED') return
      setNotif({ title: e.data.title, body: e.data.body, url: e.data.url })
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

function UpdateBanner() {
  const [show, setShow] = useState(false)
  const reloading = useRef(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let updateInterval = null
    // Auto-reload when the SW controller changes (new version took over via skipWaiting)
    const onControllerChange = () => {
      if (reloading.current) return
      reloading.current = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    // Show banner when a new SW is found installing (before it activates)
    navigator.serviceWorker.ready.then(reg => {
      const check = (sw) => {
        if (!sw) return
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed') setShow(true)
        })
      }
      if (reg.installing) check(reg.installing)
      reg.addEventListener('updatefound', () => check(reg.installing))
      // Poll for updates every 5 min while app stays open
      updateInterval = setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000)
    }).catch(() => {})
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      if (updateInterval) clearInterval(updateInterval)
    }
  }, [])

  if (!show) return null
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:99999, padding:'10px 16px', background:'linear-gradient(90deg,#6C63FF,#5E6AD2)', color:'#fff', display:'flex', alignItems:'center', gap:12, fontSize:13, fontWeight:600, boxShadow:'0 4px 20px rgba(108,99,255,.4)' }}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      <span style={{ flex:1 }}>Actualizando…</span>
    </div>
  )
}

function SyncBanner() {
  const syncStatus    = useAppStore(s => s.syncStatus)
  const syncError     = useAppStore(s => s.syncError)
  const lastSyncTime  = useAppStore(s => s.lastSyncTime)
  const fetchDB       = useAppStore(s => s.fetchDB)
  const currentScreen = useAppStore(s => s.currentScreen)
  const [retrying, setRetrying] = useState(false)

  const handleRetry = useCallback(async () => {
    setRetrying(true)
    await fetchDB()
    setRetrying(false)
  }, [fetchDB])

  if (syncStatus !== 'error' || currentScreen === 'login') return null
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
        Sin conexión{sinceText ? ` · ${sinceText}` : ''}
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
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'))

const EMP_TABS = ['inicio', 'jornada', 'vacaciones', 'calendario', 'mensajes', 'perfil']

function applyDeepLink(url) {
  try {
    const u = new URL(url, window.location.origin)
    const go  = u.searchParams.get('go')
    const tab = u.searchParams.get('tab')
    if (!go && !tab) return
    const { setScreen, setAdminPage, setEmpTab, openModal } = useAppStore.getState()
    if (go) {
      const [screen, target] = go.split(':')
      if (screen === 'admin') {
        setScreen('admin', true)
        if (target) setAdminPage(target)
      } else if (screen === 'emp') {
        setScreen('emp', true)
        if (target === 'documentos') { setEmpTab('perfil'); openModal('documentos') }
        else if (target) setEmpTab(target)
      }
    } else if (tab && EMP_TABS.includes(tab)) {
      setEmpTab(tab)
    }
    window.history.replaceState({}, '', window.location.pathname)
  } catch {}
}

function ScreenLoader() {
  return (
    <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-800)', flexDirection:'column', gap:20 }}>
      <div style={{ width:48, height:48, borderRadius:14, background:'linear-gradient(135deg,var(--primary-dim),rgba(0,212,255,.08))', border:'1px solid rgba(108,99,255,.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div className="login-spinner" style={{ width:22, height:22, borderWidth:2.5, borderColor:'rgba(108,99,255,.15)', borderTopColor:'var(--primary-light)' }} />
      </div>
      <div style={{ fontSize:13, color:'var(--text3)', fontWeight:600, letterSpacing:'.3px' }}>Cargando</div>
    </div>
  )
}

function GlobalConfirm() {
  const confirmDialog = useAppStore(s => s.confirmDialog)
  const closeConfirm  = useAppStore(s => s.closeConfirm)
  if (!confirmDialog) return null
  return (
    <div onClick={closeConfirm} style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center', background:'rgba(0,0,0,.45)', backdropFilter:'blur(4px)', WebkitBackdropFilter:'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width:'100%', maxWidth:480, padding:`24px 20px max(32px,env(safe-area-inset-bottom,0px))`,
          background:'var(--bg-700)', borderRadius:'20px 20px 0 0',
          border:'1px solid var(--border2)', boxShadow:'0 -8px 40px rgba(0,0,0,.5)',
          animation:'slideUp .2s cubic-bezier(.16,1,.3,1)' }}>
        <div style={{ width:36, height:4, borderRadius:2, background:'var(--border3)', margin:'0 auto 20px' }} />
        <div style={{ fontSize:15, fontWeight:600, color:'var(--text)', marginBottom:24, textAlign:'center', lineHeight:1.5 }}>
          {confirmDialog.msg}
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" style={{ flex:1, padding:'13px' }} onClick={closeConfirm}>Cancelar</button>
          <button className="btn btn-danger"    style={{ flex:1, padding:'13px' }} onClick={() => { confirmDialog.onConfirm(); closeConfirm() }}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const currentScreen = useAppStore(s => s.currentScreen)
  const fetchDB       = useAppStore(s => s.fetchDB)
  const initRealtime  = useAppStore(s => s.initRealtime)
  const stopRealtime  = useAppStore(s => s.stopRealtime)

  useEffect(() => {
    fetchDB()
    initRealtime()
    // El canal Realtime de Supabase gestiona actualizaciones en vivo.
    // El polling queda solo para cuando la pestaña vuelve a estar visible (app en segundo plano).
    const onVisible = () => { if (document.visibilityState === 'visible') fetchDB() }
    document.addEventListener('visibilitychange', onVisible)

    // Notificaciones nativas (Capacitor iOS/Android)
    let removePushReceived = () => {}
    let removePushTapped   = () => {}
    isNativePlatform().then(native => {
      if (!native) return
      onPushReceived(({ title, body }) => {
        useAppStore.getState().toast(`🔔 ${title}${body ? ': ' + body : ''}`)
      }).then(fn => { removePushReceived = fn })
      onPushTapped(({ url }) => {
        if (url) window.location.href = url
        fetchDB()
      }).then(fn => { removePushTapped = fn })
    })

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      stopRealtime()
      removePushReceived()
      removePushTapped()
    }
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
    applyDeepLink(window.location.href)
    const onMsg = (event) => {
      if (event.data?.type === 'PUSH_CLICK') applyDeepLink(event.data.url)
    }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('theme')
      if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light')
      } else if (!saved) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        if (!prefersDark) document.documentElement.setAttribute('data-theme', 'light')
      }
    } catch {}
  }, [])

  return (
    <>
      <UpdateBanner />
      <SyncBanner />
      <InAppNotification />
      {currentScreen === 'login' && <LoginPage />}
      <Suspense fallback={<ScreenLoader />}>
        {currentScreen === 'emp' && <EmployeePage />}
        {currentScreen === 'admin' && <AdminPage />}
      </Suspense>
      <ToastContainer />
      <GlobalConfirm />
    </>
  )
}
