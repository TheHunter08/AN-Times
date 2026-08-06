/**
 * TIMES INC – Auto-cierre de jornadas abiertas > 10h
 * Corre vía GitHub Actions cada 4 horas (ver .github/workflows/autoclose-jornada.yml).
 * Cierra registros sin fin que lleven más de 10h abiertos y notifica al empleado.
 */

import webpush from 'web-push'
import { finalizeRecord } from './src/utils/recordLifecycle.js'
import { toRecordRow } from './src/services/tableSyncPlan.js'
import { groupPushSubscriptions, pushSubscriptionDeleteFilter } from './src/server/pushSubscriptions.js'

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

const SB_HEADERS = {
  apikey: SB_ANON,
  Authorization: `Bearer ${SB_SERVICE || SB_ANON}`,
  'Content-Type': 'application/json',
}

async function readDB() {
  const res = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data,updated_at`, { headers: SB_HEADERS })
  if (!res.ok) throw new Error(`DB read failed: ${res.status}`)
  const rows = await res.json()
  return rows?.[0] ? { data: rows[0].data, ts: rows[0].updated_at } : null
}

async function writeDB(data, expectedTs) {
  const cond = expectedTs ? `?id=eq.1&updated_at=eq.${encodeURIComponent(expectedTs)}` : '?id=eq.1'
  const res = await fetch(`${SB_URL}/rest/v1/app_data${cond}`, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal,count=exact' },
    body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(`DB write failed: ${res.status}`)
  const count = parseInt(res.headers.get('Content-Range')?.split('/')[1] || '1', 10)
  if (count === 0) throw new Error('Escritura rechazada: la BD cambió mientras procesábamos.')
}

async function upsertRecordRows(records) {
  if (!records.length) return []
  const rows = records.map(record => toRecordRow(record, record._upd))
  const upsert = async batch => {
    const res = await fetch(`${SB_URL}/rest/v1/records?on_conflict=id`, {
      method: 'POST',
      headers: { ...SB_HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    })
    return { res, detail: res.ok ? '' : (await res.text()).slice(0, 180) }
  }

  const batch = await upsert(rows)
  if (batch.res.ok) return []

  const failures = []
  for (const row of rows) {
    const attempt = await upsert([row])
    if (!attempt.res.ok) failures.push(`${row.id}: ${attempt.res.status} ${attempt.detail}`)
  }
  return failures
}

async function readPushSubs() {
  const res = await fetch(`${SB_URL}/rest/v1/push_subs?select=user_id,endpoint,p256dh,auth`, { headers: SB_HEADERS })
  if (!res.ok) throw new Error(`push_subs read failed: ${res.status}`)
  return (await res.json()) || []
}

async function deletePushSub(userId, endpoint) {
  await fetch(`${SB_URL}/rest/v1/push_subs?${pushSubscriptionDeleteFilter(userId, endpoint)}`, {
    method: 'DELETE', headers: SB_HEADERS
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
  const now = Date.now()
  const row = await readDB()
  if (!row) { console.log('No se pudo leer Supabase.'); return }

  const db = row.data
  const openRecs = (db.records || []).filter(r => !r.fin)

  const toClose = openRecs.filter(r => (now - new Date(r.inicio).getTime()) > TEN_HOURS_MS)

  if (!toClose.length) {
    console.log(`Sin jornadas abiertas >10h. Open total: ${openRecs.length}`)
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

  const closedRecords = []
  const updatedRecords = db.records.map(r => {
    if (!toClose.find(c => c.id === r.id)) return r
    const closeTime = new Date(new Date(r.inicio).getTime() + TEN_HOURS_MS).toISOString()
    const closed = { ...finalizeRecord(r, { now: closeTime }), autoClosedAt: new Date().toISOString() }
    closedRecords.push(closed)
    return closed
  })

  const newDB = { ...db, records: updatedRecords, _ts: now }
  const recordSyncFailures = await upsertRecordRows(closedRecords)
  await writeDB(newDB, row.ts)
  console.log('BD actualizada.')
  if (recordSyncFailures.length) {
    console.warn(`No se pudieron reflejar ${recordSyncFailures.length} autocierres en la tabla records; app_data quedó actualizado para su resincronización.`)
  }

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

run().catch(err => { console.error(err); process.exit(1) })
