import { timingSafeEqual } from 'crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import writeXlsxFile from 'write-excel-file/node'
import { createAutomationRun, mergeAutomationHealth } from '../src/server/automationHealth.js'
import { buildScheduledReportRows, isScheduleDue, parseReportRecipients, reportPeriod } from '../src/server/scheduledReports.js'
import { isMissingStorageBucketResponse } from '../src/server/storageBuckets.js'

const clean = value => String(value || '').replace(/^\uFEFF/, '').trim()
const SB_URL = clean(process.env.VITE_SB_URL)
const SB_ANON = clean(process.env.VITE_SB_ANON)
const SB_SERVICE = clean(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
const CRON_SECRET = process.env.CRON_SECRET
const RESEND_API_KEY = clean(process.env.RESEND_API_KEY)
const REPORT_FROM_EMAIL = clean(process.env.REPORT_FROM_EMAIL)
const SB_KEY = SB_SERVICE || SB_ANON
const headers = { apikey:SB_KEY, Authorization:`Bearer ${SB_KEY}` }
const storageHeaders = SB_SERVICE ? { apikey:SB_SERVICE, Authorization:`Bearer ${SB_SERVICE}` } : headers

async function ensureReportBucket() {
  const existing = await fetch(`${SB_URL}/storage/v1/bucket/scheduled-reports`, { headers:storageHeaders })
  if (existing.ok) return
  const existingBody = await existing.text()
  if (!isMissingStorageBucketResponse(existing.status, existingBody)) {
    throw new Error(`storage bucket check ${existing.status}: ${existingBody.slice(0, 140)}`)
  }
  const created = await fetch(`${SB_URL}/storage/v1/bucket`, {
    method:'POST',
    headers:{ ...storageHeaders, 'Content-Type':'application/json' },
    body:JSON.stringify({
      id:'scheduled-reports',
      name:'scheduled-reports',
      public:false,
      file_size_limit:20 * 1024 * 1024,
      allowed_mime_types:['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    }),
  })
  // Dos invocaciones simultáneas pueden comprobar el 404 a la vez. Si la
  // segunda recibe conflicto, confirmar que la primera ya creó el bucket.
  if (!created.ok) {
    const retry = await fetch(`${SB_URL}/storage/v1/bucket/scheduled-reports`, { headers:storageHeaders })
    if (!retry.ok) throw new Error(`storage bucket create ${created.status}: ${(await created.text()).slice(0, 140)}`)
  }
}

// La programación/estado de los informes (reportSchedules, reportRuns,
// automationHealth) vive en la fila singleton config de app_entities — la
// misma que ya mantiene al día el cliente en cada guardado. Antes este cron
// leía y reescribía el blob app_data COMPLETO, y lo hacía varias veces por
// ejecución (una vez por cada intento de "reservar" un informe debido, más
// la comprobación final) — con varios informes programados a la vez, eso
// multiplicaba el coste de descargar el histórico entero de la empresa.
async function readConfig() {
  const response = await fetch(`${SB_URL}/rest/v1/app_entities?id=eq.config%3A__singleton__&select=data,updated_at`, { headers })
  if (!response.ok) throw new Error(`config read ${response.status}`)
  const row = (await response.json())?.[0]
  if (!row) throw new Error('config entity unavailable')
  return { config:row.data || {}, updated_at:row.updated_at }
}

async function writeConfig(config, expectedUpdatedAt) {
  const response = await fetch(`${SB_URL}/rest/v1/app_entities?id=eq.config%3A__singleton__&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}`, {
    method:'PATCH',
    headers:{ ...headers, 'Content-Type':'application/json', Prefer:'return=representation' },
    body:JSON.stringify({ data:config, updated_at:new Date().toISOString() }),
  })
  if (!response.ok) throw new Error(`config write ${response.status}`)
  const rows = await response.json()
  if (!rows.length) throw new Error('config cambió durante la ejecución')
}

// Los fichajes que puede necesitar un informe (semanal o mensual, siempre
// referidos al periodo más reciente ya cerrado) nunca se remontan a más de
// ~31 días atrás — nunca hace falta el histórico completo para generarlos.
async function readReportSource(sinceIso) {
  const [employeesResponse, recordsResponse] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/employees?select=*&baja=eq.false`, { headers }),
    fetch(`${SB_URL}/rest/v1/records?select=*&deleted=eq.false&inicio=gte.${encodeURIComponent(sinceIso)}`, { headers }),
  ])
  if (![employeesResponse, recordsResponse].every(response => response.ok)) throw new Error('normalized report source unavailable')
  return {
    employees:(await employeesResponse.json()).map(row => ({ ...(row.data || {}), id:row.id, name:row.name, role:row.role, baja:row.baja })),
    records:(await recordsResponse.json()).map(row => ({ ...(row.data || {}), id:row.id, empId:row.emp_id, empName:row.emp_name, inicio:row.inicio, fin:row.fin, centro:row.centro, workSecs:row.work_secs, closed:row.closed })),
  }
}

async function claimSchedule(scheduleId, periodKey) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await readConfig()
    const schedules = latest.config.reportSchedules || []
    const schedule = schedules.find(item => item.id === scheduleId)
    if (!schedule || schedule.lastRunKey === periodKey) return null
    const runningAt = Date.parse(schedule.runningAt || '')
    if (schedule.runningKey === periodKey && Number.isFinite(runningAt) && Date.now() - runningAt < 2 * 60 * 60 * 1000) return null
    const nowIso = new Date().toISOString()
    const nextSchedules = schedules.map(item => item.id === scheduleId
      ? { ...item, runningKey:periodKey, runningAt:nowIso, lastRunStatus:'running', _upd:nowIso }
      : item)
    const nextConfig = { ...latest.config, reportSchedules:nextSchedules }
    try {
      await writeConfig(nextConfig, latest.updated_at)
      return { config:nextConfig, schedule:nextSchedules.find(item => item.id === scheduleId) }
    } catch (error) {
      if (attempt === 2) throw error
    }
  }
  return null
}

async function persistFatalHealth(startedAt, error) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const latest = await readConfig()
    const health = createAutomationRun('reports', { status:'error', startedAt, error:error?.message || error })
    const nextConfig = mergeAutomationHealth({ config:latest.config }, health).config
    try { await writeConfig(nextConfig, latest.updated_at); return } catch (writeError) { if (attempt === 1) throw writeError }
  }
}

async function buildXlsx(rows, title, period) {
  const header = ['Fecha', 'Empleado', 'Entrada', 'Salida', 'Horas', 'Centro / obra', 'Estado']
  const data = [
    [{ value:title, fontWeight:'bold', span:7 }],
    [{ value:`Periodo: ${period.label}`, span:7 }],
    header.map(value => ({ value, fontWeight:'bold', backgroundColor:'#EDE9FE' })),
    ...rows.map(row => [row.date, row.employee, row.start, row.end, row.hours, row.center, row.status].map(value => ({ value }))),
  ]
  return writeXlsxFile(data, { columns:[18,28,12,12,12,28,14].map(width => ({ width })) }).toBuffer()
}

async function buildPdf(rows, title, period) {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const addPage = () => {
    const page = pdf.addPage([595, 842])
    page.drawText(title.slice(0, 72), { x:36, y:800, size:16, font:bold, color:rgb(.12,.1,.2) })
    page.drawText(`Periodo: ${period.label}`, { x:36, y:780, size:9, font:regular, color:rgb(.38,.35,.48) })
    page.drawText('Fecha       Empleado                    Entrada  Salida   Horas   Estado', { x:36, y:755, size:8, font:bold })
    return { page, y:738 }
  }
  let { page, y } = addPage()
  for (const row of rows) {
    if (y < 45) ({ page, y } = addPage())
    const employee = String(row.employee).slice(0, 25).padEnd(27)
    const line = `${row.date}  ${employee} ${String(row.start).padEnd(8)} ${String(row.end).padEnd(8)} ${String(row.hours).padEnd(7)} ${row.status}`
    page.drawText(line, { x:36, y, size:7.5, font:regular, color:rgb(.16,.15,.2) })
    y -= 14
  }
  if (!rows.length) page.drawText('No hay fichajes cerrados en este periodo.', { x:36, y, size:10, font:regular })
  return Buffer.from(await pdf.save())
}

async function uploadReport(schedule, period, body) {
  const ext = schedule.format === 'excel' ? 'xlsx' : 'pdf'
  const contentType = schedule.format === 'excel'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/pdf'
  const path = `${schedule.id}/${period.key}.${ext}`
  const response = await fetch(`${SB_URL}/storage/v1/object/scheduled-reports/${path}`, {
    method:'POST', headers:{ ...storageHeaders, 'Content-Type':contentType, 'x-upsert':'true' }, body,
  })
  if (!response.ok) throw new Error(`storage upload ${response.status}: ${(await response.text()).slice(0, 140)}`)
  const signed = await fetch(`${SB_URL}/storage/v1/object/sign/scheduled-reports/${path}`, {
    method:'POST', headers:{ ...storageHeaders, 'Content-Type':'application/json' }, body:JSON.stringify({ expiresIn:604800 }),
  })
  if (!signed.ok) throw new Error(`signed URL ${signed.status}`)
  const signedPath = (await signed.json()).signedURL
  return { path, url:signedPath?.startsWith('http') ? signedPath : `${SB_URL}/storage/v1${signedPath}` }
}

async function sendEmail(schedule, period, url) {
  const recipients = parseReportRecipients(schedule.recipients)
  if (!recipients.length) return { sent:false, reason:'sin destinatarios válidos' }
  if (!RESEND_API_KEY || !REPORT_FROM_EMAIL) return { sent:false, reason:'correo no configurado' }
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{ Authorization:`Bearer ${RESEND_API_KEY}`, 'Content-Type':'application/json' },
    body:JSON.stringify({
      from:REPORT_FROM_EMAIL, to:recipients,
      subject:`${schedule.name} · ${period.label}`,
      html:`<p>El informe <strong>${schedule.name}</strong> ya está disponible.</p><p><a href="${url}">Descargar informe</a></p><p>El enlace privado caduca en 7 días.</p>`,
    }),
  })
  if (!response.ok) throw new Error(`email ${response.status}: ${(await response.text()).slice(0, 140)}`)
  return { sent:true, recipients:recipients.length }
}

export default async function handler(req, res) {
  if (!CRON_SECRET) return res.status(500).json({ error:'CRON_SECRET no configurado' })
  const token = String(req.headers.authorization || '').replace('Bearer ', '')
  const valid = token.length === CRON_SECRET.length && timingSafeEqual(Buffer.from(token), Buffer.from(CRON_SECRET))
  if (!valid) return res.status(401).json({ error:'Unauthorized' })
  if (!SB_URL || !SB_ANON || !SB_SERVICE) return res.status(500).json({ error:'Supabase service config missing' })
  const startedAt = Date.now()
  const now = new Date()
  try {
    const source = await readConfig()
    const schedules = source.config.reportSchedules || []
    const due = schedules.filter(schedule => isScheduleDue(schedule, now))
    // No tocar Storage ni pedir fichajes cuando no hay trabajo. Además de
    // ahorrar llamadas, permite registrar una comprobación saludable aunque
    // todavía no exista el bucket porque la empresa no ha configurado ningún
    // informe.
    let reportSource = null
    if (due.length) {
      await ensureReportBucket()
      const sinceIso = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString()
      reportSource = await readReportSource(sinceIso)
    }
    const runs = []
    for (const schedule of due) {
      const period = reportPeriod(schedule.frequency, now)
      let claim
      try {
        claim = await claimSchedule(schedule.id, period.key)
      } catch (error) {
        // claimSchedule agota sus reintentos si `config:__singleton__` sigue
        // cambiando bajo los pies (varios crons escriben esa misma fila). Sin
        // este try/catch, esa excepción abortaba TODO el bucle — incluidos
        // los informes de iteraciones anteriores que ya se habían generado,
        // subido a Storage y enviado por email, cuyo `runs` nunca llegaba al
        // bloque de abajo que los marca como completados (lastRunKey). En la
        // siguiente ejecución del cron, isScheduleDue() los volvía a ver como
        // pendientes y los reenviaba por email duplicados.
        runs.push({ id:`${schedule.id}_${period.key}`, scheduleId:schedule.id, name:schedule.name, periodKey:period.key, period:period.label, format:schedule.format, status:'error', error:`No se pudo reservar el informe: ${String(error?.message || error).slice(0, 200)}`, finishedAt:new Date().toISOString(), _upd:new Date().toISOString() })
        continue
      }
      if (!claim) continue
      const current = claim.schedule
      try {
        const rows = buildScheduledReportRows(reportSource, period)
        const body = current.format === 'excel'
          ? await buildXlsx(rows, current.name, period)
          : await buildPdf(rows, current.name, period)
        const artifact = await uploadReport(current, period, body)
        const delivery = await sendEmail(current, period, artifact.url)
        runs.push({ id:`${current.id}_${period.key}`, scheduleId:current.id, name:current.name, periodKey:period.key, period:period.label, format:current.format, status:delivery.sent ? 'sent' : 'generated', delivery:delivery.reason || `${delivery.recipients} destinatarios`, storagePath:artifact.path, rowCount:rows.length, finishedAt:new Date().toISOString(), _upd:new Date().toISOString() })
      } catch (error) {
        runs.push({ id:`${current.id}_${period.key}`, scheduleId:current.id, name:current.name, periodKey:period.key, period:period.label, format:current.format, status:'error', error:String(error?.message || error).slice(0, 240), finishedAt:new Date().toISOString(), _upd:new Date().toISOString() })
      }
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const latest = await readConfig()
      const runBySchedule = new Map(runs.map(run => [run.scheduleId, run]))
      const nextSchedules = (latest.config.reportSchedules || []).map(schedule => {
        const run = runBySchedule.get(schedule.id)
        if (!run) return schedule
        const cleared = { ...schedule, runningKey:null, runningAt:null, lastRunStatus:run.status, lastRunError:run.error || null, _upd:run.finishedAt }
        return run.status !== 'error' ? { ...cleared, lastRunKey:run.periodKey, lastRunAt:run.finishedAt } : cleared
      })
      const health = createAutomationRun('reports', { startedAt, checked:schedules.length, processed:runs.length, delivered:runs.filter(run => run.status === 'sent').length, status:runs.some(run => run.status === 'error') ? 'error' : 'ok', error:runs.find(run => run.error)?.error })
      const nextConfig = mergeAutomationHealth({ config:latest.config }, health).config
      nextConfig.reportSchedules = nextSchedules
      nextConfig.reportRuns = [...runs, ...(latest.config.reportRuns || []).filter(old => !runs.some(run => run.id === old.id))].slice(0, 100)
      try { await writeConfig(nextConfig, latest.updated_at); break } catch (error) { if (attempt === 2) throw error }
    }
    return res.status(200).json({ ok:true, checked:schedules.length, due:due.length, runs:runs.map(({ storagePath, ...run }) => run) })
  } catch (error) {
    console.error('[cron-reports]', error)
    try { await persistFatalHealth(startedAt, error) } catch (healthError) { console.error('[cron-reports] health', healthError) }
    return res.status(500).json({ error:'Scheduled reports failed' })
  }
}
