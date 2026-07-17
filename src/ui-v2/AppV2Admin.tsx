// Shell admin v2 — usa el nuevo AppShell + páginas v2 con datos reales de useAppStore.
// CLAUDE.md: UI only — NO tocar backend, Supabase, auth ni lógica de negocio.
import { lazy, Suspense, useState, useMemo, useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore.js'
import { useShallow } from 'zustand/react/shallow'
import { AppShell } from './layout/AppShell.js'
import { Dashboard } from './pages/Dashboard.js'
import { Search } from './components/Search.js'
import { Avatar } from './components/Avatar.js'
import { colors } from './design-system/colors'
import {
  IconGrid, IconClock, IconCalendar, IconChart, IconUsers,
  IconFolder, IconFileText, IconClipboard, IconBell, IconChat,
  IconShield, IconBuilding, IconAlertCircle, IconReceipt,
  IconCheck, IconLogout, IconRows, IconSeal, IconTrendUp, IconMapPin,
  IconHome, IconX, IconPlus, IconSun, IconMoon,
  IconSettings,
} from './components/Icons.js'
import { useDashboardData } from './hooks/useDashboardData.js'
import { useTimesheetsData } from './hooks/useTimesheetsData.js'
import { useEmployeesData } from './hooks/useEmployeesData.js'
import { useRequestsData } from './hooks/useRequestsData.js'
import { useNotificationsData } from './hooks/useNotificationsData.js'
import { auditLog, queuePush, uploadPendingIfAny } from '../services/dataService.js'
import { supabase, persistRecordRow, deleteRecordRow } from '../services/dataServiceV2.js'
import { gid, today, mhm, localDateStr, localMonthKey, calcSecs, recWorkSecs, vacData as vacDataUtil } from '../utils/time.js'
import { buildRecordSnapshot, canCloseMonth, clipBreaksToWindow, currentDeviceLabel, isRecordMonthLocked, recordTimesFromClock, refreshUnsignedClosures } from '../utils/adminHelpers.js'
import { employeeBelongsToObra, resolveRecordObraId } from '../utils/obraAttribution.js'
import { formatObraCoords, normalizeObraCoords } from '../utils/obraGeo.js'
import { toggleTheme } from '../utils/userConfig.js'
import { downloadSimplePdf, downloadXlsx, downloadCsv, downloadDataUrl } from '../utils/exportFiles.js'
import { buildCierreConsolidadoPDF } from '../utils/cierrePdf.js'
import { useDialogA11y } from '../hooks/useDialogA11y.js'
import { getScopedOnlineRecords } from '../utils/supervisorScope.js'
import { buildComplianceSummary } from '../utils/complianceSummary.js'
import { WM, CIERRE_PDF_BUCKET, DOCUMENTOS_BUCKET } from '../config/constants.js'

const Timesheets = lazy(() => import('./pages/Timesheets.js').then(module => ({ default: module.Timesheets })))
const Employees = lazy(() => import('./pages/Employees.js').then(module => ({ default: module.Employees })))
const Requests = lazy(() => import('./pages/Requests.js').then(module => ({ default: module.Requests })))
const Notifications = lazy(() => import('./pages/Notifications.js').then(module => ({ default: module.Notifications })))
const Planning = lazy(() => import('./pages/Planning.js').then(module => ({ default: module.Planning })))
const Shifts = lazy(() => import('./pages/Shifts.js').then(module => ({ default: module.Shifts })))
const ValidateHours = lazy(() => import('./pages/ValidateHours.js').then(module => ({ default: module.ValidateHours })))
const Expenses = lazy(() => import('./pages/Expenses.js').then(module => ({ default: module.Expenses })))
const Documents = lazy(() => import('./pages/Documents.js').then(module => ({ default: module.Documents })))
const Reports = lazy(() => import('./pages/Reports.js').then(module => ({ default: module.Reports })))
const Stats = lazy(() => import('./pages/Stats.js').then(module => ({ default: module.Stats })))
const MonthlyClose = lazy(() => import('./pages/MonthlyClose.js').then(module => ({ default: module.MonthlyClose })))
const Audit = lazy(() => import('./pages/Audit.js').then(module => ({ default: module.Audit })))
const Anomalies = lazy(() => import('./pages/Anomalies.js').then(module => ({ default: module.Anomalies })))
const Messages = lazy(() => import('./pages/Messages.js').then(module => ({ default: module.Messages })))
const Obras = lazy(() => import('./pages/Obras.js').then(module => ({ default: module.Obras })))
const OnlineTeam = lazy(() => import('./pages/OnlineTeam.js').then(module => ({ default: module.OnlineTeam })))
const Operations = lazy(() => import('./pages/Operations.js').then(module => ({ default: module.Operations })))
const VacacionesPage = lazy(() => import('./pages/Vacaciones.js').then(module => ({ default: module.Vacaciones })))
const ModalAI = lazy(() => import('../components/employee/ModalAI.jsx').then(module => ({ default: module.ModalAI })))

function PageLoader() {
  return (
    <div className="ti-page-loader" role="status" aria-label="Cargando sección">
      <span /><span /><span />
    </div>
  )
}

const PAGES = [
  { id: 'dashboard',      label: 'Dashboard',         group: 'Principal', icon: <IconGrid /> },
  { id: 'pendientes',     label: 'Centro de pendientes', group: 'Principal', icon: <IconAlertCircle /> },
  { id: 'empleados',      label: 'Empleados',         group: 'Equipo', icon: <IconUsers /> },
  { id: 'en_linea',       label: 'En línea',          group: 'Equipo', icon: <IconTrendUp /> },
  { id: 'fichajes',       label: 'Fichajes',          group: 'Equipo', icon: <IconClock /> },
  { id: 'planning',       label: 'Planning',          group: 'Equipo', icon: <IconCalendar /> },
  { id: 'turnos',         label: 'Turnos',            group: 'Equipo', icon: <IconRows /> },
  { id: 'validar',        label: 'Validar horas',     group: 'Gestión', icon: <IconCheck /> },
  { id: 'solicitudes',    label: 'Solicitudes',       group: 'Gestión', icon: <IconClipboard /> },
  { id: 'vacaciones',     label: 'Vacaciones',        group: 'Gestión', icon: <IconCalendar /> },
  { id: 'gastos',         label: 'Gastos',            group: 'Gestión', icon: <IconReceipt /> },
  { id: 'obras',          label: 'Obras',             group: 'Gestión', icon: <IconBuilding /> },
  { id: 'centros',        label: 'Centros de trabajo',group: 'Gestión', icon: <IconMapPin /> },
  { id: 'documentos',     label: 'Documentos',        group: 'Gestión', icon: <IconFolder /> },
  { id: 'estadisticas',   label: 'Estadísticas',      group: 'Análisis', icon: <IconChart /> },
  { id: 'informes',       label: 'Cumplimiento',      group: 'Análisis', icon: <IconFileText /> },
  { id: 'cierre',         label: 'Cierre mensual',    group: 'Análisis', icon: <IconSeal /> },
  { id: 'anomalias',      label: 'Anomalías',         group: 'Análisis', icon: <IconAlertCircle /> },
  { id: 'auditoria',      label: 'Auditoría',         group: 'Análisis', icon: <IconShield /> },
  { id: 'mensajes',       label: 'Mensajes',          group: 'Comunicación', icon: <IconChat /> },
  { id: 'notificaciones', label: 'Notificaciones',    group: 'Comunicación', icon: <IconBell /> },
  { id: 'operaciones',    label: 'Centro operativo',  group: 'Sistema', icon: <IconSettings /> },
]

const ROLES = [
  { value: 'empleado',   label: 'Empleado' },
  { value: 'encargado',  label: 'Encargado' },
  { value: 'jefe_obra',  label: 'Jefe de obra' },
  { value: 'admin',      label: 'Administrador' },
]

interface EmpForm {
  id: string; name: string; email: string; role: string
  pin: string; pinLen: number | null
  centroTrabajo: string; telefono: string; obrasAsignadas: string[]
  fechaInicioContrato: string; turnoInicio: string; turnoFin: string
  crearTurnos: boolean; vacacionesExtra: number
}

function EmployeeModal({ initial, onClose }: { initial?: EmpForm; onClose: () => void }) {
  const db     = useAppStore(s => s.db) as any
  const saveDB = useAppStore(s => s.saveDB)
  const toast  = useAppStore(s => s.toast)
  const obras  = (db.obras || []).filter((o: any) => o.activa !== false)
  const centros: string[] = db.centrosTrabajo || db.config?.centros || []

  const blank: EmpForm = { id: gid(), name: '', email: '', role: 'empleado', pin: '', pinLen: null, centroTrabajo: '', telefono: '', obrasAsignadas: [], fechaInicioContrato: '', turnoInicio: '08:00', turnoFin: '16:00', crearTurnos: false, vacacionesExtra: 0 }
  const [form, setForm] = useState<EmpForm>(initial ?? blank)
  const isEdit = !!initial

  const setF = (k: keyof EmpForm, v: any) => setForm(f => ({ ...f, [k]: v }))
  const toggleObra = (id: string) =>
    setF('obrasAsignadas', form.obrasAsignadas.includes(id)
      ? form.obrasAsignadas.filter((x: string) => x !== id)
      : [...form.obrasAsignadas, id])

  const handleSave = () => {
    if (!form.name.trim()) { toast('El nombre es obligatorio', 2500, 'warn'); return }
    saveDB((fresh: any) => {
      const emps: any[] = fresh.employees || []
      const existing = isEdit ? emps.find((e: any) => e.id === form.id) || {} : {}
      const pinHash = form.pin ? form.pin : (isEdit ? existing.pin || null : null)
      const pinLen = form.pin ? form.pin.length : (isEdit ? existing.pinLen || null : null)
      const emp = {
        ...existing,
        id: form.id, name: form.name.trim(), email: form.email || null,
        role: form.role, pin: pinHash, pinLen,
        centroTrabajo: form.centroTrabajo || null,
        telefono: form.telefono || null,
        fechaInicioContrato: form.fechaInicioContrato || null,
        turnoInicio: form.turnoInicio || null,
        turnoFin: form.turnoFin || null,
        obrasAsignadas: form.obrasAsignadas,
        isAdmin: form.role === 'admin',
        isEnc: form.role === 'encargado',
        isJO: form.role === 'jefe_obra',
        baja: false,
        vacacionesExtra: form.vacacionesExtra || 0,
      }
      const updated = isEdit
        ? emps.map((e: any) => e.id === form.id ? emp : e)
        : [...emps, emp]
      if (!form.crearTurnos) return { employees: updated }
      const now = new Date()
      now.setHours(0, 0, 0, 0)
      const dates = Array.from({ length: 45 }, (_, i) => {
        const d = new Date(now); d.setDate(now.getDate() + i); return d
      }).filter(d => d.getDay() !== 0 && d.getDay() !== 6)
      const nowIso = new Date().toISOString()
      const turnos = [...(fresh.turnos || [])]
      dates.forEach(d => {
        const fecha = localDateStr(d)
        const idx = turnos.findIndex((t: any) => t.empId === form.id && t.fecha === fecha)
        const next = { ...(idx >= 0 ? turnos[idx] : {}), id: idx >= 0 ? turnos[idx].id : gid(), empId: form.id, empName: form.name.trim(), fecha, horaInicio: form.turnoInicio, horaFin: form.turnoFin, tipo: 'normal', _upd: nowIso }
        if (idx >= 0) turnos[idx] = next; else turnos.push(next)
      })
      return { employees: updated, turnos }
    })
    toast(isEdit ? 'Empleado actualizado' : 'Empleado creado', 2500, 'ok')
    onClose()
  }

  const iField = (label: string, key: keyof EmpForm, type = 'text', placeholder = '') => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
      <input type={type} value={form[key] as string} onChange={e => setF(key, e.target.value)} placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1px solid ${colors.border.default}`, background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
    </div>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: colors.bg[900], borderRadius: '16px 16px 0 0', border: `1px solid ${colors.border.default}`, padding: '24px 20px 40px', width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto', boxShadow: '0 -24px 64px rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: colors.text[900] }}>{isEdit ? 'Editar empleado' : 'Nuevo empleado'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text[500], padding: 4 }}><IconX width={18} height={18} /></button>
        </div>
        {iField('Nombre completo', 'name', 'text', 'Ej: Juan García')}
        {iField('Email', 'email', 'email', 'juan@empresa.com')}
        {iField('Teléfono', 'telefono', 'tel', '+34 600 000 000')}
        {iField('Inicio de contrato', 'fechaInicioContrato', 'date')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {iField('Inicio del turno', 'turnoInicio', 'time')}
          {iField('Fin del turno', 'turnoFin', 'time')}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>Ajuste días de vacaciones</div>
          <input
            type="number" min={-365} max={365} step={0.5}
            value={form.vacacionesExtra}
            onChange={e => setF('vacacionesExtra', parseFloat(e.target.value) || 0)}
            placeholder="0"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1px solid ${colors.border.default}`, background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
          />
          <div style={{ fontSize: 11, color: colors.text[500], marginTop: 4 }}>
            Días extra o descuento sobre los generados por antigüedad (positivo = más días, negativo = descuento).
          </div>
        </div>
        <label style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'11px 12px', borderRadius:10, border:`1px solid ${colors.border.default}`, background:form.crearTurnos ? colors.primary.dim : 'rgba(var(--uiv2-overlay-rgb),.04)', cursor:'pointer' }}>
          <input type="checkbox" checked={form.crearTurnos} onChange={e => setF('crearTurnos', e.target.checked)} style={{ marginTop:2, accentColor:colors.primary.base }}/>
          <span><strong style={{ display:'block', fontSize:12.5, color:colors.text[900] }}>Crear turnos laborables</strong><small style={{ display:'block', marginTop:3, fontSize:11, color:colors.text[500] }}>Asigna este horario de lunes a viernes durante los próximos 45 días.</small></span>
        </label>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.4px' }}>Rol</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {ROLES.map(r => (
              <button key={r.value} onClick={() => setF('role', r.value)} style={{
                padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${form.role === r.value ? colors.primary.base : colors.border.default}`,
                background: form.role === r.value ? colors.primary.dim : 'rgba(var(--uiv2-overlay-rgb),.04)',
                color: form.role === r.value ? colors.primary.light : colors.text[700],
                fontSize: 13, fontWeight: form.role === r.value ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const,
              }}>{r.label}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>
            PIN numérico {isEdit ? '(vacío = no cambiar)' : ''}
          </div>
          <input type="password" inputMode="numeric" pattern="[0-9]*" value={form.pin}
            onChange={e => { if (/^\d*$/.test(e.target.value)) setF('pin', e.target.value) }}
            placeholder="4-6 dígitos" maxLength={6}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1px solid ${colors.border.default}`, background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none', letterSpacing: '0.3em' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>Centro de trabajo</div>
          {centros.length > 0 ? (
            <select value={form.centroTrabajo} onChange={e => setF('centroTrabajo', e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${colors.border.default}`, background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none' }}>
              <option value="">Sin asignar</option>
              {centros.map((c: string) => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <input type="text" value={form.centroTrabajo} onChange={e => setF('centroTrabajo', e.target.value)}
              placeholder="Ej: Oficina Central"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1px solid ${colors.border.default}`, background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
          )}
        </div>
        {obras.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.4px' }}>Obras asignadas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {obras.map((o: any) => (
                <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '7px 10px', borderRadius: 8, background: form.obrasAsignadas.includes(o.id) ? colors.primary.dim : 'rgba(var(--uiv2-overlay-rgb),.04)', border: `1px solid ${form.obrasAsignadas.includes(o.id) ? colors.primary.glow : colors.border.default}` }}>
                  <input type="checkbox" checked={form.obrasAsignadas.includes(o.id)} onChange={() => toggleObra(o.id)} style={{ accentColor: colors.primary.base }} />
                  <span style={{ fontSize: 13, color: colors.text[900] }}>{o.nombre || o.name || o.id}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <button onClick={handleSave} style={{ padding: '12px', borderRadius: 10, border: 'none', background: colors.primary.base, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 }}>
          {isEdit ? 'Guardar cambios' : 'Crear empleado'}
        </button>
      </div>
    </div>
  )
}

function CentrosPage() {
  const db     = useAppStore(s => s.db) as any
  const saveDB = useAppStore(s => s.saveDB)
  const toast  = useAppStore(s => s.toast)
  const [newName, setNewName] = useState('')

  const centros: string[] = db.centrosTrabajo || db.config?.centros || []

  const addCentro = () => {
    const name = newName.trim()
    if (!name) return
    if (centros.includes(name)) { toast('Ya existe ese centro', 2000, 'warn'); return }
    saveDB(() => ({ centrosTrabajo: [...centros, name] }))
    setNewName('')
    toast('Centro creado', 2000, 'ok')
  }
  const removeCentro = (c: string) => {
    saveDB(() => ({ centrosTrabajo: centros.filter((x: string) => x !== c) }))
    toast('Centro eliminado', 2000, 'ok')
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: colors.text[900], marginBottom: 4 }}>Centros de trabajo</div>
        <div style={{ fontSize: 13, color: colors.text[500] }}>Gestiona los centros para asignar empleados y grupos.</div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCentro()}
          placeholder="Nombre del centro…"
          style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: `1px solid ${colors.border.default}`, background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
        <button onClick={addCentro} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: colors.primary.base, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconPlus width={14} height={14} /> Añadir
        </button>
      </div>
      {centros.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: colors.text[500], fontSize: 13, background: 'rgba(var(--uiv2-overlay-rgb),.03)', borderRadius: 12, border: `1px solid ${colors.border.subtle}` }}>
          No hay centros de trabajo. Crea el primero arriba.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {centros.map((c: string) => {
          const count = (db.employees || []).filter((e: any) => !e.baja && e.centroTrabajo === c).length
          return (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, background: 'rgba(var(--uiv2-overlay-rgb),.05)', border: `1px solid ${colors.border.default}` }}>
              <IconMapPin width={16} height={16} style={{ color: colors.primary.light, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: colors.text[900] }}>{c}</div>
              <div style={{ fontSize: 12, color: colors.text[500], marginRight: 4 }}>{count} empleado{count !== 1 ? 's' : ''}</div>
              <button onClick={() => removeCentro(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text[500], padding: 4, display: 'flex' }}><IconX width={16} height={16} /></button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Data helpers ──────────────────────────────────────────────────────────────

function fmtDate(ts?: string) {
  if (!ts) return ''
  try { return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) } catch { return '' }
}
function fmtTime(ts?: string) {
  if (!ts) return ''
  try { return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

function daysDiff(ts?: string) {
  if (!ts) return 999
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
}

// ─── Page wrappers ─────────────────────────────────────────────────────────────

function useRequestsActions() {
  const db      = useAppStore(s => s.db) as any
  const saveDB  = useAppStore(s => s.saveDB)
  const session = useAppStore(s => s.session)
  const toast   = useAppStore(s => s.toast)

  const approve = (id: string) => {
    const vac = (db.vacaciones || []).find((v: any) => v.id === id)
    if (!vac) return
    saveDB((freshDb: any) => {
      const nowIso = new Date().toISOString()
      const updated = (freshDb.vacaciones || []).map((v: any) =>
        v.id === id ? { ...v, estado: 'aprobada', resolvedAt: nowIso, _upd: nowIso } : v
      )
      const withAudit = auditLog(freshDb, 'Solicitud aprobada', vac.empName || '', session?.user?.name || 'Admin')
      const noti = { id: gid(), empId: vac.empId, action: 'Vacaciones aprobadas', detail: '', ts: new Date().toISOString(), leido: false }
      return { vacaciones: updated, audit: withAudit.audit, notis: [...(freshDb.notis || []), noti] }
    })
    if (vac.empId) queuePush(vac.empId, 'Vacaciones aprobadas', '', 'vacaciones', '/?go=emp:vacaciones')
    toast('Solicitud aprobada', 3000, 'ok')
  }

  const reject = (id: string) => {
    const vac = (db.vacaciones || []).find((v: any) => v.id === id)
    if (!vac) return
    saveDB((freshDb: any) => {
      const nowIso = new Date().toISOString()
      const updated = (freshDb.vacaciones || []).map((v: any) =>
        v.id === id ? { ...v, estado: 'rechazada', resolvedAt: nowIso, _upd: nowIso } : v
      )
      const withAudit = auditLog(freshDb, 'Solicitud rechazada', vac.empName || '', session?.user?.name || 'Admin')
      const noti = { id: gid(), empId: vac.empId, action: 'Vacaciones rechazadas', detail: '', ts: new Date().toISOString(), leido: false }
      return { vacaciones: updated, audit: withAudit.audit, notis: [...(freshDb.notis || []), noti] }
    })
    if (vac.empId) queuePush(vac.empId, 'Vacaciones rechazadas', '', 'vacaciones', '/?go=emp:vacaciones')
    toast('Solicitud rechazada', 3000, 'warn')
  }

  const resolveCorrection = async (id: string, estado: 'aprobada' | 'rechazada') => {
    const corr = (db.correccionesFichaje || []).find((c: any) => c.id === id)
    if (!corr) return
    const who = session?.user?.name || 'Admin'
    const nowIso = new Date().toISOString()
    const rec = (db.records || []).find((r: any) => r.id === corr.recId)
    let updatedRecord: any = null

    if (estado === 'aprobada') {
      if (!rec || !corr.propInicio) { toast('El fichaje original ya no existe', 4000, 'warn'); return }
      if (isRecordMonthLocked(db.cierres || [], rec.empId, rec.inicio)) { toast('Mes firmado y bloqueado. Reabre el cierre antes de aplicar la corrección.', 5000, 'warn'); return }
      const breaks = corr.propFin ? clipBreaksToWindow(rec.breaks || [], corr.propInicio, corr.propFin) : (rec.breaks || [])
      const device = currentDeviceLabel()
      const correction = { id:gid(), ts:nowIso, tipo:'solicitud_empleado', motivo:corr.motivo || 'Corrección solicitada', oldInicio:rec.inicio, oldFin:rec.fin, newInicio:corr.propInicio, newFin:corr.propFin || null, by:who, device, requestedDevice:corr.requestedDevice || null }
      const base = { ...rec, inicio:corr.propInicio, fin:corr.propFin || null, breaks, _upd:nowIso, modificado:true, aceptada:true, validado:true, rechazado:false, correcciones:[...(rec.correcciones || []), correction], validadoAt:nowIso, validadoBy:who }
      const calculated = calcSecs(base)
      updatedRecord = { ...base, workSecs:calculated.work, breakSecs:calculated.brk }
      try { await persistRecordRow(updatedRecord) } catch (error: any) {
        toast(`No se pudo aplicar la corrección: ${error?.message || 'error de sincronización'}`, 5000, 'warn')
        return
      }
    }

    saveDB((fresh: any) => {
      const correccionesFichaje = (fresh.correccionesFichaje || []).map((c: any) =>
        c.id === id ? { ...c, estado, resolvedAt:nowIso, resolvedBy:who, finalInicio:corr.propInicio, finalFin:corr.propFin, _upd:nowIso } : c
      )
      const records = updatedRecord
        ? (fresh.records || []).map((r: any) => r.id === corr.recId ? updatedRecord : r)
        : (fresh.records || [])
      const cierres = updatedRecord
        ? refreshUnsignedClosures(fresh.cierres || [], records, corr.empId, [rec.inicio, updatedRecord.inicio], nowIso)
        : (fresh.cierres || [])
      const noti = { id:gid(), empId:corr.empId, action:estado === 'aprobada' ? 'Corrección aprobada' : 'Corrección rechazada', detail:corr.motivo || '', ts:nowIso, leido:false }
      const withAudit = auditLog(fresh, estado === 'aprobada' ? 'correccion_aprobada' : 'correccion_rechazada', `${corr.empName}: ${corr.motivo || ''}`, who, {
        category:'jornada', entityType:'record', entityId:corr.recId, reason:corr.motivo || '', device:currentDeviceLabel(),
        before:rec ? { inicio:rec.inicio, fin:rec.fin, workSecs:rec.workSecs, breakSecs:rec.breakSecs } : null,
        after:updatedRecord ? { inicio:updatedRecord.inicio, fin:updatedRecord.fin, workSecs:updatedRecord.workSecs, breakSecs:updatedRecord.breakSecs } : { estado:'rechazada' },
      })
      return { correccionesFichaje, records, cierres, notis:[...(fresh.notis || []), noti], audit:withAudit.audit }
    })
    queuePush(corr.empId, estado === 'aprobada' ? 'Corrección aprobada' : 'Corrección rechazada', `Tu solicitud de corrección ha sido ${estado}.`, 'correccion', '/?tab=jornada')
    toast(estado === 'aprobada' ? 'Corrección aplicada y sincronizada' : 'Corrección rechazada', 3000, estado === 'aprobada' ? 'ok' : 'warn')
  }

  const vacationRows = useRequestsData(approve, reject)
  const correctionRows = (db.correccionesFichaje || []).map((c: any) => ({
    id:c.id,
    type:'Corrección de fichaje',
    employeeName:c.empName || '—',
    requestedOn:fmtDate(typeof c.ts === 'number' ? new Date(c.ts).toISOString() : c.ts),
    status:c.estado === 'aprobada' ? 'approved' : c.estado === 'rechazada' ? 'rejected' : 'pending',
    note:`${fmtTime(c.recInicio)}–${fmtTime(c.recFin)} → ${fmtTime(c.propInicio)}–${fmtTime(c.propFin)}${c.motivo ? ` · ${c.motivo}` : ''}`,
    onApprove:(corrId: string) => resolveCorrection(corrId, 'aprobada'),
    onReject:(corrId: string) => resolveCorrection(corrId, 'rechazada'),
  }))
  const rows = [...correctionRows, ...vacationRows]
  return { rows, approve, reject }
}

// ─── VacacionesAdminPage ───────────────────────────────────────────────────────

function VacacionesAdminPage() {
  const db      = useAppStore(s => s.db) as any
  const saveDB  = useAppStore(s => s.saveDB)
  const session = useAppStore(s => s.session)
  const toast   = useAppStore(s => s.toast)

  const emps = (db.employees || []).filter((e: any) => !e.baja && !e.isAdmin)

  const employees = emps.map((e: any) => {
    const vd = vacDataUtil(e.id, db)
    return { id: e.id, name: e.name || '', generated: vd.generated, used: vd.used, pending: vd.pending, available: vd.available, extra: vd.extra, months: vd.months }
  })

  const requests = [...(db.vacaciones || [])]
    .filter((v: any) => !v.tipo || v.tipo === 'vacaciones' || !v.tipo)
    .sort((a: any, b: any) => String(b.ts || '').localeCompare(String(a.ts || '')))
    .map((v: any) => ({
      id: v.id, empId: v.empId || '', empName: v.empName || '—',
      fechaInicio: v.fechaInicio || '', fechaFin: v.fechaFin || '',
      dias: v.dias || 0, estado: v.estado as 'pendiente' | 'aprobada' | 'rechazada',
      motivo: v.motivo, motivoRechazo: v.motivoRechazo,
    }))

  const onAdjust = (empId: string, extra: number) => {
    saveDB((fresh: any) => ({
      employees: (fresh.employees || []).map((e: any) =>
        e.id === empId ? { ...e, vacacionesExtra: extra } : e
      ),
    }))
    const emp = emps.find((e: any) => e.id === empId)
    if (emp) queuePush(empId, 'Saldo de vacaciones actualizado', `Tu administrador ha ajustado tu saldo de vacaciones.`, 'vacaciones', '/?go=emp:vacaciones')
    toast('Ajuste guardado', 2500, 'ok')
  }

  const onAssign = (empId: string, fechaInicio: string, fechaFin: string, motivo: string) => {
    const emp = emps.find((e: any) => e.id === empId)
    if (!emp) return
    const dias = Math.max(1, Math.round((new Date(fechaFin + 'T00:00:00').getTime() - new Date(fechaInicio + 'T00:00:00').getTime()) / 86400000) + 1)
    const who = session?.user?.name || 'Admin'
    const nowIso = new Date().toISOString()
    const vac = { id: gid(), empId, empName: emp.name, fechaInicio, fechaFin, dias, motivo: motivo || 'Vacaciones', estado: 'aprobada', ts: nowIso, _upd: nowIso, asignadoPor: who }
    saveDB((fresh: any) => {
      const noti = { id: gid(), empId, action: 'Vacaciones asignadas', detail: `${fechaInicio} → ${fechaFin}`, ts: nowIso, leido: false }
      const withAudit = auditLog(fresh, 'vacaciones_asignadas', `${emp.name}: ${fechaInicio}–${fechaFin}`, who)
      return { vacaciones: [...(fresh.vacaciones || []), vac], notis: [...(fresh.notis || []), noti], audit: withAudit.audit }
    })
    queuePush(empId, 'Vacaciones asignadas', `${fechaInicio} → ${fechaFin}`, 'vacaciones', '/?go=emp:vacaciones')
    toast('Vacaciones asignadas y aprobadas', 3000, 'ok')
  }

  const onApprove = (id: string) => {
    const vac = (db.vacaciones || []).find((v: any) => v.id === id)
    if (!vac) return
    const nowIso = new Date().toISOString()
    saveDB((fresh: any) => {
      const updated = (fresh.vacaciones || []).map((v: any) =>
        v.id === id ? { ...v, estado: 'aprobada', resolvedAt: nowIso, _upd: nowIso } : v
      )
      const withAudit = auditLog(fresh, 'Solicitud aprobada', vac.empName || '', session?.user?.name || 'Admin')
      const noti = { id: gid(), empId: vac.empId, action: 'Vacaciones aprobadas', detail: '', ts: nowIso, leido: false }
      return { vacaciones: updated, audit: withAudit.audit, notis: [...(fresh.notis || []), noti] }
    })
    if (vac.empId) queuePush(vac.empId, 'Vacaciones aprobadas', '', 'vacaciones', '/?go=emp:vacaciones')
    toast('Solicitud aprobada', 3000, 'ok')
  }

  const onReject = (id: string, motivoRechazo: string) => {
    const vac = (db.vacaciones || []).find((v: any) => v.id === id)
    if (!vac) return
    const nowIso = new Date().toISOString()
    saveDB((fresh: any) => {
      const updated = (fresh.vacaciones || []).map((v: any) =>
        v.id === id ? { ...v, estado: 'rechazada', motivoRechazo: motivoRechazo || '', resolvedAt: nowIso, _upd: nowIso } : v
      )
      const withAudit = auditLog(fresh, 'Solicitud rechazada', vac.empName || '', session?.user?.name || 'Admin')
      const noti = { id: gid(), empId: vac.empId, action: 'Vacaciones rechazadas', detail: motivoRechazo || '', ts: nowIso, leido: false }
      return { vacaciones: updated, audit: withAudit.audit, notis: [...(fresh.notis || []), noti] }
    })
    if (vac.empId) queuePush(vac.empId, 'Vacaciones rechazadas', motivoRechazo || '', 'vacaciones', '/?go=emp:vacaciones')
    toast('Solicitud rechazada', 3000, 'warn')
  }

  const onDelete = (id: string) => {
    saveDB((fresh: any) => ({ vacaciones: (fresh.vacaciones || []).filter((v: any) => v.id !== id) }))
    toast('Solicitud eliminada', 2500, 'warn')
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <VacacionesPage employees={employees} requests={requests} onAdjust={onAdjust} onAssign={onAssign} onApprove={onApprove} onReject={onReject} onDelete={onDelete} />
    </Suspense>
  )
}

function DashboardPage({ onNavigate }: { onNavigate: (id: string) => void }) {
  const data = useDashboardData()
  const db = useAppStore(s => s.db) as any
  const toast = useAppStore(s => s.toast)
  const session = useAppStore(s => s.session) as any
  const setScreen = useAppStore(s => s.setScreen)
  const { rows: reqRows } = useRequestsActions()
  const pendingCount = reqRows.filter((r: any) => r.status === 'pending').length
  const expiringDocs = (db.documentos || []).filter((d: any) => {
    if (!d.expiresOn) return false
    const days = (new Date(`${d.expiresOn}T23:59:59`).getTime() - Date.now()) / 86400000
    return days <= 30
  }).length
  const ownOpenRecord = session?.user?.id
    ? (db.records || []).find((r: any) => r.empId === session.user.id && !r.fin)
    : null
  const canClockOwnShift = !!session?.user?.id
  const ownShiftStatus = canClockOwnShift ? {
    statusLabel: ownOpenRecord ? (ownOpenRecord.enDescanso ? 'En descanso' : 'Jornada en curso') : 'Jornada sin iniciar',
    time: ownOpenRecord?.inicio
      ? `Entrada ${new Date(ownOpenRecord.inicio).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })}`
      : 'Abre Mi jornada para fichar',
    tone: (ownOpenRecord?.enDescanso ? 'orange' : ownOpenRecord ? 'green' : 'primary') as 'orange' | 'green' | 'primary',
  } : undefined

  const handleExport = () => {
    const now = new Date()
    const dow = now.getDay()
    const monday = new Date(now); monday.setDate(now.getDate() - ((dow + 6) % 7)); monday.setHours(0,0,0,0)
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999)
    const emps = (db.employees || []).filter((e: any) => !e.isAdmin)
    const weekRecs = (db.records || []).filter((r: any) => {
      if (!r.fin || !r.inicio) return false
      const d = new Date(r.inicio)
      return d >= monday && d <= sunday
    })
    const rows = weekRecs.map((r: any) => {
      const emp = emps.find((e: any) => e.id === r.empId)
      const mins = Math.round(recWorkSecs(r) / 60)
      // localDateStr(new Date(r.inicio)) (no r.inicio.slice(0,10)): inicio se
      // guarda en UTC — un fichaje nocturno mostraba la fecha del día siguiente.
      return [
        emp?.name || r.empName || '',
        r.centro || emp?.centroTrabajo || '',
        localDateStr(new Date(r.inicio)),
        new Date(r.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        new Date(r.fin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        `${Math.floor(mins/60)}h${mins%60>0?Math.floor(mins%60)+'m':''}`,
      ]
    })
    downloadCsv(['Empleado', 'Centro', 'Fecha', 'Entrada', 'Salida', 'Horas'], rows, `semana-${localDateStr(monday)}.csv`)
    toast(`CSV semana descargado — ${weekRecs.length} fichajes`, 3000, 'ok')
  }

  const teamAvatars = useMemo(() => {
    const emps = (db.employees || []).filter((e: any) => !e.baja && !e.isAdmin)
    const liveIds = new Set((db.records || []).filter((r: any) => !r.fin).map((r: any) => r.empId))
    const pauseIds = new Set((db.records || []).filter((r: any) => !r.fin && r.enDescanso).map((r: any) => r.empId))
    const active = emps.filter((e: any) => liveIds.has(e.id))
    const rest = emps.filter((e: any) => !liveIds.has(e.id))
    const shown = [...active, ...rest].slice(0, 6)
    const extra = Math.max(0, emps.length - shown.length)
    return { shown, extra, activeCount: active.length, pauseCount: pauseIds.size, total: emps.length }
  }, [db.records, db.employees])

  const nextVacRequest = useMemo(() => {
    const pending = (db.vacaciones || []).filter((v: any) => v.estado === 'pendiente')
    if (!pending.length) return undefined
    const v = pending[0]
    return { label: `${v.empName || 'Empleado'} — ${v.tipo || 'Vacaciones'}`, time: v.fechaInicio ? new Date(v.fechaInicio).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'Pendiente' }
  }, [db.vacaciones])

  const kpiIcons = [
    <IconUsers width={16} height={16} />,
    <IconClock width={16} height={16} />,
    <IconCheck width={16} height={16} />,
    <IconTrendUp width={16} height={16} />,
    <IconClipboard width={16} height={16} />,
  ]
  const kpiDestinations = ['empleados', 'en_linea', 'en_linea', 'empleados', 'fichajes']

  const kpisWithExtra = data.kpis.map((k, i) => ({
    ...k,
    icon: kpiIcons[i],
    tone: (k as any).tone ?? (['primary', 'accent', 'cyan', 'cyan', 'amber'] as const)[i],
    onClick: () => onNavigate(kpiDestinations[i] || 'dashboard'),
  }))
  const widgetIds = ['employees', 'working', 'break', 'absent', 'hoursToday']
  const legacyWidgetIds: Record<string, string> = { validation: 'break', requests: 'absent', coverage: 'hoursToday' }
  const visibleWidgets: string[] = (db.config?.adminDashboard?.visibleWidgets || widgetIds)
    .map((id: string) => legacyWidgetIds[id] || id)
  const visibleKpis = visibleWidgets
    .map(id => kpisWithExtra[widgetIds.indexOf(id)])
    .filter(Boolean)

  return (
    <Dashboard
      {...data}
      greetingSub="Aquí tienes el resumen de tu equipo."
      kpis={visibleKpis}
      trend={data.trend}
      compareTrend={data.compareTrend}
      activity={data.activity.map(item => ({ ...item, onClick: () => onNavigate('auditoria') }))}
      nextEvent={nextVacRequest ? { ...nextVacRequest, onClick: () => onNavigate('solicitudes') } : undefined}
      fichaje={ownShiftStatus ? { ...ownShiftStatus, onClick: () => setScreen('emp') } : undefined}
      teamSlot={{ ...teamAvatars, onClick: () => onNavigate('en_linea') }}
      onTrendClick={() => onNavigate('estadisticas')}
      onExport={handleExport}
      quickActions={canClockOwnShift ? (
        <button className="ti-dashboard-button" type="button" onClick={() => setScreen('emp')}>
          <IconClock width={16} height={16} /> Mi jornada
        </button>
      ) : undefined}
      quickLinks={[
        { id: 'pendientes',  label: 'Centro de pendientes', value: 'Revisar', onClick: () => onNavigate('pendientes') },
        { id: 'empleados',   label: 'Empleados activos', value: `${teamAvatars.activeCount}/${teamAvatars.total}`, onClick: () => onNavigate('empleados') },
        { id: 'fichajes',    label: 'Trabajando ahora',  value: data.kpis[1]?.value || '0', onClick: () => onNavigate('fichajes') },
        { id: 'solicitudes', label: 'Solicitudes pend.', value: String(pendingCount), onClick: () => onNavigate('solicitudes') },
        { id: 'documentos',  label: 'Documentos a revisar', value: String(expiringDocs), onClick: () => onNavigate('documentos') },
        { id: 'estadisticas',label: 'Estadísticas',      value: 'Ver', onClick: () => onNavigate('estadisticas') },
      ]}
    />
  )
}

function RequestsPage({ onOpenEmployee }: { onOpenEmployee: (name: string) => void }) {
  const { rows } = useRequestsActions()
  return <Requests rows={rows} onOpen={row => onOpenEmployee(row.employeeName)} />
}

function NotificationsPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { items, markRead, markAllRead, dismiss } = useNotificationsData()
  return <Notifications items={items} onMarkRead={markRead} onMarkAllRead={markAllRead} onDismiss={dismiss} onOpen={item => { markRead(item.id); onNavigate(item.destination || 'auditoria') }} />
}

function EmployeesPage({ onViewTimesheets }: { onViewTimesheets?: (id: string) => void }) {
  const rows   = useEmployeesData()
  const db     = useAppStore(s => s.db) as any
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; emp: EmpForm } | null>(null)

  const openEdit = (id: string) => {
    const emp = (db.employees || []).find((e: any) => e.id === id)
    if (!emp) return
    const role = emp.role || (emp.isAdmin ? 'admin' : emp.isEnc ? 'encargado' : emp.isJO ? 'jefe_obra' : 'empleado')
    setModal({ mode: 'edit', emp: {
      id: emp.id, name: emp.name || '', email: emp.email || '',
      role, pin: '', pinLen: emp.pinLen || null,
      centroTrabajo: emp.centroTrabajo || '', telefono: emp.telefono || '',
      obrasAsignadas: emp.obrasAsignadas || [],
      fechaInicioContrato: emp.fechaInicioContrato || emp.contractStart || '',
      turnoInicio: emp.turnoInicio || emp.shiftStart || '08:00',
      turnoFin: emp.turnoFin || emp.shiftEnd || '16:00',
      crearTurnos: false,
      vacacionesExtra: emp.vacacionesExtra || 0,
    }})
  }

  return (
    <>
      <Employees rows={rows} onAdd={() => setModal({ mode: 'create' })} onEdit={openEdit} onViewTimesheets={onViewTimesheets} />
      {modal && (
        <EmployeeModal initial={modal.mode === 'edit' ? modal.emp : undefined} onClose={() => setModal(null)} />
      )}
    </>
  )
}

function TimesheetsPage({ initialSearch = '', onSearchChange }: { initialSearch?: string; onSearchChange?: (s: string) => void }) {
  const [search, setSearch] = useState(initialSearch)
  const db = useAppStore(s => s.db) as any
  const saveDB = useAppStore(s => s.saveDB)
  const session = useAppStore(s => s.session)
  const toast = useAppStore(s => s.toast)
  const rows = useTimesheetsData(search)
  const handleSearch = (s: string) => { setSearch(s); onSearchChange?.(s) }

  const modify = async (id: string, entry: string, exit: string, reason: string) => {
    const rec = (db.records || []).find((r: any) => r.id === id)
    if (!rec) return false
    if (isRecordMonthLocked(db.cierres || [], rec.empId, rec.inicio)) { toast('Mes firmado y bloqueado. Reabre el cierre antes de modificarlo.', 5000, 'warn'); return false }
    const times = recordTimesFromClock(rec, entry, exit)
    if (!times) { toast('Introduce horas válidas', 3000, 'warn'); return false }
    const { inicio, fin } = times
    const breaks = clipBreaksToWindow(rec.breaks || [], inicio, fin)
    const calculated = calcSecs({ ...rec, inicio: inicio.toISOString(), fin: fin.toISOString(), breaks })
    const nowIso = new Date().toISOString()
    const device = currentDeviceLabel()
    const updated = { ...rec, inicio: inicio.toISOString(), fin: fin.toISOString(), breaks, workSecs: calculated.work, breakSecs: calculated.brk, aceptada:true, validado:true, rechazado:false, modificado:true, _upd:nowIso, validadoAt:nowIso, validadoBy:session?.user?.name || 'Encargado', correcciones:[...(rec.correcciones || []), { id:gid(), ts:nowIso, tipo:'admin', motivo:reason, oldInicio:rec.inicio, oldFin:rec.fin, newInicio:inicio.toISOString(), newFin:fin.toISOString(), by:session?.user?.name || 'Encargado', device }] }
    try {
      await persistRecordRow(updated)
      saveDB((fresh:any) => {
        const records = (fresh.records || []).map((r:any) => r.id === id ? updated : r)
        const cierres = refreshUnsignedClosures(fresh.cierres || [], records, rec.empId, [rec.inicio, updated.inicio], nowIso)
        const withAudit = auditLog(fresh, 'Fichaje modificado', `${rec.empName || rec.empId}: ${fmtTime(rec.inicio)}–${fmtTime(rec.fin)} → ${entry}–${exit} · ${reason}`, session?.user?.name || 'Encargado', {
          category:'jornada', entityType:'record', entityId:rec.id, reason, device,
          before:{ inicio:rec.inicio, fin:rec.fin, workSecs:rec.workSecs, breakSecs:rec.breakSecs },
          after:{ inicio:updated.inicio, fin:updated.fin, workSecs:updated.workSecs, breakSecs:updated.breakSecs },
        })
        return { records, cierres, audit:withAudit.audit }
      })
      toast('Fichaje modificado y sincronizado', 3000, 'ok')
      return true
    } catch (error:any) { toast(`No se pudo modificar: ${error?.message || 'error de sincronización'}`, 5000, 'warn'); return false }
  }

  const remove = async (id: string, reason: string) => {
    const rec = (db.records || []).find((r:any) => r.id === id)
    if (rec && isRecordMonthLocked(db.cierres || [], rec.empId, rec.inicio)) { toast('Mes firmado y bloqueado. Reabre el cierre antes de eliminarlo.', 5000, 'warn'); return false }
    if (!rec || !window.confirm('¿Eliminar este fichaje? Esta acción no se puede deshacer.')) return false
    try {
      await deleteRecordRow(id)
      const nowIso = new Date().toISOString()
      saveDB((fresh:any) => {
        const records = (fresh.records || []).filter((r:any) => r.id !== id)
        const cierres = refreshUnsignedClosures(fresh.cierres || [], records, rec.empId, [rec.inicio], nowIso)
        const withAudit = auditLog(fresh, 'Fichaje eliminado', `${rec.empName || rec.empId}: ${fmtDate(rec.inicio)} ${fmtTime(rec.inicio)}–${fmtTime(rec.fin)} · ${reason}`, session?.user?.name || 'Encargado', {
          category:'jornada', entityType:'record', entityId:rec.id, reason,
          before:{ inicio:rec.inicio, fin:rec.fin, workSecs:rec.workSecs, breakSecs:rec.breakSecs }, after:null,
        })
        return { records, cierres, audit:withAudit.audit }
      })
      toast('Fichaje eliminado y sincronizado', 3000, 'ok')
      return true
    } catch (error:any) { toast(`No se pudo eliminar: ${error?.message || 'error de sincronización'}`, 5000, 'warn'); return false }
  }

  return <Timesheets rows={rows} search={search} onSearchChange={handleSearch} onModify={modify} onDelete={remove} />
}

function PlanningPage({ onOpenEmployee }: { onOpenEmployee: (employeeId: string) => void }) {
  const db = useAppStore(s => s.db) as any
  const [weekOffset, setWeekOffset] = useState(0)

  const { weekLabel, days, employees } = useMemo(() => {
    // Build Mon-Sun for current week + offset
    const now = new Date()
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1 // 0=Mon
    const monday = new Date(now)
    monday.setDate(now.getDate() - dayOfWeek + weekOffset * 7)
    monday.setHours(0, 0, 0, 0)

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      return d
    })
    const days = weekDays.map(d => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }))
    const weekLabel = `${weekDays[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`

    const emps = (db.employees || []).filter((e: any) => !e.isAdmin && !e.baja)
    const records = db.records || []

    const employees = emps.map((e: any) => ({
      id: e.id,
      name: e.name,
      dept: e.dept || e.centroTrabajo || '',
      week: weekDays.map(d => {
        const isFuture = d > now && d.toDateString() !== now.toDateString()
        const dateStr = localDateStr(d)
        const dayRecs = records.filter((r: any) => r.empId === e.id && r.inicio && localDateStr(new Date(r.inicio)) === dateStr)
        const isWeekend = d.getDay() === 0 || d.getDay() === 6
        if (!dayRecs.length && isWeekend) return { status: 'weekend' as const }
        if (!dayRecs.length && isFuture)  return { status: 'future' as const }
        if (!dayRecs.length) return { status: 'absent' as const }
        const live = dayRecs.some((r: any) => !r.fin)
        if (live) return { status: 'live' as const, value: fmtTime(dayRecs[0]?.inicio) }
        // calculate hours
        const mins = dayRecs.reduce((s: number, r: any) => {
          if (!r.inicio || !r.fin) return s
          return s + recWorkSecs(r) / 60
        }, 0)
        const h = Math.floor(mins / 60)
        const m = Math.floor(mins % 60)
        return { status: 'ok' as const, value: `${h}h${m > 0 ? m + 'm' : ''}` }
      }),
    }))

    return { weekLabel, days, employees }
  }, [db, weekOffset])

  return (
    <Planning
      weekLabel={weekLabel}
      days={days}
      employees={employees}
      onPrev={() => setWeekOffset(o => o - 1)}
      onNext={() => setWeekOffset(o => o + 1)}
      onToday={() => setWeekOffset(0)}
      onOpenEmployee={onOpenEmployee}
    />
  )
}

function ShiftsPage({ onOpenEmployee }: { onOpenEmployee: (employeeId: string) => void }) {
  const db = useAppStore(s => s.db) as any
  const [weekOffset, setWeekOffset] = useState(0)

  const { weekLabel, employees } = useMemo(() => {
    const now = new Date()
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1
    const monday = new Date(now)
    monday.setDate(now.getDate() - dayOfWeek + weekOffset * 7)
    monday.setHours(0, 0, 0, 0)

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      return d
    })
    const days = weekDays.map(d => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }))
    const weekLabel = `${weekDays[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`

    const emps = (db.employees || []).filter((e: any) => !e.isAdmin && !e.baja)
    const turnos = db.turnos || []

    const employees = emps.map((e: any) => ({
      id: e.id,
      name: e.name,
      dept: e.dept || e.centroTrabajo || '',
      week: weekDays.map(d => {
        const isWeekend = d.getDay() === 0 || d.getDay() === 6
        if (isWeekend) return { status: 'weekend' as const }
        const dateStr = localDateStr(d)
        const turno = turnos.find((t: any) => t.empId === e.id && t.fecha === dateStr)
        if (!turno) return {}
        return {
          type: (turno.tipo === 'guardia' || turno.tipo === 'vacaciones' || turno.tipo === 'libre' ? turno.tipo : 'normal') as 'normal' | 'guardia' | 'vacaciones' | 'libre',
          start: turno.horaInicio || undefined,
          end: turno.horaFin || undefined,
        }
      }),
    }))

    return { weekLabel, days, employees }
  }, [db, weekOffset])

  return (
    <Shifts
      weekLabel={weekLabel}
      employees={employees}
      onPrev={() => setWeekOffset(o => o - 1)}
      onNext={() => setWeekOffset(o => o + 1)}
      onToday={() => setWeekOffset(0)}
      onOpenEmployee={onOpenEmployee}
    />
  )
}

function ValidateHoursPage() {
  const db = useAppStore(s => s.db) as any
  const session = useAppStore(s => s.session)
  const saveDB  = useAppStore(s => s.saveDB)
  const toast   = useAppStore(s => s.toast)

  const rows = useMemo(() => {
    const records: any[] = (db.records || [])
      .filter((r: any) => r.fin && r.inicio)
      .filter((r: any) => daysDiff(r.inicio) <= 14)
      .sort((a: any, b: any) => String(b.inicio || '').localeCompare(String(a.inicio || '')))
      .slice(0, 60)

    return records.map((r: any) => {
      const emp = (db.employees || []).find((e: any) => e.id === r.empId)
      const worked = recWorkSecs(r) / 60
      const expected = Number(db.config?.wdMin) || 480
      const diff = worked - expected
      const absDiffMin = Math.abs(diff)
      const diffH = Math.floor(absDiffMin / 60)
      const diffM = Math.floor(absDiffMin % 60)
      const diffStr = diff === 0 ? '0h' : `${diff > 0 ? '+' : '-'}${diffH}h${diffM > 0 ? diffM + 'm' : ''}`
      return {
        id: r.id,
        empName: emp?.name || r.empId,
        dept: emp?.dept || emp?.centroTrabajo || '',
        date: fmtDate(r.inicio),
        entry: fmtTime(r.inicio),
        exit: fmtTime(r.fin),
        worked: `${Math.floor(worked / 60)}h${Math.floor(worked % 60)}m`,
        expected: mhm(expected),
        diff: diffStr,
        diffTone: Math.abs(diff) < 15 ? 'ok' : diff > 0 ? 'over' : 'under',
        status: (r.aceptada || r.validado) ? 'approved' : r.rechazado ? 'rejected' : 'pending',
      } as any
    })
  }, [db.records, db.employees, db.config?.wdMin])

  const handleApprove = async (id: string) => {
    const rec = (db.records || []).find((r: any) => r.id === id)
    if (!rec) return
    const nowIso = new Date().toISOString()
    const updated = { ...rec, aceptada: true, validado: true, rechazado: false, validadoBy: session?.user?.name || 'Admin', validadoAt: nowIso, _upd: nowIso }
    try { await persistRecordRow(updated) } catch (error: any) {
      toast(`No se pudo validar: ${error?.message || 'error de sincronización'}`, 5000, 'warn')
      return
    }
    saveDB((fresh: any) => {
      const withAudit = auditLog(fresh, 'Jornada validada', `${rec.empName || rec.empId}: ${fmtDate(rec.inicio)}`, session?.user?.name || 'Admin', { category:'jornada', entityType:'record', entityId:rec.id, before:{ validado:!!rec.validado }, after:{ validado:true } })
      return { records: (fresh.records || []).map((r: any) => r.id === id ? updated : r), audit:withAudit.audit }
    })
    toast('Jornada validada', 2500, 'ok')
  }

  const handleReject = async (id: string) => {
    const rec = (db.records || []).find((r: any) => r.id === id)
    if (!rec) return
    const nowIso = new Date().toISOString()
    const updated = { ...rec, aceptada: false, rechazado: true, validado: false, validadoBy: session?.user?.name || 'Admin', validadoAt: nowIso, _upd: nowIso }
    try { await persistRecordRow(updated) } catch (error: any) {
      toast(`No se pudo rechazar: ${error?.message || 'error de sincronización'}`, 5000, 'warn')
      return
    }
    saveDB((fresh: any) => {
      const withAudit = auditLog(fresh, 'Jornada rechazada', `${rec.empName || rec.empId}: ${fmtDate(rec.inicio)}`, session?.user?.name || 'Admin', { category:'jornada', entityType:'record', entityId:rec.id, before:{ rechazado:!!rec.rechazado }, after:{ rechazado:true } })
      return { records: (fresh.records || []).map((r: any) => r.id === id ? updated : r), audit:withAudit.audit }
    })
    toast('Jornada rechazada', 2500, 'warn')
  }

  const handleModify = async (id: string, entry: string, exit: string) => {
    const rec = (db.records || []).find((r: any) => r.id === id)
    if (!rec) return
    if (isRecordMonthLocked(db.cierres || [], rec.empId, rec.inicio)) {
      toast('Mes firmado y bloqueado. Reabre el cierre antes de modificarlo.', 5000, 'warn')
      return
    }
    const times = recordTimesFromClock(rec, entry, exit)
    if (!times) {
      toast('Introduce una hora válida', 3000, 'warn')
      return
    }
    const { inicio: newInicio, fin: newFin } = times
    const breaks = clipBreaksToWindow(rec.breaks || [], newInicio, newFin)
    const recalculated = calcSecs({ ...rec, inicio: newInicio.toISOString(), fin: newFin.toISOString(), breaks })
    const nowIso = new Date().toISOString()
    const inicioIso = newInicio.toISOString()
    const finIso = newFin.toISOString()
    const correction = {
      id: gid(), ts: nowIso, tipo: 'admin', motivo: 'Corrección de horario desde Validar horas',
      oldInicio: rec.inicio, oldFin: rec.fin, newInicio: inicioIso, newFin: finIso,
      by: session?.user?.name || 'Admin',
      device: currentDeviceLabel(),
    }
    const correcciones = [...(rec.correcciones || []), correction]
    const updatedRec = { ...rec, inicio: inicioIso, fin: finIso, breaks, workSecs: recalculated.work, breakSecs: recalculated.brk, aceptada: true, validado: true, rechazado: false, modificado: true, correcciones, validadoBy: session?.user?.name || 'Admin', validadoAt: nowIso, _upd: nowIso }
    try {
      await persistRecordRow(updatedRec)
      saveDB((fresh: any) => {
        const records = (fresh.records || []).map((r: any) => r.id === id ? updatedRec : r)
        const cierres = refreshUnsignedClosures(fresh.cierres || [], records, rec.empId, [rec.inicio, inicioIso], nowIso)
        const withAudit = auditLog(fresh, 'Fichaje modificado', `${rec.empId}: ${entry}–${exit}`, session?.user?.name || 'Encargado', {
          category:'jornada', entityType:'record', entityId:rec.id, reason:correction.motivo, device:correction.device,
          before:{ inicio:rec.inicio, fin:rec.fin, workSecs:rec.workSecs, breakSecs:rec.breakSecs },
          after:{ inicio:updatedRec.inicio, fin:updatedRec.fin, workSecs:updatedRec.workSecs, breakSecs:updatedRec.breakSecs },
        })
        return {
          records,
          cierres,
          audit: withAudit.audit,
        }
      })
      toast('Horario modificado y sincronizado', 3000, 'ok')
    } catch (error: any) {
      console.error('[records] modify failed:', error)
      toast(`No se pudo guardar el horario: ${error?.message || 'error de sincronización'}`, 5000, 'warn')
    }
  }

  const handleDelete = async (id: string) => {
    const rec = (db.records || []).find((r: any) => r.id === id)
    if (rec && isRecordMonthLocked(db.cierres || [], rec.empId, rec.inicio)) {
      toast('Mes firmado y bloqueado. Reabre el cierre antes de eliminarlo.', 5000, 'warn')
      return
    }
    if (!rec || !window.confirm('¿Eliminar este fichaje? Esta acción no se puede deshacer.')) return
    try {
      await deleteRecordRow(id)
      const nowIso = new Date().toISOString()
      saveDB((fresh: any) => {
        const records = (fresh.records || []).filter((r: any) => r.id !== id)
        const cierres = refreshUnsignedClosures(fresh.cierres || [], records, rec.empId, [rec.inicio], nowIso)
        const withAudit = auditLog(fresh, 'Fichaje eliminado', `${rec.empId}: ${fmtDate(rec.inicio)}`, session?.user?.name || 'Encargado', {
          category:'jornada', entityType:'record', entityId:rec.id, reason:'Eliminación desde Validar horas',
          before:{ inicio:rec.inicio, fin:rec.fin, workSecs:rec.workSecs, breakSecs:rec.breakSecs }, after:null,
        })
        return { records, cierres, audit: withAudit.audit }
      })
      toast('Fichaje eliminado y sincronizado', 3000, 'ok')
    } catch (error: any) {
      console.error('[records] delete failed:', error)
      toast(`No se pudo eliminar: ${error?.message || 'error de sincronización'}`, 5000, 'warn')
    }
  }

  const handleBulkDecision = async (ids: string[], decision: 'approved' | 'rejected') => {
    const idSet = new Set(ids)
    const nowIso = new Date().toISOString()
    const actor = session?.user?.name || 'Admin'
    const candidates = (db.records || []).filter((record: any) => idSet.has(record.id))
    const updates = candidates.map((record: any) => ({
      ...record,
      aceptada: decision === 'approved',
      validado: decision === 'approved',
      rechazado: decision === 'rejected',
      validadoBy: actor,
      validadoAt: nowIso,
      _upd: nowIso,
    }))
    const results = await Promise.allSettled(updates.map((record: any) => persistRecordRow(record)))
    const successful = updates.filter((_: any, index: number) => results[index].status === 'fulfilled')
    if (!successful.length) { toast('No se pudo actualizar ninguna jornada', 4000, 'warn'); return }
    const successfulMap = new Map(successful.map((record: any) => [record.id, record]))
    saveDB((fresh: any) => {
      const nextRecords = (fresh.records || []).map((record: any) => successfulMap.get(record.id) || record)
      const withAudit = auditLog(fresh, decision === 'approved' ? 'Jornadas validadas en lote' : 'Jornadas rechazadas en lote', `${successful.length} registros`, actor, { category:'jornada', entityType:'record_batch', entityId:successful.map((record: any) => record.id).join(','), before:{ count:successful.length }, after:{ decision } })
      return { records:nextRecords, audit:withAudit.audit }
    })
    toast(`${successful.length} jornadas ${decision === 'approved' ? 'validadas' : 'rechazadas'}`, 2800, successful.length === updates.length ? 'ok' : 'warn')
  }

  return <ValidateHours rows={rows} weekLabel="Últimas 2 semanas" onApprove={handleApprove} onReject={handleReject} onModify={handleModify} onDelete={handleDelete} onApproveMany={ids => handleBulkDecision(ids, 'approved')} onRejectMany={ids => handleBulkDecision(ids, 'rejected')} />
}

function ExpensesPage({ onOpenEmployee }: { onOpenEmployee: (name: string) => void }) {
  const db      = useAppStore(s => s.db) as any
  const saveDB  = useAppStore(s => s.saveDB)
  const session = useAppStore(s => s.session)
  const toast   = useAppStore(s => s.toast)

  const catMap: Record<string, 'dieta' | 'transporte' | 'material' | 'otro'> = {
    dieta: 'dieta', comida: 'dieta', restaurante: 'dieta',
    transporte: 'transporte', gasolina: 'transporte', taxi: 'transporte', viaje: 'transporte',
    material: 'material', herramienta: 'material', equipo: 'material',
  }

  const items = useMemo(() => (db.gastos || []).map((g: any) => ({
    id: g.id,
    empName: g.empName || '—',
    category: catMap[(g.categoria || '').toLowerCase()] || 'otro',
    description: g.concepto || g.descripcion || '—',
    amount: Number(g.importe) || 0,
    date: fmtDate(g.ts || g.fecha),
    status: g.estado || 'pendiente',
  })), [db.gastos])

  const approve = (id: string) => {
    const g = (db.gastos || []).find((x: any) => x.id === id)
    if (!g) return
    const nowIso = new Date().toISOString()
    saveDB((freshDb: any) => {
      const updated = (freshDb.gastos || []).map((x: any) =>
        x.id === id ? { ...x, estado: 'aprobado', resolvedAt: nowIso, resolvedBy: session?.user?.name || 'Admin', _upd: nowIso } : x
      )
      const withAudit = auditLog(freshDb, 'Gasto aprobado', `${g.empName}: ${g.concepto} ${g.importe}€`, session?.user?.name || 'Admin')
      const noti = { id: gid(), empId: g.empId, action: 'Gasto aprobado', detail: `${g.concepto} · ${g.importe}€`, ts: nowIso, leido: false }
      return { gastos: updated, audit: withAudit.audit, notis: [...(freshDb.notis || []), noti] }
    })
    if (g.empId) queuePush(g.empId, 'Gasto aprobado', `${g.concepto} · ${g.importe}€`, 'gastos', '/?tab=perfil')
    toast('Gasto aprobado', 3000, 'ok')
  }

  const reject = (id: string) => {
    const g = (db.gastos || []).find((x: any) => x.id === id)
    if (!g) return
    const nowIso = new Date().toISOString()
    saveDB((freshDb: any) => {
      const updated = (freshDb.gastos || []).map((x: any) =>
        x.id === id ? { ...x, estado: 'rechazado', resolvedAt: nowIso, resolvedBy: session?.user?.name || 'Admin', _upd: nowIso } : x
      )
      const withAudit = auditLog(freshDb, 'Gasto rechazado', `${g.empName}: ${g.concepto}`, session?.user?.name || 'Admin')
      const noti = { id: gid(), empId: g.empId, action: 'Gasto rechazado', detail: `${g.concepto} · ${g.importe}€`, ts: nowIso, leido: false }
      return { gastos: updated, audit: withAudit.audit, notis: [...(freshDb.notis || []), noti] }
    })
    if (g.empId) queuePush(g.empId, 'Gasto rechazado', `${g.concepto} · ${g.importe}€`, 'gastos', '/?tab=perfil')
    toast('Gasto rechazado', 3000, 'warn')
  }

  const employees = useMemo(() =>
    (db.employees || []).filter((e: any) => !e.baja && !e.isAdmin).map((e: any) => ({ id: e.id, name: e.name || '' })),
    [db.employees])

  const addManual = (empId: string, concepto: string, importe: number, categoria: string, fecha: string) => {
    const emp = (db.employees || []).find((e: any) => e.id === empId)
    if (!emp) return
    const who = session?.user?.name || 'Admin'
    const nowIso = new Date().toISOString()
    const gasto = { id: gid(), empId, empName: emp.name, concepto, importe, categoria, fecha, estado: 'aprobado', ts: nowIso, resolvedAt: nowIso, resolvedBy: who, _upd: nowIso }
    saveDB((freshDb: any) => {
      const noti = { id: gid(), empId, action: 'Gasto registrado por administración', detail: `${concepto} · ${importe}€`, ts: nowIso, leido: false }
      const withAudit = auditLog(freshDb, 'Gasto manual añadido', `${emp.name}: ${concepto} ${importe}€`, who)
      return { gastos: [...(freshDb.gastos || []), gasto], notis: [...(freshDb.notis || []), noti], audit: withAudit.audit }
    })
    queuePush(empId, 'Gasto registrado', `${concepto} · ${importe}€`, 'gastos', '/?tab=perfil')
    toast('Gasto añadido y aprobado', 3000, 'ok')
  }

  return <Expenses items={items} employees={employees} onApprove={approve} onReject={reject} onOpen={item => onOpenEmployee(item.empName)} onAddManual={addManual} />
}

function DocumentsPage() {
  const db    = useAppStore(s => s.db) as any
  const saveDB = useAppStore(s => s.saveDB)
  const toast = useAppStore(s => s.toast)
  const uploadRef = useRef<HTMLInputElement>(null)
  const uploadMeta = useRef<{ empId: string; empName: string; tipo: string; expiresOn: string } | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadEmpId, setUploadEmpId] = useState('')
  const [uploadType, setUploadType] = useState('contrato')
  const [uploadExpiry, setUploadExpiry] = useState('')
  const employees = useMemo(() => (db.employees || []).filter((e: any) => !e.isAdmin && !e.baja), [db.employees])

  const catMap: Record<string, 'contrato' | 'nomina' | 'certificado' | 'otro'> = {
    contrato: 'contrato', nomina: 'nomina', nómina: 'nomina',
    certificado: 'certificado',
  }

  // Resuelve una URL utilizable: si el documento vive en Storage (subida
  // reciente), pide una URL firmada de corta duración; si no, usa el
  // base64/URL guardado directamente en el registro (documentos antiguos,
  // o si Storage no estaba disponible al subirlo).
  const resolveDocUrl = async (doc: any, filename?: string): Promise<string | null> => {
    if (doc.storagePath && supabase) {
      try {
        const { data, error } = await supabase.storage.from(DOCUMENTOS_BUCKET).createSignedUrl(doc.storagePath, 3600, filename ? { download: filename } : undefined)
        if (!error && data?.signedUrl) return data.signedUrl
      } catch { /* cae al respaldo de abajo */ }
    }
    return doc.url || doc.pdfData || doc.fileUrl || doc.data || null
  }

  const handleDownload = async (id: string) => {
    const doc = (db.documentos || []).find((d: any) => d.id === id)
    if (!doc) return
    const filename = doc.nombre || doc.name || `documento-${id}`
    const url = await resolveDocUrl(doc, filename)
    if (!url) { toast('Archivo no disponible (sin URL de descarga)', 3000, 'warn'); return }
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handlePreview = async (id: string) => {
    const doc = (db.documentos || []).find((d: any) => d.id === id)
    if (!doc) return
    const url = await resolveDocUrl(doc)
    if (!url) { toast('Vista previa no disponible', 3000, 'warn'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const items = useMemo(() => (db.documentos || []).map((d: any) => ({
    id: d.id,
    name: d.nombre || d.name || 'Documento',
    category: catMap[(d.tipo || d.category || '').toLowerCase()] || 'otro',
    empName: d.empName || '—',
    size: d.size || d.peso || '—',
    uploadedOn: fmtDate(d.ts || d.fecha || d.createdAt),
    expiresOn: d.expiresOn || '',
    onDownload: handleDownload,
    onPreview: handlePreview,
  })), [db.documentos])

  const requestUpload = () => {
    if (!employees.length) { toast('Primero debes crear un empleado', 3000, 'warn'); return }
    setUploadEmpId(employees[0].id)
    setUploadType('contrato')
    setUploadExpiry('')
    setUploadOpen(true)
  }

  const chooseFile = () => {
    const emp = employees.find((e: any) => e.id === uploadEmpId)
    if (!emp) { toast('Selecciona un empleado', 2500, 'warn'); return }
    uploadMeta.current = { empId: emp.id, empName: emp.name, tipo: uploadType, expiresOn: uploadExpiry }
    uploadRef.current?.click()
  }

  const readAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('read error'))
    reader.readAsDataURL(file)
  })

  const uploadFile = async (file?: File) => {
    const meta = uploadMeta.current
    if (!file || !meta) return
    if (file.size > 8 * 1024 * 1024) { toast('El archivo supera el máximo de 8 MB', 3500, 'warn'); return }
    const docId = gid()
    let storagePath: string | null = null
    let data: string | null = null
    // Igual que con los PDFs de cierre: preferimos Storage (cuota separada,
    // 1 GB) sobre guardar el archivo en base64 dentro del JSONB (se come la
    // cuota de base de datos, 500 MB). Si falla o no hay bucket todavía, cae
    // al comportamiento anterior para no bloquear la subida.
    if (supabase) {
      try {
        const path = `${meta.empId}/${docId}-${file.name}`
        const { error } = await supabase.storage.from(DOCUMENTOS_BUCKET).upload(path, file, { contentType: file.type, upsert: true })
        if (!error) storagePath = path
        else console.warn('[documentos] No se pudo subir a Storage, se guarda localmente:', error.message)
      } catch (uploadErr: any) {
        console.warn('[documentos] Error al subir a Storage, se guarda localmente:', uploadErr?.message)
      }
    }
    if (!storagePath) {
      try {
        data = await readAsDataUrl(file)
      } catch {
        toast('No se pudo leer el documento', 3000, 'warn')
        return
      }
    }
    const now = new Date().toISOString()
    saveDB((fresh: any) => ({ documentos: [...(fresh.documentos || []), {
      id: docId, empId: meta.empId, empName: meta.empName, tipo: meta.tipo,
      nombre: file.name, size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
      mime: file.type, storagePath, data, createdAt: now, expiresOn: meta.expiresOn || null, _upd: now,
    }] }))
    toast(`Documento subido a ${meta.empName}`, 3000, 'ok')
    uploadMeta.current = null
    setUploadOpen(false)
  }

  return <>
    <input ref={uploadRef} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={e => { uploadFile(e.target.files?.[0]); e.currentTarget.value = '' }} />
    <Documents items={items} onUpload={requestUpload} />
    {uploadOpen && (
      <div className="uiv2-sheet-overlay" onClick={() => setUploadOpen(false)} style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, background:'rgba(0,0,0,.68)', backdropFilter:'blur(8px)' }}>
        <div className="uiv2-sheet-panel" role="dialog" aria-modal="true" aria-label="Subir documento a empleado" onClick={e => e.stopPropagation()} style={{ width:'100%', maxWidth:440, padding:24, borderRadius:18, background:colors.bg[900], border:`1px solid ${colors.border.default}`, boxShadow:'0 24px 70px rgba(0,0,0,.5)', display:'grid', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <div><div style={{ fontSize:17, fontWeight:800, color:colors.text[900] }}>Subir documento</div><div style={{ marginTop:3, fontSize:12, color:colors.text[500] }}>Asigna el archivo al perfil correcto.</div></div>
            <button aria-label="Cerrar" onClick={() => setUploadOpen(false)} style={{ width:38, height:38, border:0, borderRadius:12, background:colors.bg[600], color:colors.text[700], cursor:'pointer' }}><IconX width={17} height={17}/></button>
          </div>
          <label style={{ display:'grid', gap:6, fontSize:11, fontWeight:700, color:colors.text[500], textTransform:'uppercase' }}>Empleado
            <select value={uploadEmpId} onChange={e => setUploadEmpId(e.target.value)} style={{ minHeight:46, padding:'0 12px', borderRadius:10, background:colors.bg[600], color:colors.text[900], border:`1px solid ${colors.border.default}` }}>
              {employees.map((e:any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
          <label style={{ display:'grid', gap:6, fontSize:11, fontWeight:700, color:colors.text[500], textTransform:'uppercase' }}>Tipo de documento
            <select value={uploadType} onChange={e => setUploadType(e.target.value)} style={{ minHeight:46, padding:'0 12px', borderRadius:10, background:colors.bg[600], color:colors.text[900], border:`1px solid ${colors.border.default}` }}>
              <option value="contrato">Contrato</option><option value="nomina">Nómina</option><option value="certificado">Certificado</option><option value="otro">Otro</option>
            </select>
          </label>
          <label style={{ display:'grid', gap:6, fontSize:11, fontWeight:700, color:colors.text[500], textTransform:'uppercase' }}>Fecha de caducidad (opcional)
            <input type="date" value={uploadExpiry} onChange={e => setUploadExpiry(e.target.value)} style={{ minHeight:46, padding:'0 12px', borderRadius:10, background:colors.bg[600], color:colors.text[900], border:`1px solid ${colors.border.default}` }} />
          </label>
          <button onClick={chooseFile} style={{ minHeight:48, display:'flex', alignItems:'center', justifyContent:'center', gap:7, border:0, borderRadius:12, background:colors.primary.base, color:'#fff', fontSize:14, fontWeight:750, cursor:'pointer' }}><IconPlus width={15} height={15}/> Seleccionar archivo</button>
          <div style={{ fontSize:11, color:colors.text[400], textAlign:'center' }}>PDF, Word, Excel o imagen · máximo 8 MB</div>
        </div>
      </div>
    )}
  </>
}

function ReportsPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const db = useAppStore(s => s.db) as any
  const toast = useAppStore(s => s.toast)
  const compliance = useMemo(() => buildComplianceSummary(db), [db.records, db.cierres])

  const months = useMemo(() => {
    const set = new Set<string>()
    ;(db.records || []).forEach((r: any) => {
      if (r.inicio) set.add(localMonthKey(r.inicio))
    })
    return [...set].sort().reverse().slice(0, 12)
  }, [db.records])

  const handleDownloadExcel = (mes: string) => {
    const [year, mon] = mes.split('-')
    const label = new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    const recs = (db.records || []).filter((r: any) => localMonthKey(r.inicio) === mes && r.fin)
    const emps = (db.employees || []).filter((e: any) => !e.isAdmin)
    const headers = ['Empleado', 'Centro', 'Fecha', 'Entrada', 'Salida', 'Horas trabajadas', 'Descanso (min)', 'Modificado', 'Historial de cambios']
    const rows = recs.map((r: any) => {
      const emp = emps.find((e: any) => e.id === r.empId)
      const mins = recWorkSecs(r) / 60
      const brk = Math.round((r.breakSecs || 0) / 60)
      const worked = Math.round(mins - brk)
      // localDateStr(new Date(r.inicio)) (no r.inicio.slice(0,10)): inicio se
      // guarda en UTC — un fichaje nocturno mostraba la fecha del día siguiente.
      return [
        emp?.name || r.empName || r.empId || '',
        r.centro || emp?.centroTrabajo || '',
        localDateStr(new Date(r.inicio)),
        new Date(r.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        new Date(r.fin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        `${Math.floor(worked / 60)}h ${worked % 60}m`,
        String(brk),
        r.correcciones?.length ? 'Sí' : 'No',
        (r.correcciones || []).map((c: any) => `${c.ts || ''} · ${c.by || '—'} · ${c.motivo || 'Sin motivo'} · ${c.device || 'Dispositivo no registrado'} · ${c.oldInicio || '—'}–${c.oldFin || '—'} → ${c.newInicio || '—'}–${c.newFin || '—'}`).join(' | '),
      ]
    })
    downloadXlsx(headers, rows, `fichajes-${mes}.xlsx`, label)
    toast(`Excel descargado — ${label}`, 3000, 'ok')
  }

  const handleDownload = async (mes: string) => {
    const [year, mon] = mes.split('-')
    const label = new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    const recs = (db.records || []).filter((r: any) => localMonthKey(r.inicio) === mes && r.fin)
    const emps = (db.employees || []).filter((e: any) => !e.isAdmin)

    const pdfLines: string[] = []
    emps.forEach((e: any) => {
      const empRecs = recs.filter((r: any) => r.empId === e.id)
      const mins = empRecs.reduce((s: number, r: any) =>
        s + recWorkSecs(r) / 60, 0)
      // localDateStr(new Date(r.inicio)) (no r.inicio.slice(0,10)): inicio se
      // guarda en UTC — un fichaje nocturno se contaba en el día siguiente.
      const days = new Set(empRecs.map((r: any) => localDateStr(new Date(r.inicio)))).size
      const h = Math.floor(mins / 60), m = Math.floor(mins % 60)
      pdfLines.push(`${e.name} | ${e.centroTrabajo || e.dept || '-'} | ${days} dias | ${h}h ${m}m`)
    })

    const totalMins = recs.reduce((s: number, r: any) =>
      s + recWorkSecs(r) / 60, 0)

    pdfLines.unshift(`Generado: ${new Date().toLocaleDateString('es-ES')}`)
    pdfLines.push(`TOTAL: ${Math.floor(totalMins / 60)}h ${Math.floor(totalMins % 60)}m | ${recs.length} fichajes`)
    const corrections = recs.flatMap((r: any) => (r.correcciones || []).map((c: any) => ({ record:r, correction:c })))
    if (corrections.length) {
      pdfLines.push('', `TRAZABILIDAD DE MODIFICACIONES (${corrections.length})`)
      corrections.forEach(({ record, correction: c }: any) => {
        const emp = emps.find((e: any) => e.id === record.empId)
        const oldRange = `${c.oldInicio ? new Date(c.oldInicio).toLocaleString('es-ES') : '—'}–${c.oldFin ? new Date(c.oldFin).toLocaleString('es-ES') : '—'}`
        const newRange = `${c.newInicio ? new Date(c.newInicio).toLocaleString('es-ES') : '—'}–${c.newFin ? new Date(c.newFin).toLocaleString('es-ES') : '—'}`
        pdfLines.push(`${emp?.name || record.empName || record.empId} | ${c.by || '—'} | ${c.motivo || 'Sin motivo'} | ${c.device || 'Dispositivo no registrado'} | ${oldRange} -> ${newRange}`)
      })
    }
    await downloadSimplePdf(`Informe mensual - ${label}`, pdfLines, `informe-${mes}.pdf`)
  }

  const handleExportAudit = () => {
    const auditRows = (db.audit || [])
      .slice()
      .sort((a: any, b: any) => String(a.ts || '').localeCompare(String(b.ts || '')))
      .map((entry: any) => [
        entry.ts ? new Date(entry.ts).toLocaleString('es-ES') : '',
        entry.action || '', entry.user || entry.who || '', entry.detail || entry.target || '',
        entry.category || '', entry.entityType || '', entry.entityId || '', entry.reason || '',
        entry.device || '', JSON.stringify(entry.before || ''), JSON.stringify(entry.after || ''),
      ])
    downloadCsv(
      ['Fecha', 'Acción', 'Usuario', 'Detalle', 'Categoría', 'Tipo', 'ID registro', 'Motivo', 'Dispositivo', 'Antes', 'Después'],
      auditRows,
      `auditoria-completa-${today()}.csv`,
    )
    toast('Auditoría completa exportada', 2500, 'ok')
  }

  const handleExportInspection = async () => {
    const employeesById = new Map<string, any>((db.employees || []).map((employee: any) => [employee.id, employee]))
    const cutoff = new Date(compliance.retentionCutoff).getTime()
    const retained = (db.records || [])
      .filter((record: any) => record.inicio && new Date(record.inicio).getTime() >= cutoff)
      .sort((a: any, b: any) => String(a.inicio).localeCompare(String(b.inicio)))
    const lines = [
      `Generado: ${new Date().toLocaleString('es-ES')}`,
      'Base legal: articulo 34.9 del Estatuto de los Trabajadores',
      `Indice documental: ${compliance.score}%`,
      `Registros conservados: ${compliance.retainedRecords}`,
      `Jornadas completas: ${compliance.completionPct}%`,
      `Trazabilidad de cambios: ${compliance.traceabilityPct}%`,
      `Registros validados: ${compliance.validationPct}%`,
      `Cierres firmados: ${compliance.closurePct}%`,
      '', 'DETALLE DE REGISTROS',
      ...retained.map((record: any) => {
        const employee = employeesById.get(record.empId) as any
        const workedMinutes = record.fin ? Math.round(recWorkSecs(record) / 60) : 0
        return `${localDateStr(new Date(record.inicio))} | ${employee?.name || record.empName || record.empId || '—'} | ${new Date(record.inicio).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })}-${record.fin ? new Date(record.fin).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' }) : 'ABIERTA'} | ${Math.floor(workedMinutes / 60)}h ${workedMinutes % 60}m | ${record.centro || employee?.centroTrabajo || '—'} | ${record.validado || record.aceptada ? 'VALIDADA' : 'PENDIENTE'} | ${(record.correcciones || []).length} cambios`
      }),
      '', 'RIESGOS DETECTADOS',
      ...compliance.risks.map((risk: any) => `${risk.label}: ${risk.count}`),
      '', 'INTEGRIDAD DE CIERRES FIRMADOS (SHA-256)',
      ...(db.cierres || [])
        .filter((cierre: any) => cierre.integrityHash)
        .map((cierre: any) => `${cierre.mes} · ${cierre.empName || employeesById.get(cierre.empId)?.name || cierre.empId}: ${cierre.integrityHash}`),
    ]
    await downloadSimplePdf('TIMES INC - Paquete de inspeccion', lines, `inspeccion-registro-horario-${today()}.pdf`)
    toast('Paquete de inspección generado', 3000, 'ok')
  }

  const handleExportPayroll = () => {
    const month = months[0] || localMonthKey(new Date())
    const employees = (db.employees || []).filter((employee: any) => !employee.isAdmin && !employee.baja)
    const monthRecords = (db.records || []).filter((record: any) => record.inicio && record.fin && localMonthKey(record.inicio) === month)
    const payrollRows = employees.map((employee: any) => {
      const records = monthRecords.filter((record: any) => record.empId === employee.id)
      const workedMinutes = Math.round(records.reduce((sum: number, record: any) => sum + recWorkSecs(record) / 60, 0))
      const regularMinutes = Math.min(workedMinutes, WM)
      const overtimeMinutes = Math.max(0, workedMinutes - WM)
      return [
        employee.id, employee.name || '', employee.email || '', employee.centroTrabajo || employee.dept || '',
        month, records.length, regularMinutes, overtimeMinutes,
        `${Math.floor(regularMinutes / 60)}:${String(regularMinutes % 60).padStart(2, '0')}`,
        `${Math.floor(overtimeMinutes / 60)}:${String(overtimeMinutes % 60).padStart(2, '0')}`,
      ]
    })
    downloadCsv(
      ['ID empleado', 'Empleado', 'Email', 'Centro', 'Mes', 'Jornadas', 'Minutos ordinarios', 'Minutos extra', 'Horas ordinarias', 'Horas extra'],
      payrollRows,
      `nomina-times-inc-${month}.csv`,
    )
    toast(`Exportación de nómina preparada · ${month}`, 2800, 'ok')
  }

  const rows = useMemo(() => months.map((m) => {
    const [year, mon] = m.split('-')
    const label = new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    // localMonthKey ya normaliza a mes local — evita el mismo bug UTC-vs-local
    // que r.inicio?.startsWith(m) reproduciría con fichajes nocturnos.
    const recs = (db.records || []).filter((r: any) => r.inicio && localMonthKey(r.inicio) === m && r.fin)
    const totalMins = recs.reduce((s: number, r: any) => {
      if (!r.inicio || !r.fin) return s
      return s + recWorkSecs(r) / 60
    }, 0)
    const empCount = new Set(recs.map((r: any) => r.empId)).size
    return {
      id: m,
      name: `Informe mensual · ${label}`,
      description: `${empCount} empleados · ${Math.round(totalMins / 60)}h totales`,
      generatedOn: label,
      onDownload: handleDownload,
      onDownloadExcel: handleDownloadExcel,
    }
  }), [months, db.records])

  return <Reports rows={rows} compliance={compliance} onExportInspection={handleExportInspection} onExportAudit={handleExportAudit} onExportPayroll={handleExportPayroll} onNavigate={onNavigate} />
}

function StatsPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const db = useAppStore(s => s.db) as any

  const { kpis, bars, centrosBars, donut, rawSlices } = useMemo(() => {
    const allRecs = (db.records || []).filter((r: any) => r.fin && r.inicio)
    const thisMonth = localMonthKey(new Date())
    // localMonthKey(r.inicio) (no r.inicio.startsWith(thisMonth)): inicio se
    // guarda en UTC — evita atribuir un fichaje nocturno al mes siguiente.
    const monthRecs = allRecs.filter((r: any) => localMonthKey(r.inicio) === thisMonth)
    const emps = (db.employees || []).filter((e: any) => !e.isAdmin && !e.baja)
    const employeesById = new Map(emps.map((employee: any) => [employee.id, employee]))
    const minutesByEmployee = new Map<string, number>()
    const centroMap = new Map<string, number>()
    const distribution = { full: 0, partial: 0, long: 0 }
    let totalMins = 0

    for (const record of monthRecs) {
      const minutes = recWorkSecs(record) / 60
      totalMins += minutes
      minutesByEmployee.set(record.empId, (minutesByEmployee.get(record.empId) || 0) + minutes)
      const employee = employeesById.get(record.empId) as any
      const centro = record.centro || employee?.centroTrabajo || 'Sin asignar'
      centroMap.set(centro, (centroMap.get(centro) || 0) + minutes)
      if (minutes >= 420 && minutes <= 540) distribution.full += 1
      else if (minutes > 0 && minutes < 420) distribution.partial += 1
      else if (minutes > 540) distribution.long += 1
    }
    const empCount = emps.length || 1
    const monthlyExtraMin = [...minutesByEmployee.values()]
      .reduce((sum, employeeMinutes) => sum + Math.max(0, employeeMinutes - WM), 0)

    const kpis = [
      { label: 'Horas este mes', value: `${Math.floor(totalMins / 60)}h`, tone: 'primary' as const },
      { label: 'Horas extra del mes', value: mhm(monthlyExtraMin), tone: monthlyExtraMin > 0 ? 'amber' as const : 'accent' as const },
      { label: 'Empleados activos', value: String(empCount), tone: 'cyan' as const },
      { label: 'Fichajes totales', value: String(monthRecs.length), tone: 'amber' as const },
    ]

    // Hours per employee bar
    const bars = emps.slice(0, 8).map((e: any) => {
      const empMins = minutesByEmployee.get(e.id) || 0
      const maxPossible = WM
      return { label: e.name?.split(' ')[0] || e.id, value: Math.min(100, Math.round(empMins / maxPossible * 100)) }
    })

    // Hours per centro de trabajo
    const centrosBars = [...centroMap.entries()]
      .map(([label, mins]) => ({ label, value: Math.round(mins / 60) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)

    const rawSlices = [
      { label: 'Jornada completa', value: distribution.full, color: colors.semantic.green },
      { label: 'Jornada parcial', value: distribution.partial, color: colors.semantic.orange },
      { label: 'Jornada larga', value: distribution.long, color: colors.primary.base },
    ]
    const sliceTotal = rawSlices.reduce((s, x) => s + x.value, 0) || 1
    const donut = {
      slices: rawSlices.map(s => ({ label: s.label, pct: Math.round(s.value / sliceTotal * 100), color: s.color })),
      centerValue: String(monthRecs.length),
      centerLabel: 'fichajes',
    }

    return { kpis, bars, centrosBars, donut, rawSlices }
  }, [db.records, db.employees])

  return (
    <Stats
      title="Estadísticas del mes"
      kpis={kpis.map((kpi:any, index:number) => ({ ...kpi, onClick:() => onNavigate(index === 2 ? 'empleados' : 'fichajes') }))}
      bars={bars}
      centrosBars={centrosBars}
      donut={donut}
      comparison={[
        { label: 'Jornada completa', value: `${Math.round((rawSlices[0].value / Math.max(rawSlices.reduce((s, x) => s + x.value, 0), 1)) * 100)}%`, deltaTone: 'up' },
        { label: 'Jornadas largas', value: `${rawSlices[2].value}`, deltaTone: 'up' },
      ]}
    />
  )
}

function PendingCenterPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const db = useAppStore(s => s.db) as any
  const offlinePending = useAppStore(s => s.offlinePending)
  const syncStatus = useAppStore(s => s.syncStatus)
  const lastSyncTime = useAppStore(s => s.lastSyncTime)
  const now = Date.now()
  const openTooLong = (db.records || []).filter((r:any) => !r.fin && r.inicio && now - new Date(r.inicio).getTime() > 10 * 3600000).length
  const pendingHours = (db.records || []).filter((r:any) => r.fin && !r.aceptada && !r.validado && !r.rechazado).length
  const pendingVacations = (db.vacaciones || []).filter((v:any) => v.estado === 'pendiente').length
  const pendingExpenses = (db.gastos || []).filter((g:any) => g.estado === 'pendiente').length
  const pendingDocuments = (db.documentos || []).filter((d:any) => !d.firma).length
  const pendingClosures = (db.cierres || []).filter((c:any) => !(c.firmaAdmin && (c.firmaEmp || c.firma))).length
  const cards = [
    { label:'Jornadas abiertas +10h', value:openTooLong, page:'en_linea', tone:colors.semantic.red },
    { label:'Horas por validar', value:pendingHours, page:'validar', tone:colors.semantic.orange },
    { label:'Vacaciones pendientes', value:pendingVacations, page:'solicitudes', tone:colors.primary.light },
    { label:'Gastos pendientes', value:pendingExpenses, page:'gastos', tone:colors.semantic.orange },
    { label:'Documentos sin firma', value:pendingDocuments, page:'documentos', tone:colors.accent.base },
    { label:'Cierres sin completar', value:pendingClosures, page:'cierre', tone:colors.text[700] },
  ]
  const exportBackup = () => {
    const payload = { exportedAt:new Date().toISOString(), app:'Times INC', version:1, data:db }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=`times-inc-backup-${new Date().toISOString().slice(0,10)}.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
  return <div style={{ display:'flex', flexDirection:'column', gap:20, maxWidth:1000 }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
      <div><h1 style={{ margin:0, fontSize:24, color:colors.text[900] }}>Centro de pendientes</h1><p style={{ margin:'6px 0 0', color:colors.text[500], fontSize:13 }}>Todo lo que requiere atención administrativa en un único lugar.</p></div>
      <button onClick={exportBackup} style={{ padding:'9px 13px', borderRadius:9, border:`1px solid ${colors.primary.base}`, background:colors.primary.dim, color:colors.primary.light, fontWeight:700, cursor:'pointer' }}>Descargar copia JSON</button>
    </div>
    <div style={{ padding:'13px 15px', borderRadius:12, border:`1px solid ${offlinePending || syncStatus === 'error' ? 'rgba(245,158,11,.4)' : colors.border.subtle}`, background:colors.bg[600], display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
      <strong style={{ color:offlinePending || syncStatus === 'error' ? colors.semantic.orange : colors.semantic.green }}>{offlinePending ? 'Hay un lote de cambios pendiente de subir' : syncStatus === 'synced' ? 'Datos sincronizados' : `Sincronización: ${syncStatus}`}</strong>
      <span style={{ color:colors.text[500], fontSize:12 }}>{lastSyncTime ? `Última confirmación: ${new Date(lastSyncTime).toLocaleString('es-ES')}` : 'Todavía sin confirmación del servidor'}</span>
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
      {cards.map(card => <button key={card.label} onClick={() => onNavigate(card.page)} style={{ textAlign:'left', padding:16, borderRadius:12, border:`1px solid ${colors.border.subtle}`, background:colors.bg[600], cursor:'pointer', color:colors.text[900] }}><div style={{ color:colors.text[500], fontSize:12 }}>{card.label}</div><div style={{ marginTop:8, fontSize:28, fontWeight:800, color:card.tone }}>{card.value}</div><div style={{ marginTop:8, color:colors.primary.light, fontSize:11, fontWeight:700 }}>Revisar →</div></button>)}
    </div>
  </div>
}

function MonthlyClosePage() {
  const db      = useAppStore(s => s.db) as any
  const saveDB  = useAppStore(s => s.saveDB)
  const session = useAppStore(s => s.session)
  const toast   = useAppStore(s => s.toast)
  const autoGenRef = useRef(false)
  const nowForClose = new Date()
  const currentCloseMonth = `${nowForClose.getFullYear()}-${String(nowForClose.getMonth() + 1).padStart(2, '0')}`
  const isLastDayOfMonth = canCloseMonth(currentCloseMonth, nowForClose)

  // El cierre, manual o automático, solo puede generarse el último día natural del mes.
  useEffect(() => {
    if (autoGenRef.current || !isLastDayOfMonth) return
    autoGenRef.current = true
    const now = new Date()
    const mesPasado = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const emps = (db.employees || []).filter((e: any) => !e.isAdmin && !e.baja)
    const existing = new Set((db.cierres || []).filter((c: any) => c.mes === mesPasado && !c.desactualizado).map((c: any) => c.empId))
    const toCreate = emps.filter((e: any) => !existing.has(e.id))
    if (!toCreate.length) return
    saveDB((fresh: any) => {
      const recs = fresh.records || []
      const nuevos = toCreate.flatMap((e: any) => {
        const eRecs = recs.filter((r: any) => r.empId === e.id && r.fin && localMonthKey(r.inicio) === mesPasado)
        if (!eRecs.length) return []
        const totalMin = Math.floor(eRecs.reduce((s: number, r: any) => s + recWorkSecs(r) / 60, 0))
        const records_snapshot = eRecs.map(buildRecordSnapshot)
        const generadoAt = new Date().toISOString()
        return [{
          id: gid(), empId: e.id, empName: e.name, mes: mesPasado,
          totalMin, extraMin: Math.max(0, totalMin - WM), dias: new Set(eRecs.map((r:any) => localDateStr(new Date(r.inicio)))).size, estado: 'pendiente', records_snapshot,
          generadoPor: 'Sistema', generadoAt,
          firma: null, firmaEmp: null, firmaAdmin: null, _upd: generadoAt,
        }]
      })
      if (!nuevos.length) return null
      const withAudit = auditLog(fresh, `Cierre mensual auto-generado (${mesPasado})`, `${nuevos.length} empleados`, session?.user?.name || 'Admin')
      const reemplazados = new Set(nuevos.map((c: any) => c.empId))
      const cierres = (fresh.cierres || []).filter((c: any) => !(c.mes === mesPasado && c.desactualizado && reemplazados.has(c.empId)))
      return { cierres: [...cierres, ...nuevos], audit: withAudit.audit }
    })
  }, [isLastDayOfMonth]) // eslint-disable-line

  // Build closure items from db.cierres, enriched with records
  const items = useMemo(() => {
    const allEmployees = db.employees || []
    const emps = allEmployees.filter((e: any) => !e.isAdmin && !e.baja)
    const employeesById = new Map(emps.map((employee: any) => [employee.id, employee]))
    const recordsByEmployeeMonth = new Map<string, any[]>()
    const supervisorByCenter = new Map<string, any>()

    for (const record of db.records || []) {
      if (!record.fin || !record.inicio) continue
      const key = `${record.empId}\u0000${localMonthKey(record.inicio)}`
      const grouped = recordsByEmployeeMonth.get(key)
      if (grouped) grouped.push(record)
      else recordsByEmployeeMonth.set(key, [record])
    }
    for (const employee of allEmployees) {
      if ((employee.role === 'encargado' || employee.role === 'jefe_obra') && !employee.isAdmin) {
        const center = employee.centroTrabajo || ''
        if (!supervisorByCenter.has(center)) supervisorByCenter.set(center, employee)
      }
    }

    return [...(db.cierres || [])]
      .sort((a: any, b: any) => String(b.mes || '').localeCompare(String(a.mes || '')))
      .map((c: any) => {
        const emp = employeesById.get(c.empId) as any
        const [year, mon] = (c.mes || '').split('-')
        const monthLabel = year && mon
          ? new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
          : c.mes || '—'

        const liveRecs = recordsByEmployeeMonth.get(`${c.empId}\u0000${c.mes || ''}`) || []
        // Un cierre firmado es un documento laboral sellado: nunca se vuelve a
        // calcular con fichajes que puedan cambiar después de la firma.
        const hasSignature = !!(c.firmaAdmin || c.firmaEmp || c.firma)
        const recs = hasSignature && Array.isArray(c.records_snapshot)
          ? c.records_snapshot
          : liveRecs
        const totalMins = recs.reduce((s: number, r: any) =>
          s + recWorkSecs(r) / 60, 0
        )
        const extraMins = Math.max(0, totalMins - WM)

        const dayRecs = recs.map((r: any) => ({
          date:  new Date(r.inicio).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
          entry: fmtTime(r.inicio),
          exit:  fmtTime(r.fin),
          hours: (() => { const m = recWorkSecs(r) / 60; return `${Math.floor(m/60)}h${Math.floor(m%60)}m` })(),
          corrections: Array.isArray(r.correcciones) ? r.correcciones : [],
        }))

        // Supervisor: find encargado or jefe_obra assigned to same centro
        const supervisor = supervisorByCenter.get(emp?.centroTrabajo || '')

        const empRole = emp?.role === 'empleado' ? 'Empleado' : emp?.role === 'encargado' ? 'Encargado' : emp?.role === 'jefe_obra' ? 'Jefe de obra' : emp?.role || 'Empleado'

        return {
          id: c.id,
          empId: c.empId,
          empName: c.empName || emp?.name || '—',
          dept: emp?.centroTrabajo || emp?.dept || '—',
          role: empRole,
          month: monthLabel,
          mes: c.mes || '',
          totalHours: `${Math.floor(totalMins / 60)}h${Math.floor(totalMins % 60)}m`,
          totalMins,
          extraHours: extraMins > 0 ? `+${Math.floor(extraMins / 60)}h${Math.floor(extraMins % 60)}m` : '0h',
          extraMins,
          workedDays: new Set(recs.map((r: any) => localDateStr(new Date(r.inicio)))).size,
          signedBy: (c.firmaAdmin && (c.firmaEmp || c.firma)) ? 'all' : (c.firmaEmp || c.firma) ? 'emp' : 'none',
          firmaAdmin: !!c.firmaAdmin,
          firmaEmp: !!c.firmaEmp || !!c.firma,
          firmaSupervisor: !!c.firmaSupervisor,
          supervisorName: supervisor?.name,
          generatedOn: fmtDate(c.ts || c.fecha),
          estado: c.estado || 'pendiente',
          records: dayRecs,
          pdfData: c.pdfData || null,
          reopenCount: c.reopenCount || 0,
          lastReopenAt: c.lastReopenAt ? fmtDate(c.lastReopenAt) : null,
          lastReopenBy: c.lastReopenBy || null,
          integrityHash: c.integrityHash || null,
          documentoId: c.documentoId || null,
        } as any
      })
  }, [db.cierres, db.employees, db.records])

  // Generate closures for the previous (completed) month only
  const handleGenerateAll = () => {
    if (!isLastDayOfMonth) {
      toast('El cierre mensual solo puede generarse el último día natural del mes', 4500, 'warn')
      return
    }
    const now = new Date()
    const mesPasado = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const emps = (db.employees || []).filter((e: any) => !e.isAdmin && !e.baja)
    const existing = new Set((db.cierres || []).filter((c: any) => c.mes === mesPasado && !c.desactualizado).map((c: any) => c.empId))
    const toCreate = emps.filter((e: any) => !existing.has(e.id))
    if (!toCreate.length) { toast(`Todos los empleados ya tienen cierre de ${mesPasado}`, 3000, 'ok'); return }

    saveDB((fresh: any) => {
      const recs = fresh.records || []
      const nuevos = toCreate.flatMap((e: any) => {
        const eRecs = recs.filter((r: any) => r.empId === e.id && r.fin && localMonthKey(r.inicio) === mesPasado)
        if (!eRecs.length) return []
        const totalMin = Math.floor(eRecs.reduce((s: number, r: any) => s + recWorkSecs(r) / 60, 0))
        const records_snapshot = eRecs.map(buildRecordSnapshot)
        const generadoAt = new Date().toISOString()
        return [{ id: gid(), empId: e.id, empName: e.name, mes: mesPasado, totalMin, extraMin:Math.max(0, totalMin - WM), dias:new Set(eRecs.map((r:any) => localDateStr(new Date(r.inicio)))).size, estado:'pendiente', records_snapshot, generadoPor:session?.user?.name || 'Admin', generadoAt, firma:null, firmaEmp:null, firmaAdmin:null, _upd:generadoAt }]
      })
      if (!nuevos.length) { toast(`Sin registros de ${mesPasado}`, 3000, 'warn'); return null }
      const withAudit = auditLog(fresh, `Cierre mensual generado (${mesPasado})`, `${nuevos.length} empleados`, session?.user?.name || 'Admin')
      const reemplazados = new Set(nuevos.map((c: any) => c.empId))
      const cierres = (fresh.cierres || []).filter((c: any) => !(c.mes === mesPasado && c.desactualizado && reemplazados.has(c.empId)))
      return { cierres: [...cierres, ...nuevos], audit: withAudit.audit }
    })
    toast(`Generando cierres de ${mesPasado}…`, 2500, 'ok')
  }

  const handleSignAdmin = (id: string) => {
    const target = (db.cierres || []).find((c: any) => c.id === id)
    if (target && !canCloseMonth(target.mes)) {
      toast(`El mes ${target.mes} todavía no ha terminado — no se puede firmar hasta su último día`, 4500, 'warn')
      return
    }
    const nowIso = new Date().toISOString()
    const actor = session?.user?.name || 'Admin'
    saveDB((fresh: any) => {
      const closure = (fresh.cierres || []).find((c: any) => c.id === id)
      if (!closure || closure.firmaAdmin || !canCloseMonth(closure.mes)) return null
      const cierres = (fresh.cierres || []).map((c: any) =>
        c.id === id ? { ...c, firmaAdmin:true, firmaAdminAt:nowIso, firmaAdminBy:actor, estado:(c.firmaEmp || c.firma) ? 'firmado' : c.estado, _upd:nowIso } : c
      )
      const withAudit = auditLog(fresh, 'Cierre firmado por administrador', `${closure.empName || closure.empId} · ${closure.mes}`, actor, { category:'documento', entityType:'cierre', entityId:id, device:currentDeviceLabel(), before:{ firmaAdmin:false }, after:{ firmaAdmin:true } })
      return { cierres, audit:withAudit.audit }
    })
    toast('Firma admin registrada', 2500, 'ok')
  }

  const handleSignMany = (ids: string[]) => {
    const requested = new Set(ids)
    const actor = session?.user?.name || 'Admin'
    const nowIso = new Date().toISOString()
    const blockedByDate = (db.cierres || []).filter((c: any) => requested.has(c.id) && !c.firmaAdmin && !canCloseMonth(c.mes)).length
    const signedCount = (db.cierres || []).filter((c: any) => requested.has(c.id) && !c.firmaAdmin && canCloseMonth(c.mes)).length
    if (!signedCount) {
      toast('Ninguno de los meses seleccionados ha terminado todavía', 3200, 'warn')
      return
    }
    saveDB((fresh: any) => {
      const eligible = (fresh.cierres || []).filter((c: any) => requested.has(c.id) && !c.firmaAdmin && canCloseMonth(c.mes))
      if (!eligible.length) return null
      const eligibleIds = new Set(eligible.map((c: any) => c.id))
      const cierres = (fresh.cierres || []).map((c: any) => eligibleIds.has(c.id)
        ? { ...c, firmaAdmin:true, firmaAdminAt:nowIso, firmaAdminBy:actor, estado:(c.firmaEmp || c.firma) ? 'firmado' : c.estado, _upd:nowIso }
        : c
      )
      const withAudit = auditLog(fresh, 'Cierres firmados en lote', `${eligible.length} cierres · ${eligible.map((c: any) => c.mes).filter((mes: string, index: number, all: string[]) => all.indexOf(mes) === index).join(', ')}`, actor, { category:'documento', entityType:'cierre_batch', entityId:eligible.map((c: any) => c.id).join(','), device:currentDeviceLabel(), before:{ count:eligible.length, firmaAdmin:false }, after:{ count:eligible.length, firmaAdmin:true } })
      return { cierres, audit:withAudit.audit }
    })
    toast(`${signedCount} cierre${signedCount !== 1 ? 's' : ''} firmado${signedCount !== 1 ? 's' : ''} y auditado${signedCount !== 1 ? 's' : ''}${blockedByDate ? ` — ${blockedByDate} omitido${blockedByDate !== 1 ? 's' : ''} por mes no terminado` : ''}`, 3800, 'ok')
  }

  // Descarga el PDF oficial firmado. Los cierres firmados a partir de la
  // migracion a Storage solo guardan `documentoId` (ruta en el bucket
  // privado cierres-pdf), ya no el PDF entero en base64 dentro de la fila —
  // hay que pedir una URL firmada de corta duracion en el momento de la
  // descarga. Los cierres firmados antes de ese cambio siguen teniendo
  // `pdfData` y se descargan igual que siempre.
  const handleDownloadPdf = async (id: string) => {
    const closure = (db.cierres || []).find((c: any) => c.id === id)
    if (!closure) return
    const filename = `cierre-${closure.mes}-${(closure.empName || '').replace(/\s+/g, '_')}.pdf`
    if (closure.pdfData) { downloadDataUrl(closure.pdfData, filename); return }
    if (closure.documentoId && supabase) {
      try {
        const { data, error } = await supabase.storage.from(CIERRE_PDF_BUCKET).createSignedUrl(closure.documentoId, 3600, { download: filename })
        if (error || !data?.signedUrl) { toast('No se pudo generar el enlace de descarga del PDF firmado', 4000, 'warn'); return }
        const a = document.createElement('a')
        a.href = data.signedUrl
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
      } catch {
        toast('No se pudo generar el enlace de descarga del PDF firmado', 4000, 'warn')
      }
      return
    }
    toast('Este cierre todavía no tiene un PDF firmado generado', 3000, 'warn')
  }

  const handleDownloadConsolidated = async (mes: string) => {
    const cierresDelMes = (db.cierres || []).filter((c: any) => c.mes === mes).map((cierre: any) => {
      if (cierre.firmaAdmin || cierre.firmaEmp || cierre.firma || cierre.estado === 'firmado') return cierre
      const records = (db.records || []).filter((record: any) =>
        record.empId === cierre.empId && record.inicio && record.fin && localMonthKey(record.inicio) === mes
      )
      const records_snapshot = records.map(buildRecordSnapshot)
      return {
        ...cierre,
        records_snapshot,
        totalMin: Math.floor(records_snapshot.reduce((sum: number, record: any) => sum + recWorkSecs(record), 0) / 60),
        dias: new Set(records.map((record: any) => localDateStr(new Date(record.inicio)))).size,
      }
    })
    if (!cierresDelMes.length) return
    try {
      const { dataUrl } = await buildCierreConsolidadoPDF({ cierres: cierresDelMes, mes, empresa: undefined })
      downloadDataUrl(dataUrl, `cierre-consolidado-${mes}.pdf`)
    } catch (e: any) {
      toast(`No se pudo generar el PDF consolidado: ${e?.message || 'error'}`, 4500, 'warn')
    }
  }

  // Reabrir un cierre firmado: no existía ninguna forma de corregir horas de
  // un mes ya firmado (ni por el empleado ni por el admin) — isRecordMonthLocked
  // bloqueaba Validar horas/Fichajes indefinidamente sin salida posible.
  const handleReopenClosure = (id: string) => {
    const closure = (db.cierres || []).find((c: any) => c.id === id)
    if (!closure) return
    if (!(closure.firmaAdmin || closure.firmaEmp || closure.firma)) return
    const empName = closure.empName || (db.employees || []).find((e: any) => e.id === closure.empId)?.name || closure.empId
    if (!window.confirm(`¿Reabrir el cierre de ${empName} (${closure.mes})? Se borrarán las firmas y el PDF firmado; habrá que volver a firmarlo.`)) return
    const nowIso = new Date().toISOString()
    const actor = session?.user?.name || 'Admin'
    saveDB((fresh: any) => {
      const cierres = (fresh.cierres || []).map((c: any) => c.id === id
        ? { ...c, firmaAdmin: false, firmaEmp: false, firma: null, firmaSupervisor: false, estado: 'pendiente', pdfData: null, pdfUrl: null, documentoId: null, desactualizado: false, reopenCount: (c.reopenCount || 0) + 1, lastReopenAt: nowIso, lastReopenBy: actor, _upd: nowIso }
        : c
      )
      const withAudit = auditLog(fresh, 'Cierre reabierto', `${empName} · ${closure.mes}`, actor, { category:'documento', entityType:'cierre', entityId:id, device:currentDeviceLabel(), before:{ estado: closure.estado }, after:{ estado:'pendiente' } })
      const noti = { id: gid(), empId: closure.empId, action: 'Cierre reabierto', detail: `Tu cierre de ${closure.mes} se ha reabierto para corregir horas. Vuelve a firmarlo cuando esté listo.`, ts: nowIso, leido: false }
      return { cierres, audit: withAudit.audit, notis: [...(fresh.notis || []), noti] }
    })
    if (closure.empId) queuePush(closure.empId, 'Cierre reabierto', `Tu cierre de ${closure.mes} se ha reabierto para corregir horas.`, 'cierre', '/?go=emp:perfil')
    toast('Cierre reabierto — vuelve a estado pendiente de firma', 3500, 'ok')
  }

  // Reabrir de una sola vez todos los cierres firmados de un mes — evita tener
  // que reabrir empleado a empleado cuando el mes entero se cerró/firmó por
  // error (p.ej. julio 2026 se generó y firmó antes de que el mes terminara).
  const handleReopenMonth = (mes: string) => {
    const affected = (db.cierres || []).filter((c: any) => c.mes === mes && (c.firmaAdmin || c.firmaEmp || c.firma))
    if (!affected.length) { toast(`No hay cierres firmados en ${mes}`, 3000, 'warn'); return }
    if (!window.confirm(`¿Reabrir TODOS los cierres de ${mes}? Se borrarán las firmas y PDFs de ${affected.length} empleado${affected.length !== 1 ? 's' : ''}; habrá que volver a firmarlos.`)) return
    const nowIso = new Date().toISOString()
    const actor = session?.user?.name || 'Admin'
    const ids = new Set(affected.map((c: any) => c.id))
    saveDB((fresh: any) => {
      const cierres = (fresh.cierres || []).map((c: any) => ids.has(c.id)
        ? { ...c, firmaAdmin: false, firmaEmp: false, firma: null, firmaSupervisor: false, estado: 'pendiente', pdfData: null, pdfUrl: null, documentoId: null, desactualizado: false, reopenCount: (c.reopenCount || 0) + 1, lastReopenAt: nowIso, lastReopenBy: actor, _upd: nowIso }
        : c
      )
      const withAudit = auditLog(fresh, 'Mes completo reabierto', `${mes} · ${affected.length} cierres`, actor, { category:'documento', entityType:'cierre_batch', entityId:[...ids].join(','), device:currentDeviceLabel(), before:{ count:affected.length }, after:{ count:affected.length, estado:'pendiente' } })
      const nuevasNotis = affected.map((c: any) => ({ id: gid(), empId: c.empId, action: 'Cierre reabierto', detail: `Tu cierre de ${mes} se ha reabierto para corregir horas. Vuelve a firmarlo cuando esté listo.`, ts: nowIso, leido: false }))
      return { cierres, audit: withAudit.audit, notis: [...(fresh.notis || []), ...nuevasNotis] }
    })
    affected.forEach((c: any) => { if (c.empId) queuePush(c.empId, 'Cierre reabierto', `Tu cierre de ${mes} se ha reabierto para corregir horas.`, 'cierre', '/?go=emp:perfil') })
    toast(`${affected.length} cierre${affected.length !== 1 ? 's' : ''} de ${mes} reabierto${affected.length !== 1 ? 's' : ''}`, 3500, 'ok')
  }

  const handleDeleteClosure = (id: string) => {
    const closure = (db.cierres || []).find((c: any) => c.id === id)
    if (closure && (closure.firmaAdmin || closure.firmaEmp || closure.firma)) {
      toast('Un cierre firmado está bloqueado y no puede eliminarse', 4500, 'warn')
      return
    }
    if (!closure || !window.confirm('¿Eliminar este cierre y su PDF generado? Esta acción no se puede deshacer.')) return
    saveDB((fresh: any) => ({ cierres: (fresh.cierres || []).filter((c: any) => c.id !== id) }))
    if (supabase) supabase.from('cierres').delete().eq('id', id).then(({ error }: any) => {
      if (error) toast('Eliminado localmente — no se pudo confirmar con el servidor', 4000, 'warn')
    })
    toast('Cierre eliminado', 2500, 'ok')
  }

  // Borrado en lote de todos los cierres de un mes — a diferencia de
  // handleDeleteClosure, aquí se permite borrar aunque estén firmados: se usa
  // para deshacer una generación entera hecha por error antes de que el mes
  // terminara (no son documentos legales válidos, ya que nunca debieron
  // poder firmarse — ver canCloseMonth).
  const handleDeleteMonth = (mes: string) => {
    const affected = (db.cierres || []).filter((c: any) => c.mes === mes)
    if (!affected.length) { toast(`No hay cierres de ${mes}`, 3000, 'warn'); return }
    if (!window.confirm(`¿Eliminar TODOS los cierres de ${mes} (${affected.length})? Esta acción no se puede deshacer.`)) return
    const actor = session?.user?.name || 'Admin'
    const ids = affected.map((c: any) => c.id)
    saveDB((fresh: any) => {
      const withAudit = auditLog(fresh, 'Cierres de mes eliminados', `${mes} · ${affected.length} cierres`, actor, { category:'documento', entityType:'cierre_batch', entityId:ids.join(','), device:currentDeviceLabel(), before:{ count:affected.length }, after:{ count:0 } })
      return { cierres: (fresh.cierres || []).filter((c: any) => c.mes !== mes), audit: withAudit.audit }
    })
    if (supabase) supabase.from('cierres').delete().eq('mes', mes).then(({ error }: any) => {
      if (error) toast('Eliminado localmente — no se pudo confirmar con el servidor', 4000, 'warn')
    })
    toast(`${affected.length} cierre${affected.length !== 1 ? 's' : ''} de ${mes} eliminado${affected.length !== 1 ? 's' : ''}`, 3500, 'ok')
  }

  return <MonthlyClose items={items} onDownload={handleDownloadPdf} onSignAdmin={handleSignAdmin} onSignMany={handleSignMany} onGenerateAll={handleGenerateAll} onDelete={handleDeleteClosure} onDeleteMonth={handleDeleteMonth} onReopen={handleReopenClosure} onReopenMonth={handleReopenMonth} onDownloadConsolidated={handleDownloadConsolidated} canGenerate={isLastDayOfMonth} generationHint={isLastDayOfMonth ? `Generar cierre de ${currentCloseMonth}` : 'Solo se permite el último día natural del mes'} />
}

function AuditPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const db = useAppStore(s => s.db) as any
  const toast = useAppStore(s => s.toast)

  const catDetect = (action = ''): any => {
    const a = action.toLowerCase()
    if (a.includes('jornada') || a.includes('fichaj') || a.includes('entrada') || a.includes('salida')) return 'jornada'
    if (a.includes('empleado') || a.includes('usuario') || a.includes('perfil')) return 'empleado'
    if (a.includes('obra') || a.includes('proyecto')) return 'obra'
    if (a.includes('documento') || a.includes('pdf')) return 'documento'
    if (a.includes('solicitud') || a.includes('vacacion') || a.includes('gasto')) return 'solicitud'
    if (a.includes('login') || a.includes('sesión') || a.includes('acceso')) return 'seguridad'
    return 'sistema'
  }

  const entries = useMemo(() => (db.audit || [])
    .slice()
    .sort((a: any, b: any) => String(b.ts || '').localeCompare(String(a.ts || '')))
    .slice(0, 200)
    .map((a: any, i: number) => ({
      id: a.id || String(i),
      action: a.action || 'Acción',
      category: catDetect(a.action),
      user: a.user || a.who || '—',
      detail: a.detail || a.target || '',
      ts: a.ts || '',
      entityId: a.entityId || '',
      reason: a.reason || '',
      device: a.device || '',
      before: a.before || null,
      after: a.after || null,
    })), [db.audit])

  const handleExport = () => {
    const rows = entries.map((e: any) => [
      e.ts ? new Date(e.ts).toLocaleString('es-ES') : '',
      e.action, e.user, e.detail, e.entityId || '', e.reason || '', e.device || '',
    ])
    downloadCsv(['Fecha', 'Acción', 'Usuario', 'Detalle', 'Registro', 'Motivo', 'Dispositivo'], rows, `auditoria-${today()}.csv`)
    toast('Auditoría exportada', 2000, 'ok')
  }

  const handleOpenEntry = (entry: any) => {
    const destinations: Record<string, string> = {
      jornada: 'fichajes', empleado: 'empleados', obra: 'obras',
      documento: 'documentos', solicitud: 'solicitudes',
    }
    const target = destinations[entry.category]
    if (target) onNavigate(target)
  }

  return <Audit entries={entries} onExport={handleExport} onOpenEntry={handleOpenEntry} />
}

function AnomaliesPage({ onOpenEmployee }: { onOpenEmployee: (name: string) => void }) {
  const db = useAppStore(s => s.db) as any
  const saveDB = useAppStore(s => s.saveDB)

  const items = useMemo(() => {
    const anomalies: any[] = []
    const records: any[] = db.records || []
    const todayStr = today()

    records.forEach((r: any) => {
      if (!r.inicio) return
      // localDateStr(new Date(r.inicio)) (no r.inicio.slice(0,10)): inicio se guarda en
      // UTC — un fichaje nocturno se comparaba con el día siguiente al real.
      const dateStr = localDateStr(new Date(r.inicio))
      const emp = (db.employees || []).find((e: any) => e.id === r.empId)
      const empName = emp?.name || r.empId
      const dept = emp?.dept || emp?.centroTrabajo || ''

      // Sin salida: record from a past day with no fin
      if (!r.fin && dateStr < todayStr) {
        anomalies.push({
          id: `no-fin-${r.id}`,
          empName, dept,
          type: 'sin_salida',
          description: `Jornada iniciada el ${fmtDate(r.inicio)} sin registrar salida`,
          date: fmtDate(r.inicio),
          severity: 'alta',
          resolved: false,
        })
      }

      if (r.fin) {
        const workedHours = recWorkSecs(r) / 3600
        if (workedHours > 10) anomalies.push({ id:`long-${r.id}`, empName, dept, type:'jornada_larga', description:`Jornada de ${workedHours.toFixed(1)} horas`, date:fmtDate(r.inicio), severity:'alta', resolved:false })
        if (workedHours >= 6 && !(r.breaks || []).length && !(r.breakSecs > 0)) anomalies.push({ id:`break-${r.id}`, empName, dept, type:'sin_descanso', description:'Jornada de 6 horas o más sin descanso registrado', date:fmtDate(r.inicio), severity:'media', resolved:false })
      }
      if (r.geoAlert || r.fueraZona) anomalies.push({ id:`geo-${r.id}`, empName, dept, type:'fuera_zona', description:'Fichaje registrado fuera de la zona asignada', date:fmtDate(r.inicio), severity:'alta', resolved:false })
      if (r.cierreManual) anomalies.push({ id:`manual-${r.id}`, empName, dept, type:'cierre_manual', description:`Finalizada por ${r.cerradoPor || 'un responsable'}${r.motivoCierre ? ` · ${r.motivoCierre}` : ''}`, date:fmtDate(r.fin || r.inicio), severity:'baja', resolved:false })
    })

    const openByEmployee = new Map<string, any[]>()
    records.filter((r:any) => !r.fin && r.inicio).forEach((r:any) => openByEmployee.set(r.empId, [...(openByEmployee.get(r.empId) || []), r]))
    openByEmployee.forEach((open, empId) => {
      if (open.length < 2) return
      const emp = (db.employees || []).find((e:any) => e.id === empId)
      anomalies.push({ id:`double-${empId}`, empName:emp?.name || empId, dept:emp?.centroTrabajo || emp?.dept || '', type:'doble_abierto', description:`${open.length} jornadas abiertas simultáneamente`, date:fmtDate(open[0].inicio), severity:'alta', resolved:false })
    })

    // Detect overlapping records per employee per day
    const byEmpDay = new Map<string, any[]>()
    records.filter((r: any) => r.fin && r.inicio).forEach((r: any) => {
      const key = `${r.empId}::${localDateStr(new Date(r.inicio))}`
      if (!byEmpDay.has(key)) byEmpDay.set(key, [])
      byEmpDay.get(key)!.push(r)
    })
    byEmpDay.forEach((recs, key) => {
      if (recs.length < 2) return
      const [empId, date] = key.split('::')
      const emp = (db.employees || []).find((e: any) => e.id === empId)
      anomalies.push({
        id: `overlap-${empId}-${date}`,
        empName: emp?.name || empId,
        dept: emp?.dept || emp?.centroTrabajo || '',
        type: 'solapamiento',
        description: `${recs.length} fichajes el mismo día (${fmtDate(date + 'T00:00:00')})`,
        date: fmtDate(date + 'T00:00:00'),
        severity: 'media',
        resolved: false,
      })
    })

    const resolvedIds = new Set(db.anomalias_vistas || [])
    return anomalies.slice(0, 50).map(item => ({ ...item, resolved: resolvedIds.has(item.id) }))
  }, [db])

  const resolveAnomaly = (id:string) => saveDB((fresh:any) => ({ anomalias_vistas:[...new Set([...(fresh.anomalias_vistas || []), id])] }))
  return <Anomalies items={items} onResolve={resolveAnomaly} onOpen={item => onOpenEmployee(item.empName)} />
}

function ObraModal({ onClose }: { onClose: () => void }) {
  const saveDB = useAppStore(s => s.saveDB)
  const toast  = useAppStore(s => s.toast)
  const [nombre, setNombre] = useState('')
  const [coords, setCoords] = useState('')
  const [radio, setRadio] = useState('200')
  const [fechaInicio, setFechaInicio] = useState(() => today())
  const dialogRef = useDialogA11y(true, onClose)

  const handleSave = () => {
    if (!nombre.trim()) { toast('El nombre es obligatorio', 2500, 'warn'); return }
    const normalizedCoords = coords.trim() ? normalizeObraCoords(coords) : null
    if (coords.trim() && !normalizedCoords) { toast('Usa coordenadas válidas: latitud, longitud', 3500, 'warn'); return }
    const nowIso = new Date().toISOString()
    const obra = {
      id: gid(), nombre: nombre.trim(),
      coords: normalizedCoords,
      radio: Number(radio) > 0 ? Number(radio) : 200,
      activa: true,
      fechaInicio: fechaInicio || null,
      _upd: nowIso,
    }
    saveDB((fresh: any) => ({ obras: [...(fresh.obras || []), obra] }))
    toast('Obra creada', 2500, 'ok')
    onClose()
  }

  const fieldStyle = { width: '100%', boxSizing: 'border-box' as const, padding: '9px 12px', borderRadius: 8, border: `1px solid ${colors.border.default}`, background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none' }
  const labelStyle = { fontSize: 11, fontWeight: 700, color: colors.text[500], marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '.4px' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Nueva obra" onClick={e => e.stopPropagation()} style={{ background: colors.bg[900], borderRadius: '16px 16px 0 0', border: `1px solid ${colors.border.default}`, padding: '24px 20px 40px', width: '100%', maxWidth: 420, maxHeight: '92dvh', overflowY: 'auto', boxShadow: '0 -24px 64px rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: colors.text[900] }}>Nueva obra</div>
          <button type="button" aria-label="Cerrar nueva obra" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text[500], padding: 4 }}><IconX width={18} height={18} /></button>
        </div>
        <div>
          <div style={labelStyle}>Nombre</div>
          <input value={nombre} onChange={e => setNombre(e.target.value)} aria-label="Nombre de la obra" placeholder="Ej: Gecama" style={fieldStyle} />
        </div>
        <div>
          <div style={labelStyle}>Coordenadas GPS (opcional)</div>
          <input value={coords} onChange={e => setCoords(e.target.value)} aria-label="Coordenadas GPS" placeholder="Ej: 18.4861,-69.9312" style={fieldStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={labelStyle}>Radio de geovalla (m)</div>
            <input type="number" min="0" value={radio} onChange={e => setRadio(e.target.value)} aria-label="Radio de geovalla" style={fieldStyle} />
          </div>
          <div>
            <div style={labelStyle}>Fecha de inicio</div>
            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} aria-label="Fecha de inicio de la obra" style={fieldStyle} />
          </div>
        </div>
        <button onClick={handleSave} style={{ padding: '12px', borderRadius: 10, border: 'none', background: colors.primary.base, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 }}>
          Crear obra
        </button>
      </div>
    </div>
  )
}

function ObrasPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const db = useAppStore(s => s.db) as any
  const [showAdd, setShowAdd] = useState(false)
  const todayStr = today()
  const currentMonth = localMonthKey(new Date())

  const items = useMemo(() => {
    const obras = db.obras || []
    const employees: any[] = (db.employees || []).filter((e: any) => !e.isAdmin && !e.baja)
    const records: any[] = db.records || []

    return obras.map((o: any) => {
      const assigned = employees.filter((employee: any) => employeeBelongsToObra(employee, o))
      const employeesById = new Map(employees.map((employee: any) => [employee.id, employee]))
      const obraRecords = records.filter((record: any) =>
        resolveRecordObraId(record, employeesById.get(record.empId), obras) === o.id
      )
      // localDateStr(new Date(r.inicio)) (no r.inicio.startsWith(todayStr)): inicio
      // se guarda en UTC — un fichaje nocturno no contaba como "hoy" en esta obra.
      const todayRecs = obraRecords.filter((r: any) =>
        r.fin && r.inicio && localDateStr(new Date(r.inicio)) === todayStr
      )
      const todayMins = todayRecs.reduce((s: number, r: any) => {
        return s + recWorkSecs(r) / 60
      }, 0)
      const monthRecs = obraRecords.filter((r: any) =>
        r.fin && r.inicio && localMonthKey(r.inicio) === currentMonth
      )
      const monthMins = monthRecs.reduce((sum: number, record: any) => sum + recWorkSecs(record) / 60, 0)
      const activeNow = obraRecords.filter((record: any) => record.inicio && !record.fin).length
      // e.role || isEnc/isJO: mismo fallback legacy que EmployeesPage.openEdit,
      // si no, un encargado marcado solo por isEnc/isJO no se detectaba aquí.
      const manager = employees.find((e: any) => {
        const role = e.role || (e.isEnc ? 'encargado' : e.isJO ? 'jefe_obra' : '')
        return (role === 'encargado' || role === 'jefe_obra') &&
          employeeBelongsToObra(e, o)
      })
      return {
        id: o.id,
        name: o.nombre || o.id,
        address: formatObraCoords(o.coords) ? `GPS: ${formatObraCoords(o.coords)}` : '—',
        status: (o.activa === false ? 'completada' : 'activa') as 'activa' | 'completada',
        employeeCount: assigned.length,
        hoursToday: todayMins > 0 ? `${Math.floor(todayMins / 60)}h${todayMins % 60 > 0 ? Math.floor(todayMins % 60) + 'm' : ''}` : '0h',
        hoursMonth: monthMins > 0 ? `${Math.floor(monthMins / 60)}h ${Math.floor(monthMins % 60)}m` : '0h',
        activeNow,
        manager: manager?.name || '—',
        startDate: fmtDate(o.fechaInicio || o.createdAt || o.ts),
      }
    })
  }, [db, todayStr, currentMonth])

  return <>
    <Obras items={items} onAdd={() => setShowAdd(true)} onViewEmployees={() => onNavigate('empleados')} />
    {showAdd && <ObraModal onClose={() => setShowAdd(false)} />}
  </>
}

function OnlineTeamPage({ onOpenEmployee }: { onOpenEmployee: (employeeId: string) => void }) {
  const db = useAppStore(s => s.db) as any
  const session = useAppStore(s => s.session) as any
  const saveDB = useAppStore(s => s.saveDB)
  const toast = useAppStore(s => s.toast)
  const [recentClose, setRecentClose] = useState<any>(null)
  const user = session?.user || {}
  const isScopedRole = session?.isEnc || session?.isJO || user.role === 'encargado' || user.role === 'jefe_obra'
  const hasScope = !isScopedRole || Boolean(user.centroTrabajo || user.dept || user.obrasAsignadas?.length)

  const rows = useMemo(() => getScopedOnlineRecords({
    records: db.records || [],
    employees: db.employees || [],
    obras: db.obras || [],
    supervisor: user,
    unrestricted: !isScopedRole,
  })
    .filter(({ employee }: any) => employee.id !== user.id)
    .map(({ record, employee }: any) => ({
    id: record.id,
    employeeId: employee.id,
    name: employee.name || record.empName || 'Empleado',
    location: record.centro || employee.centroTrabajo || employee.dept || 'Sin ubicación',
    startedAt: record.inicio,
    onBreak: Boolean(record.enDescanso),
  })), [db.records, db.employees, db.obras, user, isScopedRole])

  const missingTeam = useMemo(() => {
    const liveIds = new Set((db.records || []).filter((record:any) => !record.fin).map((record:any) => record.empId))
    const center = String(user.centroTrabajo || user.dept || '').toLocaleLowerCase('es')
    const works = new Set((user.obrasAsignadas || []).map((value:string) => String(value).toLocaleLowerCase('es')))
    return (db.employees || []).filter((employee:any) => {
      if (employee.baja || employee.isAdmin || employee.id === user.id || liveIds.has(employee.id)) return false
      if (!isScopedRole) return true
      const employeeCenter = String(employee.centroTrabajo || employee.dept || '').toLocaleLowerCase('es')
      const employeeWorks = (employee.obrasAsignadas || []).map((value:string) => String(value).toLocaleLowerCase('es'))
      return (!!center && employeeCenter === center) || employeeWorks.some((value:string) => works.has(value))
    })
  }, [db.records, db.employees, user, isScopedRole])

  // persistRecordRow primero (igual que Fichajes/Validar horas): la
  // mutación de un record solo se confirma en local si el guardado
  // incremental de Supabase tuvo éxito.
  const finishShift = async (row: any) => {
    if (!window.confirm(`¿Finalizar la jornada de ${row.name}? La hora de salida será la actual.`)) return
    const reason = window.prompt('Motivo obligatorio para finalizar la jornada:')?.trim()
    if (!reason) { toast('Debes indicar el motivo del cierre', 3000, 'warn'); return }

    const current = (db.records || []).find((record: any) => record.id === row.id)
    if (!current || current.fin) return
    const nowIso = new Date().toISOString()
    const actor = user.name || (session?.isAdmin ? 'Administración' : 'Supervisor')

    const breaks = [...(current.breaks || [])]
    if (current.enDescanso && current.bStartTs) breaks.push({ start: current.bStartTs, end: nowIso })
    const closed: any = {
      ...current,
      fin: nowIso,
      breaks,
      enDescanso: false,
      bStartTs: null,
      closed: true,
      cerradoPor: actor,
      cerradoPorId: user.id || 'admin',
      cierreManual: true,
      motivoCierre: reason,
      operationId: globalThis.crypto?.randomUUID?.() ?? current.operationId ?? null,
      _rev: (current._rev || 0) + 1,
      _upd: nowIso,
    }
    const totals = calcSecs(closed)
    closed.workSecs = totals.work
    closed.breakSecs = totals.brk
    const workedMinutes = Math.floor(totals.work / 60)

    try { await persistRecordRow(closed) } catch (error: any) {
      toast(`No se pudo finalizar la jornada: ${error?.message || 'error de sincronización'}`, 5000, 'warn')
      return
    }

    setRecentClose({ record: current, name: row.name, reason })
    saveDB((fresh: any) => {
      const next = { ...fresh, records: (fresh.records || []).map((record: any) => record.id === closed.id ? closed : record) }
      return auditLog(next, 'Jornada finalizada manualmente', `${row.name} · salida ${fmtTime(nowIso)} · ${reason}`, actor)
    })

    queuePush(row.employeeId, 'Jornada finalizada', `${actor} ha finalizado tu jornada${workedMinutes ? ` (${mhm(workedMinutes)})` : ''}.`, 'jornada', '/?tab=jornada')
    toast(`Jornada de ${row.name} finalizada`, 3000, 'ok')
  }

  const undoClose = async () => {
    if (!recentClose?.record) return
    const nowIso = new Date().toISOString()
    const actor = user.name || (session?.isAdmin ? 'Administración' : 'Supervisor')
    const restored = { ...recentClose.record, _upd: nowIso }

    try { await persistRecordRow(restored) } catch (error: any) {
      toast(`No se pudo deshacer el cierre: ${error?.message || 'error de sincronización'}`, 5000, 'warn')
      return
    }

    saveDB((fresh: any) => {
      const next = { ...fresh, records: (fresh.records || []).map((record: any) => record.id === restored.id ? restored : record) }
      return auditLog(next, 'Cierre manual deshecho', `${recentClose.name} · ${recentClose.reason}`, actor)
    })
    toast(`Cierre de ${recentClose.name} deshecho`, 3000, 'ok')
    setRecentClose(null)
  }

  const remindMissing = () => {
    missingTeam.forEach((employee:any) => queuePush(employee.id, 'Recordatorio de fichaje', `${user.name || 'Tu responsable'} te recuerda que todavía no has iniciado la jornada.`, 'jornada', '/?tab=inicio'))
    toast(`Recordatorio enviado a ${missingTeam.length} empleado${missingTeam.length === 1 ? '' : 's'}`, 3000, 'ok')
  }

  const finishMany = async (selectedRows:any[]) => {
    if (!window.confirm(`¿Finalizar las ${selectedRows.length} jornadas visibles con la hora actual?`)) return
    const reason = window.prompt('Motivo obligatorio para el cierre múltiple:')?.trim()
    if (!reason) { toast('Debes indicar el motivo', 3000, 'warn'); return }
    const nowIso = new Date().toISOString()
    const actor = user.name || (session?.isAdmin ? 'Administración' : 'Supervisor')
    const ids = new Set(selectedRows.map(row => row.id))

    const closedRecords = (db.records || [])
      .filter((record: any) => ids.has(record.id) && !record.fin)
      .map((record: any) => {
        const breaks = [...(record.breaks || [])]
        if (record.enDescanso && record.bStartTs) breaks.push({ start:record.bStartTs, end:nowIso })
        const closed:any = { ...record, fin:nowIso, breaks, enDescanso:false, bStartTs:null, closed:true, cerradoPor:actor, cerradoPorId:user.id || 'admin', cierreManual:true, motivoCierre:reason, operationId:globalThis.crypto?.randomUUID?.() ?? record.operationId ?? null, _rev:(record._rev || 0) + 1, _upd:nowIso }
        const totals = calcSecs(closed); closed.workSecs=totals.work; closed.breakSecs=totals.brk
        return closed
      })
    if (!closedRecords.length) return

    try { await Promise.all(closedRecords.map((r: any) => persistRecordRow(r))) } catch (error: any) {
      toast(`No se pudieron finalizar todas las jornadas: ${error?.message || 'error de sincronización'}`, 5000, 'warn')
      return
    }

    const closedById = new Map(closedRecords.map((r: any) => [r.id, r]))
    saveDB((fresh:any) => {
      const records = (fresh.records || []).map((record:any) => closedById.get(record.id) || record)
      const next = { ...fresh, records }
      return auditLog(next, 'Jornadas finalizadas en lote', `${selectedRows.length} empleados · ${reason}`, actor)
    })
    selectedRows.forEach(row => queuePush(row.employeeId, 'Jornada finalizada', `${actor} ha finalizado tu jornada. Motivo: ${reason}`, 'jornada', '/?tab=jornada'))
    toast(`${closedRecords.length} jornadas finalizadas`, 3000, 'ok')
  }

  return <OnlineTeam rows={rows} hasScope={hasScope} onFinishShift={finishShift} recentClose={recentClose} onUndoClose={undoClose} missingCount={missingTeam.length} onRemindMissing={remindMissing} onFinishMany={finishMany} onOpenEmployee={row => onOpenEmployee(row.employeeId)} />
}

function MessagesPage() {
  const db      = useAppStore(s => s.db) as any
  const session = useAppStore(s => s.session)
  const saveDB  = useAppStore(s => s.saveDB)

  // Identidad fija del canal "administración" en el chat — NUNCA el id real
  // de sesión. Un jefe de obra o encargado inicia sesión con isAdmin=true
  // pero session.user.id es su propio id de empleado; si se usara ese id
  // aquí, el mensaje se guardaría con un `from` distinto de 'admin' y el
  // empleado nunca lo vería (ModalChat.jsx/TabMensajes.jsx/EmployeePage.jsx
  // solo escuchan mensajes de/hacia el literal 'admin').
  const adminId = 'admin'
  const adminName = session?.user?.name || 'Admin'
  const chats: any[] = db.chats || []
  const emps = (db.employees || []).filter((e: any) => !e.isAdmin)

  const conversations = useMemo(() => {
    return emps.map((e: any) => {
      const conv = chats
        .filter((m: any) =>
          (m.from === e.id && m.to === adminId) || (m.from === adminId && m.to === e.id)
        )
        .sort((a: any, b: any) => String(a.ts || '').localeCompare(String(b.ts || '')))

      const unread = chats.filter((m: any) => m.from === e.id && m.to === adminId && !m.leido).length
      const last = conv[conv.length - 1]

      return {
        empId: e.id,
        empName: e.name,
        dept: e.dept || e.centroTrabajo || '',
        unread,
        lastMessage: last?.text || 'Sin mensajes',
        lastTime: last?.ts ? fmtTime(last.ts) : '',
        messages: conv.map((m: any) => ({
          id: m.id,
          from: m.from === adminId ? 'admin' : 'emp',
          text: m.text,
          time: fmtTime(m.ts),
        })),
      }
    }).filter((c: any) => c.messages.length > 0 || emps.length <= 5)
  }, [chats, emps, adminId])

  const handleSend = (empId: string, text: string) => {
    const newChat = {
      id: gid(), from: adminId, to: empId,
      text, ts: new Date().toISOString(), leido: false,
    }
    saveDB((fresh: any) => ({ chats: [...(fresh.chats || []), newChat] }))
    queuePush(empId, `Mensaje de ${adminName}`, text, 'mensajes', '/?go=emp:mensajes')
  }

  // Sin esto, el badge de "no leídos" nunca bajaba aunque el admin ya
  // hubiera abierto y leído la conversación.
  const handleMarkRead = (empId: string) => {
    saveDB((fresh: any) => {
      const chatsList = fresh.chats || []
      const hasUnread = chatsList.some((m: any) => m.from === empId && m.to === adminId && !m.leido)
      if (!hasUnread) return null
      return { chats: chatsList.map((m: any) => (m.from === empId && m.to === adminId && !m.leido) ? { ...m, leido: true } : m) }
    })
  }

  return <Messages conversations={conversations} adminName={adminName} onSend={handleSend} onSelectConversation={handleMarkRead} />
}

function OperationsPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const db = useAppStore(s => s.db) as any
  const saveDB = useAppStore(s => s.saveDB)
  const toast = useAppStore(s => s.toast)
  const syncStatus = useAppStore(s => s.syncStatus)
  const syncError = useAppStore(s => s.syncError)
  const offlinePending = useAppStore(s => s.offlinePending)
  const realtimeStatus = useAppStore(s => s.realtimeStatus)
  const lastSyncTime = useAppStore(s => s.lastSyncTime)
  const fetchDB = useAppStore(s => s.fetchDB)
  const schedules = db.config?.reportSchedules || []
  const defaultWidgets = ['employees', 'working', 'break', 'absent', 'hoursToday']
  const legacyWidgetIds: Record<string, string> = { validation: 'break', requests: 'absent', coverage: 'hoursToday' }
  const visibleWidgets = (db.config?.adminDashboard?.visibleWidgets || defaultWidgets)
    .map((id: string) => legacyWidgetIds[id] || id)
  const employees = (db.employees || []).filter((employee: any) => !employee.baja)
  const authReady = employees.filter((employee: any) => employee.auth_id || employee.authId).length
  const documentCount = (db.documentos || []).length

  const updateConfig = (patch: any) => saveDB((fresh: any) => ({
    config: { ...(fresh.config || {}), ...patch, _upd: new Date().toISOString() },
  }))

  const onSync = async () => {
    await uploadPendingIfAny()
    await fetchDB()
    toast('Sincronización comprobada', 2200, 'ok')
  }

  return <Operations
    syncStatus={syncStatus}
    syncError={syncError}
    offlinePending={offlinePending}
    realtimeStatus={realtimeStatus}
    lastSyncTime={lastSyncTime}
    authReady={authReady}
    authTotal={employees.length}
    documentCount={documentCount}
    schedules={schedules}
    visibleWidgets={visibleWidgets}
    onSync={onSync}
    onSaveSchedule={(schedule: any) => {
      updateConfig({ reportSchedules: [...schedules, schedule] })
      toast('Programación guardada', 2200, 'ok')
    }}
    onToggleSchedule={(id: string) => updateConfig({ reportSchedules: schedules.map((schedule: any) => schedule.id === id ? { ...schedule, enabled: !schedule.enabled, _upd: new Date().toISOString() } : schedule) })}
    onDeleteSchedule={(id: string) => updateConfig({ reportSchedules: schedules.filter((schedule: any) => schedule.id !== id) })}
    onChangeWidgets={(ids: string[]) => updateConfig({ adminDashboard: { ...(db.config?.adminDashboard || {}), visibleWidgets: ids } })}
    onNavigate={onNavigate}
  />
}

// ─── Main shell ────────────────────────────────────────────────────────────────

// Páginas visibles para encargado/jefe de obra (panel supervisor limitado)
const ENC_PAGES = ['en_linea', 'fichajes', 'planning', 'validar', 'solicitudes', 'mensajes', 'notificaciones']

export default function AppV2Admin() {
  const { session, currentAdminPage, setAdminPage, logout, setScreen, syncStatus, syncError, offlinePending, lastSyncTime, fetchDB, db } = useAppStore(
    useShallow((state: any) => ({
      session: state.session,
      currentAdminPage: state.currentAdminPage,
      setAdminPage: state.setAdminPage,
      logout: state.logout,
      setScreen: state.setScreen,
      syncStatus: state.syncStatus,
      syncError: state.syncError,
      offlinePending: state.offlinePending,
      lastSyncTime: state.lastSyncTime,
      fetchDB: state.fetchDB,
      db: state.db,
    })),
  ) as any
  const [search, setSearch] = useState('')
  const [fichajesSearch, setFichajesSearch] = useState('')
  const [isLight, setIsLight] = useState(() => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light')
  const [manualSyncing, setManualSyncing] = useState(false)
  const [showAI, setShowAI] = useState(false)
  const name = session?.user?.name || 'Admin'
  const aiUser = session?.user || { id:'__admin__', name, role:'admin', isAdmin:true }
  const notis = useNotificationsData()
  const unreadCount = useMemo(() => notis.items.filter(n => !n.read).length, [notis.items])

  // Detectar si es encargado/jefe_obra en lugar de admin
  const isEnc = !session?.isAdmin && (session?.isEnc || session?.isJO)
  const encRoleLabel = session?.isJO ? 'Jefe de obra' : 'Encargado'

  // Filtrar páginas según rol
  const visiblePages = useMemo(() => isEnc ? PAGES.filter(p => ENC_PAGES.includes(p.id)) : PAGES, [isEnc])
  const { pendingHours, pendingRequests, pendingExpenses } = useMemo(() => ({
    // Misma ventana que ValidateHoursPage (últimos 14 días + tope de 60 filas
    // más recientes) antes de contar pendientes: si no, la insignia contaba
    // pendientes que ni siquiera aparecen en la lista de "Validar horas"
    // (por estar fuera del rango o del tope), mostrando un número que nunca
    // coincidía con lo visible en pantalla.
    pendingHours: (db.records || [])
      .filter((r: any) => r.fin && r.inicio && daysDiff(r.inicio) <= 14)
      .sort((a: any, b: any) => String(b.inicio || '').localeCompare(String(a.inicio || '')))
      .slice(0, 60)
      .filter((r: any) => !r.aceptada && !r.validado && !r.rechazado).length,
    pendingRequests: (db.vacaciones || []).filter((v: any) => v.estado === 'pendiente').length
      + (db.correccionesFichaje || []).filter((c: any) => !c.estado || c.estado === 'pendiente').length,
    pendingExpenses: (db.gastos || []).filter((g: any) => g.estado === 'pendiente').length,
  }), [db.records, db.vacaciones, db.correccionesFichaje, db.gastos])
  const pendingVac = (db.vacaciones || []).filter((v: any) => v.estado === 'pendiente').length
  const navBadges: Record<string, number> = {
    pendientes: pendingHours + pendingRequests + pendingExpenses,
    validar: pendingHours,
    solicitudes: pendingRequests,
    vacaciones: pendingVac,
    gastos: pendingExpenses,
    notificaciones: unreadCount,
  }
  const navItems = visiblePages.map(p => ({
    id: p.id,
    label: p.label,
    group: p.group,
    icon: <span>{p.icon}</span>,
    badge: navBadges[p.id] || undefined,
  }))

  // Página por defecto según rol; si el encargado llega con 'dashboard', redirigir a 'validar'
  const effectivePage = isEnc
    ? (ENC_PAGES.includes(currentAdminPage || '') ? (currentAdminPage || 'validar') : 'validar')
    : (currentAdminPage || 'dashboard')

  const roleLabel = session?.isJO || session?.user?.role === 'jefe_obra'
    ? 'Jefe de obra · Administrador'
    : isEnc ? encRoleLabel : 'Administrador'

  function goToFichajes(empId: string) {
    const emp = (db.employees || []).find((e: any) => e.id === empId)
    setFichajesSearch(emp?.name || '')
    setAdminPage('fichajes')
  }

  const globalMatches = (() => {
    const q = search.trim().toLocaleLowerCase('es')
    if (!q) return []
    const pages = visiblePages
      .filter(p => `${p.label} ${p.group}`.toLocaleLowerCase('es').includes(q))
      .slice(0, 4)
      .map(p => ({ key:`page:${p.id}`, label:p.label, action:() => setAdminPage(p.id) }))
    const employees = (db.employees || [])
      .filter((e: any) => !e.baja && `${e.name} ${e.email || ''}`.toLocaleLowerCase('es').includes(q))
      .slice(0, 4)
      .map((e: any) => ({ key:`emp:${e.id}`, label:e.name, action:() => goToFichajes(e.id) }))
    return [...pages, ...employees]
  })()

  const runGlobalSearch = () => {
    const normalized = search.trim().toLocaleLowerCase('es')
    const target = globalMatches.find(item => item.label.toLocaleLowerCase('es') === normalized) || globalMatches[0]
    if (!target) return
    target.action()
    setSearch('')
  }

  const syncNow = async () => {
    if (manualSyncing) return
    setManualSyncing(true)
    try {
      await uploadPendingIfAny()
      await fetchDB()
    } finally {
      setManualSyncing(false)
    }
  }
  const safeLogout = () => {
    if (offlinePending && !window.confirm('Hay cambios pendientes de sincronizar. Si cierras sesión ahora seguirán guardados en este dispositivo. ¿Continuar?')) return
    logout()
  }

  function renderPage() {
    const page = effectivePage
    if (page === 'dashboard')      return <DashboardPage onNavigate={setAdminPage} />
    if (page === 'pendientes')     return <PendingCenterPage onNavigate={setAdminPage} />
    if (page === 'empleados')      return <EmployeesPage onViewTimesheets={goToFichajes} />
    if (page === 'en_linea')       return <OnlineTeamPage onOpenEmployee={goToFichajes} />
    if (page === 'fichajes')       return <TimesheetsPage key={fichajesSearch} initialSearch={fichajesSearch} onSearchChange={setFichajesSearch} />
    if (page === 'planning')       return <PlanningPage onOpenEmployee={goToFichajes} />
    if (page === 'turnos')         return <ShiftsPage onOpenEmployee={goToFichajes} />
    if (page === 'validar')        return <ValidateHoursPage />
    if (page === 'solicitudes')    return <RequestsPage onOpenEmployee={name => { setFichajesSearch(name); setAdminPage('fichajes') }} />
    if (page === 'vacaciones')     return <VacacionesAdminPage />
    if (page === 'gastos')         return <ExpensesPage onOpenEmployee={name => { setFichajesSearch(name); setAdminPage('fichajes') }} />
    if (page === 'documentos')     return <DocumentsPage />
    if (page === 'estadisticas')   return <StatsPage onNavigate={setAdminPage} />
    if (page === 'informes')       return <ReportsPage onNavigate={setAdminPage} />
    if (page === 'cierre')         return <MonthlyClosePage />
    if (page === 'mensajes')       return <MessagesPage />
    if (page === 'notificaciones') return <NotificationsPage onNavigate={setAdminPage} />
    if (page === 'anomalias')      return <AnomaliesPage onOpenEmployee={name => { setFichajesSearch(name); setAdminPage('fichajes') }} />
    if (page === 'auditoria')      return <AuditPage onNavigate={setAdminPage} />
    if (page === 'obras')          return <ObrasPage onNavigate={setAdminPage} />
    if (page === 'centros')        return <CentrosPage />
    if (page === 'operaciones')    return <OperationsPage onNavigate={setAdminPage} />
    return null
  }

  return (
    <div id="sAdmin" style={{ minHeight: '100dvh' }}>
    <AppShell
      navItems={navItems}
      activeNav={effectivePage}
      onSelectNav={setAdminPage}
      sidebarHeader={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/icon-192.png" style={{ width: 30, height: 30, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} alt="Times INC" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-.2px', color: colors.text[900] }}>TIMES INC</span>
            </div>
            <div style={{ fontSize: 10, color: colors.text[500] }}>Control Horario</div>
          </div>
        </div>
      }
      sidebarFooter={
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }}>
            <Avatar name={name} size={32} status="online" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.text[900], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
              <div style={{ fontSize: 10.5, color: colors.text[500] }}>{roleLabel}</div>
            </div>
            <button onClick={safeLogout} title="Cerrar sesión" aria-label="Cerrar sesión" style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text[400], display: 'flex', padding: 6, borderRadius: 8 }}>
              <IconLogout width={15} height={15} />
            </button>
          </div>
          {setScreen && session?.user?.id && (
            <button onClick={() => setScreen('emp')} style={{ width: '100%', marginTop: 8, padding: '7px 10px', borderRadius: 8, border: `1px solid ${colors.border.default}`, background: colors.bg[600], color: colors.text[700], fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <IconHome width={13} height={13} /> Vista empleado
            </button>
          )}
        </>
      }
      headerActions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              placeholder="Buscar empleado o sección…"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              list="admin-global-search"
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') runGlobalSearch() }}
            />
            <datalist id="admin-global-search">
              {globalMatches.map(item => <option key={item.key} value={item.label} />)}
            </datalist>
          </div>
          <button
            type="button"
            onClick={syncNow}
            disabled={manualSyncing}
            title={`${offlinePending ? 'Cambios pendientes' : syncStatus === 'synced' ? 'Sincronizado' : 'Estado: ' + syncStatus}${syncError ? ` · ${syncError}` : ''}${lastSyncTime ? ` · Última copia ${new Date(lastSyncTime).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })}` : ''}. Pulsa para sincronizar ahora.`}
            aria-label="Sincronizar ahora"
            style={{ minWidth:32, height:32, padding:'0 9px', display:'flex', alignItems:'center', justifyContent:'center', gap:6, borderRadius:9, border:`1px solid ${offlinePending || syncStatus === 'error' ? 'rgba(245,158,11,.45)' : colors.border.subtle}`, background:colors.bg[600], color:offlinePending || syncStatus === 'error' ? colors.semantic.orange : colors.semantic.green, cursor:manualSyncing?'wait':'pointer', fontSize:11, fontWeight:700 }}
          >
            <span style={{ width:7, height:7, borderRadius:'50%', background:'currentColor', boxShadow:offlinePending?'0 0 0 3px rgba(245,158,11,.14)':'none' }} />
            <span className="uiv2-sync-label">{manualSyncing ? 'Sincronizando…' : offlinePending ? '1 lote pendiente' : syncStatus === 'synced' ? 'Al día' : 'Reintentar'}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAI(true)}
            aria-label="Abrir Times AI"
            title="Times AI · análisis operativo"
            style={{ minWidth:32, height:32, padding:'0 9px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:9, border:`1px solid ${colors.primary.glow}`, background:colors.primary.dim, color:colors.primary.light, cursor:'pointer', fontSize:11, fontWeight:800 }}
          >
            ✦ <span className="uiv2-sync-label" style={{ marginLeft:5 }}>IA</span>
          </button>
          <button
            type="button"
            aria-label={isLight ? 'Activar modo oscuro' : 'Activar modo claro'}
            title={isLight ? 'Modo oscuro' : 'Modo claro'}
            onClick={() => { toggleTheme(); setIsLight(v => !v) }}
            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: `1px solid ${colors.border.subtle}`, background: colors.bg[600], color: colors.text[700], cursor: 'pointer', fontSize: 15, lineHeight: 1 }}
          >
            {isLight ? <IconMoon width={18} height={18} /> : <IconSun width={18} height={18} />}
          </button>
          <button
            onClick={() => setAdminPage('notificaciones')}
            type="button"
            aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
            style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', color: colors.text[700], display: 'flex', padding: 4 }}
          >
            <IconBell width={20} height={20} />
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, background: colors.semantic?.red || '#EF4444', color: '#fff', fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: `2px solid ${colors.bg[700]}` }}>
                {unreadCount}
              </span>
            )}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar name={name} size={30} />
            <span style={{ fontSize: 12, fontWeight: 640, color: colors.text[900] }}>{name.split(' ')[0]}</span>
          </div>
        </div>
      }
      pageTitle=""
      breadcrumb="TIMES INC"
    >
      <Suspense fallback={<PageLoader />}>{renderPage()}</Suspense>
    </AppShell>
    {showAI && (
      <Suspense fallback={null}>
        <ModalAI visible db={{ ...db, _runtimeSync:{ syncStatus, syncError, offlinePending, lastSyncTime } }} u={aiUser} onClose={() => setShowAI(false)} />
      </Suspense>
    )}
    </div>
  )
}
