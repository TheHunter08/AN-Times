/**
 * TIMES INC – Recordatorio diario de fichaje
 * Corre vía GitHub Actions a las 8-9h (L-V).
 * Lee empleados y registros desde Supabase.
 * Envía push directamente a empleados sin fichar.
 */

import webpush from 'web-push'

// Limpia BOM (﻿) y espacios que GitHub Secrets puede incluir al copiar desde Windows
const cleanEnv = s => (s || '').replace(/^﻿/, '').trim()
const toB64Url = s => cleanEnv(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const isValidVapid = s => /^[A-Za-z0-9\-_]{40,}$/.test(s)
const _vpub = toB64Url(process.env.VAPID_PUBLIC)
const _vprv = toB64Url(process.env.VAPID_PRIVATE)
const VAPID_PUBLIC  = isValidVapid(_vpub) ? _vpub : null
const VAPID_PRIVATE = isValidVapid(_vprv) ? _vprv : null
const SB_URL        = cleanEnv(process.env.VITE_SB_URL)  || 'https://eyyhlcvpyiorpdnvqsll.supabase.co'
const SB_ANON       = cleanEnv(process.env.VITE_SB_ANON) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I'

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error('VAPID_PUBLIC/VAPID_PRIVATE no configuradas o inválidas — abortando sin enviar push')
  process.exit(1)
}
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

async function run() {
  const now         = new Date()
  const madridFmt   = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' })
  const madridHHFmt = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Madrid', hour:'numeric', hour12: false })
  const todayStr    = madridFmt.format(now)
  const hh          = parseInt(madridHHFmt.format(now))

  console.log(`Madrid: ${now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} | Fecha: ${todayStr}`)

  if (hh < 7 || hh >= 10) {
    console.log('Fuera de ventana horaria (07:00-10:00), nada que hacer.')
    return
  }

  const [db, pushSubs] = await Promise.all([sbReadData(), sbReadPushSubs()])
  if (!db) { console.log('No se pudo leer Supabase.'); return }

  const employees = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
  const records   = db.records || []
  const subsMap   = Object.fromEntries(pushSubs.map(s => [s.user_id, s]))

  const sinFichar = employees.filter(emp =>
    !records.some(r => r.empId === emp.id && r.inicio.startsWith(todayStr))
  )

  console.log(`Empleados sin fichar hoy (${todayStr}): ${sinFichar.length}/${employees.length}`)
  if (!sinFichar.length) return

  let enviados = 0
  for (const emp of sinFichar) {
    const sub = subsMap[emp.id]
    if (!sub?.endpoint) continue

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({
          title: '⏰ Recordatorio de fichaje',
          body: `${emp.name.split(' ')[0]}, recuerda registrar tu entrada de hoy.`,
          tag: 'reminder-fichar',
          url: '/?tab=inicio'
        })
      )
      console.log(`  ✓ Push: ${emp.name}`)
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

  console.log(`✓ ${enviados} recordatorio(s) enviados`)
}

run().catch(e => { console.error('Error:', e.message); process.exit(1) })
