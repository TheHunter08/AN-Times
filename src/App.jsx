import { useEffect } from 'react'
import { useAppStore } from './store/appStore.js'
import { useViewport } from './hooks/useViewport.js'
import { ToastContainer } from './components/Toast.jsx'
import LoginPage from './pages/LoginPage.jsx'
import EmployeePage from './pages/EmployeePage.jsx'
import AdminPage from './pages/AdminPage.jsx'

export default function App() {
  const currentScreen = useAppStore(s => s.currentScreen)
  const fetchDB = useAppStore(s => s.fetchDB)
  useViewport()

  useEffect(() => {
    fetchDB()
    // Poll every 5 min (was 60s — reducido 5x para no agotar cuota Firebase)
    const iv = setInterval(fetchDB, 5 * 60 * 1000)
    // Parar cuando la app va a segundo plano, reanudar al volver
    const onVisible = () => { if (document.visibilityState === 'visible') fetchDB() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVisible) }
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
