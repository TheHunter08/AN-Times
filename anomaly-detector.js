/**
 * TIMES INC – Anomaly Detector (GitHub Actions)
 * Detecta jornadas abiertas >10h y envía push al empleado y al admin.
 * Corre cada noche a las 23h Madrid via GitHub Actions.
 */

import https   from 'https'
import webpush from 'web-push'

const VAPID_PUBLIC  = 'BI4uEES76cujGjvpJ68hIKD4jeZfBUAHTmV9DTTbpnd91jAzld1iv_aeN9PkgKJ46J9m_r7GkvoiCeyOcsmm8q4'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || '0P7eNL8RBQfc5fy41k63OQuiT73_IKPgbM35I76rSvU'
const FB_BASE       = 'https://times-inc-default-rtdb.europe-west1.firebasedatabase.app'
const DB_PATH       = 'an_times_data'
const FB_API_KEY    = 'AIzaSyAYZdHMrGBnBb5O6p5oBIuikX1Qc9HgvjQ'
const ALERT_HOURS   = 10

webpush.setVapidDetails('mailto:admin@times.inc', VAPID_PUBLIC, VAPID_PRIVATE)

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const u    = new URL(url)
    const req  = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let buf = ''
      res.on('data', d => buf += d)
      res.on('end', () => { try { resolve(JSON.parse(buf)) } catch { resolve(null) } })
    })
    req.on('error', reject)
    req.write(data); req.end()
  })
}

async function getToken() {
  const d = await post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FB_API_KEY}`,
    { returnSecureToken: true }
  )
  if (!d?.idToken) throw new Error('Auth Firebase fallida')
  return d.idToken
}

function fbGet(path, token) {
  return new Promise((resolve, reject) => {
    const url = `${FB_BASE}/${path}.json?auth=${token}`
    https.get(url, res => {
      let buf = ''
      res.on('data', d => buf += d)
      res.on('end', () => { try { resolve(JSON.parse(buf)) } catch { resolve(null) } })
    }).on('error', reject)
  })
}

async function sendPush(sub, payload, uid, token) {
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload))
    console.log(`Push enviado a ${uid}`)
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Suscripción expirada — eliminar de Firebase
      await new Promise(resolve => {
        const u = new URL(`${FB_BASE}/pushSubs/${encodeURIComponent(uid)}.json?auth=${token}`)
        const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'DELETE' }, resolve)
        req.on('error', resolve); req.end()
      })
      console.log(`Sub expirada eliminada: ${uid}`)
    } else {
      console.warn(`Push fallido para ${uid}:`, err.statusCode || err.message)
    }
  }
}

async function main() {
  console.log('=== Anomaly Detector iniciado ===')
  const token = await getToken()

  const [db, pushSubs] = await Promise.all([
    fbGet(DB_PATH, token),
    fbGet('pushSubs', token),
  ])

  if (!db?.records) { console.log('Sin records en DB'); return }

  const now = Date.now()
  const THRESHOLD_MS = ALERT_HOURS * 60 * 60 * 1000
  const madridTime = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit'
  }).format(new Date())

  const stale = (db.records || []).filter(r =>
    !r.fin && !r.autoClosedAt && (now - new Date(r.inicio).getTime()) > THRESHOLD_MS
  )

  console.log(`Jornadas abiertas >10h: ${stale.length}`)

  const subs = pushSubs || {}
  const notifiedEmps = new Set()

  for (const rec of stale) {
    const hoursOpen = Math.floor((now - new Date(rec.inicio).getTime()) / 3600000)
    const sub = subs[rec.empId]
    if (!sub || notifiedEmps.has(rec.empId)) continue
    notifiedEmps.add(rec.empId)

    await sendPush(sub, {
      title: '⚠️ Jornada abierta sin cerrar',
      body: `Llevas ${hoursOpen}h sin fichar la salida. Son las ${madridTime}. ¿Olvidaste fichar?`,
      tag: 'anomaly-open-shift',
      url: '/?tab=inicio'
    }, rec.empId, token)
  }

  // Aviso al admin si hay jornadas abiertas
  if (stale.length > 0) {
    const adminSub = subs['admin']
    if (adminSub) {
      const names = [...new Set(stale.map(r => r.empName?.split(' ')[0] || r.empId))].join(', ')
      await sendPush(adminSub, {
        title: `⚠️ ${stale.length} jornada${stale.length > 1 ? 's' : ''} sin cerrar`,
        body: `${names} — llevan >10h con jornada activa`,
        tag: 'anomaly-admin',
        url: '/admin'
      }, 'admin', token)
    }
  }

  console.log('=== Anomaly Detector completado ===')
}

main().catch(e => { console.error(e); process.exit(1) })
