const CRLF = '\r\n'

function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function safeId(value) {
  return String(value || 'event').replace(/[^a-zA-Z0-9_.-]/g, '-')
}

function utcStamp(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function localStamp(date) {
  const p2 = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}${p2(date.getMonth() + 1)}${p2(date.getDate())}T${p2(date.getHours())}${p2(date.getMinutes())}00`
}

function dateValue(value) {
  return String(value || '').slice(0, 10).replace(/-/g, '')
}

function nextDateValue(value) {
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  if (!Number.isFinite(date.getTime())) return null
  date.setDate(date.getDate() + 1)
  return dateValue(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`)
}

function foldLine(line) {
  if (line.length <= 73) return line
  const chunks = []
  for (let index = 0; index < line.length; index += 73) {
    chunks.push(`${index ? ' ' : ''}${line.slice(index, index + 73)}`)
  }
  return chunks.join(CRLF)
}

function calendar(lines, name) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Times INC//Calendario laboral//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    ...lines,
    'END:VCALENDAR',
    '',
  ].map(foldLine).join(CRLF)
}

function timedEvent({ uid, start, end, summary, description, location }) {
  const dtStart = utcStamp(start), dtEnd = utcStamp(end)
  if (!dtStart || !dtEnd) return []
  return [
    'BEGIN:VEVENT',
    `UID:${safeId(uid)}@times-inc`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeText(summary)}`,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    location ? `LOCATION:${escapeText(location)}` : null,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
  ].filter(Boolean)
}

function allDayEvent({ uid, start, end, summary, description }) {
  const dtStart = dateValue(start), dtEnd = nextDateValue(end || start)
  if (!dtStart || !dtEnd) return []
  return [
    'BEGIN:VEVENT',
    `UID:${safeId(uid)}@times-inc`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${escapeText(summary)}`,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    'STATUS:CONFIRMED',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ].filter(Boolean)
}

export function buildEmployeeCalendarICS(db, employee, range = {}) {
  const employeeId = employee?.id
  const from = range.from ? new Date(range.from).getTime() : Number.NEGATIVE_INFINITY
  const to = range.to ? new Date(range.to).getTime() : Number.POSITIVE_INFINITY
  const inRange = value => {
    const time = new Date(value).getTime()
    return Number.isFinite(time) && time >= from && time < to
  }
  const events = []

  for (const record of db?.records || []) {
    if (record.empId !== employeeId || !record.inicio || !record.fin || !inRange(record.inicio)) continue
    const minutes = Math.max(0, Math.round((new Date(record.fin) - new Date(record.inicio)) / 60000) - Math.round((record.breakSecs || 0) / 60))
    events.push(...timedEvent({
      uid:`record-${record.id}`, start:record.inicio, end:record.fin,
      summary:`Jornada · ${record.centro || 'Trabajo'}`,
      description:`Tiempo trabajado: ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`,
      location:record.centro,
    }))
  }

  const addAbsences = (items, kind, label) => {
    for (const item of items || []) {
      if (item.empId !== employeeId) continue
      const start = item.fechaInicio || item.fecha
      const end = item.fechaFin || start
      if (!start || !inRange(`${start}T12:00:00`)) continue
      events.push(...allDayEvent({ uid:`${kind}-${item.id}`, start, end, summary:label, description:item.motivo }))
    }
  }
  addAbsences((db?.vacaciones || []).filter(item => item.estado === 'aprobada'), 'vacation', 'Vacaciones')
  addAbsences(db?.ausencias, 'absence', 'Ausencia')
  addAbsences(db?.medicos, 'medical', 'Baja médica')

  return calendar(events, `Times INC · ${employee?.name || 'Mi calendario laboral'}`)
}

export function buildReportScheduleICS(schedule, now = new Date()) {
  const start = new Date(now)
  start.setSeconds(0, 0)
  start.setHours(8, 0, 0, 0)
  if (schedule.frequency === 'weekly') {
    const daysUntilMonday = (8 - start.getDay()) % 7 || 7
    start.setDate(start.getDate() + daysUntilMonday)
  } else {
    start.setMonth(start.getMonth() + 1, 1)
  }
  const end = new Date(start.getTime() + 30 * 60 * 1000)
  const recurrence = schedule.frequency === 'weekly' ? 'FREQ=WEEKLY;BYDAY=MO' : 'FREQ=MONTHLY;BYMONTHDAY=1'
  const event = [
    'BEGIN:VEVENT',
    `UID:report-${safeId(schedule.id)}@times-inc`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${localStamp(start)}`,
    `DTEND:${localStamp(end)}`,
    `RRULE:${recurrence}`,
    `SUMMARY:${escapeText(schedule.name || 'Informe de jornada')}`,
    `DESCRIPTION:${escapeText(`Generar informe ${String(schedule.format || 'pdf').toUpperCase()} en Times INC. Destinatarios: ${schedule.recipients || 'sin especificar'}`)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Preparar informe de Times INC',
    'END:VALARM',
    'END:VEVENT',
  ]
  return calendar(event, schedule.name || 'Informe Times INC')
}

export function downloadICS(content, filename) {
  const blob = new Blob([content], { type:'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.endsWith('.ics') ? filename : `${filename}.ics`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
