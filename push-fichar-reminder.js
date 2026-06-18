/**
 * TIMES INC – Recordatorio diario de fichaje
 * Corre vía GitHub Actions a las 8-9h (L-V).
 * Lee empleados y registros de hoy desde Firebase.
 * Escribe en /pushQueue para cada empleado que no haya fichado aún.
 * push-server-once.js lo entrega en los siguientes 5 minutos.
 */

import https   from 'https'
import webpush from 'web-push'

const VAPID_PUBLIC  = 'BI4uEES76cujGjvpJ68hIKD4jeZfBUAHTmV9DTTbpnd91jAzld1iv_aeN9PkgKJ46J9m_r7GkvoiCeyOcsmm8q4'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || '0P7eNL8RBQfc5fy41k63OQuiT73_IKPgbM35I76rSvU'
const FB_BASE       = 'https://times-inc-default-rtdb.europe-west1.firebasedatabase.app'
const FB_API_KEY    = 'AIzaSyAYZdHMrGBnBb5O6p5oBIuikX1Qc9HgvjQ'

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
  if (!d?.idToken) throw new Error('Firebase auth failed')
  return d.idToken
}

function fbGet(path, token) {
  return new Promise((resolve, reject) => {
    https.get(`${FB_BASE}/${path}.json?auth=${token}`, res => {
      let buf = ''
      res.on('data', d => buf += d)
      res.on('end', () => { try { resolve(JSON.parse(buf)) } catch { resolve(null) } })
    }).on('error', reject)
  })
}

function fbPost(path, data, token) {
  return new Promise(resolve => {
    const body = JSON.stringify(data)
    const u    = new URL(`${FB_BASE}/${path}.json?auth=${token}`)
    const req  = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { res.resume(); res.on('end', resolve) })
    req.on('error', () => resolve())
    req.write(body); req.end()
  })
}

async function run() {
  // Hora actual en Madrid (UTC+1 invierno / UTC+2 verano)
  const now      = new Date()
  const madridH  = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }))
  const todayStr = madridH.toISOString().slice(0, 10)
  const hh       = madridH.getHours()

  console.log(`🕐 Madrid: ${madridH.toLocaleTimeString('es-ES')} | Fecha: ${todayStr}`)

  // Solo lanzar si es entre 7:00 y 10:00 hora Madrid (el cron puede variar ±1h)
  if (hh < 7 || hh >= 10) {
    console.log('Fuera de ventana horaria, nada que hacer.')
    return
  }

  const token = await getToken()
  const db    = await fbGet('an_times_data', token)
  if (!db) { console.log('No se pudo leer Firebase.'); return }

  const employees = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
  const records   = db.records || []

  // Empleados que NO han fichado hoy
  const sinFichar = employees.filter(emp =>
    !records.some(r => r.empId === emp.id && r.inicio.startsWith(todayStr))
  )

  console.log(`Empleados sin fichar hoy (${todayStr}): ${sinFichar.length}/${employees.length}`)
  if (!sinFichar.length) return

  // Evitar duplicados: comprobar si ya se mandó recordatorio hoy
  const queue = db.pushQueue ? Object.values(db.pushQueue) : []
  const yaEnviado = queue.some(q =>
    q.tag === 'reminder-fichar' && q.ts && q.ts > new Date(todayStr).getTime()
  )
  if (yaEnviado) { console.log('Recordatorio ya enviado hoy.'); return }

  // Escribir en la cola — push-server-once.js lo entregará
  for (const emp of sinFichar) {
    await fbPost('pushQueue', {
      to:    emp.id,
      title: '⏰ Recordatorio de fichaje',
      body:  `${emp.name.split(' ')[0]}, recuerda registrar tu entrada de hoy.`,
      tag:   'reminder-fichar',
      url:   '/?tab=inicio',
      ts:    Date.now()
    }, token)
    console.log(`  → Cola: ${emp.name}`)
  }

  console.log(`✓ ${sinFichar.length} recordatorio(s) en cola`)
}

run().catch(e => { console.error('Error:', e.message); process.exit(1) })
