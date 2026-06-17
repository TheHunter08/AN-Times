import { useEffect, lazy, Suspense } from 'react'
import { useAppStore } from './store/appStore.js'
import { ToastContainer } from './components/Toast.jsx'
import LoginPage from './pages/LoginPage.jsx'

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

export default function App() {
  const currentScreen = useAppStore(s => s.currentScreen)
  const fetchDB = useAppStore(s => s.fetchDB)

  useEffect(() => {
    fetchDB()
    const iv = setInterval(fetchDB, 60000)
    return () => clearInterval(iv)
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
      {currentScreen === 'login' && <LoginPage />}
      <Suspense fallback={<ScreenLoader />}>
        {currentScreen === 'emp' && <EmployeePage />}
        {currentScreen === 'admin' && <AdminPage />}
      </Suspense>
      <ToastContainer />
    </>
  )
}
