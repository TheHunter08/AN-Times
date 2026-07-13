// Shell admin v2 — usa el nuevo AppShell + páginas v2 con datos reales de useAppStore.
// CLAUDE.md: UI only — NO tocar backend, Supabase, auth ni lógica de negocio.
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../store/appStore.js'
import { AppShell } from './layout/AppShell.js'
import { Dashboard } from './pages/Dashboard.js'
import { Timesheets } from './pages/Timesheets.js'
import { Employees } from './pages/Employees.js'
import { Requests } from './pages/Requests.js'
import { Notifications } from './pages/Notifications.js'
import { Planning } from './pages/Planning.js'
import { Shifts } from './pages/Shifts.js'
import { ValidateHours } from './pages/ValidateHours.js'
import { Expenses } from './pages/Expenses.js'
import { Documents } from './pages/Documents.js'
import { Reports } from './pages/Reports.js'
import { Stats } from './pages/Stats.js'
import { MonthlyClose } from './pages/MonthlyClose.js'
import { Audit } from './pages/Audit.js'
import { Anomalies } from './pages/Anomalies.js'
import { Messages } from './pages/Messages.js'
import { Obras } from './pages/Obras.js'
import { Search } from './components/Search.js'
import { Avatar } from './components/Avatar.js'
import { colors } from './design-system/colors'
import {
  IconGrid, IconClock, IconCalendar, IconChart, IconUsers,
  IconFolder, IconFileText, IconClipboard, IconBell, IconChat,
  IconShield, IconBuilding, IconAlertCircle, IconReceipt,
  IconCheck, IconLogout, IconRows, IconSeal, IconTrendUp, IconMapPin,
  IconEdit, IconUserPlus, IconHome, IconX, IconPlus, IconSun, IconMoon,
} from './components/Icons.js'
import { useDashboardData } from './hooks/useDashboardData.js'
import { useTimesheetsData } from './hooks/useTimesheetsData.js'
import { useEmployeesData } from './hooks/useEmployeesData.js'
import { useRequestsData } from './hooks/useRequestsData.js'
import { useNotificationsData } from './hooks/useNotificationsData.js'
import { auditLog, queuePush } from '../services/dataService.js'
import { supabase } from '../services/dataServiceV2.js'
import { gid, today, mhm, localDateStr, calcSecs } from '../utils/time.js'
import { clipBreaksToWindow } from '../utils/adminHelpers.js'
import { toggleTheme } from '../utils/userConfig.js'
import { downloadSimplePdf, downloadExcel } from '../utils/exportFiles.js'

const PAGES = [
  { id: 'dashboard',      label: 'Dashboard',         group: 'Principal', icon: <IconGrid /> },
  { id: 'empleados',      label: 'Empleados',         group: 'Equipo', icon: <IconUsers /> },
  { id: 'fichajes',       label: 'Fichajes',          group: 'Equipo', icon: <IconClock /> },
  { id: 'planning',       label: 'Planning',          group: 'Equipo', icon: <IconCalendar /> },
  { id: 'turnos',         label: 'Turnos',            group: 'Equipo', icon: <IconRows /> },
  { id: 'validar',        label: 'Validar horas',     group: 'Gestión', icon: <IconCheck /> },
  { id: 'solicitudes',    label: 'Solicitudes',       group: 'Gestión', icon: <IconClipboard /> },
  { id: 'gastos',         label: 'Gastos',            group: 'Gestión', icon: <IconReceipt /> },
  { id: 'obras',          label: 'Obras',             group: 'Gestión', icon: <IconBuilding /> },
  { id: 'centros',        label: 'Centros de trabajo',group: 'Gestión', icon: <IconMapPin /> },
  { id: 'documentos',     label: 'Documentos',        group: 'Gestión', icon: <IconFolder /> },
  { id: 'estadisticas',   label: 'Estadísticas',      group: 'Análisis', icon: <IconChart /> },
  { id: 'informes',       label: 'Informes',          group: 'Análisis', icon: <IconFileText /> },
  { id: 'cierre',         label: 'Cierre mensual',    group: 'Análisis', icon: <IconSeal /> },
  { id: 'anomalias',      label: 'Anomalías',         group: 'Análisis', icon: <IconAlertCircle /> },
  { id: 'auditoria',      label: 'Auditoría',         group: 'Análisis', icon: <IconShield /> },
  { id: 'mensajes',       label: 'Mensajes',          group: 'Comunicación', icon: <IconChat /> },
  { id: 'notificaciones', label: 'Notificaciones',    group: 'Comunicación', icon: <IconBell /> },
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
  crearTurnos: boolean
}

function EmployeeModal({ initial, onClose }: { initial?: EmpForm; onClose: () => void }) {
  const db     = useAppStore(s => s.db) as any
  const saveDB = useAppStore(s => s.saveDB)
  const toast  = useAppStore(s => s.toast)
  const obras  = (db.obras || []).filter((o: any) => o.activa !== false)
  const centros: string[] = db.centrosTrabajo || db.config?.centros || []

  const blank: EmpForm = { id: gid(), name: '', email: '', role: 'empleado', pin: '', pinLen: null, centroTrabajo: '', telefono: '', obrasAsignadas: [], fechaInicioContrato: '', turnoInicio: '08:00', turnoFin: '16:00', crearTurnos: false }
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

  const rows = useRequestsData(approve, reject)
  return { rows, approve, reject }
}

function DashboardPage({ onNavigate }: { onNavigate: (id: string) => void }) {
  const data = useDashboardData()
  const db = useAppStore(s => s.db) as any
  const toast = useAppStore(s => s.toast)
  const { rows: reqRows } = useRequestsActions()
  const pendingCount = reqRows.filter((r: any) => r.status === 'pending').length

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
    const rows = [['Empleado', 'Centro', 'Fecha', 'Entrada', 'Salida', 'Horas']]
    weekRecs.forEach((r: any) => {
      const emp = emps.find((e: any) => e.id === r.empId)
      const mins = Math.round((new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000)
      rows.push([
        emp?.name || r.empName || '',
        r.centro || emp?.centroTrabajo || '',
        (r.inicio || '').slice(0, 10),
        new Date(r.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        new Date(r.fin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        `${Math.floor(mins/60)}h${mins%60>0?Math.floor(mins%60)+'m':''}`,
      ])
    })
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `semana-${monday.toISOString().slice(0,10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    toast(`CSV semana descargado — ${weekRecs.length} fichajes`, 3000, 'ok')
  }

  const activeEmps = useMemo(() => {
    const liveIds = new Set((db.records || []).filter((r: any) => !r.fin).map((r: any) => r.empId))
    return (db.employees || []).filter((e: any) => !e.baja && !e.isAdmin && liveIds.has(e.id))
  }, [db.records, db.employees])

  const teamAvatars = useMemo(() => {
    const emps = (db.employees || []).filter((e: any) => !e.baja && !e.isAdmin)
    const liveIds = new Set((db.records || []).filter((r: any) => !r.fin).map((r: any) => r.empId))
    const pauseIds = new Set((db.records || []).filter((r: any) => !r.fin && r.enDescanso).map((r: any) => r.empId))
    const active = emps.filter((e: any) => liveIds.has(e.id))
    const rest = emps.filter((e: any) => !liveIds.has(e.id))
    const shown = [...active, ...rest].slice(0, 6)
    const extra = Math.max(0, emps.length - shown.length)
    return { shown, extra, activeCount: active.size || active.length, pauseCount: pauseIds.size, total: emps.length }
  }, [db.records, db.employees])

  const nextVacRequest = useMemo(() => {
    const pending = (db.vacaciones || []).filter((v: any) => v.estado === 'pendiente')
    if (!pending.length) return undefined
    const v = pending[0]
    return { label: `${v.empName || 'Empleado'} — ${v.tipo || 'Vacaciones'}`, time: v.fechaInicio ? new Date(v.fechaInicio).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'Pendiente' }
  }, [db.vacaciones])

  const extraHorasMes = useMemo(() => {
    const now = new Date()
    const mesStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const wdMin: number = (db.config?.wdMin) || 480
    const byDay = new Map<string, number>()
    ;(db.records || []).filter((r: any) => r.fin && r.inicio?.startsWith(mesStr)).forEach((r: any) => {
      const key = `${r.empId}::${r.inicio.slice(0, 10)}`
      const mins = (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000
      byDay.set(key, (byDay.get(key) || 0) + mins)
    })
    let extra = 0
    byDay.forEach(mins => { if (mins > wdMin) extra += mins - wdMin })
    return Math.round(extra)
  }, [db.records, db.config])

  const kpiIcons = [
    <IconUsers width={16} height={16} />,
    <IconClock width={16} height={16} />,
    <IconCheck width={16} height={16} />,
    <IconTrendUp width={16} height={16} />,
    <IconClipboard width={16} height={16} />,
  ]

  const kpisWithExtra = data.kpis.map((k, i) => ({
    ...k,
    icon: kpiIcons[i],
    tone: (k as any).tone ?? (['primary', 'accent', 'cyan', 'cyan', 'amber'] as const)[i],
  }))

  return (
    <Dashboard
      {...data}
      greetingSub="Aquí tienes el resumen de tu equipo."
      kpis={kpisWithExtra}
      trend={data.trend}
      compareTrend={data.compareTrend}
      activity={data.activity}
      nextEvent={nextVacRequest}
      teamSlot={teamAvatars}
      onExport={handleExport}
      quickLinks={[
        { id: 'empleados',   label: 'Empleados activos', value: `${teamAvatars.activeCount}/${teamAvatars.total}`, onClick: () => onNavigate('empleados') },
        { id: 'fichajes',    label: 'Trabajando ahora',  value: data.kpis[1]?.value || '0', onClick: () => onNavigate('fichajes') },
        { id: 'solicitudes', label: 'Solicitudes pend.', value: String(pendingCount), onClick: () => onNavigate('solicitudes') },
        { id: 'estadisticas',label: 'Estadísticas',      value: 'Ver', onClick: () => onNavigate('estadisticas') },
      ]}
    />
  )
}

function RequestsPage() {
  const { rows } = useRequestsActions()
  return <Requests rows={rows} />
}

function NotificationsPage() {
  const { items, markRead, markAllRead, dismiss } = useNotificationsData()
  return <Notifications items={items} onMarkRead={markRead} onMarkAllRead={markAllRead} onDismiss={dismiss} />
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
  const rows = useTimesheetsData(search)
  const handleSearch = (s: string) => { setSearch(s); onSearchChange?.(s) }
  return <Timesheets rows={rows} search={search} onSearchChange={handleSearch} />
}

function PlanningPage() {
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

    const todayStr = today()
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
          return s + (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000
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
    />
  )
}

function ShiftsPage() {
  const db = useAppStore(s => s.db) as any
  const [weekOffset, setWeekOffset] = useState(0)

  const { weekLabel, days, employees } = useMemo(() => {
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
      const worked = (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000
      const expected = Number(db.config?.wdMin) || 480
      const diff = worked - expected
      const diffH = Math.abs(Math.floor(diff / 60))
      const diffM = Math.abs(Math.floor(diff % 60))
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
  }, [db])

  const handleApprove = (id: string) => {
    const rec = (db.records || []).find((r: any) => r.id === id)
    if (!rec) return
    const nowIso = new Date().toISOString()
    saveDB((fresh: any) => ({
      records: (fresh.records || []).map((r: any) =>
        r.id === id ? { ...r, aceptada: true, validado: true, rechazado: false, validadoBy: session?.user?.name || 'Admin', validadoAt: nowIso, _upd: nowIso } : r
      ),
    }))
    toast('Jornada validada', 2500, 'ok')
  }

  const handleReject = (id: string) => {
    const rec = (db.records || []).find((r: any) => r.id === id)
    if (!rec) return
    const nowIso = new Date().toISOString()
    saveDB((fresh: any) => ({
      records: (fresh.records || []).map((r: any) =>
        r.id === id ? { ...r, aceptada: false, rechazado: true, validado: false, validadoBy: session?.user?.name || 'Admin', validadoAt: nowIso, _upd: nowIso } : r
      ),
    }))
    toast('Jornada rechazada', 2500, 'warn')
  }

  const handleModify = (id: string, entry: string, exit: string) => {
    const rec = (db.records || []).find((r: any) => r.id === id)
    if (!rec) return
    const base = new Date(rec.inicio)
    const [eh, em] = entry.split(':').map(Number)
    const [xh, xm] = exit.split(':').map(Number)
    if (!Number.isFinite(eh) || !Number.isFinite(em) || !Number.isFinite(xh) || !Number.isFinite(xm)) {
      toast('Introduce una hora válida', 3000, 'warn')
      return
    }
    const newInicio = new Date(base); newInicio.setHours(eh, em, 0, 0)
    const newFin    = new Date(base); newFin.setHours(xh, xm, 0, 0)
    if (newFin <= newInicio) newFin.setDate(newFin.getDate() + 1)
    const breaks = clipBreaksToWindow(rec.breaks || [], newInicio, newFin)
    const recalculated = calcSecs({ ...rec, inicio: newInicio.toISOString(), fin: newFin.toISOString(), breaks })
    const nowIso = new Date().toISOString()
    const inicioIso = newInicio.toISOString()
    const finIso = newFin.toISOString()
    const correction = {
      id: gid(), ts: nowIso, tipo: 'admin', motivo: 'Corrección de horario desde Validar horas',
      oldInicio: rec.inicio, oldFin: rec.fin, newInicio: inicioIso, newFin: finIso,
      by: session?.user?.name || 'Admin',
    }
    const correcciones = [...(rec.correcciones || []), correction]
    saveDB((fresh: any) => ({
      records: (fresh.records || []).map((r: any) =>
        r.id === id ? { ...r, inicio: inicioIso, fin: finIso, breaks, workSecs: recalculated.work, breakSecs: recalculated.brk, aceptada: true, validado: true, rechazado: false, modificado: true, correcciones, validadoBy: session?.user?.name || 'Admin', validadoAt: nowIso, _upd: nowIso } : r
      ),
    }))
    toast('Horario modificado', 2500, 'ok')
  }

  const handleDelete = (id: string) => {
    const rec = (db.records || []).find((r: any) => r.id === id)
    if (!rec || !window.confirm('¿Eliminar este fichaje? Esta acción no se puede deshacer.')) return
    saveDB((fresh: any) => ({ records: (fresh.records || []).filter((r: any) => r.id !== id) }))
    if (supabase) supabase.from('records').delete().eq('id', id).then(({ error }: any) => {
      if (error) toast('Eliminado localmente — no se pudo confirmar con el servidor', 4000, 'warn')
    })
    toast('Fichaje eliminado', 2500, 'ok')
  }

  return <ValidateHours rows={rows} weekLabel="Últimas 2 semanas" onApprove={handleApprove} onReject={handleReject} onModify={handleModify} onDelete={handleDelete} />
}

function ExpensesPage() {
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
    saveDB((freshDb: any) => {
      const nowIso = new Date().toISOString()
      const updated = (freshDb.gastos || []).map((x: any) =>
        x.id === id ? { ...x, estado: 'aprobado', resolvedAt: nowIso, resolvedBy: session?.user?.name || 'Admin', _upd: nowIso } : x
      )
      const withAudit = auditLog(freshDb, 'Gasto aprobado', `${g.empName}: ${g.concepto} ${g.importe}€`, session?.user?.name || 'Admin')
      return { gastos: updated, audit: withAudit.audit }
    })
    toast('Gasto aprobado', 3000, 'ok')
  }

  const reject = (id: string) => {
    const g = (db.gastos || []).find((x: any) => x.id === id)
    if (!g) return
    saveDB((freshDb: any) => {
      const nowIso = new Date().toISOString()
      const updated = (freshDb.gastos || []).map((x: any) =>
        x.id === id ? { ...x, estado: 'rechazado', resolvedAt: nowIso, resolvedBy: session?.user?.name || 'Admin', _upd: nowIso } : x
      )
      const withAudit = auditLog(freshDb, 'Gasto rechazado', `${g.empName}: ${g.concepto}`, session?.user?.name || 'Admin')
      return { gastos: updated, audit: withAudit.audit }
    })
    toast('Gasto rechazado', 3000, 'warn')
  }

  return <Expenses items={items} onApprove={approve} onReject={reject} />
}

function DocumentsPage() {
  const db    = useAppStore(s => s.db) as any
  const saveDB = useAppStore(s => s.saveDB)
  const toast = useAppStore(s => s.toast)
  const uploadRef = useRef<HTMLInputElement>(null)
  const uploadMeta = useRef<{ empId: string; empName: string; tipo: string } | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadEmpId, setUploadEmpId] = useState('')
  const [uploadType, setUploadType] = useState('contrato')
  const employees = useMemo(() => (db.employees || []).filter((e: any) => !e.isAdmin && !e.baja), [db.employees])

  const catMap: Record<string, 'contrato' | 'nomina' | 'certificado' | 'otro'> = {
    contrato: 'contrato', nomina: 'nomina', nómina: 'nomina',
    certificado: 'certificado',
  }

  const handleDownload = (id: string) => {
    const doc = (db.documentos || []).find((d: any) => d.id === id)
    if (!doc) return
    const url = doc.url || doc.pdfData || doc.fileUrl || doc.data
    if (url) {
      const a = document.createElement('a')
      a.href = url
      a.download = doc.nombre || doc.name || `documento-${id}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } else {
      toast('Archivo no disponible (sin URL de descarga)', 3000, 'warn')
    }
  }

  const items = useMemo(() => (db.documentos || []).map((d: any) => ({
    id: d.id,
    name: d.nombre || d.name || 'Documento',
    category: catMap[(d.tipo || d.category || '').toLowerCase()] || 'otro',
    empName: d.empName || '—',
    size: d.size || d.peso || '—',
    uploadedOn: fmtDate(d.ts || d.fecha || d.createdAt),
    onDownload: handleDownload,
  })), [db.documentos])

  const requestUpload = () => {
    if (!employees.length) { toast('Primero debes crear un empleado', 3000, 'warn'); return }
    setUploadEmpId(employees[0].id)
    setUploadType('contrato')
    setUploadOpen(true)
  }

  const chooseFile = () => {
    const emp = employees.find((e: any) => e.id === uploadEmpId)
    if (!emp) { toast('Selecciona un empleado', 2500, 'warn'); return }
    uploadMeta.current = { empId: emp.id, empName: emp.name, tipo: uploadType }
    uploadRef.current?.click()
  }

  const uploadFile = (file?: File) => {
    const meta = uploadMeta.current
    if (!file || !meta) return
    if (file.size > 8 * 1024 * 1024) { toast('El archivo supera el máximo de 8 MB', 3500, 'warn'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const now = new Date().toISOString()
      saveDB((fresh: any) => ({ documentos: [...(fresh.documentos || []), {
        id: gid(), empId: meta.empId, empName: meta.empName, tipo: meta.tipo,
        nombre: file.name, size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
        mime: file.type, data: reader.result, createdAt: now, _upd: now,
      }] }))
      toast(`Documento subido a ${meta.empName}`, 3000, 'ok')
      uploadMeta.current = null
      setUploadOpen(false)
    }
    reader.onerror = () => toast('No se pudo leer el documento', 3000, 'warn')
    reader.readAsDataURL(file)
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
          <button onClick={chooseFile} style={{ minHeight:48, display:'flex', alignItems:'center', justifyContent:'center', gap:7, border:0, borderRadius:12, background:colors.primary.base, color:'#fff', fontSize:14, fontWeight:750, cursor:'pointer' }}><IconPlus width={15} height={15}/> Seleccionar archivo</button>
          <div style={{ fontSize:11, color:colors.text[400], textAlign:'center' }}>PDF, Word, Excel o imagen · máximo 8 MB</div>
        </div>
      </div>
    )}
  </>
}

function ReportsPage() {
  const db = useAppStore(s => s.db) as any
  const toast = useAppStore(s => s.toast)

  const months = useMemo(() => {
    const set = new Set<string>()
    ;(db.records || []).forEach((r: any) => {
      if (r.inicio) set.add(r.inicio.slice(0, 7))
    })
    return [...set].sort().reverse().slice(0, 12)
  }, [db.records])

  const handleDownloadCSV = (mes: string) => {
    const [year, mon] = mes.split('-')
    const label = new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    const recs = (db.records || []).filter((r: any) => (r.inicio || '').startsWith(mes) && r.fin)
    const emps = (db.employees || []).filter((e: any) => !e.isAdmin)
    const rows = [['Empleado', 'Centro', 'Fecha', 'Entrada', 'Salida', 'Horas trabajadas', 'Descanso (min)']]
    recs.forEach((r: any) => {
      const emp = emps.find((e: any) => e.id === r.empId)
      const mins = (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000
      const brk = Math.round((r.breakSecs || 0) / 60)
      const worked = Math.round(mins - brk)
      rows.push([
        emp?.name || r.empName || r.empId || '',
        r.centro || emp?.centroTrabajo || '',
        (r.inicio || '').slice(0, 10),
        new Date(r.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        new Date(r.fin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        `${Math.floor(worked / 60)}h ${worked % 60}m`,
        String(brk),
      ])
    })
    downloadExcel(rows[0], rows.slice(1), `fichajes-${mes}.xls`)
    toast(`Excel descargado — ${label}`, 3000, 'ok')
  }

  const handleDownload = async (mes: string) => {
    const [year, mon] = mes.split('-')
    const label = new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    const recs = (db.records || []).filter((r: any) => (r.inicio || '').startsWith(mes) && r.fin)
    const emps = (db.employees || []).filter((e: any) => !e.isAdmin)

    const pdfLines: string[] = []
    emps.forEach((e: any) => {
      const empRecs = recs.filter((r: any) => r.empId === e.id)
      const mins = empRecs.reduce((s: number, r: any) =>
        s + (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000, 0)
      const days = new Set(empRecs.map((r: any) => (r.inicio || '').slice(0, 10))).size
      const h = Math.floor(mins / 60), m = Math.floor(mins % 60)
      pdfLines.push(`${e.name} | ${e.centroTrabajo || e.dept || '-'} | ${days} dias | ${h}h ${m}m`)
    })

    const totalMins = recs.reduce((s: number, r: any) =>
      s + (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000, 0)

    pdfLines.unshift(`Generado: ${new Date().toLocaleDateString('es-ES')}`)
    pdfLines.push(`TOTAL: ${Math.floor(totalMins / 60)}h ${Math.floor(totalMins % 60)}m | ${recs.length} fichajes`)
    await downloadSimplePdf(`Informe mensual - ${label}`, pdfLines, `informe-${mes}.pdf`)
  }

  const rows = useMemo(() => months.map((m) => {
    const [year, mon] = m.split('-')
    const label = new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    const recs = (db.records || []).filter((r: any) => (r.inicio || '').startsWith(m) && r.fin)
    const totalMins = recs.reduce((s: number, r: any) => {
      if (!r.inicio || !r.fin) return s
      return s + (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000
    }, 0)
    const empCount = new Set(recs.map((r: any) => r.empId)).size
    return {
      id: m,
      name: `Informe mensual · ${label}`,
      description: `${empCount} empleados · ${Math.round(totalMins / 60)}h totales`,
      generatedOn: label,
      onDownload: handleDownload,
      onDownloadCSV: handleDownloadCSV,
    }
  }), [months, db.records])

  return <Reports rows={rows} />
}

function StatsPage() {
  const db = useAppStore(s => s.db) as any

  const { kpis, bars, centrosBars, donut, rawSlices } = useMemo(() => {
    const allRecs = (db.records || []).filter((r: any) => r.fin && r.inicio)
    const thisMonth = new Date().toISOString().slice(0, 7)
    const monthRecs = allRecs.filter((r: any) => (r.inicio || '').startsWith(thisMonth))
    const totalMins = monthRecs.reduce((s: number, r: any) => {
      return s + (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000
    }, 0)
    const emps = (db.employees || []).filter((e: any) => !e.isAdmin && !e.baja)
    const empCount = emps.length || 1
    const avgMins = totalMins / Math.max(monthRecs.length, 1)
    const avgH = Math.floor(avgMins / 60)
    const avgM = Math.floor(avgMins % 60)

    const kpis = [
      { label: 'Horas este mes', value: `${Math.floor(totalMins / 60)}h`, tone: 'primary' as const },
      { label: 'Media por fichaje', value: `${avgH}h${avgM > 0 ? avgM + 'm' : ''}`, tone: 'accent' as const },
      { label: 'Empleados activos', value: String(empCount), tone: 'cyan' as const },
      { label: 'Fichajes totales', value: String(monthRecs.length), tone: 'amber' as const },
    ]

    // Hours per employee bar
    const bars = emps.slice(0, 8).map((e: any) => {
      const empMins = monthRecs.filter((r: any) => r.empId === e.id).reduce((s: number, r: any) =>
        s + (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000, 0
      )
      const maxPossible = 160 * 60 // 160h/month
      return { label: e.name?.split(' ')[0] || e.id, value: Math.min(100, Math.round(empMins / maxPossible * 100)) }
    })

    // Hours per centro de trabajo
    const centroMap = new Map<string, number>()
    monthRecs.forEach((r: any) => {
      const emp = emps.find((e: any) => e.id === r.empId)
      const centro = r.centro || emp?.centroTrabajo || 'Sin asignar'
      const mins = (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000
      centroMap.set(centro, (centroMap.get(centro) || 0) + mins)
    })
    const centrosBars = [...centroMap.entries()]
      .map(([label, mins]) => ({ label, value: Math.round(mins / 60) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)

    const rawSlices = [
      { label: 'Jornada completa', value: monthRecs.filter((r: any) => {
        const mins = (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000
        return mins >= 420 && mins <= 540
      }).length, color: colors.semantic.green },
      { label: 'Jornada parcial', value: monthRecs.filter((r: any) => {
        const mins = (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000
        return mins > 0 && mins < 420
      }).length, color: colors.semantic.orange },
      { label: 'Horas extra', value: monthRecs.filter((r: any) => {
        const mins = (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000
        return mins > 540
      }).length, color: colors.primary.base },
    ]
    const sliceTotal = rawSlices.reduce((s, x) => s + x.value, 0) || 1
    const donut = {
      slices: rawSlices.map(s => ({ label: s.label, pct: Math.round(s.value / sliceTotal * 100), color: s.color })),
      centerValue: String(monthRecs.length),
      centerLabel: 'fichajes',
    }

    return { kpis, bars, centrosBars, donut, rawSlices }
  }, [db])

  return (
    <Stats
      title="Estadísticas del mes"
      kpis={kpis}
      bars={bars}
      centrosBars={centrosBars}
      donut={donut}
      comparison={[
        { label: 'Jornada completa', value: `${Math.round((rawSlices[0].value / Math.max(rawSlices.reduce((s, x) => s + x.value, 0), 1)) * 100)}%`, deltaTone: 'up' },
        { label: 'Jornadas extra', value: `${rawSlices[2].value}`, deltaTone: 'up' },
      ]}
    />
  )
}

function MonthlyClosePage() {
  const db      = useAppStore(s => s.db) as any
  const saveDB  = useAppStore(s => s.saveDB)
  const session = useAppStore(s => s.session)
  const toast   = useAppStore(s => s.toast)
  const autoGenRef = useRef(false)

  const mesActual = new Date().toISOString().slice(0, 7)

  // Auto-generate closures only for months that have already ended (never the current month)
  useEffect(() => {
    if (autoGenRef.current) return
    autoGenRef.current = true
    const now = new Date()
    // Calculate previous month
    const prevY = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const prevM = now.getMonth() === 0 ? 12 : now.getMonth()
    const mesPasado = `${prevY}-${String(prevM).padStart(2, '0')}`
    const emps = (db.employees || []).filter((e: any) => !e.isAdmin && !e.baja)
    const existing = new Set((db.cierres || []).filter((c: any) => c.mes === mesPasado).map((c: any) => c.empId))
    const toCreate = emps.filter((e: any) => !existing.has(e.id))
    if (!toCreate.length) return
    saveDB((fresh: any) => {
      const recs = fresh.records || []
      const nuevos = toCreate.flatMap((e: any) => {
        const eRecs = recs.filter((r: any) => r.empId === e.id && r.fin && r.inicio?.startsWith(mesPasado))
        if (!eRecs.length) return []
        const totalMin = Math.floor(eRecs.reduce((s: number, r: any) => {
          const ini = new Date(r.inicio).getTime(), fin = new Date(r.fin).getTime()
          return s + Math.max(0, (fin - ini) / 60000 - Math.floor((r.breakSecs || 0) / 60))
        }, 0))
        return [{
          id: gid(), empId: e.id, empName: e.name, mes: mesPasado,
          totalMin, dias: eRecs.length, estado: 'pendiente',
          generadoPor: 'Sistema', generadoAt: new Date().toISOString(),
          firma: null, firmaEmp: null, firmaAdmin: null,
        }]
      })
      if (!nuevos.length) return null
      const withAudit = auditLog(fresh, `Cierre mensual auto-generado (${mesPasado})`, `${nuevos.length} empleados`, session?.user?.name || 'Admin')
      return { cierres: [...(fresh.cierres || []), ...nuevos], audit: withAudit.audit }
    })
  }, []) // eslint-disable-line

  // Build closure items from db.cierres, enriched with records
  const items = useMemo(() => {
    const emps = (db.employees || []).filter((e: any) => !e.isAdmin && !e.baja)
    return (db.cierres || [])
      .sort((a: any, b: any) => String(b.mes || '').localeCompare(String(a.mes || '')))
      .map((c: any) => {
        const emp = emps.find((e: any) => e.id === c.empId)
        const [year, mon] = (c.mes || '').split('-')
        const monthLabel = year && mon
          ? new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
          : c.mes || '—'

        const recs = (db.records || []).filter((r: any) =>
          r.empId === c.empId && r.fin && r.inicio && (r.inicio || '').startsWith(c.mes || '')
        )
        const totalMins = recs.reduce((s: number, r: any) =>
          s + (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000, 0
        )
        const extraMins = Math.max(0, totalMins - 160 * 60)

        const dayRecs = recs.map((r: any) => ({
          date:  new Date(r.inicio).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
          entry: fmtTime(r.inicio),
          exit:  fmtTime(r.fin),
          hours: (() => { const m = (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000; return `${Math.floor(m/60)}h${Math.floor(m%60)}m` })(),
        }))

        // Supervisor: find encargado or jefe_obra assigned to same centro
        const supervisor = (db.employees || []).find((e: any) =>
          (e.role === 'encargado' || e.role === 'jefe_obra') &&
          e.centroTrabajo === (emp?.centroTrabajo || '') && !e.isAdmin
        )

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
          workedDays: new Set(recs.map((r: any) => (r.inicio || '').slice(0, 10))).size,
          signedBy: (c.firmaAdmin && (c.firmaEmp || c.firma)) ? 'all' : (c.firmaEmp || c.firma) ? 'emp' : 'none',
          firmaAdmin: !!c.firmaAdmin,
          firmaEmp: !!c.firmaEmp || !!c.firma,
          firmaSupervisor: !!c.firmaSupervisor,
          supervisorName: supervisor?.name,
          generatedOn: fmtDate(c.ts || c.fecha),
          estado: c.estado || 'pendiente',
          records: dayRecs,
        } as any
      })
  }, [db])

  // Generate closures for the previous (completed) month only
  const handleGenerateAll = () => {
    const now = new Date()
    const prevY = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const prevM = now.getMonth() === 0 ? 12 : now.getMonth()
    const mesPasado = `${prevY}-${String(prevM).padStart(2, '0')}`
    const emps = (db.employees || []).filter((e: any) => !e.isAdmin && !e.baja)
    const existing = new Set((db.cierres || []).filter((c: any) => c.mes === mesPasado).map((c: any) => c.empId))
    const toCreate = emps.filter((e: any) => !existing.has(e.id))
    if (!toCreate.length) { toast(`Todos los empleados ya tienen cierre de ${mesPasado}`, 3000, 'ok'); return }

    saveDB((fresh: any) => {
      const recs = fresh.records || []
      const nuevos = toCreate.flatMap((e: any) => {
        const eRecs = recs.filter((r: any) => r.empId === e.id && r.fin && r.inicio?.startsWith(mesPasado))
        if (!eRecs.length) return []
        const totalMin = Math.floor(eRecs.reduce((s: number, r: any) => {
          const ini = new Date(r.inicio).getTime(), fin = new Date(r.fin).getTime()
          return s + Math.max(0, (fin - ini) / 60000 - Math.floor((r.breakSecs || 0) / 60))
        }, 0))
        return [{ id: gid(), empId: e.id, empName: e.name, mes: mesPasado, totalMin, dias: eRecs.length, estado: 'pendiente', generadoPor: session?.user?.name || 'Admin', generadoAt: new Date().toISOString(), firma: null, firmaEmp: null, firmaAdmin: null }]
      })
      if (!nuevos.length) { toast(`Sin registros de ${mesPasado}`, 3000, 'warn'); return null }
      const withAudit = auditLog(fresh, `Cierre mensual generado (${mesPasado})`, `${nuevos.length} empleados`, session?.user?.name || 'Admin')
      return { cierres: [...(fresh.cierres || []), ...nuevos], audit: withAudit.audit }
    })
    toast(`Generando cierres de ${mesPasado}…`, 2500, 'ok')
  }

  const handleSignAdmin = (id: string) => {
    saveDB((fresh: any) => ({
      cierres: (fresh.cierres || []).map((c: any) =>
        c.id === id ? { ...c, firmaAdmin: true, firmaAdminAt: new Date().toISOString(), firmaAdminBy: session?.user?.name || 'Admin', estado: c.firmaEmp ? 'firmado' : c.estado } : c
      ),
    }))
    toast('Firma admin registrada', 2500, 'ok')
  }

  const handleDeleteClosure = (id: string) => {
    const closure = (db.cierres || []).find((c: any) => c.id === id)
    if (!closure || !window.confirm('¿Eliminar este cierre y su PDF generado? Esta acción no se puede deshacer.')) return
    saveDB((fresh: any) => ({ cierres: (fresh.cierres || []).filter((c: any) => c.id !== id) }))
    if (supabase) supabase.from('cierres').delete().eq('id', id).then(({ error }: any) => {
      if (error) toast('Eliminado localmente — no se pudo confirmar con el servidor', 4000, 'warn')
    })
    toast('Cierre eliminado', 2500, 'ok')
  }

  return <MonthlyClose items={items} onSignAdmin={handleSignAdmin} onGenerateAll={handleGenerateAll} onDelete={handleDeleteClosure} />
}

function AuditPage() {
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
    })), [db.audit])

  const handleExport = () => {
    const csv = ['Fecha,Acción,Usuario,Detalle', ...entries.map((e: any) =>
      `"${e.ts}","${e.action}","${e.user}","${e.detail}"`
    )].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    toast('Auditoría exportada', 2000, 'ok')
  }

  return <Audit entries={entries} onExport={handleExport} />
}

function AnomaliesPage() {
  const db = useAppStore(s => s.db) as any

  const items = useMemo(() => {
    const anomalies: any[] = []
    const records: any[] = db.records || []
    const todayStr = today()

    records.forEach((r: any) => {
      if (!r.inicio) return
      const dateStr = r.inicio.slice(0, 10)
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
    })

    // Detect overlapping records per employee per day
    const byEmpDay = new Map<string, any[]>()
    records.filter((r: any) => r.fin && r.inicio).forEach((r: any) => {
      const key = `${r.empId}::${r.inicio.slice(0, 10)}`
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

    return anomalies.slice(0, 50)
  }, [db])

  return <Anomalies items={items} />
}

function ObrasPage() {
  const db = useAppStore(s => s.db) as any
  const todayStr = today()

  const items = useMemo(() => {
    const obras = db.obras || []
    const employees: any[] = (db.employees || []).filter((e: any) => !e.isAdmin && !e.baja)
    const records: any[] = db.records || []

    return obras.map((o: any) => {
      const assigned = employees.filter((e: any) =>
        Array.isArray(e.obrasAsignadas) && e.obrasAsignadas.includes(o.id)
      )
      const assignedIds = new Set(assigned.map((e: any) => e.id))
      const todayRecs = records.filter((r: any) =>
        assignedIds.has(r.empId) && r.fin && (r.inicio || '').startsWith(todayStr)
      )
      const todayMins = todayRecs.reduce((s: number, r: any) => {
        return s + (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000
      }, 0)
      const manager = employees.find((e: any) =>
        (e.role === 'encargado' || e.role === 'jefe_obra') &&
        Array.isArray(e.obrasAsignadas) && e.obrasAsignadas.includes(o.id)
      )
      return {
        id: o.id,
        name: o.nombre || o.id,
        address: o.coords ? `GPS: ${String(o.coords).slice(0, 30)}` : '—',
        status: (o.activa === false ? 'completada' : 'activa') as 'activa' | 'completada',
        employeeCount: assigned.length,
        hoursToday: todayMins > 0 ? `${Math.floor(todayMins / 60)}h${todayMins % 60 > 0 ? Math.floor(todayMins % 60) + 'm' : ''}` : '0h',
        manager: manager?.name || '—',
        startDate: fmtDate(o.fechaInicio || o.createdAt || o.ts),
      }
    })
  }, [db, todayStr])

  return <Obras items={items} />
}

function MessagesPage() {
  const db      = useAppStore(s => s.db) as any
  const session = useAppStore(s => s.session)
  const saveDB  = useAppStore(s => s.saveDB)
  const toast   = useAppStore(s => s.toast)

  const adminId = session?.user?.id || 'admin'
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

  return <Messages conversations={conversations} adminName={adminName} onSend={handleSend} />
}

// ─── Main shell ────────────────────────────────────────────────────────────────

// Páginas visibles para encargado/jefe de obra (panel supervisor limitado)
const ENC_PAGES = ['fichajes', 'planning', 'validar', 'solicitudes', 'mensajes', 'notificaciones']

export default function AppV2Admin() {
  const { session, currentAdminPage, setAdminPage, logout, setScreen } = useAppStore() as any
  const [search, setSearch] = useState('')
  const [fichajesSearch, setFichajesSearch] = useState('')
  const [isLight, setIsLight] = useState(() => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light')

  const name = session?.user?.name || 'Admin'
  const notis = useNotificationsData()
  const unreadCount = notis.items.filter(n => !n.read).length

  // Detectar si es encargado/jefe_obra en lugar de admin
  const isEnc = !session?.isAdmin && (session?.isEnc || session?.isJO)
  const encRoleLabel = session?.isJO ? 'Jefe de obra' : 'Encargado'

  // Filtrar páginas según rol
  const visiblePages = isEnc ? PAGES.filter(p => ENC_PAGES.includes(p.id)) : PAGES
  const navItems = visiblePages.map(p => ({ id: p.id, label: p.label, group: p.group, icon: <span>{p.icon}</span> }))

  // Página por defecto según rol; si el encargado llega con 'dashboard', redirigir a 'validar'
  const effectivePage = isEnc
    ? (ENC_PAGES.includes(currentAdminPage || '') ? (currentAdminPage || 'validar') : 'validar')
    : (currentAdminPage || 'dashboard')

  const db = useAppStore(s => s.db) as any

  function goToFichajes(empId: string) {
    const emp = (db.employees || []).find((e: any) => e.id === empId)
    setFichajesSearch(emp?.name || '')
    setAdminPage('fichajes')
  }

  function renderPage() {
    const page = effectivePage
    if (page === 'dashboard')      return <DashboardPage onNavigate={setAdminPage} />
    if (page === 'empleados')      return <EmployeesPage onViewTimesheets={goToFichajes} />
    if (page === 'fichajes')       return <TimesheetsPage key={fichajesSearch} initialSearch={fichajesSearch} onSearchChange={setFichajesSearch} />
    if (page === 'planning')       return <PlanningPage />
    if (page === 'turnos')         return <ShiftsPage />
    if (page === 'validar')        return <ValidateHoursPage />
    if (page === 'solicitudes')    return <RequestsPage />
    if (page === 'gastos')         return <ExpensesPage />
    if (page === 'documentos')     return <DocumentsPage />
    if (page === 'estadisticas')   return <StatsPage />
    if (page === 'informes')       return <ReportsPage />
    if (page === 'cierre')         return <MonthlyClosePage />
    if (page === 'mensajes')       return <MessagesPage />
    if (page === 'notificaciones') return <NotificationsPage />
    if (page === 'anomalias')      return <AnomaliesPage />
    if (page === 'auditoria')      return <AuditPage />
    if (page === 'obras')          return <ObrasPage />
    if (page === 'centros')        return <CentrosPage />
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
              <div style={{ fontSize: 10.5, color: colors.text[500] }}>{isEnc ? encRoleLabel : 'Administrador'}</div>
            </div>
            <button onClick={logout} title="Cerrar sesión" style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text[400], display: 'flex', padding: 4 }}>
              <IconLogout width={15} height={15} />
            </button>
          </div>
          {setScreen && (
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
              placeholder="Buscar…"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            />
          </div>
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
      {renderPage()}
    </AppShell>
    </div>
  )
}
