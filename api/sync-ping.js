// GitHub Actions: cada 5 minutos (Vercel Hobby solo admite cron diario).
// Detecta dispositivos con datos offline pendientes (basándose en heartbeats)
// y les envía un push SYNC_PING para despertar el Service Worker en iOS/Android.
//
// Comprueba periódicamente los dispositivos usados en los últimos siete días.
// Es intencionado: un fichaje creado totalmente offline no puede actualizar
// last_online y el servidor no tendría otra forma de saber que existe.
//
// El SW maneja SYNC_PING en el push handler (sw.js), ejecuta _bgSync() y
// muestra una notificación mínima que se cierra sola si no había nada que subir.
import webpush from 'web-push'
import { timingSafeEqual } from 'crypto'
import { getDeviceCoverage, isSyncCandidate } from '../src/server/syncPingPolicy.js'

const cleanEnv = s => (s || '').replace(/^﻿/, '').trim()
const toB64Url = s => cleanEnv(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const isValid  = s => /^[A-Za-z0-9\-_]{40,}$/.test(s)

const VAPID_PUBLIC  = isValid(toB64Url(process.env.VAPID_PUBLIC))  ? toB64Url(process.env.VAPID_PUBLIC)  : null
const VAPID_PRIVATE = isValid(toB64Url(process.env.VAPID_PRIVATE)) ? toB64Url(process.env.VAPID_PRIVATE) : null
const SB_URL        = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON       = cleanEnv(process.env.VITE_SB_ANON)
const CRON_SECRET   = process.env.CRON_SECRET
const COMPANY_ID    = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

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
async function getSyncState() {
  if (!SB_URL || !SB_ANON) return { candidates: [], coverage: getDeviceCoverage() }
  const employeesUrl = `${SB_URL}/rest/v1/employees?select=id,role,baja&company_id=eq.${COMPANY_ID}`
  const subscriptionsUrl = `${SB_URL}/rest/v1/push_subs?select=user_id,endpoint,p256dh,auth,last_online,last_sync,updated_at`
  try {
    const [employeesResponse, subscriptionsResponse] = await Promise.all([
      fetch(employeesUrl, { headers: SB_H }),
      fetch(subscriptionsUrl, { headers: SB_H }),
    ])
    if (!employeesResponse.ok || !subscriptionsResponse.ok) {
      throw new Error(`coverage fetch failed: ${employeesResponse.status}/${subscriptionsResponse.status}`)
    }
    const coverage = getDeviceCoverage(
      await employeesResponse.json(),
      await subscriptionsResponse.json()
    )
    return {
      coverage,
      // El total registrado y los móviles que necesitan un ping son métricas distintas.
      candidates: coverage.activeSubscriptions.filter(subscription => isSyncCandidate(subscription)),
    }
  } catch (e) {
    console.error('[sync-ping] fetch coverage error:', e.message)
    throw e
  }
}

async function deleteSub(userId) {
  if (!SB_URL || !SB_ANON) return
  fetch(`${SB_URL}/rest/v1/push_subs?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE', headers: SB_H
  }).catch(() => {})
}

export default async function handler(req, res) {
  // Vercel Cron y GitHub Actions comparten el CRON_SECRET ya configurado en
  // ambos servicios. Comparación constante para no filtrar información.
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '')
  const authorized = !!CRON_SECRET && token.length === CRON_SECRET.length &&
    timingSafeEqual(Buffer.from(token), Buffer.from(CRON_SECRET))
  if (!authorized) return res.status(401).json({ error: 'Unauthorized' })

  if (_vapidError) return res.status(500).json({ error: _vapidError })
  if (!SB_URL || !SB_ANON) return res.status(500).json({ error: 'Supabase config missing' })

  try {
    const { candidates, coverage } = await getSyncState()
    const coverageResult = {
      expectedDevices: coverage.expectedWorkers,
      registeredDevices: coverage.registeredWorkers,
      missingDevices: coverage.missingWorkerIds.length,
      orphanSubscriptions: coverage.orphanSubscriptions.length,
    }
    if (!candidates.length) {
      console.log(`[sync-ping] expected=${coverageResult.expectedDevices} registered=${coverageResult.registeredDevices} missing=${coverageResult.missingDevices} candidates=0 sent=0`)
      return res.status(200).json({ ok: true, ...coverageResult, candidates: 0, sent: 0, reason: 'no candidates' })
    }

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

    console.log(`[sync-ping] expected=${coverageResult.expectedDevices} registered=${coverageResult.registeredDevices} missing=${coverageResult.missingDevices} candidates=${candidates.length} sent=${sent} expired=${expired} errors=${errors}`)
    return res.status(200).json({ ok: true, ...coverageResult, candidates: candidates.length, sent, expired, errors })
  } catch (e) {
    console.error('[sync-ping] fatal:', e)
    return res.status(500).json({ error: e.message })
  }
}
