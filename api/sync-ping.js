// GitHub Actions: cada 5 minutos (Vercel Hobby solo admite cron diario).
// Detecta dispositivos con datos offline pendientes (basándose en heartbeats)
// y les envía un push SYNC_PING para despertar el Service Worker en iOS/Android.
//
// Un dispositivo "podría tener datos pendientes" si estuvo activo durante las
// últimas 24h y last_online es posterior a last_sync.
//
// El SW maneja SYNC_PING en el push handler (sw.js), ejecuta _bgSync() y
// muestra una notificación mínima que se cierra sola si no había nada que subir.
import webpush from 'web-push'
import { authorizeSyncRequest } from '../src/server/syncAuth.js'
import { isSyncCandidate, PUSH_ACTIVE_WINDOW_MS } from '../src/server/syncPingPolicy.js'

const cleanEnv = s => (s || '').replace(/^﻿/, '').trim()
const toB64Url = s => cleanEnv(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const isValid  = s => /^[A-Za-z0-9\-_]{40,}$/.test(s)

const VAPID_PUBLIC  = isValid(toB64Url(process.env.VAPID_PUBLIC))  ? toB64Url(process.env.VAPID_PUBLIC)  : null
const VAPID_PRIVATE = isValid(toB64Url(process.env.VAPID_PRIVATE)) ? toB64Url(process.env.VAPID_PRIVATE) : null
const SB_URL        = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON       = cleanEnv(process.env.VITE_SB_ANON)

let _vapidError = null
if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  _vapidError = 'VAPID keys not configured'
  console.error('[sync-ping] FATAL:', _vapidError)
} else {
  try {
    webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)
  } catch (e) {
    _vapidError = 'setVapidDetails failed: ' + e.message
    console.error('[sync-ping] FATAL:', _vapidError)
  }
}

const SB_H = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` }
async function getCandidateSubs() {
  if (!SB_URL || !SB_ANON) return []
  // Una sola señal se conserva en APNs/FCM hasta siete días. La ventana de 24h
  // limita suscripciones abandonadas, pero cubre turnos completos sin abrir la app.
  const activeSince = new Date(Date.now() - PUSH_ACTIVE_WINDOW_MS).toISOString()
  const url = `${SB_URL}/rest/v1/push_subs?select=user_id,endpoint,p256dh,auth,last_online,last_sync&last_online=gt.${activeSince}`
  try {
    const r = await fetch(url, { headers: SB_H })
    if (!r.ok) { console.warn('[sync-ping] getPushSubs error', r.status); return [] }
    const subs = await r.json()
    return subs.filter(s => isSyncCandidate(s))
  } catch (e) { console.error('[sync-ping] fetch subs error:', e.message); return [] }
}

async function deleteSub(userId) {
  if (!SB_URL || !SB_ANON) return
  fetch(`${SB_URL}/rest/v1/push_subs?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE', headers: SB_H
  }).catch(() => {})
}

export default async function handler(req, res) {
  // Vercel Cron usa CRON_SECRET; GitHub Actions usa un JWT OIDC efímero y
  // verificable, sin guardar otra contraseña de larga duración.
  if (!await authorizeSyncRequest(req)) return res.status(401).json({ error: 'Unauthorized' })

  if (_vapidError) return res.status(500).json({ error: _vapidError })
  if (!SB_URL || !SB_ANON) return res.status(500).json({ error: 'Supabase config missing' })

  try {
    const candidates = await getCandidateSubs()
    if (!candidates.length) return res.status(200).json({ ok: true, sent: 0, reason: 'no candidates' })

    const payload = JSON.stringify({
      type: 'SYNC_PING',
      title: 'Times INC',
      body: '',
      tag: 'sync-ping',
    })

    let sent = 0, expired = 0, errors = 0
    await Promise.allSettled(candidates.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          {
            TTL: 7 * 24 * 60 * 60,
            urgency: 'high',
            topic: 'times-sync',
          }
        )
        sent++
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          expired++; await deleteSub(sub.user_id)
        } else {
          errors++
          console.warn('[sync-ping] push error:', sub.user_id, err.statusCode, err.body || err.message)
        }
      }
    }))

    console.log(`[sync-ping] candidates=${candidates.length} sent=${sent} expired=${expired} errors=${errors}`)
    return res.status(200).json({ ok: true, sent, expired, errors })
  } catch (e) {
    console.error('[sync-ping] fatal:', e)
    return res.status(500).json({ error: e.message })
  }
}
