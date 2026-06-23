// ── Cron de recordatorios de fichaje ──────────────────────────────────────────
// Ejecutado por Vercel Cron (vercel.json) cada hora.
// Lee app_data de Supabase, detecta qué empleados no han fichado y tienen la
// hora de recordatorio superada, y envía push notifications directamente via
// web-push (sin pasar por /api/sendpush para evitar redondeo extra de red).
//
// Requiere en variables de entorno de Vercel:
//   VAPID_PUBLIC, VAPID_PRIVATE, VITE_SB_URL, VITE_SB_ANON, CRON_SECRET
// ─────────────────────────────────────────────────────────────────────────────
const webpush = require('web-push')

const toB64Url = s => (s || '').replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const isValid  = s => /^[A-Za-z0-9\-_]{40,}$/.test(s)

const VAPID_PUBLIC  = isValid(toB64Url(process.env.VAPID_PUBLIC))  ? toB64Url(process.env.VAPID_PUBLIC)  : 'BJLsu9gt57Oa3uflEpMVUfRXgawp49vhtgdMjU6nzb9zOjWgSxIxuuFQVe6z_uiNXNPUwbCPqUHUoZk_iVmjNfQ'
const VAPID_PRIVATE = isValid(toB64Url(process.env.VAPID_PRIVATE)) ? toB64Url(process.env.VAPID_PRIVATE) : 'fvQg0fFEkOoUGLdOfUkdZ4uI2k7vv6bmUPqbChZSOnE'
const SB_URL        = process.env.VITE_SB_URL  || 'https://eyyhlcvpyiorpdnvqsll.supabase.co'
const SB_ANON       = process.env.VITE_SB_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I'
const CRON_SECRET   = process.env.CRON_SECRET   // Set in Vercel env vars for manual trigger security

webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)

const SB_H = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` }

async function getAppData() {
  const r = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data`, { headers: SB_H })
  if (!r.ok) return null
  const rows = await r.json()
  return rows?.[0]?.data || null
}

async function markNotisSent(keys) {
  // Re-read fresh data to minimize overwrite risk, then merge only notisSent
  const current = await getAppData()
  if (!current) return
  const merged = { ...current, notisSent: { ...(current.notisSent || {}), ...keys }, _ts: Date.now() }
  await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1`, {
    method: 'PATCH',
    headers: { ...SB_H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ data: merged, updated_at: new Date().toISOString() })
  }).catch(e => console.warn('[cron] markNotisSent patch error', e.message))
}

async function getPushSubs() {
  const r = await fetch(`${SB_URL}/rest/v1/push_subs?select=user_id,endpoint,p256dh,auth`, { headers: SB_H })
  if (!r.ok) return []
  return r.json()
}

async function deleteSub(userId) {
  await fetch(`${SB_URL}/rest/v1/push_subs?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE', headers: SB_H
  }).catch(() => {})
}

// Convierte Date a hora en la zona Europe/Madrid (soporta horario de verano/invierno)
function nowInSpain() {
  const str = new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' })
  return new Date(str)
}

function todayInSpain() {
  const d = nowInSpain()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

module.exports = async function handler(req, res) {
  // Vercel Cron envía el header x-vercel-cron:1 — aceptar también peticiones
  // manuales autenticadas con CRON_SECRET para pruebas.
  const isCronInvocation = req.headers['x-vercel-cron'] === '1'
  if (!isCronInvocation && CRON_SECRET) {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '')
    if (token !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()

  try {
    const db = await getAppData()
    if (!db) return res.status(500).json({ error: 'no app_data' })

    const now    = nowInSpain()
    const today  = todayInSpain()
    const nowH   = now.getHours()
    const nowM   = now.getMinutes()

    const employees  = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
    const records    = db.records || []
    const notisSent  = db.notisSent || {}
    const subs       = await getPushSubs()
    const subMap     = new Map(subs.map(s => [s.user_id, s]))

    const toSend    = []   // { emp, sub }
    const newKeys   = {}   // keys to mark as sent

    for (const emp of employees) {
      // reminderTime está guardado en el empleado desde el onboarding (o default 20:00)
      const reminderTime = emp.reminderTime || '20:00'
      const [rh, rm] = reminderTime.split(':').map(Number)
      const minsPast = (nowH - rh) * 60 + (nowM - rm)

      // Solo si ya pasó la hora del recordatorio hoy
      if (minsPast < 0) continue

      // Ya enviado hoy
      const key = 'an_rem_' + emp.id
      if (notisSent[key] === today) continue

      // Ya fichó hoy
      const hasFichado = records.some(r => r.empId === emp.id && typeof r.inicio === 'string' && r.inicio.startsWith(today))
      if (hasFichado) continue

      // Tiene suscripción push activa
      const sub = subMap.get(emp.id)
      if (!sub || !sub.endpoint) continue

      toSend.push({ emp, sub })
      newKeys[key] = today
    }

    let sent = 0, failed = 0
    for (const { emp, sub } of toSend) {
      const payload = JSON.stringify({
        title: '⏰ Recordatorio de fichaje',
        body: '¿Has fichado hoy? No olvides registrar tu jornada laboral.',
        tag: 'reminder-fichar',
        url: '/?tab=inicio'
      })
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        sent++
        console.log(`[cron] reminder sent → ${emp.name}`)
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) await deleteSub(emp.id)
        else console.warn(`[cron] push error for ${emp.name}:`, err.statusCode, err.body || err.message)
        failed++
        delete newKeys['an_rem_' + emp.id] // no marcar como enviado si falló
      }
    }

    // Persistir claves enviadas para no repetir hoy
    if (Object.keys(newKeys).length > 0) await markNotisSent(newKeys)

    const result = { ok: true, today, checked: employees.length, sent, failed, skipped: employees.length - toSend.length }
    console.log('[cron-reminders]', JSON.stringify(result))
    return res.status(200).json(result)
  } catch (e) {
    console.error('[cron-reminders] fatal', e)
    return res.status(500).json({ error: e.message })
  }
}
