// Arnés de previsualización aislado para ui-v2 — NO forma parte de la app
// real, no se importa desde main.jsx/App.jsx. Sirve solo para verificar
// visualmente los componentes/pantallas nuevas con datos de ejemplo
// mientras se construyen, sin tocar la aplicación en producción.
import { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import '../design-system/index.ts'
import './design-system/theme.css'
import '../styles/v7.css'
import { AppShell } from './layout/AppShell.js'
import { Dashboard } from './pages/Dashboard.js'
import { Timesheets } from './pages/Timesheets.js'
import { Calendar } from './pages/Calendar.js'
import type { CalendarDay } from './pages/Calendar.js'
import { Stats } from './pages/Stats.js'
import { Settings, SettingsField } from './pages/Settings.js'
import { EmployeeHome } from './pages/EmployeeHome.js'
import type { ClockState } from './pages/EmployeeHome.js'
import { Employees } from './pages/Employees.js'
import { Requests } from './pages/Requests.js'
import type { RequestRow } from './pages/Requests.js'
import { Projects } from './pages/Projects.js'
import { Reports } from './pages/Reports.js'
import { Notifications } from './pages/Notifications.js'
import { Messages } from './pages/Messages.js'
import { Expenses } from './pages/Expenses.js'
import { Obras } from './pages/Obras.js'
import { Shifts } from './pages/Shifts.js'
import { Planning } from './pages/Planning.js'
import { MonthlyClose } from './pages/MonthlyClose.js'
import { Documents } from './pages/Documents.js'
import { Audit } from './pages/Audit.js'
import { Anomalies } from './pages/Anomalies.js'
import { ValidateHours } from './pages/ValidateHours.js'
import { Login } from './pages/Login.js'
import { useDashboardData } from './hooks/useDashboardData.js'
import { useTimesheetsData } from './hooks/useTimesheetsData.js'
import { Search } from './components/Search.js'
import { Avatar } from './components/Avatar.js'
import { colors } from './design-system/colors'
import { radius } from './design-system/radius'
import * as demo from './data/demoData.js'
import {
  IconGrid, IconClock, IconCalendar, IconChart, IconSettings, IconUsers,
  IconFolder, IconFileText, IconClipboard, IconBell, IconChat,
  IconWifiOff, IconDevice, IconSync, IconRefresh, IconShield, IconBuilding,
  IconAlertCircle, IconMapPin, IconReceipt, IconCheck,
} from './components/Icons.js'

const PAGES = [
  // Admin views
  { id: 'dashboard',      label: 'Resumen',             icon: <IconGrid />,         group: 'Principal' },
  { id: 'empleados',      label: 'Empleados',           icon: <IconUsers />,        group: 'Equipo' },
  { id: 'fichajes',       label: 'Fichajes',            icon: <IconClock />,        group: 'Equipo' },
  { id: 'planning',       label: 'Planning',            icon: <IconCalendar />,     group: 'Equipo' },
  { id: 'turnos',         label: 'Turnos',              icon: <IconCalendar />,     group: 'Equipo' },
  { id: 'validar',        label: 'Validar horas',       icon: <IconCheck />,        group: 'Gestión' },
  { id: 'solicitudes',    label: 'Solicitudes',         icon: <IconClipboard />,    group: 'Gestión' },
  { id: 'gastos',         label: 'Gastos',              icon: <IconReceipt />,      group: 'Gestión' },
  { id: 'obras',          label: 'Obras',               icon: <IconBuilding />,     group: 'Gestión' },
  { id: 'proyectos',      label: 'Proyectos',           icon: <IconFolder />,       group: 'Gestión' },
  { id: 'documentos',     label: 'Documentos',          icon: <IconFolder />,       group: 'Gestión' },
  { id: 'cierre',         label: 'Cierre mensual',      icon: <IconFileText />,     group: 'Análisis' },
  { id: 'stats',          label: 'Estadísticas',        icon: <IconChart />,        group: 'Análisis' },
  { id: 'reportes',       label: 'Informes',            icon: <IconFileText />,     group: 'Análisis' },
  { id: 'anomalias',      label: 'Anomalías',           icon: <IconAlertCircle />,  group: 'Análisis' },
  { id: 'auditoria',      label: 'Auditoría',           icon: <IconShield />,       group: 'Análisis' },
  { id: 'mensajes',       label: 'Mensajes',            icon: <IconChat />,         group: 'Comunicación' },
  { id: 'notificaciones', label: 'Notificaciones',      icon: <IconBell />,         group: 'Comunicación' },
  { id: 'ajustes',        label: 'Ajustes',             icon: <IconSettings />,     group: 'Sistema' },
  // Employee views
  { id: 'empleado',       label: 'Vista Empleado',      icon: <IconClock />,        group: 'emp' },
  { id: 'calendario',     label: 'Calendario',          icon: <IconCalendar />,     group: 'emp' },
  // Special
  { id: 'login',          label: 'Login',               icon: <IconShield />,       group: 'auth' },
]

const toneHex: Record<string, string> = {
  primary: colors.kpiTone.primary.base,
  accent: colors.kpiTone.accent.base,
  cyan: colors.kpiTone.cyan.base,
  amber: colors.kpiTone.amber.base,
  pink: '#EC4899',
}

function buildMonthWeeks(): CalendarDay[][] {
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
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  return (
    <EmployeeHome
      greeting={greeting}
      time={`${p2(now.getHours())}:${p2(now.getMinutes())}`}
      seconds={`:${p2(now.getSeconds())}`}
      dateLabel={now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
      state={state}
      onStartAction={() => setState(s => s === 'idle' ? 'working' : 'idle')}
      onBreakAction={() => setState(s => s === 'break' ? 'working' : 'break')}
      onStopAction={() => setState('idle')}
      workedLabel={state === 'idle' ? '0h 00m' : '4h 12m'}
      remainingLabel={state === 'idle' ? '8h 00m' : '3h 48m'}
      progressPct={state === 'idle' ? 0 : 52}
      siteLabel={state !== 'idle' ? 'Obra Telecomunicaciones' : undefined}
      shiftStart="08:00"
      shiftEnd="17:00"
      overtimeLabel={state === 'working' ? '0h 12m' : undefined}
      streakDays={12}
      weeklyTotal="29h 45m"
      week={[
        { label: 'L', pct: 88,  hours: '7h 54m' },
        { label: 'M', pct: 100, hours: '8h 05m' },
        { label: 'X', pct: 72,  hours: '6h 28m' },
        { label: 'J', pct: 95,  hours: '7h 18m' },
        { label: 'V', pct: state === 'idle' ? 0 : 52, hours: state === 'idle' ? undefined : '4h 12m', isToday: true },
        { label: 'S', pct: 0 },
        { label: 'D', pct: 0 },
      ]}
      recent={[
        { id: '1', label: 'Entrada registrada', time: '08:03', tone: 'green',  type: 'entrada' },
        { id: '2', label: 'Pausa iniciada',      time: '10:30', tone: 'orange', type: 'pausa'   },
        { id: '3', label: 'Vuelta al trabajo',   time: '11:00', tone: 'green',  type: 'reanuda' },
      ]}
    />
  )
}

function DashboardReal() {
  const data = useDashboardData()
  return <Dashboard {...data} />
}

function TimesheetsReal() {
  const [search, setSearch] = useState('')
  const rows = useTimesheetsData(search)
  return <Timesheets rows={rows} search={search} onSearchChange={setSearch} />
}

function useRequestsState() {
  const [rows, setRows] = useState<RequestRow[]>(() => demo.requests.map(r => ({ id: r.id, type: r.type, employeeName: r.employeeName, requestedOn: r.requestedOn, status: r.status, days: r.days, note: r.note })))
  const approve = (id: string) => setRows(rs => rs.map(r => r.id === id ? { ...r, status: 'approved' } : r))
  const reject = (id: string) => setRows(rs => rs.map(r => r.id === id ? { ...r, status: 'rejected' } : r))
  return { rows, approve, reject }
}

function DashboardDemo({ pendingCount, onNavigate }: { pendingCount: number; onNavigate: (id: string) => void }) {
  return (
    <Dashboard
      greeting="Buenos días, Admin"
      greetingSub="Aquí tienes el resumen de tu equipo hoy."
      kpis={[
        { label: 'Empleados activos', value: String(demo.employees.length), tone: 'primary', icon: <IconUsers width={17} height={17} /> },
        { label: 'Trabajando ahora', value: String(demo.employees.filter(e => e.status === 'active').length), tone: 'cyan', icon: <IconClock width={17} height={17} /> },
        { label: 'En descanso', value: String(demo.employees.filter(e => e.status === 'break').length), tone: 'amber', icon: <IconClock width={17} height={17} /> },
        { label: 'Ausentes hoy', value: String(demo.employees.filter(e => e.status === 'off').length), tone: 'accent', icon: <IconUsers width={17} height={17} /> },
        { label: 'Horas trabajadas hoy', value: demo.kpis.horasTrabajadas, tone: 'primary', icon: <IconChart width={17} height={17} /> },
      ]}
      trend={demo.weeklyTrend}
      compareTrend={demo.weeklyTrendCompare}
      activity={demo.activity}
      fichaje={{ statusLabel: 'Jornada en curso', time: '08:15:36', tone: 'green' }}
      nextEvent={{ label: 'Proyecto Beta', time: 'Hoy, 14:00 - 17:00' }}
      quickLinks={[
        { id: 'empleados', label: 'Empleados', value: String(demo.employees.length), onClick: () => onNavigate('empleados') },
        { id: 'proyectos', label: 'Proyectos activos', value: String(demo.projects.filter(p => p.status === 'active').length), onClick: () => onNavigate('proyectos') },
        { id: 'solicitudes', label: 'Solicitudes pendientes', value: String(pendingCount), onClick: () => onNavigate('solicitudes') },
        { id: 'estadisticas', label: 'Horas este mes', value: demo.monthlyStats[0].value, onClick: () => onNavigate('stats') },
      ]}
    />
  )
}

function QuickAccessItem({ icon, iconBg, iconColor, label, onClick }: { icon: React.ReactNode; iconBg: string; iconColor: string; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', borderRadius: radius.sm, border: 'none', background: 'transparent', color: colors.text[700], fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: radius.xs, background: iconBg, color: iconColor, flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  )
}

function SidebarFooterContent({ onNavigate }: { onNavigate: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: colors.text[500], padding: '0 4px', marginBottom: 6 }}>Accesos rápidos</div>
        <QuickAccessItem icon={<IconClock width={13} height={13} />} iconBg="rgba(16,185,129,.16)" iconColor={colors.semantic.green} label="Iniciar fichaje" onClick={() => onNavigate('empleado')} />
        <QuickAccessItem icon={<IconClipboard width={13} height={13} />} iconBg="rgba(59,130,246,.16)" iconColor={colors.accent.base} label="Nueva solicitud" onClick={() => onNavigate('solicitudes')} />
        <QuickAccessItem icon={<IconUsers width={13} height={13} />} iconBg={colors.primary.dim} iconColor={colors.primary.light} label="Añadir empleado" onClick={() => onNavigate('empleados')} />
        <QuickAccessItem icon={<IconFileText width={13} height={13} />} iconBg="rgba(239,68,68,.16)" iconColor={colors.semantic.red} label="Ver reportes" onClick={() => onNavigate('reportes')} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px' }}>
        <Avatar name="Admin" size={30} status="online" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 640, color: colors.text[900] }}>Admin</div>
          <div style={{ fontSize: 10.5, color: colors.text[500] }}>Administrador</div>
        </div>
      </div>

      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: radius.md, padding: 14, background: colors.gradients.brand }}>
        <div style={{ position: 'absolute', top: -30, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,.15)', filter: 'blur(6px)' }} />
        <div style={{ position: 'relative', fontSize: 12.5, fontWeight: 700, color: '#fff' }}>Potencia tu productividad</div>
        <div style={{ position: 'relative', fontSize: 11, color: 'rgba(255,255,255,.85)', marginTop: 4, marginBottom: 10 }}>Workforce Operating System</div>
        <button style={{ position: 'relative', padding: '6px 12px', borderRadius: radius.xs, border: 'none', background: 'rgba(255,255,255,.18)', color: '#fff', fontSize: 11.5, fontWeight: 640, cursor: 'pointer' }}>Ver novedades</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 10.5, color: colors.text[500], paddingTop: 8, borderTop: `1px solid ${colors.border.subtle}` }}>
        <div style={{ fontWeight: 700, color: colors.text[700], fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>PWA — Siempre contigo</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><IconWifiOff width={12} height={12} /> Funciona offline</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><IconDevice width={12} height={12} /> Instalable</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><IconBell width={12} height={12} /> Notificaciones push</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><IconSync width={12} height={12} /> Sincronización</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.semantic.green }} />
          Sistema operativo <IconRefresh width={11} height={11} style={{ marginLeft: 'auto' }} />
        </div>
      </div>
    </div>
  )
}

function HeaderActions({ notifCount, onNavigate }: { notifCount: number; onNavigate: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button onClick={() => onNavigate('notificaciones')} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', color: colors.text[700], display: 'flex', padding: 2 }}>
        <IconBell width={18} height={18} />
        {notifCount > 0 && (
          <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, background: colors.semantic.red, color: '#fff', fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: `2px solid ${colors.bg[700]}` }}>{notifCount}</span>
        )}
      </button>
      <button onClick={() => onNavigate('mensajes')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text[700], display: 'flex', padding: 2 }}>
        <IconChat width={18} height={18} />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar name="Admin" size={30} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 640, color: colors.text[900] }}>Admin</div>
        </div>
      </div>
    </div>
  )
}

function PreviewApp() {
  const [active, setActive] = useState('dashboard')
  const [search, setSearch] = useState('')
  const [name, setName] = useState('Gecama')
  const requestsState = useRequestsState()
  const [notifs, setNotifs] = useState(demo.notifications)

  const unreadNotifs = notifs.filter(n => !n.read).length

  const markRead = (id: string) => setNotifs(ns => ns.map(n => n.id === id ? { ...n, read: true } : n))
  const markAllRead = () => setNotifs(ns => ns.map(n => ({ ...n, read: true })))
  const dismissNotif = (id: string) => setNotifs(ns => ns.filter(n => n.id !== id))

  // Login es pantalla fullscreen sin AppShell
  if (active === 'login') {
    return (
      <div>
        <Login onLogin={() => setActive('dashboard')} />
        <button onClick={() => setActive('dashboard')} style={{ position: 'fixed', top: 16, right: 16, padding: '8px 14px', borderRadius: radius.sm, border: `1px solid ${colors.border.default}`, background: colors.bg[600], color: colors.text[700], fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', zIndex: 100 }}>
          ← Volver al preview
        </button>
      </div>
    )
  }

  return (
    <AppShell
      navItems={PAGES.filter(p => p.group !== 'auth').map(p => ({ id: p.id, label: p.label, group: p.group, icon: <span>{p.icon}</span> }))}
      activeNav={active}
      onSelectNav={setActive}
      sidebarHeader={
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: colors.gradients.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#fff', flexShrink: 0 }}>T</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-.2px' }}>TIMES INC</span>
              </div>
              <div style={{ fontSize: 10, color: colors.text[500] }}>Workforce Operating System</div>
            </div>
          </div>
        </div>
      }
      sidebarFooter={<SidebarFooterContent onNavigate={setActive} />}
      headerActions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <div className="uiv2-header-search" style={{ position: 'relative' }}>
            <Search placeholder="Buscar empleados, proyectos, fichajes…" value={search} onChange={e => setSearch(e.target.value)} />
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 700, color: colors.text[500], background: colors.bg[500], padding: '2px 6px', borderRadius: radius.xs, border: `1px solid ${colors.border.subtle}` }}>⌘K</span>
          </div>
          <HeaderActions notifCount={unreadNotifs} onNavigate={setActive} />
          <style>{`@media (max-width: 680px) { .uiv2-header-search { display: none; } }`}</style>
        </div>
      }
      pageTitle={PAGES.find(p => p.id === active)?.label ?? ''}
      breadcrumb="ui-v2 preview"
    >
      {active === 'login' && null}
      {active === 'empleado' && <EmployeeHomeDemo />}
      {active === 'dashboard' && (
        <DashboardDemo pendingCount={requestsState.rows.filter(r => r.status === 'pending').length} onNavigate={setActive} />
      )}
      {active === 'dashboard-real' && <DashboardReal />}
      {active === 'fichajes-real' && <TimesheetsReal />}
      {active === 'empleados' && <Employees rows={demo.employees} />}
      {active === 'solicitudes' && (
        <Requests rows={requestsState.rows.map(r => ({ ...r, onApprove: requestsState.approve, onReject: requestsState.reject }))} />
      )}
      {active === 'proyectos' && <Projects rows={demo.projects} />}
      {active === 'reportes' && <Reports rows={demo.reports} />}
      {active === 'fichajes' && (
        <Timesheets
          search={search} onSearchChange={setSearch}
          rows={[
            { id: '1', name: 'Robin Maximo Santana', centro: 'Telecomunicaciones', day: '3 jul 2026', entrada: '06:07', salida: '11:35', worked: '5h 28m' },
            { id: '2', name: 'Franklin Lisandro Nuñez', centro: 'Telecomunicaciones', day: '3 jul 2026', entrada: '06:04', salida: '11:35', worked: '5h 31m' },
            { id: '3', name: 'Carlos Alberto Peña', centro: 'Telecomunicaciones', day: '3 jul 2026', entrada: '06:01', salida: '10:02', worked: '9h 12m', over: true },
          ]}
        />
      )}
      {active === 'calendario' && (
        <Calendar
          monthLabel="Mayo 2024"
          weeks={buildMonthWeeks()}
          onPrev={() => {}}
          onNext={() => {}}
          week={{ monthLabel: 'Mayo 2024', days: demo.weekDays, events: demo.scheduleEvents }}
        />
      )}
      {active === 'stats' && (
        <Stats
          title="Estadísticas"
          kpis={[
            { label: 'Horas este mes', value: demo.monthlyStats[0]?.value ?? '128h', delta: '12.5% vs mes pasado', deltaTone: 'up', tone: 'primary' },
            { label: 'Puntualidad', value: '94%', delta: '1.2% vs mes pasado', deltaTone: 'up', tone: 'cyan' },
            { label: 'Ausentismo', value: '2%', delta: '0.5% vs mes pasado', deltaTone: 'down', tone: 'amber' },
            { label: 'Horas extra', value: '14h', delta: '3h más que el mes pasado', deltaTone: 'down', tone: 'accent' },
          ]}
          bars={[
            { label: 'Lun', value: 70 }, { label: 'Mar', value: 85 }, { label: 'Mié', value: 60 },
            { label: 'Jue', value: 90 }, { label: 'Vie', value: 40 }, { label: 'Sáb', value: 10 }, { label: 'Dom', value: 0 },
          ]}
          comparison={[
            { label: 'Horas totales', value: '138h', deltaTone: 'down' },
            { label: 'Puntualidad media', value: '94%', deltaTone: 'up' },
            { label: 'Ausentismo', value: '2%', deltaTone: 'down' },
            { label: 'Fichajes OK', value: '342', deltaTone: 'up' },
          ]}
          donut={{
            centerValue: demo.departmentDonut.centerValue,
            centerLabel: demo.departmentDonut.centerLabel,
            slices: demo.departmentDonut.slices.map(s => ({ label: s.label, pct: s.pct, color: toneHex[s.colorKey] })),
          }}
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
      {/* ── Nuevas pantallas v5 ── */}
      {active === 'notificaciones' && (
        <Notifications
          items={notifs}
          onMarkRead={markRead}
          onMarkAllRead={markAllRead}
          onDismiss={dismissNotif}
        />
      )}
      {active === 'mensajes' && (
        <Messages conversations={demo.conversations} adminName="Admin" />
      )}
      {active === 'gastos' && (
        <Expenses items={demo.expenses} />
      )}
      {active === 'obras' && (
        <Obras items={demo.obras} />
      )}
      {active === 'turnos' && (
        <Shifts
          weekLabel="7 — 13 jul 2026"
          employees={demo.shiftsEmployees}
          onPrev={() => {}} onNext={() => {}} onToday={() => {}}
        />
      )}
      {active === 'planning' && (
        <Planning
          weekLabel="7 — 13 jul 2026"
          days={['Lun 7', 'Mar 8', 'Mié 9', 'Jue 10', 'Vie 11', 'Sáb 12', 'Dom 13']}
          employees={demo.planningEmployees}
          onPrev={() => {}} onNext={() => {}} onToday={() => {}}
        />
      )}
      {active === 'cierre' && (
        <MonthlyClose items={demo.closures as any} />
      )}
      {active === 'documentos' && (
        <Documents items={demo.documents} />
      )}
      {active === 'auditoria' && (
        <Audit entries={demo.auditEntries} />
      )}
      {active === 'anomalias' && (
        <Anomalies items={demo.anomalies} />
      )}
      {active === 'validar' && (
        <ValidateHours rows={demo.validateRows} weekLabel="Semana del 7 al 13 jul 2026" />
      )}
    </AppShell>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreviewApp />
  </StrictMode>
)
