/**
 * TIMES INC – Resumen semanal de horas
 * Corre vía GitHub Actions los viernes ~17h Madrid.
 * Envía a cada empleado un push con sus horas de la semana.
 */

import https from 'https'
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

const p2 = n => String(n).padStart(2, '0')
const mhm = m => `${Math.floor(m/60)}h ${p2(m%60)}m`

async function run() {
  const now      = new Date()
  const madridFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' })
  const madridHFmt = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Madrid', weekday:'long' })
  const madridHHFmt = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Madrid', hour:'numeric', hour12: false })
  const todayStr  = madridFmt.format(now)
  const weekday   = madridHFmt.format(now)
  const hh        = parseInt(madridHHFmt.format(now))

  console.log(`Madrid: ${now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} | Día: ${weekday}`)

  // Solo viernes entre 16h y 19h Madrid
  if (!weekday.toLowerCase().includes('fri') || hh < 16 || hh >= 19) {
    console.log('No es viernes tarde — nada que hacer.')
    return
  }

  // Calcular lunes y viernes de esta semana en Madrid
  const todayDate  = new Date(todayStr + 'T00:00:00')
  const dow        = todayDate.getDay() // 5 = viernes
  const monday     = new Date(todayDate)
  monday.setDate(todayDate.getDate() - (dow === 0 ? 6 : dow - 1))
  const mondayStr  = madridFmt.format(monday)

  console.log(`Semana: ${mondayStr} → ${todayStr}`)

  const token = await getToken()
  const db    = await fbGet('an_times_data', token)
  if (!db) { console.log('No se pudo leer Firebase.'); return }

  const employees = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
  const records   = db.records || []
  const pushSubs  = db.pushSubs || {}

  // Evitar duplicado: comprobar si ya se envió resumen esta semana
  const queue = db.pushQueue ? Object.values(db.pushQueue) : []
  const yaEnviado = queue.some(q => {
    if (q.tag !== 'weekly-summary' || !q.ts) return false
    const qDate = madridFmt.format(new Date(q.ts))
    return qDate >= mondayStr && qDate <= todayStr
  })
  if (yaEnviado) { console.log('Resumen semanal ya enviado esta semana.'); return }

  let enviados = 0
  for (const emp of employees) {
    const sub = pushSubs[encodeURIComponent(emp.id)] || pushSubs[emp.id]
    if (!sub?.endpoint) continue

    const eRecs = records.filter(r =>
      r.empId === emp.id && r.fin &&
      r.inicio.slice(0, 10) >= mondayStr &&
      r.inicio.slice(0, 10) <= todayStr
    )

    const totalMin  = eRecs.reduce((s, r) => {
      const ws = r.workSecs > 0 ? Math.floor(r.workSecs / 60) : 0
      if (ws > 0) return s + ws
      if (r.fin) {
        const diff = Math.floor((new Date(r.fin) - new Date(r.inicio)) / 60000)
        return s + Math.max(0, diff - Math.floor((r.breakSecs || 0) / 60))
      }
      return s
    }, 0)

    const dias    = eRecs.length
    const nombre  = emp.name.split(' ')[0]
    const horas   = mhm(totalMin)
    const weeklyH = emp.horasSemanales || 40
    const diff    = totalMin - weeklyH * 60
    const diffStr = diff >= 0 ? `+${mhm(diff)}` : `-${mhm(Math.abs(diff))}`

    const title = `Resumen semanal`
    const body  = `${nombre}, esta semana: ${horas} en ${dias} día${dias!==1?'s':''} (${diffStr} vs jornada)`

    // Envío directo via Web Push
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title, body, tag: 'weekly-summary', url: '/?tab=inicio' }))
      console.log(`  ✓ ${emp.name}: ${horas}`)
      enviados++
    } catch {
      // Escribir en cola como fallback
      await fbPost('pushQueue', { to: emp.id, title, body, tag: 'weekly-summary', url: '/?tab=inicio', ts: Date.now() }, token)
    }
  }

  // Marcar que se envió para evitar duplicados
  await fbPost('pushQueue', {
    to: '__marker__', title: 'weekly-summary-sent', body: '', tag: 'weekly-summary',
    url: '/', ts: Date.now(), processed: true, processedAt: Date.now()
  }, token)

  console.log(`✓ Resumen semanal enviado a ${enviados}/${employees.length} empleados`)
}

run().catch(e => { console.error('Error:', e.message); process.exit(1) })
