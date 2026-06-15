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
    const iv = setInterval(fetchDB, 60000)
    return () => clearInterval(iv)
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
