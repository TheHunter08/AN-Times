// Arnés de previsualización aislado para ui-v2 — NO forma parte de la app
// real, no se importa desde main.jsx/App.jsx. Sirve solo para verificar
// visualmente los componentes nuevos con datos de ejemplo mientras se
// construyen, sin tocar la aplicación en producción.
import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import { AppShell } from './layout/AppShell.js'
import { Dashboard } from './pages/Dashboard.js'

function PreviewApp() {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <span>◧</span> },
    { id: 'fichajes', label: 'Fichajes', icon: <span>◷</span> },
    { id: 'empleados', label: 'Empleados', icon: <span>◍</span> },
  ]
  return (
    <AppShell
      navItems={navItems}
      activeNav="dashboard"
      onSelectNav={() => {}}
      sidebarHeader={<div style={{ fontWeight: 800, fontSize: 14 }}>TIMES INC</div>}
      pageTitle="Dashboard"
      breadcrumb="ui-v2 preview"
    >
      <Dashboard
        greeting="Buenas tardes, Ismael 👋"
        kpis={[
          { label: 'Activos ahora', value: '3/8' },
          { label: 'Horas hoy', value: '31h 00m', delta: { text: '+4%', tone: 'up' } },
          { label: 'Horas este mes', value: '138h 01m', delta: { text: '-40%', tone: 'down' } },
          { label: 'Productividad', value: '10%', delta: { text: 'bajo objetivo', tone: 'flat' } },
        ]}
        activity={[
          { id: '1', text: 'Franklin fichó salida — 5h 31m', time: 'hace 12 min', tone: 'green' },
          { id: '2', text: 'Robin solicitó vacaciones', time: 'hace 1 h', tone: 'purple' },
          { id: '3', text: 'Documento pendiente de firma', time: 'hace 2 h', tone: 'orange' },
        ]}
      />
    </AppShell>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreviewApp />
  </StrictMode>
)
