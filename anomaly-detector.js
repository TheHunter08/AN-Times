/**
 * TIMES INC – Anomaly Detector (GitHub Actions)
 * Detecta jornadas abiertas >10h y envía push al empleado y al admin.
 * Corre cada noche a las 23h Madrid via GitHub Actions.
 */

import webpush from 'web-push'

const toB64Url = s => (s || '').replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const isValidVapid = s => /^[A-Za-z0-9\-_]{40,}$/.test(s)
const _vpub = toB64Url(process.env.VAPID_PUBLIC)
const _vprv = toB64Url(process.env.VAPID_PRIVATE)
const VAPID_PUBLIC  = isValidVapid(_vpub) ? _vpub : 'BJLsu9gt57Oa3uflEpMVUfRXgawp49vhtgdMjU6nzb9zOjWgSxIxuuFQVe6z_uiNXNPUwbCPqUHUoZk_iVmjNfQ'
const VAPID_PRIVATE = isValidVapid(_vprv) ? _vprv : 'fvQg0fFEkOoUGLdOfUkdZ4uI2k7vv6bmUPqbChZSOnE'
const SB_URL        = process.env.VITE_SB_URL   || 'https://eyyhlcvpyiorpdnvqsll.supabase.co'
const SB_ANON       = process.env.VITE_SB_ANON  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I'
const ALERT_HOURS   = 10

webpush.setVapidDetails('mailto:admin@times.inc', VAPID_PUBLIC, VAPID_PRIVATE)

const SB_HEADERS = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` }

async function sbReadData() {
  const res = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data`, { headers: SB_HEADERS })
  const rows = await res.json()
  return rows?.[0]?.data || null
}

async function sbReadPushSubs() {
  const res = await fetch(`${SB_URL}/rest/v1/push_subs?select=user_id,endpoint,p256dh,auth`, { headers: SB_HEADERS })
  return (await res.json()) || []
}

async function sbDeletePushSub(userId) {
  await fetch(`${SB_URL}/rest/v1/push_subs?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE', headers: SB_HEADERS
  }).catch(() => {})
}

async function sendPush(sub, payload, userId) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    )
    console.log(`Push enviado a ${userId}`)
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await sbDeletePushSub(userId)
      console.log(`Sub expirada eliminada: ${userId}`)
    } else {
      console.warn(`Push fallido para ${userId}:`, err.statusCode || err.message)
    }
  }
}

async function main() {
  console.log('=== Anomaly Detector iniciado ===')

  const [db, pushSubs] = await Promise.all([sbReadData(), sbReadPushSubs()])
  if (!db?.records) { console.log('Sin records en DB'); return }

  const subsMap      = Object.fromEntries(pushSubs.map(s => [s.user_id, s]))
  const now          = Date.now()
  const THRESHOLD_MS = ALERT_HOURS * 60 * 60 * 1000
  const madridTime   = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit'
  }).format(new Date())

  const stale = (db.records || []).filter(r =>
    !r.fin && !r.autoClosedAt && (now - new Date(r.inicio).getTime()) > THRESHOLD_MS
  )

  console.log(`Jornadas abiertas >10h: ${stale.length}`)

  const notifiedEmps = new Set()
  for (const rec of stale) {
    const hoursOpen = Math.floor((now - new Date(rec.inicio).getTime()) / 3600000)
    const sub = subsMap[rec.empId]
    if (!sub || notifiedEmps.has(rec.empId)) continue
    notifiedEmps.add(rec.empId)

    await sendPush(sub, {
      title: '⚠️ Jornada abierta sin cerrar',
      body: `Llevas ${hoursOpen}h sin fichar la salida. Son las ${madridTime}. ¿Olvidaste fichar?`,
      tag: 'anomaly-open-shift',
      url: '/?tab=inicio'
    }, rec.empId)
  }

  if (stale.length > 0) {
    const adminSub = subsMap['admin']
    if (adminSub) {
      const names = [...new Set(stale.map(r => r.empName?.split(' ')[0] || r.empId))].join(', ')
      await sendPush(adminSub, {
        title: `⚠️ ${stale.length} jornada${stale.length > 1 ? 's' : ''} sin cerrar`,
        body: `${names} — llevan >10h con jornada activa`,
        tag: 'anomaly-admin',
        url: '/?go=admin:control'
      }, 'admin')
    }
  }

  console.log('=== Anomaly Detector completado ===')
}

main().catch(e => { console.error(e); process.exit(1) })
