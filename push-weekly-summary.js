/**
 * Resumen definitivo de la semana laboral (lunes a viernes).
 * Corre el sábado y usa exactamente la misma regla que la app y los cierres.
 */
import webpush from 'web-push'
import {
  adminWeeklyDeficitBody,
  completedWeeklySummary,
  employeeWeeklySummaryBody,
} from './src/utils/weeklySummary.js'

process.env.TZ = 'Europe/Madrid'

const cleanEnv = value => String(value || '').replace(/^\uFEFF/, '').trim()
const toB64Url = value => cleanEnv(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const isValidVapid = value => /^[A-Za-z0-9_-]{40,}$/.test(value)
const VAPID_PUBLIC = toB64Url(process.env.VAPID_PUBLIC)
const VAPID_PRIVATE = toB64Url(process.env.VAPID_PRIVATE)
const SB_URL = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON = cleanEnv(process.env.VITE_SB_ANON)

if (!isValidVapid(VAPID_PUBLIC) || !isValidVapid(VAPID_PRIVATE) || !SB_URL || !SB_ANON) {
  console.error('Faltan credenciales VAPID o Supabase válidas')
  process.exit(1)
}

webpush.setVapidDetails('mailto:admin@times.inc', VAPID_PUBLIC, VAPID_PRIVATE)
const SB_HEADERS = { apikey:SB_ANON, Authorization:`Bearer ${SB_ANON}` }

async function readJson(path) {
  const response = await fetch(`${SB_URL}/rest/v1/${path}`, { headers:SB_HEADERS })
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${path}`)
  return response.json()
}

async function readAppData() {
  const rows = await readJson('app_data?id=eq.1&select=data')
  return rows?.[0]?.data || null
}

async function deletePushSub(userId) {
  await fetch(`${SB_URL}/rest/v1/push_subs?user_id=eq.${encodeURIComponent(userId)}`, {
    method:'DELETE',
    headers:SB_HEADERS,
  }).catch(() => {})
}

async function markSent(keys) {
  if (!Object.keys(keys).length) return
  const latest = await readAppData()
  const data = {
    ...latest,
    notisSent:{ ...(latest.notisSent || {}), ...keys },
    _ts:Date.now(),
  }
  const response = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1`, {
    method:'PATCH',
    headers:{ ...SB_HEADERS, 'Content-Type':'application/json', Prefer:'return=minimal' },
    body:JSON.stringify({ data, updated_at:new Date().toISOString() }),
  })
  if (!response.ok) throw new Error(`No se pudo guardar la deduplicación (${response.status})`)
}

async function deliver(recipient, subscription, title, body, tag, url) {
  if (!subscription?.endpoint) return { ok:false, skipped:true }
  try {
    await webpush.sendNotification(
      { endpoint:subscription.endpoint, keys:{ p256dh:subscription.p256dh, auth:subscription.auth } },
      JSON.stringify({ title, body, tag, url, userId:recipient.id }),
    )
    return { ok:true }
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) await deletePushSub(recipient.id)
    return { ok:false, error }
  }
}

async function run() {
  const now = new Date()
  if (now.getDay() !== 6) {
    console.log('No es sábado en Europe/Madrid; no se genera un resumen provisional.')
    return
  }

  const [db, pushSubs] = await Promise.all([
    readAppData(),
    readJson('push_subs?select=user_id,endpoint,p256dh,auth'),
  ])
  if (!db) throw new Error('No se pudo leer app_data')

  const employees = (db.employees || []).filter(item => !item.baja && !item.isAdmin)
  const admins = (db.employees || []).filter(item => !item.baja && (item.isAdmin || item.role === 'jefe_obra'))
  const subs = new Map(pushSubs.map(item => [item.user_id, item]))
  const sentKeys = {}
  let sent = 0

  for (const employee of employees) {
    const summary = completedWeeklySummary(db, employee, now)
    if (!summary) continue

    if (!db.notisSent?.[summary.employeeKey]) {
      const result = await deliver(
        employee,
        subs.get(employee.id),
        '📊 Resumen semanal definitivo',
        employeeWeeklySummaryBody(employee, summary),
        'resumen-semanal',
        '/?tab=jornada',
      )
      if (result.ok) {
        sent++
        sentKeys[summary.employeeKey] = summary.end
      }
    }

    if (summary.deficitMin <= 0) continue
    for (const admin of admins) {
      const key = `an_weekly_deficit_${admin.id}_${employee.id}_${summary.start}`
      if (db.notisSent?.[key]) continue
      const result = await deliver(
        admin,
        subs.get(admin.id),
        '⚠️ Déficit semanal cerrado',
        adminWeeklyDeficitBody(employee, summary),
        'deficit-semanal',
        '/?go=admin:horas',
      )
      if (result.ok) {
        sent++
        sentKeys[key] = summary.end
      }
    }
  }

  await markSent(sentKeys)
  console.log(`Resumen semanal definitivo: ${sent} notificaciones entregadas`)
}

run().catch(error => {
  console.error('Error:', error?.message || error)
  process.exit(1)
})
