const ADMIN_PAGES = new Set([
  'dashboard', 'pendientes', 'empleados', 'en_linea', 'fichajes', 'planning',
  'turnos', 'validar', 'solicitudes', 'gastos', 'obras', 'centros',
  'documentos', 'estadisticas', 'informes', 'cierre', 'anomalias', 'auditoria',
  'mensajes', 'notificaciones', 'operaciones',
])

const EMPLOYEE_TABS = new Set(['inicio', 'jornada', 'vacaciones', 'calendario', 'turnos', 'perfil'])

const ADMIN_ALIASES = {
  empleado: 'empleados', empleados_activos: 'empleados', equipo: 'empleados',
  online: 'en_linea', enlinea: 'en_linea', trabajando: 'en_linea',
  fichaje: 'fichajes', jornada: 'fichajes', horas: 'fichajes',
  validacion: 'validar', validaciones: 'validar', horas_pendientes: 'validar',
  solicitud: 'solicitudes', vacaciones: 'solicitudes', correcciones: 'solicitudes',
  documento: 'documentos', docs: 'documentos',
  estadistica: 'estadisticas', stats: 'estadisticas',
  informe: 'informes', reportes: 'informes',
  cierres: 'cierre', firma: 'cierre',
  anomalia: 'anomalias', alertas: 'anomalias',
  auditoria_sistema: 'auditoria', historial: 'auditoria',
  mensaje: 'mensajes', chat: 'mensajes',
  notificacion: 'notificaciones', configuracion: 'operaciones', sistema: 'operaciones',
}

const EMPLOYEE_ALIASES = {
  home: 'inicio', fichaje: 'jornada', fichajes: 'jornada', horas: 'jornada',
  solicitud: 'vacaciones', solicitudes: 'vacaciones', vacacion: 'vacaciones',
  calendario_laboral: 'calendario', turno: 'turnos', cuenta: 'perfil',
}

function clean(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^\/+|\/+$/g, '')
}

function decoded(value) {
  let result = String(value || '').trim()
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(result)
      if (next === result) break
      result = next
    } catch { break }
  }
  return result
}

/** Extrae destinos de `admin:pagina`, `emp:seccion`, URLs y parámetros tab/go. */
export function parseNavigationTarget(raw) {
  const value = decoded(raw)
  if (!value) return null

  let go = ''
  let tab = ''
  try {
    const url = new URL(value, 'https://times-inc.local')
    go = decoded(url.searchParams.get('go') || '')
    tab = decoded(url.searchParams.get('tab') || '')
  } catch {}

  const direct = go || value
  const goMatch = direct.match(/(?:^|[?&#])go=([^&#]+)/i)
  const candidate = decoded(goMatch?.[1] || direct).replace(/^go=/i, '')
  const roleMatch = candidate.match(/^(admin|emp|employee):([^:&?#/]+)(?::([^&#?]+))?/i)
  if (roleMatch) {
    return { role: roleMatch[1] === 'admin' ? 'admin' : 'emp', target: clean(roleMatch[2]), subtab: clean(roleMatch[3]) || undefined }
  }
  if (tab) return { role: 'emp', target: clean(tab) }

  const plain = clean(candidate.split(/[?&#]/)[0])
  return plain ? { role: null, target: plain } : null
}

function explicitTarget(item) {
  return parseNavigationTarget(item?.target) || parseNavigationTarget(item?.url)
}

export function resolveAdminNotificationDestination(item = {}) {
  const explicit = explicitTarget(item)
  if (explicit && explicit.role !== 'emp') {
    const target = ADMIN_ALIASES[explicit.target] || explicit.target
    if (ADMIN_PAGES.has(target)) return target
  }

  const text = clean(`${item.action || item.title || ''} ${item.detail || item.body || ''}`)
  if (/correcci|vacac|solicitud/.test(text)) return 'solicitudes'
  if (/mensaje|chat|administracion/.test(text)) return 'mensajes'
  if (/document/.test(text)) return 'documentos'
  if (/cierre|firma/.test(text)) return 'cierre'
  if (/anomali|alerta/.test(text)) return 'anomalias'
  if (/validar|validacion|pendiente_de_aprobar/.test(text)) return 'validar'
  if (/fichaj|entrada|salida|jornada|hora/.test(text)) return 'fichajes'
  if (/emplead|aniversario|cumple/.test(text)) return 'empleados'
  return 'auditoria'
}

export function resolveEmployeeNotificationDestination(item = {}) {
  const explicit = explicitTarget(item)
  if (explicit && explicit.role !== 'admin') {
    const target = EMPLOYEE_ALIASES[explicit.target] || explicit.target
    if (target === 'documentos') return { tab: 'perfil', modal: 'documentos' }
    if (target === 'cierre' || target === 'firma') return { tab: 'perfil', modal: 'cierreSign' }
    if (target === 'chat' || target === 'mensajes') return { tab: 'inicio', modal: 'chat' }
    if (EMPLOYEE_TABS.has(target)) return { tab: target }
  }

  const text = clean(`${item.action || item.title || ''} ${item.detail || item.body || ''}`)
  if (/vacac|solicitud/.test(text)) return { tab: 'vacaciones' }
  if (/document/.test(text)) return { tab: 'perfil', modal: 'documentos' }
  if (/cierre|firma/.test(text)) return { tab: 'perfil', modal: 'cierreSign' }
  if (/mensaje|chat|administracion/.test(text)) return { tab: 'inicio', modal: 'chat' }
  if (/jornada|fich|salida|entrada|hora/.test(text)) return { tab: 'jornada' }
  return { tab: 'inicio' }
}

