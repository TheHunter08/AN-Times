// ── Push masivo desde admin ────────────────────────────────────────────────────
// POST /api/send-push-all
// Body: { title, body, url?, target }
//   target: 'all' | 'activos' | { role: 'jefe_obra'|'encargado'|'empleado' } | { empIds: [...] }
// Auth: Authorization: Bearer <CRON_SECRET>  o  x-admin-secret: <CRON_SECRET>
// ─────────────────────────────────────────────────────────────────────────────
import webpush from 'web-push'
import { timingSafeEqual } from 'crypto'

const cleanEnv = s => (s || '').replace(/^﻿/, '').trim()
const toB64Url = s => cleanEnv(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const isValid  = s => /^[A-Za-z0-9\-_]{40,}$/.test(s)

// Fallar en inicio si faltan claves — evita errores crípticos en tiempo de ejecución
const VAPID_PUBLIC  = toB64Url(process.env.VAPID_PUBLIC)
const VAPID_PRIVATE = toB64Url(process.env.VAPID_PRIVATE)
if (!isValid(VAPID_PUBLIC) || !isValid(VAPID_PRIVATE)) {
  console.error('[send-push-all] VAPID keys missing or invalid — configure VAPID_PUBLIC and VAPID_PRIVATE in env')
}

const SB_URL  = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON = cleanEnv(process.env.VITE_SB_ANON)
if (!SB_URL || !SB_ANON) console.error('[send-push-all] VITE_SB_URL / VITE_SB_ANON not set')

// Usar solo CRON_SECRET (sin prefijo VITE_) para que no quede expuesto en el bundle del cliente
const CRON_SECRET = process.env.CRON_SECRET

const SB_H = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` }

try {
  webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)
} catch (e) {
  console.error('[send-push-all] setVapidDetails failed:', e.message)
}

async function getAppData() {
  const r = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data`, { headers: SB_H })
  if (!r.ok) return null
  const rows = await r.json()
  return rows?.[0]?.data || null
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const secret = (req.headers['x-admin-secret'] || req.headers['authorization'] || '').replace('Bearer ', '')
  const hasValidSecret = CRON_SECRET && secret && secret.length === CRON_SECRET.length && timingSafeEqual(Buffer.from(secret), Buffer.from(CRON_SECRET))
  const hasValidOrigin = (req.headers.origin || '').startsWith('https://') && req.headers.origin === (process.env.PUSH_ALLOWED_ORIGIN || '')
  // Server-to-server calls: require CRON_SECRET. Browser calls: require valid origin.
  if (!hasValidSecret && !hasValidOrigin) return res.status(401).json({ error: 'Unauthorized' })

  const { title, body, url = '/', target = 'all' } = req.body || {}
  if (!title || !body) return res.status(400).json({ error: 'title y body son requeridos' })
  if (title.length > 80)  return res.status(400).json({ error: 'title máx 80 caracteres' })
  if (body.length > 200)  return res.status(400).json({ error: 'body máx 200 caracteres' })

  try {
    // Fetch en paralelo — independientes entre sí
    const [db, subs] = await Promise.all([getAppData(), getPushSubs()])
    if (!db) return res.status(500).json({ error: 'no app_data' })

    const allEmps = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
    const subMap  = new Map(subs.map(s => [s.user_id, s]))

    let recipients = []
    if (target === 'all') {
      recipients = allEmps
    } else if (target === 'activos') {
      const todayStr = new Date().toISOString().slice(0, 10)
      const activeIds = new Set(
        (db.records || []).filter(r => !r.fin && r.inicio?.startsWith(todayStr)).map(r => r.empId)
      )
      recipients = allEmps.filter(e => activeIds.has(e.id))
    } else if (target?.role) {
      recipients = allEmps.filter(e => e.role === target.role)
    } else if (Array.isArray(target?.empIds)) {
      const ids = new Set(target.empIds)
      recipients = allEmps.filter(e => ids.has(e.id))
    } else {
      recipients = allEmps
    }

    const safeUrl = (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) ? url : '/'
    const payload = JSON.stringify({ title, body, tag: 'admin-broadcast', url: safeUrl })

    // Envío en paralelo con Promise.allSettled — evita timeout de Vercel por ejecución secuencial
    const toSend = recipients.filter(e => subMap.get(e.id)?.endpoint)
    const noSub  = recipients.length - toSend.length

    const results = await Promise.allSettled(
      toSend.map(async emp => {
        const sub = subMap.get(emp.id)
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        console.log(`[push-all] sent → ${emp.name}`)
      })
    )

    let sent = 0, failed = 0
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        sent++
      } else {
        const err = results[i].reason
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          deleteSub(toSend[i].id) // fire-and-forget, sub expirada
        }
        console.warn(`[push-all] failed → ${toSend[i].name}: ${err?.statusCode || err?.message}`)
        failed++
      }
    }

    const result = { ok: true, sent, failed, noSub, total: recipients.length }
    console.log('[send-push-all]', JSON.stringify(result))
    return res.status(200).json(result)

  } catch (e) {
    console.error('[send-push-all] fatal', e)
    return res.status(500).json({ error: e.message })
  }
}
