/**
 * TIMES INC – Resumen semanal de horas
 * Corre vía GitHub Actions los viernes ~17h Madrid.
 * Lee datos desde Supabase y envía push directamente a cada empleado.
 */

import webpush from 'web-push'

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC  || 'BHkLMm4jcnQUppuN6UNx7b3gK073ZB0l7LHABbT74GrBxt-BeYWyi0LEadsf21Vpx9gO71Mc3TVRy2yTh_MaOsw'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE
const SB_URL        = process.env.VITE_SB_URL   || 'https://eyyhlcvpyiorpdnvqsll.supabase.co'
const SB_ANON       = process.env.VITE_SB_ANON  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I'

if (!VAPID_PRIVATE) { console.error('Falta VAPID_PRIVATE'); process.exit(1) }
webpush.setVapidDetails('mailto:admin@times.inc', VAPID_PUBLIC, VAPID_PRIVATE)

const SB_HEADERS = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` }
const p2  = n => String(n).padStart(2, '0')
const mhm = m => `${Math.floor(m/60)}h ${p2(m%60)}m`

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

async function run() {
  const now         = new Date()
  const madridFmt   = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' })
  const madridHFmt  = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Madrid', weekday:'long' })
  const madridHHFmt = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Madrid', hour:'numeric', hour12: false })
  const todayStr    = madridFmt.format(now)
  const weekday     = madridHFmt.format(now)
  const hh          = parseInt(madridHHFmt.format(now))

  console.log(`Madrid: ${now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} | Día: ${weekday}`)

  if (!weekday.toLowerCase().includes('fri') || hh < 16 || hh >= 19) {
    console.log('No es viernes tarde (16:00-19:00) — nada que hacer.')
    return
  }

  const todayDate = new Date(todayStr + 'T00:00:00')
  const dow       = todayDate.getDay()
  const monday    = new Date(todayDate)
  monday.setDate(todayDate.getDate() - (dow === 0 ? 6 : dow - 1))
  const mondayStr = madridFmt.format(monday)

  console.log(`Semana: ${mondayStr} → ${todayStr}`)

  const [db, pushSubs] = await Promise.all([sbReadData(), sbReadPushSubs()])
  if (!db) { console.log('No se pudo leer Supabase.'); return }

  const employees = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
  const records   = db.records || []
  const subsMap   = Object.fromEntries(pushSubs.map(s => [s.user_id, s]))

  let enviados = 0
  for (const emp of employees) {
    const sub = subsMap[emp.id]
    if (!sub?.endpoint) continue

    const eRecs = records.filter(r =>
      r.empId === emp.id && r.fin &&
      r.inicio.slice(0, 10) >= mondayStr &&
      r.inicio.slice(0, 10) <= todayStr
    )

    const totalMin = eRecs.reduce((s, r) => {
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

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({
          title: 'Resumen semanal',
          body: `${nombre}, esta semana: ${horas} en ${dias} día${dias!==1?'s':''} (${diffStr} vs jornada)`,
          tag: 'weekly-summary',
          url: '/?tab=inicio'
        })
      )
      console.log(`  ✓ ${emp.name}: ${horas}`)
      enviados++
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await sbDeletePushSub(emp.id)
        console.log(`  ✗ Sub expirada eliminada: ${emp.name}`)
      } else {
        console.warn(`  ✗ Push fallido para ${emp.name}:`, err.statusCode || err.message)
      }
    }
  }

  console.log(`✓ Resumen semanal enviado a ${enviados}/${employees.length} empleados`)
}

run().catch(e => { console.error('Error:', e.message); process.exit(1) })
