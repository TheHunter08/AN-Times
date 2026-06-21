import { useEffect } from 'react'
import { useAppStore } from './store/appStore.js'
import { useViewport } from './hooks/useViewport.js'
import { ToastContainer } from './components/Toast.jsx'
import LoginPage from './pages/LoginPage.jsx'
import EmployeePage from './pages/EmployeePage.jsx'
import AdminPage from './pages/AdminPage.jsx'

export default function App() {
  const currentScreen = useAppStore(s => s.currentScreen)
  const fetchDB       = useAppStore(s => s.fetchDB)
  const initRealtime  = useAppStore(s => s.initRealtime)
  const stopRealtime  = useAppStore(s => s.stopRealtime)
  useViewport()

  useEffect(() => {
    // Carga inicial
    fetchDB()
    // Realtime: recibe cambios al instante sin polling
    initRealtime()
    // Fallback: sync cada 5 min si Realtime cae o no está configurado
    const iv = setInterval(fetchDB, 5 * 60 * 1000)
    // Sync al volver de segundo plano
    const onVisible = () => { if (document.visibilityState === 'visible') fetchDB() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVisible)
      stopRealtime()
    }
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
