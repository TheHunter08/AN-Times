/**
 * TIMES INC – Auto-cierre de jornadas abiertas > 12h
 * Corre vía GitHub Actions cada 2 horas (ver .github/workflows/autoclose-jornada.yml).
 * Cierra registros sin fin que lleven más de 12h abiertos y notifica al empleado.
 */

import webpush from 'web-push'

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC  || 'BJLsu9gt57Oa3uflEpMVUfRXgawp49vhtgdMjU6nzb9zOjWgSxIxuuFQVe6z_uiNXNPUwbCPqUHUoZk_iVmjNfQ'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || 'fvQg0fFEkOoUGLdOfUkdZ4uI2k7vv6bmUPqbChZSOnE'
const SB_URL        = process.env.VITE_SB_URL   || 'https://eyyhlcvpyiorpdnvqsll.supabase.co'
const SB_ANON       = process.env.VITE_SB_ANON  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I'

webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)

const SB_HEADERS = {
  apikey: SB_ANON,
  Authorization: `Bearer ${SB_ANON}`,
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

async function readPushSubs() {
  const res = await fetch(`${SB_URL}/rest/v1/push_subs?select=user_id,endpoint,p256dh,auth`, { headers: SB_HEADERS })
  return (await res.json()) || []
}

async function deletePushSub(userId) {
  await fetch(`${SB_URL}/rest/v1/push_subs?user_id=eq.${encodeURIComponent(userId)}`, {
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
    if (err.statusCode === 410) await deletePushSub(sub.user_id)
    return false
  }
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000
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

  const toClose = openRecs.filter(r => (now - new Date(r.inicio).getTime()) > TWELVE_HOURS_MS)

  if (!toClose.length) {
    console.log(`Sin jornadas abiertas >12h. Open total: ${openRecs.length}`)
    return
  }

  console.log(`Cerrando ${toClose.length} jornada(s) con >12h sin fichar salida`)

  const pushSubs = await readPushSubs()
  const subsMap  = Object.fromEntries(pushSubs.map(s => [s.user_id, s]))

  const closedIds = new Set()
  const updatedRecords = db.records.map(r => {
    if (!toClose.find(c => c.id === r.id)) return r
    const closeTime = new Date(new Date(r.inicio).getTime() + TWELVE_HOURS_MS).toISOString()
    const workMs    = new Date(closeTime) - new Date(r.inicio)
    const breakMs   = (r.breakSecs || 0) * 1000
    const workSecs  = Math.max(0, Math.floor((workMs - breakMs) / 1000))
    closedIds.add(r.id)
    return { ...r, fin: closeTime, workSecs, closed: true, autoClosedAt: new Date().toISOString() }
  })

  const newDB = { ...db, records: updatedRecords, _ts: now }
  await writeDB(newDB, row.ts)
  console.log('BD actualizada.')

  for (const rec of toClose) {
    const workMin = Math.floor((TWELVE_HOURS_MS - (rec.breakSecs || 0) * 1000) / 60000)
    const sub = subsMap[rec.empId]
    if (!sub?.endpoint) { console.log(`  ! Sin suscripción push: ${rec.empId}`); continue }
    const sent = await sendPush(
      sub,
      '⏱️ Jornada cerrada automáticamente',
      `Tu jornada del ${rec.inicio.slice(0, 10)} se cerró tras ${mhm(workMin)} (más de 12h sin fichar salida).`,
      '/?tab=jornada'
    )
    console.log(`  ${sent ? '✓' : '!'} Push a ${rec.empId} (${rec.empName || ''})`)
  }
}

run().catch(err => { console.error(err); process.exit(1) })
