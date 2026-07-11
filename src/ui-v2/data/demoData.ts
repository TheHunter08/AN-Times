// Datos de ejemplo centralizados para el arnés de previsualización de
// ui-v2 — una sola fuente de verdad para que Dashboard, Empleados,
// Solicitudes, Estadísticas y Calendario muestren SIEMPRE los mismos
// datos (antes cada pantalla inventaba sus propios números sueltos).
// Nada de esto toca datos reales: es contenido de ejemplo para el
// prototipo visual local, no para producción.

export interface DemoEmployee {
  id: string
  name: string
  dept: string
  status: 'active' | 'break' | 'off'
  role?: string
  horasHoy?: string
  location?: string
}

export const employees: DemoEmployee[] = [
  { id: '1', name: 'Juan Pérez',      dept: 'Desarrollo',       role: 'Dev Senior',       status: 'active', horasHoy: '4h 12m', location: 'Oficina Central' },
  { id: '2', name: 'María García',    dept: 'Diseño',            role: 'UX Designer',      status: 'active', horasHoy: '3h 45m', location: 'Remoto' },
  { id: '3', name: 'Carlos López',    dept: 'Análisis',          role: 'Data Analyst',     status: 'active', horasHoy: '5h 02m', location: 'Obra Norte' },
  { id: '4', name: 'Ana Martínez',    dept: 'Recursos Humanos',  role: 'RRHH Manager',     status: 'break',  horasHoy: '2h 30m', location: 'Oficina Central' },
  { id: '5', name: 'Luis Rodríguez',  dept: 'Comercial',         role: 'Account Manager',  status: 'active', horasHoy: '4h 58m', location: 'Cliente A' },
  { id: '6', name: 'Carmen Ruiz',     dept: 'Administración',    role: 'Administrativa',   status: 'off',    location: 'Oficina Central' },
  { id: '7', name: 'Pedro Sánchez',   dept: 'Obras',             role: 'Encargado',        status: 'active', horasHoy: '6h 10m', location: 'Obra Sur' },
  { id: '8', name: 'Laura Jiménez',   dept: 'Contabilidad',      role: 'Contable',         status: 'active', horasHoy: '3h 22m', location: 'Oficina Central' },
]

export interface DemoRequest {
  id: string
  type: string
  employeeName: string
  requestedOn: string
  status: 'pending' | 'approved' | 'rejected'
  days?: number
  note?: string
}

export const requests: DemoRequest[] = [
  { id: '1', type: 'Vacaciones',   employeeName: 'Luis Rodríguez', requestedOn: '8 Jul',  status: 'pending',  days: 5,  note: 'Viaje familiar programado' },
  { id: '2', type: 'Día personal', employeeName: 'Carmen Ruiz',    requestedOn: '9 Jul',  status: 'pending',  days: 1 },
  { id: '3', type: 'Teletrabajo',  employeeName: 'Juan Pérez',     requestedOn: '10 Jul', status: 'pending',  days: 3 },
  { id: '4', type: 'Horas extra',  employeeName: 'María García',   requestedOn: '7 Jul',  status: 'approved', days: 2 },
  { id: '5', type: 'Baja',         employeeName: 'Ana Martínez',   requestedOn: '5 Jul',  status: 'approved', days: 7, note: 'Baja médica justificada' },
  { id: '6', type: 'Vacaciones',   employeeName: 'Pedro Sánchez',  requestedOn: '4 Jul',  status: 'rejected', days: 10, note: 'Fechas solapadas con otro empleado' },
]

export const departmentDonut = {
  centerValue: '128h 30m',
  centerLabel: 'Total',
  slices: [
    { label: 'Administración', pct: 42, colorKey: 'primary' as const },
    { label: 'Desarrollo', pct: 28, colorKey: 'accent' as const },
    { label: 'Marketing', pct: 16, colorKey: 'cyan' as const },
    { label: 'Operaciones', pct: 10, colorKey: 'amber' as const },
    { label: 'Soporte', pct: 4, colorKey: 'pink' as const },
  ],
}

export const monthlyStats = [
  { label: 'Horas totales', value: '512h 30m', delta: '15.5%' },
  { label: 'Promedio diario', value: '8h 10m', delta: '0.5h' },
  { label: 'Días trabajados', value: '22', delta: '2' },
]

export const monthlyBars = [
  { label: '1', value: 60 }, { label: '5', value: 80 }, { label: '10', value: 45 }, { label: '15', value: 90 },
  { label: '20', value: 55 }, { label: '25', value: 70 }, { label: '30', value: 40 },
]

export const weeklyTrend = [
  { label: 'Lun', value: 70 }, { label: 'Mar', value: 82 }, { label: 'Mié', value: 65 },
  { label: 'Jue', value: 90 }, { label: 'Vie', value: 78 }, { label: 'Sáb', value: 30 }, { label: 'Dom', value: 10 },
]

export const weeklyTrendCompare = [
  { label: 'Lun', value: 55 }, { label: 'Mar', value: 60 }, { label: 'Mié', value: 58 },
  { label: 'Jue', value: 70 }, { label: 'Vie', value: 65 }, { label: 'Sáb', value: 20 }, { label: 'Dom', value: 8 },
]

export const kpis = {
  horasTrabajadas: '128h 30m',
  fichajesRealizados: 342,
  empleadosActivos: employees.filter(e => e.status !== 'off').length,
  ausenciasHoy: 2,
}

export const activity = [
  { id: '1', text: 'Juan Pérez — Entrada registrada', time: '08:15', tone: 'green' as const },
  { id: '2', text: 'María García — Salida registrada', time: '17:45', tone: 'purple' as const },
  { id: '3', text: 'Carlos López — Entrada registrada', time: '08:02', tone: 'green' as const },
  { id: '4', text: 'Ana Martínez — Solicitud aprobada', time: 'Ayer', tone: 'orange' as const },
]

export const upcomingAbsences = [
  { id: '1', name: 'Luis Rodríguez', type: 'Vacaciones', when: 'Mañana' },
  { id: '2', name: 'Carmen Ruiz', type: 'Día personal', when: '23 May' },
  { id: '3', name: 'Pedro Sánchez', type: 'Enfermedad', when: '25 May' },
]

export const alerts = [
  { id: '1', title: '2 fichajes pendientes', subtitle: 'Requieren revisión' },
  { id: '2', title: '1 solicitud de vacaciones', subtitle: 'Pendiente de aprobación' },
  { id: '3', title: 'Recordatorio', subtitle: 'Reunión de equipo a las 10:00' },
]

export const weekDays = [
  { label: 'Lun', date: 20 }, { label: 'Mar', date: 21 }, { label: 'Mié', date: 22, isToday: true },
  { label: 'Jue', date: 23 }, { label: 'Vie', date: 24 }, { label: 'Sáb', date: 25 }, { label: 'Dom', date: 26 },
]

export const scheduleEvents = [
  { id: '1', day: 0, startHour: 9, endHour: 9.5, label: 'Fichaje', time: '09:00', tone: 'primary' as const },
  { id: '2', day: 0, startHour: 9.5, endHour: 11, label: 'Proyecto Alpha', time: '09:30 - 11:00', tone: 'primary' as const },
  { id: '3', day: 0, startHour: 11.5, endHour: 12.5, label: 'Formación', time: '11:30 - 12:30', tone: 'primary' as const },
  { id: '4', day: 0, startHour: 12.5, endHour: 13.5, label: 'Descanso', time: '12:30 - 13:30', tone: 'gray' as const },
  { id: '5', day: 1, startHour: 10, endHour: 11, label: 'Reunión equipo', time: '10:00 - 11:00', tone: 'red' as const },
  { id: '6', day: 1, startHour: 12, endHour: 13, label: 'Cliente X', time: '12:00 - 13:00', tone: 'red' as const },
  { id: '7', day: 2, startHour: 14, endHour: 17, label: 'Proyecto Beta', time: '14:00 - 17:00', tone: 'primary' as const },
  { id: '8', day: 3, startHour: 16, endHour: 17, label: 'Informe semanal', time: '16:00 - 17:00', tone: 'primary' as const },
]

export interface DemoProject {
  id: string
  name: string
  client: string
  hoursLogged: string
  progressPct: number
  status: 'active' | 'paused' | 'done'
}

// Mismos nombres de proyecto que ya aparecen en el calendario semanal
// (scheduleEvents) — para que "Proyecto Alpha"/"Proyecto Beta" sean el
// mismo proyecto en todas las pantallas, no coincidencias de nombre.
export const projects: DemoProject[] = [
  { id: '1', name: 'Proyecto Alpha', client: 'Telecomunicaciones S.A.', hoursLogged: '86h 20m', progressPct: 72, status: 'active' },
  { id: '2', name: 'Proyecto Beta', client: 'Cliente X', hoursLogged: '42h 10m', progressPct: 45, status: 'active' },
  { id: '3', name: 'Migración interna', client: 'TIMES INC', hoursLogged: '18h 00m', progressPct: 100, status: 'done' },
  { id: '4', name: 'Auditoría Q2', client: 'Cliente X', hoursLogged: '6h 30m', progressPct: 15, status: 'paused' },
]

export interface DemoReport {
  id: string
  name: string
  description: string
  generatedOn: string
}

export const reports: DemoReport[] = [
  { id: '1', name: 'Registro horario (RD 8/2019)', description: 'Informe legal de jornada para Inspección de Trabajo', generatedOn: 'Mayo 2024' },
  { id: '2', name: 'Resumen mensual de horas', description: 'Horas trabajadas por empleado y departamento', generatedOn: 'Mayo 2024' },
  { id: '3', name: 'Informe de ausencias', description: 'Vacaciones, bajas y días personales del periodo', generatedOn: 'Abril 2024' },
  { id: '4', name: 'Distribución por departamento', description: 'Desglose de horas por departamento', generatedOn: 'Mayo 2024' },
]

export const todayPunches = [
  { id: '1', label: 'Entrada', time: '08:15', tone: 'green' as const },
  { id: '2', label: 'Pausa inicio', time: '12:30', tone: 'orange' as const },
  { id: '3', label: 'Pausa fin', time: '13:00', tone: 'orange' as const },
  { id: '4', label: 'Salida', time: '17:45', tone: 'red' as const },
]

// ── Notificaciones ────────────────────────────────────────────────────────────
export const notifications = [
  { id: '1', type: 'fichaje'    as const, title: 'Fichaje detectado',             body: 'Juan Pérez ha registrado entrada a las 08:14.',                        time: 'Hace 2 min', read: false, group: 'hoy'    as const },
  { id: '2', type: 'solicitud'  as const, title: 'Nueva solicitud de vacaciones', body: 'Luis Rodríguez solicita vacaciones del 15 al 22 de julio.',             time: 'Hace 1h',    read: false, group: 'hoy'    as const },
  { id: '3', type: 'mensaje'    as const, title: 'Mensaje de María García',       body: '¿Puedes revisar mi horario de la semana pasada? Creo que hay un error.', time: 'Hace 3h',  read: false, group: 'hoy'    as const },
  { id: '4', type: 'anomalia'   as const, title: 'Anomalía detectada',            body: 'Carlos López tiene 3 días sin registrar salida este mes.',               time: '18:42',      read: true,  group: 'ayer'   as const },
  { id: '5', type: 'aniversario'as const, title: 'Aniversario de empresa',        body: 'Carmen Ruiz cumple 3 años en la empresa. ¡Felicidades!',                 time: '09:00',      read: true,  group: 'ayer'   as const },
  { id: '6', type: 'sistema'    as const, title: 'Backup completado',             body: 'El respaldo semanal de datos se ha completado correctamente.',           time: 'Dom 03:00',  read: true,  group: 'semana' as const },
  { id: '7', type: 'fichaje'    as const, title: 'Salida no registrada',          body: 'Pedro Sánchez no registró salida el viernes a las 17:00.',              time: 'Vie 17:05',  read: true,  group: 'semana' as const },
]

// ── Mensajes / Chat ───────────────────────────────────────────────────────────
export const conversations = [
  {
    empId: '1', empName: 'Juan Pérez', dept: 'Desarrollo', unread: 2, online: true, lastMessage: '¿Me confirmas el horario del viernes?', lastTime: '14:32',
    messages: [
      { id: 'm1', from: 'emp' as const, text: 'Hola, buenas tardes', time: '14:20' },
      { id: 'm2', from: 'admin' as const, text: 'Hola Juan, ¿en qué puedo ayudarte?', time: '14:25' },
      { id: 'm3', from: 'emp' as const, text: '¿Me confirmas el horario del viernes?', time: '14:32' },
      { id: 'm4', from: 'emp' as const, text: 'Es que tengo una cita médica a las 16h', time: '14:32' },
    ],
  },
  {
    empId: '2', empName: 'María García', dept: 'Diseñadora', unread: 1, online: true, lastMessage: 'Creo que hay un error en mi horario', lastTime: '11:15',
    messages: [
      { id: 'm5', from: 'emp' as const, text: '¿Puedes revisar mi horario de la semana pasada?', time: '11:10' },
      { id: 'm6', from: 'emp' as const, text: 'Creo que hay un error en mi horario', time: '11:15' },
    ],
  },
  {
    empId: '3', empName: 'Carlos López', dept: 'Analista', unread: 0, lastMessage: 'Perfecto, muchas gracias', lastTime: 'Ayer',
    messages: [
      { id: 'm7', from: 'admin' as const, text: 'Carlos, he aprobado tus vacaciones para el 15 de julio.', time: 'Ayer 10:00' },
      { id: 'm8', from: 'emp' as const, text: 'Perfecto, muchas gracias', time: 'Ayer 10:30' },
    ],
  },
  {
    empId: '4', empName: 'Ana Martínez', dept: 'Recursos Humanos', unread: 0, lastMessage: 'De acuerdo, lo tengo en cuenta', lastTime: 'Lun',
    messages: [
      { id: 'm9', from: 'admin' as const, text: 'Recuerda que el viernes es festivo.', time: 'Lun 09:00' },
      { id: 'm10', from: 'emp' as const, text: 'De acuerdo, lo tengo en cuenta', time: 'Lun 09:15' },
    ],
  },
]

// ── Gastos ────────────────────────────────────────────────────────────────────
export const expenses = [
  { id: 'g1', empName: 'Juan Pérez', category: 'dieta' as const, description: 'Dieta desplazamiento Madrid', amount: 42.50, date: '10 jul 2026', status: 'pendiente' as const },
  { id: 'g2', empName: 'María García', category: 'transporte' as const, description: 'Taxi aeropuerto cliente', amount: 28.00, date: '9 jul 2026', status: 'pendiente' as const },
  { id: 'g3', empName: 'Carlos López', category: 'material' as const, description: 'Material oficina', amount: 67.80, date: '8 jul 2026', status: 'pendiente' as const },
  { id: 'g4', empName: 'Ana Martínez', category: 'otro' as const, description: 'Software licencia anual', amount: 120.00, date: '5 jul 2026', status: 'aprobado' as const },
  { id: 'g5', empName: 'Luis Rodríguez', category: 'dieta' as const, description: 'Dieta visita obra Telecomunicaciones', amount: 35.00, date: '4 jul 2026', status: 'aprobado' as const },
  { id: 'g6', empName: 'Carmen Ruiz', category: 'transporte' as const, description: 'Gasolina desplazamiento', amount: 18.50, date: '3 jul 2026', status: 'rechazado' as const },
]

// ── Obras ─────────────────────────────────────────────────────────────────────
export const obras = [
  { id: 'o1', name: 'Telecomunicaciones Norte', address: 'Av. Industrial 24, Madrid', status: 'activa' as const, employeeCount: 8, hoursToday: '62h', manager: 'Carlos López', startDate: 'Mar 2026' },
  { id: 'o2', name: 'Centro Comercial Sur', address: 'C/ Gran Vía 45, Sevilla', status: 'activa' as const, employeeCount: 5, hoursToday: '38h', manager: 'Juan Pérez', startDate: 'Ene 2026' },
  { id: 'o3', name: 'Oficinas Corporativas', address: 'Parque Empresarial, Barcelona', status: 'pausada' as const, employeeCount: 3, hoursToday: '0h', manager: 'Ana Martínez', startDate: 'Feb 2026' },
  { id: 'o4', name: 'Nave Industrial Este', address: 'Polígono 7, Zaragoza', status: 'completada' as const, employeeCount: 0, hoursToday: '0h', manager: 'Luis Rodríguez', startDate: 'Nov 2025' },
  { id: 'o5', name: 'Residencial Las Palmas', address: 'Urb. Las Palmas, Valencia', status: 'activa' as const, employeeCount: 6, hoursToday: '44h', manager: 'Carmen Ruiz', startDate: 'Abr 2026' },
]

// ── Turnos ────────────────────────────────────────────────────────────────────
export const shiftsEmployees = employees.map((e, idx) => ({
  id: e.id, name: e.name, dept: e.dept,
  week: [
    { type: 'normal' as const, start: '08:00', end: '17:00' },
    { type: 'normal' as const, start: '08:00', end: '17:00' },
    idx === 2 ? { type: 'guardia' as const, start: '07:00', end: '15:00' } : { type: 'normal' as const, start: '08:00', end: '17:00' },
    { type: 'normal' as const, start: '08:00', end: '17:00' },
    idx === 1 ? { type: 'libre' as const } : { type: 'normal' as const, start: '08:00', end: '17:00' },
    { type: 'libre' as const },
    { type: 'libre' as const },
  ],
}))

// ── Planning ──────────────────────────────────────────────────────────────────
export const planningEmployees = employees.map((e, idx) => ({
  id: e.id, name: e.name, dept: e.dept,
  week: [
    { status: idx === 2 ? 'live' as const : 'ok' as const, value: idx === 2 ? undefined : '8h 02m' },
    { status: 'ok' as const, value: '8h 15m' },
    { status: 'ok' as const, value: '7h 58m' },
    { status: idx === 5 ? 'vac' as const : 'ok' as const, value: idx === 5 ? undefined : '8h 30m' },
    { status: 'future' as const },
    { status: 'weekend' as const },
    { status: 'weekend' as const },
  ],
}))

// ── Cierre mensual ────────────────────────────────────────────────────────────
export const closures = [
  { id: 'c1', empName: 'Juan Pérez', dept: 'Desarrollo', month: 'Junio 2026', totalHours: '172h 30m', extraHours: '+12h', signedBy: 'both' as const, generatedOn: '1 jul 2026' },
  { id: 'c2', empName: 'María García', dept: 'Diseñadora', month: 'Junio 2026', totalHours: '160h 00m', extraHours: '0h', signedBy: 'emp' as const, generatedOn: '1 jul 2026' },
  { id: 'c3', empName: 'Carlos López', dept: 'Analista', month: 'Junio 2026', totalHours: '168h 15m', extraHours: '+8h', signedBy: 'none' as const, generatedOn: '1 jul 2026' },
  { id: 'c4', empName: 'Ana Martínez', dept: 'Recursos Humanos', month: 'Junio 2026', totalHours: '155h 00m', extraHours: '-5h', signedBy: 'both' as const, generatedOn: '1 jul 2026' },
  { id: 'c5', empName: 'Luis Rodríguez', dept: 'Comercial', month: 'Mayo 2026', totalHours: '178h 00m', extraHours: '+18h', signedBy: 'both' as const, generatedOn: '1 jun 2026' },
  { id: 'c6', empName: 'Carmen Ruiz', dept: 'Administración', month: 'Mayo 2026', totalHours: '160h 00m', extraHours: '0h', signedBy: 'emp' as const, generatedOn: '1 jun 2026' },
]

// ── Documentos ────────────────────────────────────────────────────────────────
export const documents = [
  { id: 'd1', name: 'Contrato Juan Pérez 2024.pdf', category: 'contrato' as const, empName: 'Juan Pérez', size: '245 KB', uploadedOn: '3 ene 2024' },
  { id: 'd2', name: 'Nómina Junio 2026 - María García.pdf', category: 'nomina' as const, empName: 'María García', size: '128 KB', uploadedOn: '1 jul 2026' },
  { id: 'd3', name: 'Certificado aptitud médica - Carlos.pdf', category: 'certificado' as const, empName: 'Carlos López', size: '89 KB', uploadedOn: '15 mar 2026' },
  { id: 'd4', name: 'Nómina Junio 2026 - Ana Martínez.pdf', category: 'nomina' as const, empName: 'Ana Martínez', size: '131 KB', uploadedOn: '1 jul 2026' },
  { id: 'd5', name: 'Contrato Luis Rodríguez 2025.pdf', category: 'contrato' as const, empName: 'Luis Rodríguez', size: '212 KB', uploadedOn: '10 ene 2025' },
  { id: 'd6', name: 'Declaración IRPF Carmen Ruiz.pdf', category: 'otro' as const, empName: 'Carmen Ruiz', size: '56 KB', uploadedOn: '30 jun 2026' },
]

// ── Auditoría ─────────────────────────────────────────────────────────────────
export const auditEntries = [
  { id: 'a1', action: 'Jornada cerrada', category: 'jornada' as const, user: 'Admin', detail: 'Cierre mensual de junio 2026 para Juan Pérez generado.', ts: '10 jul 2026, 09:12' },
  { id: 'a2', action: 'Empleado añadido', category: 'empleado' as const, user: 'Admin', detail: 'Pedro Álvarez dado de alta como operario en Telecomunicaciones Norte.', ts: '9 jul 2026, 11:45' },
  { id: 'a3', action: 'Solicitud aprobada', category: 'solicitud' as const, user: 'Admin', detail: 'Vacaciones de Luis Rodríguez del 15 al 22 de julio aprobadas.', ts: '8 jul 2026, 16:30' },
  { id: 'a4', action: 'Documento subido', category: 'documento' as const, user: 'Admin', detail: 'Nóminas de junio 2026 subidas para 6 empleados.', ts: '1 jul 2026, 08:00' },
  { id: 'a5', action: 'Obra creada', category: 'obra' as const, user: 'Admin', detail: 'Nueva obra "Residencial Las Palmas" creada y asignada a Carmen Ruiz.', ts: '28 jun 2026, 14:00' },
  { id: 'a6', action: 'PIN cambiado', category: 'seguridad' as const, user: 'Sistema', detail: 'Restablecimiento de PIN para María García por solicitud del empleado.', ts: '25 jun 2026, 10:22' },
  { id: 'a7', action: 'Backup completado', category: 'sistema' as const, user: 'Sistema', detail: 'Respaldo semanal de base de datos completado. 6 empleados, 1847 registros.', ts: '22 jun 2026, 03:00' },
]

// ── Anomalías ─────────────────────────────────────────────────────────────────
export const anomalies = [
  { id: 'an1', empName: 'Carlos López', dept: 'Analista', type: 'sin_salida' as const, description: 'No registró salida el 8 de julio. Se computaron 24h automáticamente.', date: '8 jul 2026, 17:00', severity: 'alta' as const, resolved: false },
  { id: 'an2', empName: 'Ana Martínez', dept: 'Recursos Humanos', type: 'retraso' as const, description: 'Entrada a las 09:42, turno desde 08:00 (1h 42m de retraso).', date: '9 jul 2026, 09:42', severity: 'media' as const, resolved: false },
  { id: 'an3', empName: 'Juan Pérez', dept: 'Desarrollo', type: 'extra' as const, description: 'Jornada de 11h 20m (límite recomendado: 9h). Se requiere aprobación.', date: '7 jul 2026', severity: 'media' as const, resolved: true },
  { id: 'an4', empName: 'María García', dept: 'Diseñadora', type: 'ausencia' as const, description: 'Sin registro durante todo el día. No hay vacaciones ni baja activa.', date: '5 jul 2026', severity: 'alta' as const, resolved: true },
  { id: 'an5', empName: 'Luis Rodríguez', dept: 'Comercial', type: 'solapamiento' as const, description: 'Dos fichajes activos simultáneamente detectados entre 14:00 y 14:30.', date: '4 jul 2026', severity: 'baja' as const, resolved: false },
]

// ── Validar horas ─────────────────────────────────────────────────────────────
export const validateRows = [
  { id: 'v1', empName: 'Juan Pérez', dept: 'Desarrollo', date: '10 jul', entry: '08:07', exit: '17:15', worked: '9h 08m', expected: '8h 00m', diff: '+1h 08m', diffTone: 'over' as const, status: 'pending' as const },
  { id: 'v2', empName: 'María García', dept: 'Diseñadora', date: '10 jul', entry: '08:30', exit: '17:00', worked: '8h 00m', expected: '8h 00m', diff: '0h', diffTone: 'ok' as const, status: 'pending' as const },
  { id: 'v3', empName: 'Carlos López', dept: 'Analista', date: '10 jul', entry: '09:42', exit: '17:00', worked: '6h 58m', expected: '8h 00m', diff: '-1h 02m', diffTone: 'under' as const, status: 'pending' as const },
  { id: 'v4', empName: 'Ana Martínez', dept: 'Recursos Humanos', date: '9 jul', entry: '08:00', exit: '17:30', worked: '9h 00m', expected: '8h 00m', diff: '+1h 00m', diffTone: 'over' as const, status: 'approved' as const },
  { id: 'v5', empName: 'Luis Rodríguez', dept: 'Comercial', date: '9 jul', entry: '07:55', exit: '16:58', worked: '8h 03m', expected: '8h 00m', diff: '+0h 03m', diffTone: 'ok' as const, status: 'approved' as const },
]
