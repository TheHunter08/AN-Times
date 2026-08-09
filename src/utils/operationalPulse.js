import { isRecordPendingValidation } from './recordValidation.js'

const HOUR_MS = 60 * 60 * 1000

const list = value => Array.isArray(value) ? value : []

export function buildOperationalPulse(db = {}, now = Date.now()) {
  const records = list(db.records).filter(record => !record?.deleted)
  const employees = list(db.employees).filter(employee => !employee?.baja && !employee?.isAdmin)
  const openRecords = records.filter(record => record?.inicio && !record?.fin)
  const staleOpen = openRecords.filter(record => {
    const startedAt = new Date(record.inicio).getTime()
    return Number.isFinite(startedAt) && now - startedAt >= 12 * HOUR_MS
  })
  const onBreak = openRecords.filter(record => record?.enDescanso).length
  const pendingHours = records.filter(isRecordPendingValidation).length
  const pendingRequests = list(db.vacaciones).filter(item => item?.estado === 'pendiente').length
    + list(db.correccionesFichaje).filter(item => !item?.estado || item.estado === 'pendiente').length
  const pendingExpenses = list(db.gastos).filter(item => item?.estado === 'pendiente').length
  const incompleteProfiles = employees.filter(employee => !String(employee?.email || '').trim() || !String(employee?.centroTrabajo || '').trim()).length
  const reviewItems = pendingHours + pendingRequests + pendingExpenses
  const reviewMinutes = reviewItems * 3

  const penalty = Math.min(100,
    staleOpen.length * 20
      + Math.min(30, pendingHours * 2)
      + Math.min(18, pendingRequests * 3)
      + Math.min(12, pendingExpenses * 3)
      + Math.min(20, incompleteProfiles * 2),
  )
  const score = Math.max(0, 100 - penalty)
  const level = score >= 85 ? 'Óptimo' : score >= 65 ? 'Estable' : score >= 40 ? 'Atención' : 'Crítico'
  const tone = score >= 85 ? 'green' : score >= 65 ? 'primary' : score >= 40 ? 'orange' : 'red'

  const signals = [
    { id:'open', label:'Equipo activo ahora', value:openRecords.length, detail:onBreak ? `${onBreak} en descanso` : 'Sin pausas activas', page:'en_linea', tone:'green' },
    { id:'validation', label:'Horas por validar', value:pendingHours, detail:pendingHours ? 'Afectan al cierre y a los informes' : 'Validación al día', page:'validar', tone:pendingHours ? 'orange' : 'green' },
    { id:'requests', label:'Solicitudes en cola', value:pendingRequests, detail:pendingRequests ? 'Vacaciones y correcciones pendientes' : 'Bandeja despejada', page:'solicitudes', tone:pendingRequests ? 'primary' : 'green' },
    { id:'stale', label:'Jornadas de riesgo', value:staleOpen.length, detail:staleOpen.length ? 'Abiertas desde hace 12 horas o más' : 'Sin jornadas anómalas', page:'anomalias', tone:staleOpen.length ? 'red' : 'green' },
  ]

  let nextAction = { label:'Explorar el equipo en vivo', detail:'No hay bloqueos prioritarios. Revisa cobertura y actividad.', page:'en_linea' }
  if (incompleteProfiles) nextAction = { label:'Completar perfiles', detail:`${incompleteProfiles} perfil${incompleteProfiles === 1 ? '' : 'es'} sin correo o centro de trabajo.`, page:'empleados' }
  if (pendingExpenses) nextAction = { label:'Resolver gastos', detail:`${pendingExpenses} gasto${pendingExpenses === 1 ? '' : 's'} pendiente${pendingExpenses === 1 ? '' : 's'} de revisión.`, page:'gastos' }
  if (pendingRequests) nextAction = { label:'Vaciar solicitudes', detail:`${pendingRequests} solicitud${pendingRequests === 1 ? '' : 'es'} esperando decisión.`, page:'solicitudes' }
  if (pendingHours) nextAction = { label:'Validar horas', detail:`${pendingHours} jornada${pendingHours === 1 ? '' : 's'} bloquea${pendingHours === 1 ? '' : 'n'} una operativa limpia.`, page:'validar' }
  if (staleOpen.length) nextAction = { label:'Resolver jornadas de riesgo', detail:`${staleOpen.length} jornada${staleOpen.length === 1 ? '' : 's'} lleva${staleOpen.length === 1 ? '' : 'n'} abierta${staleOpen.length === 1 ? '' : 's'} 12 h o más.`, page:'anomalias' }

  return {
    score,
    level,
    tone,
    signals,
    nextAction,
    activeNow:openRecords.length,
    onBreak,
    reviewItems,
    reviewMinutes,
    reviewEstimate:reviewItems === 0 ? 'Sin cola de revisión' : reviewMinutes < 60 ? `≈ ${reviewMinutes} min de revisión` : `≈ ${Math.floor(reviewMinutes / 60)} h ${reviewMinutes % 60 ? `${reviewMinutes % 60} min` : ''} de revisión`,
    explanation:'Índice local y explicable: resta peso por jornadas de riesgo, validaciones, solicitudes, gastos y perfiles incompletos.',
  }
}
