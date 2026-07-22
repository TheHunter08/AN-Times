import { useState } from 'react'
import { Card } from '../components/Card.js'
import { PageTitle } from '../components/PageTitle.js'
import { ProductState } from '../components/ProductState.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconCheck, IconClock, IconFileText, IconShield } from '../components/Icons.js'
import { buildReportScheduleICS, downloadICS } from '../../utils/calendarExport.js'

export interface ReportSchedule {
  id: string
  name: string
  frequency: 'weekly' | 'monthly'
  format: 'pdf' | 'excel'
  recipients: string
  enabled: boolean
  _upd: string
}

export interface LaunchBlocker {
  employeeId: string
  employeeName: string
  issues: string[]
}

interface OperationsProps {
  syncStatus: string
  syncError?: string | null
  offlinePending: boolean
  realtimeStatus: string
  lastSyncTime?: number | null
  authReady: number
  authTotal: number
  emailReady: number
  signatureReady: number
  signatureTotal: number
  pushReady: number | null
  pushTotal: number
  pendingValidation: number
  documentCount: number
  launchBlockers: LaunchBlocker[]
  schedules: ReportSchedule[]
  visibleWidgets: string[]
  onSync: () => Promise<void>
  onSaveSchedule: (schedule: ReportSchedule) => void
  onToggleSchedule: (id: string) => void
  onDeleteSchedule: (id: string) => void
  onChangeWidgets: (ids: string[]) => void
  onNavigate: (page: string) => void
  onReviewEmployee: (employeeId: string) => void
}

const WIDGETS = [
  { id: 'employees', label: 'Empleados activos' },
  { id: 'working', label: 'Trabajando ahora' },
  { id: 'break', label: 'En descanso' },
  { id: 'absent', label: 'Ausentes hoy' },
  { id: 'hoursToday', label: 'Horas trabajadas hoy' },
]

const inputStyle = {
  minHeight: 40, width: '100%', boxSizing: 'border-box' as const, padding: '8px 11px',
  borderRadius: radius.sm, border: `1px solid ${colors.border.default}`,
  background: colors.bg[600], color: colors.text[900], fontFamily: 'inherit', fontSize: 12.5,
}

export function Operations(props: OperationsProps) {
  const [syncing, setSyncing] = useState(false)
  const [name, setName] = useState('Informe mensual de jornada')
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('monthly')
  const [format, setFormat] = useState<'pdf' | 'excel'>('pdf')
  const [recipients, setRecipients] = useState('')

  const syncNow = async () => {
    if (syncing) return
    setSyncing(true)
    try { await props.onSync() } finally { setSyncing(false) }
  }

  const addSchedule = () => {
    if (!name.trim() || !recipients.trim()) return
    props.onSaveSchedule({
      id: `report_${Date.now().toString(36)}`,
      name: name.trim(), frequency, format, recipients: recipients.trim(), enabled: true,
      _upd: new Date().toISOString(),
    })
    setRecipients('')
  }

  const authPct = props.authTotal ? Math.round((props.authReady / props.authTotal) * 100) : 0
  const syncHealthy = props.syncStatus === 'synced' && !props.offlinePending
  const realtimeHealthy = props.realtimeStatus === 'SUBSCRIBED'
  const orderedWidgets = [...WIDGETS].sort((a, b) => {
    const ai = props.visibleWidgets.indexOf(a.id), bi = props.visibleWidgets.indexOf(b.id)
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
  })
  const moveWidget = (id: string, delta: number) => {
    const current = [...props.visibleWidgets]
    const index = current.indexOf(id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= current.length) return
    ;[current[index], current[target]] = [current[target], current[index]]
    props.onChangeWidgets(current)
  }

  return (
    <div className="ti-operations">
      <div>
        <PageTitle>Centro operativo</PageTitle>
        <p className="ti-operations__subtitle">Sincronización, seguridad, automatizaciones y preferencias en un solo lugar.</p>
      </div>

      <section className="ti-operations__health" aria-label="Salud del sistema">
        {[
          { label: 'Datos', value: syncHealthy ? 'Sincronizados' : props.offlinePending ? 'Cambios pendientes' : 'Revisar conexión', ok: syncHealthy, icon: <IconCheck />, page: 'auditoria', detail: 'Abrir auditoría' },
          { label: 'Tiempo real', value: realtimeHealthy ? 'Activo' : 'Reconectando', ok: realtimeHealthy, icon: <IconClock />, page: 'en_linea', detail: 'Ver equipo conectado' },
          { label: 'Acceso seguro', value: `${props.authReady}/${props.authTotal} vinculados`, ok: authPct === 100, icon: <IconShield />, page: 'empleados', detail: 'Revisar empleados' },
          { label: 'Correos de acceso', value: `${props.emailReady}/${props.authTotal} configurados`, ok: props.emailReady === props.authTotal, icon: <IconShield />, page: 'empleados', detail: 'Completar perfiles' },
          { label: 'Firmas obligatorias', value: `${props.signatureReady}/${props.signatureTotal} registradas`, ok: props.signatureReady === props.signatureTotal, icon: <IconFileText />, page: 'empleados', detail: 'Revisar empleados' },
          { label: 'Dispositivos', value: props.pushReady == null ? 'Comprobando…' : `${props.pushReady}/${props.pushTotal} registrados`, ok: props.pushReady === props.pushTotal, icon: <IconCheck />, page: 'empleados', detail: 'Revisar cobertura' },
          { label: 'Validaciones reales', value: props.pendingValidation ? `${props.pendingValidation} pendientes` : 'Ninguna pendiente', ok: props.pendingValidation === 0, icon: <IconClock />, page: 'validar', detail: 'Abrir validación' },
          { label: 'Documentos', value: props.documentCount ? `${props.documentCount} guardados` : 'Sin documentos', ok: props.documentCount > 0, icon: <IconFileText />, page: 'documentos', detail: 'Abrir documentos' },
        ].map(item => (
          <Card key={item.label} padding={4} role="button" tabIndex={0} aria-label={`${item.label}: ${item.value}. ${item.detail}`} onClick={() => props.onNavigate(item.page)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onNavigate(item.page) } }} className="ti-operations__health-card" style={{ minHeight: 106 }}>
            <div className={`ti-operations__health-icon${item.ok ? ' is-ok' : ''}`}>{item.icon}</div>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail} →</small>
          </Card>
        ))}
      </section>

      <Card>
        <div className="ti-operations__section-title">
          <div><strong>Plan de lanzamiento por empleado</strong><span>Personas que todavía requieren una acción real</span></div>
          <span className="ti-operations__pill">{props.launchBlockers.length ? `${props.launchBlockers.length} por completar` : 'Completo'}</span>
        </div>
        {props.launchBlockers.length === 0 ? (
          <ProductState compact title="Equipo preparado para el lanzamiento" description="Todos los perfiles tienen acceso, firma y notificaciones configuradas." icon={<IconCheck />} />
        ) : (
          <div className="ti-operations__blockers">
            {props.launchBlockers.map(blocker => (
              <button key={blocker.employeeId} type="button" onClick={() => props.onReviewEmployee(blocker.employeeId)} aria-label={`Revisar ${blocker.employeeName}: ${blocker.issues.join(', ')}`}>
                <strong>{blocker.employeeName}</strong>
                <span>{blocker.issues.map(issue => <small key={issue}>{issue}</small>)}</span>
                <b>Revisar perfil →</b>
              </button>
            ))}
          </div>
        )}
      </Card>

      <section className="ti-operations__grid">
        <Card>
          <div className="ti-operations__section-title"><div><strong>Sincronización</strong><span>Estado de esta instalación</span></div><button type="button" onClick={syncNow} disabled={syncing}>{syncing ? 'Sincronizando…' : 'Sincronizar ahora'}</button></div>
          <dl className="ti-operations__details">
            <div><dt>Estado</dt><dd>{props.offlinePending ? 'Cambios pendientes de subir' : props.syncStatus}</dd></div>
            <div><dt>Última confirmación</dt><dd>{props.lastSyncTime ? new Date(props.lastSyncTime).toLocaleString('es-ES') : 'Aún no disponible'}</dd></div>
            <div><dt>Error</dt><dd>{props.syncError || 'Ninguno'}</dd></div>
          </dl>
        </Card>

        <Card>
          <div className="ti-operations__section-title"><div><strong>Preparación de acceso seguro</strong><span>Supabase Auth + políticas RLS</span></div><button type="button" className="ti-operations__secondary-action" onClick={() => props.onNavigate('empleados')}>Revisar empleados</button></div>
          <div className="ti-operations__progress"><span style={{ width: `${authPct}%` }} /></div>
          <p className="ti-operations__hint">Las políticas seguras están preparadas, pero solo deben activarse cuando todos los usuarios tengan un auth_id vinculado.</p>
        </Card>

        {!props.documentCount && (
          <Card>
            <div className="ti-operations__section-title"><div><strong>Archivo de documentos</strong><span>Contratos, nóminas y certificados</span></div><button type="button" className="ti-operations__secondary-action" onClick={() => props.onNavigate('documentos')}>Subir el primero</button></div>
            <p className="ti-operations__hint">Aún no has guardado ningún documento. Sube contratos, nóminas o certificados por empleado para tenerlos centralizados y listos ante una inspección.</p>
          </Card>
        )}
      </section>

      <section className="ti-operations__grid">
        <Card>
          <div className="ti-operations__section-title"><div><strong>Dashboard personalizado</strong><span>Elige los indicadores que quieres ver</span></div><button type="button" className="ti-operations__secondary-action" onClick={() => props.onNavigate('dashboard')}>Ver dashboard</button></div>
          <div className="ti-operations__checks">
            {orderedWidgets.map(widget => {
              const checked = props.visibleWidgets.includes(widget.id)
              const index = props.visibleWidgets.indexOf(widget.id)
              return <label key={widget.id}><input type="checkbox" checked={checked} onChange={() => props.onChangeWidgets(checked ? props.visibleWidgets.filter(id => id !== widget.id) : [...props.visibleWidgets, widget.id])} /> <span>{widget.label}</span>{checked && <span className="ti-operations__order"><button type="button" aria-label={`Subir ${widget.label}`} disabled={index === 0} onClick={event => { event.preventDefault(); moveWidget(widget.id, -1) }}>↑</button><button type="button" aria-label={`Bajar ${widget.label}`} disabled={index === props.visibleWidgets.length - 1} onClick={event => { event.preventDefault(); moveWidget(widget.id, 1) }}>↓</button></span>}</label>
            })}
          </div>
        </Card>

        <Card>
          <div className="ti-operations__section-title"><div><strong>Programar informe</strong><span>Crea un recordatorio recurrente compatible con tu calendario</span></div><button type="button" className="ti-operations__secondary-action" onClick={() => props.onNavigate('informes')}>Abrir cumplimiento</button></div>
          <div className="ti-operations__form">
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} aria-label="Nombre del informe" placeholder="Nombre del informe" />
            <div><select style={inputStyle} value={frequency} onChange={e => setFrequency(e.target.value as 'weekly' | 'monthly')} aria-label="Frecuencia"><option value="weekly">Semanal</option><option value="monthly">Mensual</option></select><select style={inputStyle} value={format} onChange={e => setFormat(e.target.value as 'pdf' | 'excel')} aria-label="Formato"><option value="pdf">PDF</option><option value="excel">Excel</option></select></div>
            <input style={inputStyle} value={recipients} onChange={e => setRecipients(e.target.value)} aria-label="Destinatarios" placeholder="administracion@empresa.com" />
            <button type="button" onClick={addSchedule} disabled={!name.trim() || !recipients.trim()}>Guardar programación</button>
          </div>
        </Card>
      </section>

      <Card>
        <div className="ti-operations__section-title"><div><strong>Informes programados</strong><span>Añádelos a Google Calendar, Outlook o Apple Calendar</span></div><span className="ti-operations__pill">{props.schedules.length}</span></div>
        {!props.schedules.length ? <ProductState compact title="Aún no hay informes programados" description="Crea una programación semanal o mensual para dejarla preparada." icon={<IconFileText />} /> : (
          <div className="ti-operations__schedules">{props.schedules.map(schedule => <div key={schedule.id}><div><strong>{schedule.name}</strong><span>{schedule.frequency === 'weekly' ? 'Semanal' : 'Mensual'} · {schedule.format.toUpperCase()} · {schedule.recipients}</span></div><div><button type="button" onClick={() => downloadICS(buildReportScheduleICS(schedule), `informe-${schedule.id}.ics`)}>Calendario</button><button type="button" onClick={() => props.onToggleSchedule(schedule.id)}>{schedule.enabled ? 'Pausar' : 'Activar'}</button><button type="button" className="is-danger" onClick={() => props.onDeleteSchedule(schedule.id)}>Eliminar</button></div></div>)}</div>
        )}
      </Card>
    </div>
  )
}
