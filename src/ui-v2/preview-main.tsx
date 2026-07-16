import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/globals.css'
import '../styles/v5.css'
import '../styles/v7.css'
import '../design-system/index.ts'
import './design-system/theme.css'
import '../styles/premium.css'
import { AppShell } from './layout/AppShell.js'
import { Dashboard } from './pages/Dashboard.js'
import { EmployeeHome, type ClockState } from './pages/EmployeeHome.js'
import { Login, type LoginMode } from './pages/Login.js'
import { ProductState } from './components/ProductState.js'
import { Notifications, type NotificationItem } from './pages/Notifications.js'
import { Search } from './components/Search.js'
import { Avatar } from './components/Avatar.js'
import {
  IconAlertCircle,
  IconBell,
  IconCalendar,
  IconCheck,
  IconClipboard,
  IconClock,
  IconGrid,
  IconReceipt,
  IconUsers,
} from './components/Icons.js'
import { colors } from './design-system/colors.js'

type PreviewScreen = 'admin' | 'employee' | 'login'

const adminNav = [
  { id:'dashboard', label:'Dashboard', group:'Principal', icon:<IconGrid /> },
  { id:'pendientes', label:'Centro de pendientes', group:'Principal', icon:<IconAlertCircle />, badge:12 },
  { id:'empleados', label:'Empleados', group:'Equipo', icon:<IconUsers /> },
  { id:'fichajes', label:'Fichajes', group:'Equipo', icon:<IconClock /> },
  { id:'planning', label:'Planning', group:'Equipo', icon:<IconCalendar /> },
  { id:'validar', label:'Validar horas', group:'Gestión', icon:<IconCheck />, badge:7 },
  { id:'solicitudes', label:'Solicitudes', group:'Gestión', icon:<IconClipboard />, badge:3 },
  { id:'gastos', label:'Gastos', group:'Gestión', icon:<IconReceipt />, badge:2 },
  { id:'notificaciones', label:'Notificaciones', group:'Comunicación', icon:<IconBell />, badge:4 },
]

const dashboardKpis = [
  { label:'Empleados activos', value:'18', delta:{ text:'+2 hoy', tone:'up' as const }, icon:<IconUsers />, tone:'primary' as const, sparkline:[11,13,12,16,18] },
  { label:'Trabajando ahora', value:'12', delta:{ text:'67% equipo', tone:'flat' as const }, icon:<IconClock />, tone:'accent' as const, sparkline:[4,8,11,12,12] },
  { label:'Horas por validar', value:'7', delta:{ text:'Requiere acción', tone:'down' as const }, icon:<IconCheck />, tone:'amber' as const },
  { label:'Solicitudes', value:'3', delta:{ text:'2 nuevas', tone:'down' as const }, icon:<IconClipboard />, tone:'cyan' as const },
  { label:'Cobertura semanal', value:'96%', delta:{ text:'+4%', tone:'up' as const }, icon:<IconCalendar />, tone:'primary' as const },
]

function AdminPreview() {
  const [active, setActive] = useState('dashboard')
  const title = adminNav.find(item => item.id === active)?.label || 'Dashboard'
  const [previewNotis, setPreviewNotis] = useState<NotificationItem[]>([
    { id:'n1',type:'solicitud',title:'Nueva solicitud de vacaciones',body:'Franklin solicita vacaciones del 22 al 26 de julio.',time:'Hace 8 min',read:false,group:'hoy',destination:'solicitudes' },
    { id:'n2',type:'fichaje',title:'Horas pendientes de validación',body:'Hay 7 jornadas esperando revisión.',time:'Hace 21 min',read:false,group:'hoy',destination:'validar' },
    { id:'n3',type:'sistema',title:'Documento próximo a caducar',body:'Revisa la documentación de Mariano.',time:'Hace 1h',read:false,group:'hoy',destination:'empleados' },
    { id:'n4',type:'mensaje',title:'Nuevo mensaje del equipo',body:'Tienes una conversación pendiente.',time:'Ayer',read:false,group:'ayer',destination:'notificaciones' },
  ])
  const kpiDestinations = ['empleados','fichajes','validar','solicitudes','planning']
  return (
    <div id="sAdmin" style={{ minHeight:'100dvh' }}>
      <AppShell
        navItems={adminNav}
        activeNav={active}
        onSelectNav={setActive}
        sidebarHeader={
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            <span style={{ width:32,height:32,display:'grid',placeItems:'center',borderRadius:10,background:'var(--gradient-brand)',color:'#fff',fontWeight:850 }}>T</span>
            <div><strong style={{ display:'block',fontSize:13.5 }}>TIMES INC</strong><span style={{ color:colors.text[500],fontSize:10 }}>Workforce OS</span></div>
          </div>
        }
        sidebarFooter={
          <div style={{ display:'flex',alignItems:'center',gap:9 }}>
            <Avatar name="Ismael Admin" size={34} status="online" />
            <div><strong style={{ display:'block',fontSize:12 }}>Ismael Admin</strong><span style={{ color:colors.text[500],fontSize:10 }}>Administrador</span></div>
          </div>
        }
        pageTitle={title}
        breadcrumb="TIMES INC"
        headerActions={
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            <Search placeholder="Buscar empleado o sección…" />
            <button type="button" aria-label="Estado sincronizado" style={{ minHeight:38,padding:'0 12px',borderRadius:10,border:`1px solid ${colors.border.default}`,background:colors.bg[600],color:colors.semantic.green,fontWeight:700 }}>● <span className="uiv2-sync-label">Al día</span></button>
            <button type="button" aria-label={`Notificaciones, ${previewNotis.filter(item => !item.read).length} sin leer`} onClick={()=>setActive('notificaciones')} style={{ width:38,height:38,display:'grid',placeItems:'center',borderRadius:10,border:`1px solid ${colors.border.default}`,background:colors.bg[600],color:colors.text[700],cursor:'pointer',position:'relative' }}><IconBell width={17} height={17} /></button>
            <Avatar name="Ismael Admin" size={30} />
          </div>
        }
      >
        {active === 'dashboard' ? (
          <Dashboard
            greeting="Buenas tardes, Ismael"
            greetingSub="Todo lo importante está bajo control."
            kpis={dashboardKpis.map((kpi,index)=>({ ...kpi,onClick:()=>setActive(kpiDestinations[index] || 'dashboard') }))}
            activity={[
              { id:'1',text:'Carlos inició su jornada en Obra Centro',time:'08:02',tone:'green',onClick:()=>setActive('fichajes') },
              { id:'2',text:'Nueva solicitud de vacaciones de Franklin',time:'08:14',tone:'orange',onClick:()=>setActive('solicitudes') },
              { id:'3',text:'Documento de Mariano próximo a caducar',time:'09:05',tone:'red',onClick:()=>setActive('empleados') },
              { id:'4',text:'Johnny reanudó su jornada',time:'09:18',tone:'purple',onClick:()=>setActive('fichajes') },
            ]}
            trend={[
              { label:'L',value:126 },{ label:'M',value:139 },{ label:'X',value:132 },{ label:'J',value:148 },{ label:'V',value:121 },
            ]}
            compareTrend={[
              { label:'L',value:118 },{ label:'M',value:125 },{ label:'X',value:129 },{ label:'J',value:135 },{ label:'V',value:116 },
            ]}
            nextEvent={{ label:'Franklin — Vacaciones',time:'22 jul',onClick:()=>setActive('solicitudes') }}
            teamSlot={{
              shown:[
                { id:'1',name:'Carlos Peña' },{ id:'2',name:'Franklin Melo' },{ id:'3',name:'Johnny Cruz' },
                { id:'4',name:'Jose Santos' },{ id:'5',name:'Mariano Díaz' },{ id:'6',name:'Melky Reyes' },
              ],
              extra:12,activeCount:12,pauseCount:2,total:18,onClick:()=>setActive('empleados'),
            }}
            quickLinks={[
              { id:'pendientes',label:'Centro de pendientes',value:'12',onClick:()=>setActive('pendientes') },
              { id:'validar',label:'Horas por validar',value:'7',onClick:()=>setActive('validar') },
              { id:'solicitudes',label:'Solicitudes nuevas',value:'3',onClick:()=>setActive('solicitudes') },
              { id:'gastos',label:'Gastos a revisar',value:'2',onClick:()=>setActive('gastos') },
              { id:'empleados',label:'Empleados activos',value:'18',onClick:()=>setActive('empleados') },
              { id:'fichajes',label:'Trabajando ahora',value:'12',onClick:()=>setActive('fichajes') },
            ]}
              onTrendClick={()=>setActive('fichajes')}
            />
        ) : active === 'notificaciones' ? (
          <Notifications
            items={previewNotis}
            onMarkRead={id=>setPreviewNotis(items=>items.map(item=>item.id===id?{...item,read:true}:item))}
            onMarkAllRead={()=>setPreviewNotis(items=>items.map(item=>({...item,read:true})))}
            onDismiss={id=>setPreviewNotis(items=>items.filter(item=>item.id!==id))}
            onOpen={item=>{ setPreviewNotis(items=>items.map(current=>current.id===item.id?{...current,read:true}:current)); setActive(item.destination || 'dashboard') }}
          />
        ) : (
          <ProductState title={title} description="Esta vista conserva su funcionalidad actual y adopta el nuevo sistema visual premium." actionLabel="Volver al dashboard" onAction={()=>setActive('dashboard')} />
        )}
      </AppShell>
    </div>
  )
}

function EmployeePreview() {
  const [state, setState] = useState<ClockState>('idle')
  const startStop = () => setState(current => current === 'idle' ? 'working' : 'idle')
  const pause = () => setState(current => current === 'break' ? 'working' : 'break')
  return (
    <div id="sEmp" className="ti-preview__employee">
      <EmployeeHome
        time={state === 'idle' ? '00:00' : '04:26'}
        seconds={state === 'idle' ? '00' : '18'}
        dateLabel="Miércoles, 15 de julio"
        state={state}
        onStartAction={startStop}
        onStopAction={startStop}
        onBreakAction={pause}
        workedLabel={state === 'idle' ? '0 h 00 min' : '4 h 26 min'}
        remainingLabel={state === 'idle' ? '8 h previstas' : '3 h 34 min restantes'}
        progressPct={state === 'idle' ? 0 : 55}
        siteLabel="Obra Centro"
        streakDays={12}
        syncLabel="Guardado · En tiempo real"
        syncTone="ok"
        greeting="Buenas tardes, Ismael"
        shiftStart="08:00"
        shiftEnd="16:00"
        weeklyTotal="20 h 42 min"
        week={[
          { label:'L',pct:100,hours:'8h' },{ label:'M',pct:100,hours:'8h' },{ label:'X',pct:55,hours:'4.4h',isToday:true },
          { label:'J',pct:0,hours:'—' },{ label:'V',pct:0,hours:'—' },
        ]}
        recent={state === 'idle' ? [] : [
          { id:'1',label:'Entrada registrada',time:'08:02',tone:'green',type:'entrada' },
          { id:'2',label:'Descanso finalizado',time:'10:22',tone:'green',type:'reanuda' },
          { id:'3',label:'Descanso iniciado',time:'10:05',tone:'orange',type:'pausa' },
        ]}
      />
    </div>
  )
}

function LoginPreview() {
  const [mode, setMode] = useState<LoginMode>('pin')
  const [selected, setSelected] = useState('ismael')
  const [pin, setPin] = useState('')
  const employees = useMemo(() => ['Carlos','Franklin','Ismael','Johnny','Jose','Mariano','Melky','Robin'].map(name => ({ id:name.toLowerCase(),name,pinLen:4 })),[])
  return (
    <Login
      employees={employees}
      selectedEmpId={selected}
      onSelectEmp={id=>{setSelected(id);setPin('')}}
      pin={pin}
      onPinKey={key=>setPin(current => current.length < 4 ? current + key : current)}
      onPinDel={()=>setPin(current=>current.slice(0,-1))}
      mode={mode}
      onSetMode={setMode}
      online
      lastSyncLabel="hace un momento"
    />
  )
}

function PreviewApp() {
  const [screen, setScreen] = useState<PreviewScreen>('admin')
  return (
    <div className="ti-preview">
      <div className="ti-preview__canvas">
        {screen === 'admin' && <AdminPreview />}
        {screen === 'employee' && <EmployeePreview />}
        {screen === 'login' && <LoginPreview />}
      </div>
      <nav className="ti-preview__switcher" aria-label="Cambiar vista previa">
        {([
          ['admin','Administrador'],['employee','Empleado'],['login','Acceso'],
        ] as const).map(([id,label]) => (
          <button key={id} type="button" aria-pressed={screen === id} onClick={()=>setScreen(id)}>{label}</button>
        ))}
      </nav>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<PreviewApp />)
