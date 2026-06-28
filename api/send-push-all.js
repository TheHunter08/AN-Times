// ── Push masivo desde admin ────────────────────────────────────────────────────
// POST /api/send-push-all
// Body: { title, body, url?, target }
//   target: 'all' | 'activos' | { role: 'jefe_obra'|'encargado'|'empleado' } | { empIds: [...] }
// Auth: header x-admin-secret: <CRON_SECRET>
// ─────────────────────────────────────────────────────────────────────────────
import webpush from 'web-push'

const cleanEnv  = s => (s || '').replace(/^﻿/, '').trim()
const toB64Url  = s => cleanEnv(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const isValid   = s => /^[A-Za-z0-9\-_]{40,}$/.test(s)

const VAPID_PUBLIC  = isValid(toB64Url(process.env.VAPID_PUBLIC))  ? toB64Url(process.env.VAPID_PUBLIC)  : 'BJLsu9gt57Oa3uflEpMVUfRXgawp49vhtgdMjU6nzb9zOjWgSxIxuuFQVe6z_uiNXNPUwbCPqUHUoZk_iVmjNfQ'
const VAPID_PRIVATE = isValid(toB64Url(process.env.VAPID_PRIVATE)) ? toB64Url(process.env.VAPID_PRIVATE) : 'fvQg0fFEkOoUGLdOfUkdZ4uI2k7vv6bmUPqbChZSOnE'
const SB_URL        = cleanEnv(process.env.VITE_SB_URL)  || 'https://eyyhlcvpyiorpdnvqsll.supabase.co'
const SB_ANON       = cleanEnv(process.env.VITE_SB_ANON) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I'
const CRON_SECRET   = process.env.CRON_SECRET || process.env.VITE_PUSH_SECRET

const SB_H = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` }

try {
  webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)
} catch {}

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

  // Auth: solo admin con CRON_SECRET puede llamar esto
  const secret = (req.headers['x-admin-secret'] || req.headers['authorization'] || '').replace('Bearer ', '')
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { title, body, url = '/', target = 'all' } = req.body || {}
  if (!title || !body) return res.status(400).json({ error: 'title y body son requeridos' })
  if (title.length > 80)  return res.status(400).json({ error: 'title máx 80 caracteres' })
  if (body.length > 200)  return res.status(400).json({ error: 'body máx 200 caracteres' })

  try {
    const db   = await getAppData()
    const subs = await getPushSubs()
    if (!db) return res.status(500).json({ error: 'no app_data' })

    const allEmps = (db.employees || []).filter(e => !e.baja)
    const subMap  = new Map(subs.map(s => [s.user_id, s]))

    // Seleccionar destinatarios según target
    let recipients = []
    if (target === 'all') {
      recipients = allEmps
    } else if (target === 'activos') {
      const today = new Date().toISOString().slice(0, 10)
      const activeIds = new Set(
        (db.records || []).filter(r => !r.fin && r.inicio?.startsWith(today)).map(r => r.empId)
      )
      recipients = allEmps.filter(e => activeIds.has(e.id))
    } else if (target?.role) {
      recipients = allEmps.filter(e => e.role === target.role || (target.role === 'admin' && e.isAdmin))
    } else if (Array.isArray(target?.empIds)) {
      const ids = new Set(target.empIds)
      recipients = allEmps.filter(e => ids.has(e.id))
    } else {
      recipients = allEmps
    }

    const payload = JSON.stringify({
      title,
      body,
      tag: 'admin-broadcast',
      url: (typeof url === 'string' && url.startsWith('/')) ? url : '/'
    })

    let sent = 0, failed = 0, noSub = 0
    for (const emp of recipients) {
      const sub = subMap.get(emp.id)
      if (!sub?.endpoint) { noSub++; continue }
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        sent++
        console.log(`[push-all] sent → ${emp.name}`)
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await deleteSub(emp.id)
        }
        console.warn(`[push-all] failed → ${emp.name}: ${err.statusCode || err.message}`)
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
