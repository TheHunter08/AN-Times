import { useState } from 'react'
import { Card } from '../components/Card.js'
import { PageTitle } from '../components/PageTitle.js'
import { ProductState } from '../components/ProductState.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconCheck, IconClock, IconFileText, IconShield } from '../components/Icons.js'
import { buildReportScheduleICS, downloadICS } from '../../utils/calendarExport.js'
import { evaluateRlsTransition, evaluateSafeMigration } from '../../config/securityReadiness.js'
import { automationHealthList } from '../../server/automationHealth.js'
import { buildLaunchBlockerInstructions } from '../../utils/launchRequirements.js'

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
  duplicatedEmails: number
  duplicatedAuthIds: number
  signatureReady: number
  signatureTotal: number
  pushReady: number | null
  pushTotal: number
  pushCoverageState: 'loading' | 'ready' | 'error'
  pendingValidation: number
  documentCount: number
  launchBlockers: LaunchBlocker[]
  schedules: ReportSchedule[]
  automationHealth?: Record<string, any>
  migrationVerification?: Record<string, any>
  visibleWidgets: string[]
  onSync: () => Promise<void>
  onRetryPushCoverage: () => void
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
  const [actionHelpId, setActionHelpId] = useState<string | null>(null)
  const [copiedHelpId, setCopiedHelpId] = useState<string | null>(null)
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
  const rlsTransition = evaluateRlsTransition({
    authTotal:props.authTotal,
    authReady:props.authReady,
    emailReady:props.emailReady,
    duplicatedEmails:props.duplicatedEmails,
    duplicatedAuthIds:props.duplicatedAuthIds,
  })
  const { ready:rlsReady } = rlsTransition
  const migration = evaluateSafeMigration({ rlsTransition, verification:props.migrationVerification })
  const identitiesReady = rlsTransition.identityBlockers.length === 0
  const syncHealthy = props.syncStatus === 'synced' && !props.offlinePending
  const realtimeHealthy = props.realtimeStatus === 'SUBSCRIBED'
  const pushCoverageReady = props.pushCoverageState === 'ready'
  const automationRuns = automationHealthList(props.automationHealth)
  const automationLabels: Record<string, string> = {
    reminders:'Recordatorios', autoclose:'Autocierre', sync:'Sincronización offline', reports:'Informes',
    monthlyClose:'Cierre mensual', backup:'Backup verificado', migration:'Paridad de migración',
  }
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

  const copyEmployeeInstructions = async (blocker: LaunchBlocker) => {
    const text = buildLaunchBlockerInstructions(blocker)
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
      else {
        const field = document.createElement('textarea')
        field.value = text
        field.style.position = 'fixed'
        field.style.opacity = '0'
        document.body.appendChild(field)
        field.select()
        document.execCommand('copy')
        field.remove()
      }
      setCopiedHelpId(blocker.employeeId)
      window.setTimeout(() => setCopiedHelpId(current => current === blocker.employeeId ? null : current), 2500)
    } catch {
      setCopiedHelpId(null)
    }
  }

  return (
    <div className="ti-operations">
      <div>
        <PageTitle>Centro operativo</PageTitle>
        <p className="ti-operations__subtitle">Sincronización, seguridad, automatizaciones y preferencias en un solo lugar.</p>
      </div>

      <section className="ti-operations__health" aria-label="Salud del sistema">
        {[
          { label: 'Datos', value: syncHealthy ? 'Sincronizados' : props.offlinePending ? 'Cambios pendientes' : 'Revisar conexión', ok: syncHealthy, icon: <IconCheck />, action: () => props.onNavigate('auditoria'), detail: 'Abrir auditoría' },
          { label: 'Tiempo real', value: realtimeHealthy ? 'Activo' : 'Reconectando', ok: realtimeHealthy, icon: <IconClock />, action: () => props.onNavigate('en_linea'), detail: 'Ver equipo conectado' },
          { label: 'Acceso seguro', value: rlsReady ? 'Listo para prueba' : identitiesReady ? 'Ruta de datos pendiente' : `${props.authReady}/${props.authTotal} vinculados`, ok: rlsReady, icon: <IconShield />, action: () => props.onNavigate(identitiesReady ? 'auditoria' : 'empleados'), detail: identitiesReady ? 'Ver diagnóstico' : 'Revisar empleados' },
          { label: 'Correos de acceso', value: props.duplicatedEmails ? `${props.duplicatedEmails} duplicados` : `${props.emailReady}/${props.authTotal} configurados`, ok: props.emailReady === props.authTotal && props.duplicatedEmails === 0, icon: <IconShield />, action: () => props.onNavigate('empleados'), detail: 'Completar perfiles' },
          { label: 'Firmas obligatorias', value: `${props.signatureReady}/${props.signatureTotal} registradas`, ok: props.signatureReady === props.signatureTotal, icon: <IconFileText />, action: () => props.onNavigate('empleados'), detail: 'Revisar empleados' },
          {
            label: 'Dispositivos',
            value: props.pushCoverageState === 'loading' ? 'Comprobando…' : props.pushCoverageState === 'error' ? 'No disponible' : `${props.pushReady}/${props.pushTotal} registrados`,
            ok: pushCoverageReady && props.pushReady === props.pushTotal,
            icon: <IconCheck />,
            action: props.pushCoverageState === 'error' ? props.onRetryPushCoverage : () => props.onNavigate('empleados'),
            detail: props.pushCoverageState === 'error' ? 'Reintentar comprobación' : 'Revisar cobertura',
          },
          { label: 'Validaciones reales', value: props.pendingValidation ? `${props.pendingValidation} pendientes` : 'Ninguna pendiente', ok: props.pendingValidation === 0, icon: <IconClock />, action: () => props.onNavigate('validar'), detail: 'Abrir validación' },
          { label: 'Documentos', value: props.documentCount ? `${props.documentCount} guardados` : 'Sin documentos', ok: props.documentCount > 0, icon: <IconFileText />, action: () => props.onNavigate('documentos'), detail: 'Abrir documentos' },
        ].map(item => (
          <Card key={item.label} padding={4} role="button" tabIndex={0} aria-label={`${item.label}: ${item.value}. ${item.detail}`} onClick={item.action} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); item.action() } }} className="ti-operations__health-card" style={{ minHeight: 106 }}>
            <div className={`ti-operations__health-icon${item.ok ? ' is-ok' : ''}`}>{item.icon}</div>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail} →</small>
          </Card>
        ))}
      </section>

      <Card>
        <div className="ti-operations__section-title">
          <div><strong>Automatizaciones</strong><span>Última ejecución confirmada por cada proceso</span></div>
          <span className="ti-operations__pill">{automationRuns.filter(item => item.healthy).length}/{automationRuns.length} activas</span>
        </div>
        <div className="ti-operations__automation-grid">
          {automationRuns.map(item => (
            <div key={item.job} className={`ti-operations__automation${item.healthy ? ' is-ok' : ' is-warning'}`}>
              <span className="ti-operations__automation-dot" aria-hidden="true" />
              <div>
                <strong>{automationLabels[item.job]}</strong>
                <span>{item.label}</span>
                <small>{item.run?.finishedAt ? new Date(item.run.finishedAt).toLocaleString('es-ES') : 'Se mostrará tras la primera ejecución'}</small>
                {item.run?.error && <small className="is-error">{item.run.error}</small>}
              </div>
              <b>{item.run ? `${item.run.processed || 0} procesados` : 'Pendiente'}</b>
            </div>
          ))}
        </div>
        <p className="ti-operations__hint">Un estado atrasado significa que el proceso no ha confirmado una ejecución dentro de su intervalo esperado. La tarea sigue siendo idempotente y puede reintentarse sin duplicar resultados.</p>
      </Card>

      <Card>
        <div className="ti-operations__section-title">
          <div><strong>Plan de lanzamiento por empleado</strong><span>Personas que todavía requieren una acción real</span></div>
          <span className="ti-operations__pill">
            {props.pushCoverageState === 'loading'
              ? 'Comprobando dispositivos'
              : props.pushCoverageState === 'error'
                ? 'Cobertura sin comprobar'
                : props.launchBlockers.length
                  ? `${props.launchBlockers.length} por completar`
                  : 'Completo'}
          </span>
        </div>
        {props.pushCoverageState !== 'ready' && (
          <ProductState
            compact
            title={props.pushCoverageState === 'loading' ? 'Comprobando la cobertura de dispositivos' : 'No se pudo comprobar la cobertura de dispositivos'}
            description={props.pushCoverageState === 'loading'
              ? 'El plan se completará cuando termine la comprobación. Todavía no se considera que el equipo esté preparado.'
              : 'La cobertura es desconocida, así que el equipo todavía no se considera preparado para el lanzamiento.'}
            icon={<IconClock />}
            actionLabel={props.pushCoverageState === 'error' ? 'Reintentar comprobación' : undefined}
            onAction={props.pushCoverageState === 'error' ? props.onRetryPushCoverage : undefined}
          />
        )}
        {props.pushCoverageState === 'ready' && props.launchBlockers.length === 0 ? (
          <ProductState compact title="Equipo preparado para el lanzamiento" description="Todos los perfiles tienen acceso, firma y notificaciones configuradas." icon={<IconCheck />} />
        ) : props.launchBlockers.length > 0 && (
          <div className="ti-operations__blockers">
            {props.launchBlockers.map(blocker => {
              const profileFixable = blocker.issues.some(issue =>
                issue === 'Falta email' || issue === 'Falta PIN' || issue === 'Correo compartido con otro perfil'
              )
              const employeeActionOnly = !profileFixable
              const showActionHelp = employeeActionOnly && actionHelpId === blocker.employeeId
              return [
                <button
                  key={blocker.employeeId}
                  type="button"
                  onClick={() => employeeActionOnly
                    ? setActionHelpId(current => current === blocker.employeeId ? null : blocker.employeeId)
                    : props.onReviewEmployee(blocker.employeeId)}
                  aria-expanded={employeeActionOnly ? showActionHelp : undefined}
                  aria-label={`${employeeActionOnly ? 'Ver instrucciones para' : 'Revisar'} ${blocker.employeeName}: ${blocker.issues.join(', ')}`}
                >
                  <strong>{blocker.employeeName}</strong>
                  <span>{blocker.issues.map(issue => <small key={issue}>{issue}</small>)}</span>
                  <b>{employeeActionOnly ? 'Ver instrucciones →' : 'Revisar perfil →'}</b>
                </button>,
                showActionHelp && (
                  <div key={`${blocker.employeeId}-help`} className="ti-operations__device-help" role="note">
                    <strong>Siguiente paso para {blocker.employeeName}</strong>
                    {blocker.issues.includes('Identidad de acceso duplicada') && (
                      <span>Dos perfiles comparten la misma identidad de acceso. No actives RLS ni cambies correos para ocultar el conflicto: debe revisarse qué perfil es el propietario correcto antes de desvincular el otro.</span>
                    )}
                    {blocker.issues.includes('Falta crear acceso') && (
                      <span>Debe abrir la pantalla de acceso, elegir “Acceso con email” y pulsar “Primera vez: vincular mi cuenta”. Usará el correo de su perfil, su PIN habitual y una contraseña nueva.</span>
                    )}
                    {blocker.issues.includes('Falta firma') && (
                      <span>Al entrar como empleado se abrirá la configuración obligatoria. En el paso “Tu firma” debe dibujarla y guardarla; no puede registrarse desde Administración.</span>
                    )}
                    {blocker.issues.includes('Falta activar notificaciones') && (
                      <span>Debe abrir Times INC en su móvil, iniciar sesión y completar el paso “Activar notificaciones”. No puede activarse desde Administración porque el permiso pertenece a ese dispositivo.</span>
                    )}
                    {blocker.issues.includes('PIN heredado: iniciar sesión') && (
                      <span>Debe cerrar sesión y entrar una vez con su PIN habitual. La app actualizará la protección del PIN automáticamente, sin cambiarlo.</span>
                    )}
                    <button type="button" className="ti-operations__secondary-action" onClick={() => copyEmployeeInstructions(blocker)}>
                      {copiedHelpId === blocker.employeeId ? 'Instrucciones copiadas' : 'Copiar instrucciones'}
                    </button>
                  </div>
                ),
              ]
            })}
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
          <div className="ti-operations__section-title"><div><strong>Preparación de acceso seguro</strong><span>Supabase Auth + políticas RLS</span></div><span className="ti-operations__pill">{rlsReady ? 'Prueba controlada' : 'Bloqueado'}</span></div>
          <div className="ti-operations__progress"><span style={{ width: `${authPct}%` }} /></div>
          <p className="ti-operations__hint">
            {rlsReady
              ? 'Todos los perfiles tienen correo e identidad única. Ya puede prepararse una prueba controlada de RLS antes de activarla globalmente.'
              : rlsTransition.identityBlockers.length
                ? `No activar RLS todavía: ${rlsTransition.identityBlockers.join(', ')}.`
                : `No activar RLS todavía: ${rlsTransition.runtimeBlockers.join(', ')}.`}
          </p>
          <dl className="ti-operations__details" style={{ marginTop:12 }}>
            <div><dt>Fase segura</dt><dd>{migration.stage}</dd></div>
            <div><dt>Comprobación</dt><dd>{migration.label}</dd></div>
            <div><dt>Reversión</dt><dd>Blob conservado</dd></div>
          </dl>
          <button type="button" className="ti-operations__secondary-action" onClick={() => props.onNavigate('empleados')}>Revisar empleados</button>
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
          <div className="ti-operations__section-title"><div><strong>Programar informe</strong><span>Generación automática y aviso a los destinatarios</span></div><button type="button" className="ti-operations__secondary-action" onClick={() => props.onNavigate('informes')}>Abrir cumplimiento</button></div>
          <div className="ti-operations__form">
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} aria-label="Nombre del informe" placeholder="Nombre del informe" />
            <div><select style={inputStyle} value={frequency} onChange={e => setFrequency(e.target.value as 'weekly' | 'monthly')} aria-label="Frecuencia"><option value="weekly">Semanal</option><option value="monthly">Mensual</option></select><select style={inputStyle} value={format} onChange={e => setFormat(e.target.value as 'pdf' | 'excel')} aria-label="Formato"><option value="pdf">PDF</option><option value="excel">Excel</option></select></div>
            <input style={inputStyle} value={recipients} onChange={e => setRecipients(e.target.value)} aria-label="Destinatarios" placeholder="administracion@empresa.com" />
            <button type="button" onClick={addSchedule} disabled={!name.trim() || !recipients.trim()}>Guardar programación</button>
          </div>
        </Card>
      </section>

      <Card>
        <div className="ti-operations__section-title"><div><strong>Informes programados</strong><span>Se generan automáticamente; el calendario es opcional</span></div><span className="ti-operations__pill">{props.schedules.length}</span></div>
        {!props.schedules.length ? <ProductState compact title="Aún no hay informes programados" description="Crea una programación semanal o mensual para dejarla preparada." icon={<IconFileText />} /> : (
          <div className="ti-operations__schedules">{props.schedules.map(schedule => <div key={schedule.id}><div><strong>{schedule.name}</strong><span>{schedule.frequency === 'weekly' ? 'Semanal' : 'Mensual'} · {schedule.format.toUpperCase()} · {schedule.recipients}</span><small>{(schedule as any).lastRunAt ? `Último: ${new Date((schedule as any).lastRunAt).toLocaleString('es-ES')} · ${(schedule as any).lastRunStatus === 'sent' ? 'Enviado' : (schedule as any).lastRunStatus === 'generated' ? 'Generado, entrega pendiente' : (schedule as any).lastRunStatus || 'Completado'}` : 'Pendiente de primera ejecución'}</small></div><div><button type="button" onClick={() => downloadICS(buildReportScheduleICS(schedule), `informe-${schedule.id}.ics`)}>Calendario</button><button type="button" onClick={() => props.onToggleSchedule(schedule.id)}>{schedule.enabled ? 'Pausar' : 'Activar'}</button><button type="button" className="is-danger" onClick={() => props.onDeleteSchedule(schedule.id)}>Eliminar</button></div></div>)}</div>
        )}
      </Card>
    </div>
  )
}
