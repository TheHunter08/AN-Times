// Arnés de previsualización aislado para ui-v2 — NO forma parte de la app
// real, no se importa desde main.jsx/App.jsx. Sirve solo para verificar
// visualmente los componentes/pantallas nuevas con datos de ejemplo
// mientras se construyen, sin tocar la aplicación en producción.
import { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import { AppShell } from './layout/AppShell.js'
import { Dashboard } from './pages/Dashboard.js'
import { Timesheets } from './pages/Timesheets.js'
import { Calendar } from './pages/Calendar.js'
import type { CalendarDay } from './pages/Calendar.js'
import { Stats } from './pages/Stats.js'
import { Settings, SettingsField } from './pages/Settings.js'
import { EmployeeHome } from './pages/EmployeeHome.js'
import type { ClockState } from './pages/EmployeeHome.js'
import { useDashboardData } from './hooks/useDashboardData.js'
import { useTimesheetsData } from './hooks/useTimesheetsData.js'
import { IconGrid, IconClock, IconCalendar, IconChart, IconSettings } from './components/Icons.js'

const PAGES = [
  { id: 'empleado', label: 'Vista Empleado', icon: <IconClock /> },
  { id: 'dashboard', label: 'Dashboard', icon: <IconGrid /> },
  { id: 'dashboard-real', label: 'Dashboard (real)', icon: <IconGrid /> },
  { id: 'fichajes', label: 'Fichajes', icon: <IconClock /> },
  { id: 'fichajes-real', label: 'Fichajes (real)', icon: <IconClock /> },
  { id: 'calendario', label: 'Calendario', icon: <IconCalendar /> },
  { id: 'stats', label: 'Estadísticas', icon: <IconChart /> },
  { id: 'ajustes', label: 'Ajustes', icon: <IconSettings /> },
]

function buildWeeks(): CalendarDay[][] {
  const weeks: CalendarDay[][] = []
  let week: CalendarDay[] = [{ day: 0 }, { day: 0 }]
  for (let d = 1; d <= 31; d++) {
    week.push({ day: d, status: d === 3 ? 'today' : d % 7 === 0 ? 'off' : d % 3 === 0 ? 'partial' : 'complete' })
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length) weeks.push(week)
  return weeks
}

function EmployeeHomeDemo() {
  const [now, setNow] = useState(new Date())
  const [state, setState] = useState<ClockState>('idle')
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const p2 = (n: number) => String(n).padStart(2, '0')
  return (
    <EmployeeHome
      time={`${p2(now.getHours())}:${p2(now.getMinutes())}`}
      seconds={`:${p2(now.getSeconds())}`}
      dateLabel={now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
      state={state}
      onMainAction={() => setState(s => (s === 'idle' ? 'working' : 'idle'))}
      onBreakAction={() => setState(s => (s === 'break' ? 'working' : 'break'))}
      workedLabel={state === 'idle' ? '0h 00m' : '4h 12m'}
      remainingLabel={state === 'idle' ? '8h 00m' : '3h 48m'}
      progressPct={state === 'idle' ? 0 : 52}
      siteLabel={state === 'idle' ? undefined : 'Obra Telecomunicaciones'}
    />
  )
}

// Demuestra que ui-v2 puede consumir datos reales del store existente
// (solo lectura, vía useDashboardData) — es el paso previo necesario
// antes de cualquier switch de rutas real (Fase 5).
function DashboardReal() {
  const data = useDashboardData()
  return <Dashboard {...data} />
}

function TimesheetsReal() {
  const [search, setSearch] = useState('')
  const rows = useTimesheetsData(search)
  return <Timesheets rows={rows} search={search} onSearchChange={setSearch} />
}

function PreviewApp() {
  const [active, setActive] = useState('dashboard')
  const [search, setSearch] = useState('')
  const [name, setName] = useState('Gecama')

  return (
    <AppShell
      navItems={PAGES.map(p => ({ id: p.id, label: p.label, icon: <span>{p.icon}</span> }))}
      activeNav={active}
      onSelectNav={setActive}
      sidebarHeader={<div style={{ fontWeight: 800, fontSize: 14 }}>TIMES INC</div>}
      pageTitle={PAGES.find(p => p.id === active)?.label ?? ''}
      breadcrumb="ui-v2 preview"
    >
      {active === 'empleado' && <EmployeeHomeDemo />}
      {active === 'dashboard' && (
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
          team={[
            { id: '1', name: 'Franklin Lisandro', status: 'active', detail: 'Desde 06:04' },
            { id: '2', name: 'Robin Maximo', status: 'break', detail: 'En pausa' },
            { id: '3', name: 'Carlos Alberto', status: 'off', detail: 'Sin jornada hoy' },
            { id: '4', name: 'Johnny Luis', status: 'off', detail: 'Sin jornada hoy' },
          ]}
          trend={[
            { label: 'lun', value: 92 }, { label: 'mar', value: 78 }, { label: 'mié', value: 88 },
            { label: 'jue', value: 65 }, { label: 'vie', value: 95 }, { label: 'sáb', value: 20 }, { label: 'dom', value: 0 },
          ]}
        />
      )}
      {active === 'dashboard-real' && <DashboardReal />}
      {active === 'fichajes-real' && <TimesheetsReal />}
      {active === 'fichajes' && (
        <Timesheets
          search={search}
          onSearchChange={setSearch}
          rows={[
            { id: '1', name: 'Robin Maximo Santana', centro: 'Telecomunicaciones', day: '3 jul 2026', entrada: '06:07', salida: '11:35', worked: '5h 28m' },
            { id: '2', name: 'Franklin Lisandro Nuñez', centro: 'Telecomunicaciones', day: '3 jul 2026', entrada: '06:04', salida: '11:35', worked: '5h 31m' },
            { id: '3', name: 'Carlos Alberto Peña', centro: 'Telecomunicaciones', day: '3 jul 2026', entrada: '06:01', salida: '10:02', worked: '9h 12m', over: true },
          ]}
        />
      )}
      {active === 'calendario' && (
        <Calendar monthLabel="Julio 2026" weeks={buildWeeks()} onPrev={() => {}} onNext={() => {}} />
      )}
      {active === 'stats' && (
        <Stats
          title="Estadísticas"
          bars={[
            { label: 'Lun', value: 70 }, { label: 'Mar', value: 85 }, { label: 'Mié', value: 60, tone: 'orange' },
            { label: 'Jue', value: 90, tone: 'green' }, { label: 'Vie', value: 40, tone: 'orange' }, { label: 'Sáb', value: 10 }, { label: 'Dom', value: 0 },
          ]}
          comparison={[
            { label: 'Horas totales', value: '138h', deltaTone: 'down' },
            { label: 'Puntualidad', value: '94%', deltaTone: 'up' },
            { label: 'Ausentismo', value: '2%', deltaTone: 'down' },
          ]}
        />
      )}
      {active === 'ajustes' && (
        <Settings
          saving={false}
          onSave={() => {}}
          sections={[
            { id: 'general', title: 'Empresa', description: 'Datos básicos de la organización', content: <SettingsField label="Nombre" value={name} onChange={setName} /> },
          ]}
        />
      )}
    </AppShell>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreviewApp />
  </StrictMode>
)
