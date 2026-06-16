import { useEffect } from 'react'
import { useAppStore } from './store/appStore.js'
import { useViewport } from './hooks/useViewport.js'
import { ToastContainer } from './components/Toast.jsx'
import LoginPage from './pages/LoginPage.jsx'
import EmployeePage from './pages/EmployeePage.jsx'
import AdminPage from './pages/AdminPage.jsx'

// Deep-link de notificaciones push: "/?go=admin:documentos" o "/?go=emp:vacaciones"
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

export default function App() {
  const currentScreen = useAppStore(s => s.currentScreen)
  const fetchDB = useAppStore(s => s.fetchDB)
  useViewport()

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
      const t = localStorage.getItem('theme')
      if (t === 'light') document.documentElement.setAttribute('data-theme', 'light')
    } catch {}
  }, [])

  return (
    <>
      {currentScreen === 'login' && <LoginPage />}
      {currentScreen === 'emp'   && <EmployeePage />}
      {currentScreen === 'admin' && <AdminPage />}
      <ToastContainer />
    </>
  )
}
