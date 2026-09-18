/**
 * TIMES INC – Auto-cierre de jornadas abiertas > 10h (respaldo manual)
 * Corre vía GitHub Actions (workflow_dispatch, ver .github/workflows/autoclose-jornada.yml)
 * cuando el cron de Vercel (api/cron-autoclose.js) falla. Cierra registros sin
 * fin que lleven más de 10h abiertos y notifica al empleado — misma lógica
 * que api/cron-autoclose.js, para que el respaldo manual no reintroduzca
 * bugs ya corregidos allí.
 */

import webpush from 'web-push'
import { finalizeRecord, MAX_OPEN_BREAK_MIN_ON_AUTOCLOSE } from './src/utils/recordLifecycle.js'
import { toRecordRow } from './src/services/tableSyncPlan.js'
import { groupPushSubscriptions, pushSubscriptionDeleteFilter } from './src/server/pushSubscriptions.js'
import { createAutomationRun } from './src/server/automationHealth.js'
import { persistAutomationRun } from './src/server/persistAutomationHealth.js'

// Limpia BOM (﻿) y espacios que GitHub Secrets puede incluir al copiar desde Windows
const cleanEnv  = s => (s || '').replace(/^﻿/, '').trim()
const toB64Url  = s => cleanEnv(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const isValidVapid = s => /^[A-Za-z0-9\-_]{40,}$/.test(s)
const _vpub = toB64Url(process.env.VAPID_PUBLIC)
const _vprv = toB64Url(process.env.VAPID_PRIVATE)
const VAPID_PUBLIC  = isValidVapid(_vpub) ? _vpub : null
const VAPID_PRIVATE = isValidVapid(_vprv) ? _vprv : null
const SB_URL        = cleanEnv(process.env.VITE_SB_URL)  || 'https://eyyhlcvpyiorpdnvqsll.supabase.co'
const SB_ANON       = cleanEnv(process.env.VITE_SB_ANON) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I'
const SB_SERVICE    = cleanEnv(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error('VAPID_PUBLIC/VAPID_PRIVATE no configuradas o inválidas — abortando sin enviar push')
  process.exit(1)
}
webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)

const headers = {
  apikey: SB_ANON,
  Authorization: `Bearer ${SB_SERVICE || SB_ANON}`,
  'Content-Type': 'application/json',
}

// La tabla `records` es la fuente viva de jornadas abiertas — el cliente
// escribe cada fichaje ahí directamente (persistRecordRow, prioritario sobre
// la reconciliación del blob completo). Decidir qué cerrar a partir del blob
// `app_data.data.records` (que solo se pone al día en segundo plano y con
// más fragilidad en cobertura débil) dejaba fuera justo los fichajes de
// empleados con conexión intermitente: los que más necesitan el autocierre.
async function readOpenRecords() {
  const response = await fetch(`${SB_URL}/rest/v1/records?select=*&fin=is.null&deleted=eq.false`, { headers })
  if (!response.ok) throw new Error(`records read ${response.status}`)
  return (await response.json()).map(row => ({
    ...(row.data || {}), id: row.id, empId: row.emp_id, empName: row.emp_name,
    inicio: row.inicio, fin: row.fin, breaks: row.breaks || [], workSecs: row.work_secs || 0,
    breakSecs: row.break_secs || 0, closed: !!row.closed, _upd: row.updated_at,
  }))
}

async function upsertRecords(records) {
  if (!records.length) return []
  const rows = records.map(record => toRecordRow(record, record._upd))
  const upsert = async batch => {
    const response = await fetch(`${SB_URL}/rest/v1/records?on_conflict=id`, {
      method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(batch),
    })
    return { ok: response.ok, status: response.status, detail: response.ok ? '' : (await response.text()).slice(0, 180) }
  }
  const batch = await upsert(rows)
  if (batch.ok) return []
  const failures = []
  for (const row of rows) {
    const attempt = await upsert([row])
    if (!attempt.ok) failures.push(`${row.id}: ${attempt.status} ${attempt.detail}`)
  }
  return failures
}

async function readPushSubs() {
  const res = await fetch(`${SB_URL}/rest/v1/push_subs?select=user_id,endpoint,p256dh,auth`, { headers })
  if (!res.ok) throw new Error(`push_subs read failed: ${res.status}`)
  return (await res.json()) || []
}

async function deletePushSub(userId, endpoint) {
  await fetch(`${SB_URL}/rest/v1/push_subs?${pushSubscriptionDeleteFilter(userId, endpoint)}`, {
    method: 'DELETE', headers,
  }).catch(() => {})
}

async function sendPush(sub, title, body, url = '/') {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title, body, tag: 'autoclose', url })
    )
    return true
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) await deletePushSub(sub.user_id, sub.endpoint)
    return false
  }
}

async function sendPushToAll(subs, title, body, url = '/') {
  const results = await Promise.all(subs.map(sub => sendPush(sub, title, body, url)))
  return results.some(Boolean)
}

const TEN_HOURS_MS = 10 * 60 * 60 * 1000
const p2 = n => String(n).padStart(2, '0')
const mhm = min => {
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h ${p2(m)}min` : `${m}min`
}

async function run() {
  const startedAt = Date.now()
  const open = await readOpenRecords()
  const toClose = open.filter(r => (startedAt - new Date(r.inicio).getTime()) > TEN_HOURS_MS)

  if (!toClose.length) {
    await persistAutomationRun(createAutomationRun('autoclose', { startedAt, checked: open.length, processed: 0 }))
    console.log(`Sin jornadas abiertas >10h. Open total: ${open.length}`)
    return
  }

  console.log(`Cerrando ${toClose.length} jornada(s) con >10h sin fichar salida`)

  let pushSubs = []
  try {
    pushSubs = await readPushSubs()
  } catch (error) {
    // La notificación es secundaria: una caída de push_subs no debe impedir
    // que la jornada se cierre y se conserve correctamente.
    console.warn('No se pudieron leer las suscripciones push; el autocierre continuará sin aviso:', error.message)
  }
  const subsByUser = groupPushSubscriptions(pushSubs)

  // finalizeRecord con maxOpenBreakMin: un descanso sin cerrar no debe
  // comerse la jornada entera al autocerrar (ver MAX_OPEN_BREAK_MIN_ON_AUTOCLOSE
  // en recordLifecycle.js) — sin este tope, este mismo script reproducía el
  // bug de "0h trabajadas" ya corregido en api/cron-autoclose.js.
  const closedRecords = toClose.map(record => {
    const closeTime = new Date(new Date(record.inicio).getTime() + TEN_HOURS_MS).toISOString()
    return { ...finalizeRecord(record, { now: closeTime, maxOpenBreakMin: MAX_OPEN_BREAK_MIN_ON_AUTOCLOSE }), autoClosedAt: new Date().toISOString() }
  })

  const tableFailures = await upsertRecords(closedRecords)
  if (tableFailures.length) {
    console.warn(`No se pudieron reflejar ${tableFailures.length} autocierres en la tabla records:`, tableFailures.join('; '))
  }
  await persistAutomationRun(createAutomationRun('autoclose', {
    startedAt, checked: open.length, processed: closedRecords.length,
    status: tableFailures.length ? 'error' : 'ok', error: tableFailures[0] || null,
  }))
  console.log('Tabla records actualizada.')

  for (const rec of toClose) {
    const closed = closedRecords.find(item => item.id === rec.id)
    const workMin = Math.floor((closed?.workSecs || 0) / 60)
    const employeeSubs = subsByUser.get(rec.empId) || []
    const sub = employeeSubs[0]
    if (!sub?.endpoint) { console.log(`  ! Sin suscripción push: ${rec.empId}`); continue }
    const sent = await sendPushToAll(
      employeeSubs,
      '⏱️ Jornada cerrada automáticamente',
      `Tu jornada del ${rec.inicio.slice(0, 10)} se cerró tras ${mhm(workMin)} (más de 10h sin fichar salida).`,
      '/?tab=jornada'
    )
    console.log(`  ${sent ? '✓' : '!'} Push a ${rec.empId} (${rec.empName || ''})`)
  }
}

const processStartedAt = Date.now()
run().catch(async err => {
  console.error(err)
  try {
    await persistAutomationRun(createAutomationRun('autoclose', {
      status: 'error', startedAt: processStartedAt, error: err?.message || err,
    }))
  } catch (healthError) {
    console.error('No se pudo registrar el fallo del autocierre:', healthError.message)
  }
  process.exit(1)
})
