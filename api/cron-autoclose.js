import { timingSafeEqual } from 'crypto'
import webpush from 'web-push'
import { createAutomationRun, mergeAutomationHealth } from '../src/server/automationHealth.js'
import { groupPushSubscriptions, pushSubscriptionDeleteFilter } from '../src/server/pushSubscriptions.js'
import { toRecordRow } from '../src/services/tableSyncPlan.js'
import { finalizeRecord } from '../src/utils/recordLifecycle.js'
import { isAuthRlsServerMode } from '../src/server/securityMode.js'

const clean = value => String(value || '').replace(/^\uFEFF/, '').trim()
const SB_URL = clean(process.env.VITE_SB_URL)
const SB_ANON = clean(process.env.VITE_SB_ANON)
const SB_SERVICE = clean(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
const CRON_SECRET = process.env.CRON_SECRET
const AUTH_RLS_MODE = isAuthRlsServerMode()
const headers = { apikey:SB_SERVICE || SB_ANON, Authorization:`Bearer ${SB_SERVICE || SB_ANON}`, 'Content-Type':'application/json' }
const TEN_HOURS_MS = 10 * 60 * 60 * 1000

async function readDB() {
  if (AUTH_RLS_MODE) {
    const [recordsResponse, configResponse] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/records?select=*&fin=is.null&deleted=eq.false`, { headers }),
      fetch(`${SB_URL}/rest/v1/app_entities?id=eq.config%3A__singleton__&select=data,updated_at`, { headers }),
    ])
    if (!recordsResponse.ok || !configResponse.ok) throw new Error(`normalized read ${recordsResponse.status}/${configResponse.status}`)
    const records = (await recordsResponse.json()).map(row => ({
      ...(row.data || {}), id:row.id, empId:row.emp_id, empName:row.emp_name,
      inicio:row.inicio, fin:row.fin, breaks:row.breaks || [], workSecs:row.work_secs || 0,
      breakSecs:row.break_secs || 0, closed:!!row.closed, _upd:row.updated_at,
    }))
    const configRow = (await configResponse.json())?.[0]
    if (!configRow) throw new Error('config entity unavailable')
    return { data:{ records, config:configRow.data || {} }, updated_at:configRow.updated_at }
  }
  const response = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data,updated_at`, { headers })
  if (!response.ok) throw new Error(`app_data read ${response.status}`)
  return (await response.json())?.[0] || null
}

async function writeDB(data, expectedUpdatedAt) {
  const url = AUTH_RLS_MODE
    ? `${SB_URL}/rest/v1/app_entities?id=eq.config%3A__singleton__&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}`
    : `${SB_URL}/rest/v1/app_data?id=eq.1&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}`
  const payload = AUTH_RLS_MODE ? { data:data.config || {}, updated_at:new Date().toISOString() } : { data, updated_at:new Date().toISOString() }
  const response = await fetch(url, {
    method:'PATCH', headers:{ ...headers, Prefer:'return=representation' },
    body:JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`app_data write ${response.status}`)
  if (!(await response.json())?.length) throw new Error('app_data cambió durante el autocierre')
}

async function persistHealth(run) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await readDB()
    const next = { ...mergeAutomationHealth(row.data, run), _ts:Date.now() }
    try { await writeDB(next, row.updated_at); return } catch (error) { if (attempt === 1) throw error }
  }
}

// El cliente escribe cada fichaje directamente en la tabla `records` en
// cuanto se crea (ver appStore.js: persistRecordRow, prioritario sobre la
// reconciliación del blob completo) — la tabla es la fuente viva de jornadas
// abiertas independientemente de si el runtime Auth/RLS está sellado.
// Decidir aquí qué cerrar a partir del blob (`app_data.data.records`, que
// solo se pone al día en segundo plano y con más fragilidad en cobertura
// débil) dejaba fuera justo los fichajes de empleados con conexión
// intermitente: los que más necesitan el autocierre de las 10h nunca se
// veían como candidatos.
async function readOpenRecords() {
  const response = await fetch(`${SB_URL}/rest/v1/records?select=*&fin=is.null&deleted=eq.false`, { headers })
  if (!response.ok) throw new Error(`records read ${response.status}`)
  return (await response.json()).map(row => ({
    ...(row.data || {}), id:row.id, empId:row.emp_id, empName:row.emp_name,
    inicio:row.inicio, fin:row.fin, breaks:row.breaks || [], workSecs:row.work_secs || 0,
    breakSecs:row.break_secs || 0, closed:!!row.closed, _upd:row.updated_at,
  }))
}

async function upsertRecords(records) {
  if (!records.length) return []
  const rows = records.map(record => toRecordRow(record, record._upd))
  const upsert = async batch => {
    const response = await fetch(`${SB_URL}/rest/v1/records?on_conflict=id`, {
      method:'POST', headers:{ ...headers, Prefer:'resolution=merge-duplicates,return=minimal' }, body:JSON.stringify(batch),
    })
    return { ok:response.ok, status:response.status, detail:response.ok ? '' : (await response.text()).slice(0, 160) }
  }
  const batch = await upsert(rows)
  if (batch.ok) return []
  const failures = []
  for (const row of rows) {
    const result = await upsert([row])
    if (!result.ok) failures.push(`${row.id}: ${result.status} ${result.detail}`)
  }
  return failures
}

async function notifyClosed(records) {
  const publicKey = clean(process.env.VAPID_PUBLIC)
  const privateKey = clean(process.env.VAPID_PRIVATE)
  if (!publicKey || !privateKey) return { sent:0, skipped:records.length, reason:'VAPID no configurado' }
  try { webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', publicKey, privateKey) } catch { return { sent:0, skipped:records.length, reason:'VAPID inválido' } }
  const response = await fetch(`${SB_URL}/rest/v1/push_subs?select=user_id,endpoint,p256dh,auth`, { headers })
  if (!response.ok) return { sent:0, skipped:records.length, reason:`push_subs ${response.status}` }
  const grouped = groupPushSubscriptions(await response.json())
  let sent = 0
  for (const record of records) {
    const subs = grouped.get(record.empId) || []
    const payload = JSON.stringify({ title:'⏱️ Jornada cerrada automáticamente', body:`Tu jornada del ${record.inicio.slice(0, 10)} se cerró tras 10 horas sin fichar salida.`, tag:'autoclose', url:'/?tab=jornada', userId:record.empId })
    const results = await Promise.allSettled(subs.map(async sub => {
      try {
        await webpush.sendNotification({ endpoint:sub.endpoint, keys:{ p256dh:sub.p256dh, auth:sub.auth } }, payload)
        return true
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await fetch(`${SB_URL}/rest/v1/push_subs?${pushSubscriptionDeleteFilter(record.empId, sub.endpoint)}`, { method:'DELETE', headers }).catch(() => {})
        }
        return false
      }
    }))
    sent += results.filter(result => result.status === 'fulfilled' && result.value).length
  }
  return { sent, skipped:Math.max(0, records.length - sent) }
}

export default async function handler(req, res) {
  if (!CRON_SECRET) return res.status(500).json({ error:'CRON_SECRET no configurado' })
  const token = String(req.headers.authorization || '').replace('Bearer ', '')
  const valid = token.length === CRON_SECRET.length && timingSafeEqual(Buffer.from(token), Buffer.from(CRON_SECRET))
  if (!valid) return res.status(401).json({ error:'Unauthorized' })
  if (!SB_URL || !SB_ANON || !SB_SERVICE) return res.status(500).json({ error:'Supabase service config missing' })
  const startedAt = Date.now()
  try {
    const open = await readOpenRecords()
    const candidates = open.filter(record => startedAt - new Date(record.inicio).getTime() > TEN_HOURS_MS)
    if (!candidates.length) {
      await persistHealth(createAutomationRun('autoclose', { startedAt, checked:open.length }))
      return res.status(200).json({ ok:true, checked:open.length, closed:0 })
    }
    const closed = candidates.map(record => {
      const closeTime = new Date(new Date(record.inicio).getTime() + TEN_HOURS_MS).toISOString()
      return { ...finalizeRecord(record, { now:closeTime }), autoClosedAt:new Date().toISOString() }
    })
    const tableFailures = await upsertRecords(closed)
    const run = createAutomationRun('autoclose', { startedAt, checked:open.length, processed:closed.length, status:tableFailures.length ? 'error' : 'ok', error:tableFailures[0] || null })
    await persistHealth(run)
    const delivery = await notifyClosed(closed)
    return res.status(200).json({ ok:true, checked:open.length, closed:closed.length, tableFailures:tableFailures.length, pushSent:delivery.sent, pushSkipped:delivery.skipped })
  } catch (error) {
    console.error('[cron-autoclose]', error)
    try { await persistHealth(createAutomationRun('autoclose', { status:'error', startedAt, error:error?.message || error })) } catch {}
    return res.status(500).json({ error:'Autoclose failed' })
  }
}
