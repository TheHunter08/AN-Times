import { useEffect, lazy, Suspense } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useAppStore } from './store/appStore.js'
import { initStorage, flushOfflineQueue } from './services/dataService.js'
import { ToastContainer } from './components/Toast.jsx'
import LoginPage from './pages/LoginPage.jsx'

function UpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Chequea actualizaciones cada 5 min mientras la app está abierta
      setInterval(() => r && !r.installing && r.update(), 5 * 60 * 1000)
    }
  })
  if (!needRefresh) return null
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:99999, padding:'10px 16px', background:'linear-gradient(90deg,#6C63FF,#5E6AD2)', color:'#fff', display:'flex', alignItems:'center', gap:12, fontSize:13, fontWeight:600, boxShadow:'0 4px 20px rgba(108,99,255,.4)', backdropFilter:'blur(8px)' }}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      <span style={{ flex:1 }}>Nueva versión disponible</span>
      <button onClick={() => updateServiceWorker(true)} style={{ background:'rgba(255,255,255,.2)', border:'1px solid rgba(255,255,255,.3)', borderRadius:20, padding:'5px 14px', color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit', WebkitTapHighlightColor:'transparent' }}>
        Actualizar ahora
      </button>
    </div>
  )
}

const EmployeePage = lazy(() => import('./pages/EmployeePage.jsx'))
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'))

function applyDeepLink(url) {
  try {
    const u = new URL(url, window.location.origin)
    const go = u.searchParams.get('go')
    if (!go) return
    const [screen, target] = go.split(':')
    const { setScreen, setAdminPage, setEmpTab, openModal } = useAppStore.getState()
    if (screen === 'admin') {
      setScreen('admin', true)
      if (target) setAdminPage(target)
    } else if (screen === 'emp') {
      setScreen('emp', true)
      if (target === 'documentos') { setEmpTab('perfil'); openModal('documentos') }
      else if (target) setEmpTab(target)
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
  const fetchDB      = useAppStore(s => s.fetchDB)
  const hydrateIDB   = useAppStore(s => s.hydrateIDB)
  const toast        = useAppStore(s => s.toast)

  // Inicialización: migrar localStorage→IDB, hidratar store, primer fetch
  useEffect(() => {
    const init = async () => {
      await initStorage()   // migra localStorage→IDB si es la primera vez
      await hydrateIDB()    // carga datos completos desde IDB
      await fetchDB()       // sincroniza con Firebase
    }
    init()
    const iv = setInterval(fetchDB, 25000)
    return () => clearInterval(iv)
  }, [])

  // Cuando vuelve la conexión, vaciar la cola offline de IDB
  useEffect(() => {
    const onOnline = () => {
      flushOfflineQueue(
        () => toast('✅ Datos sincronizados con el servidor'),
        () => {}
      )
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  // Auto-logout tras 30 min de inactividad
  useEffect(() => {
    const TIMEOUT = 30 * 60 * 1000
    let timer = null
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const { currentScreen: sc, logout } = useAppStore.getState()
        if (sc !== 'login') logout()
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
