// Limpieza semanal de push_subs: filas huérfanas (el empleado ya no existe)
// y duplicadas (mismo endpoint en más de un usuario, resto de antes del
// índice único de notification-hardening.sql) — misma lógica que
// scripts/repair-push-subscriptions.mjs, pero automática.
import { timingSafeEqual } from 'crypto'
import { createAutomationRun } from '../src/server/automationHealth.js'
import { persistAutomationRun } from '../src/server/persistAutomationHealth.js'
import { findPushSubscriptionCleanup } from '../src/server/pushSubscriptionCleanup.js'
import { readAllRestRows } from '../scripts/read-all-rest-rows.mjs'

const clean = value => String(value || '').replace(/^﻿/, '').trim()
const SB_URL = clean(process.env.VITE_SB_URL)
const SB_ANON = clean(process.env.VITE_SB_ANON)
const SB_SERVICE = clean(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
const CRON_SECRET = process.env.CRON_SECRET
const headers = { apikey:SB_SERVICE || SB_ANON, Authorization:`Bearer ${SB_SERVICE || SB_ANON}`, 'Content-Type':'application/json' }

export default async function handler(req, res) {
  if (!CRON_SECRET) return res.status(500).json({ error:'CRON_SECRET no configurado' })
  const token = String(req.headers.authorization || '').replace('Bearer ', '')
  const valid = token.length === CRON_SECRET.length && timingSafeEqual(Buffer.from(token), Buffer.from(CRON_SECRET))
  if (!valid) return res.status(401).json({ error:'Unauthorized' })
  if (!SB_URL || !SB_ANON || !SB_SERVICE) return res.status(500).json({ error:'Supabase service config missing' })

  const startedAt = Date.now()
  try {
    const [employees, subscriptions] = await Promise.all([
      readAllRestRows({ baseUrl:SB_URL, path:'employees?select=id,baja', headers }),
      readAllRestRows({ baseUrl:SB_URL, path:'push_subs?select=user_id,endpoint,updated_at', headers }),
    ])
    const { orphaned, duplicated, removals } = findPushSubscriptionCleanup({ employees, subscriptions })

    const failures = []
    for (const item of removals) {
      const response = await fetch(`${SB_URL}/rest/v1/push_subs?user_id=eq.${encodeURIComponent(item.user_id)}&endpoint=eq.${encodeURIComponent(item.endpoint)}`, {
        method:'DELETE', headers:{ ...headers, Prefer:'return=minimal' },
      })
      if (!response.ok) failures.push(`${item.user_id}: ${response.status}`)
    }

    const run = createAutomationRun('pushCleanup', {
      startedAt, checked:subscriptions.length, processed:removals.length - failures.length,
      status:failures.length ? 'error' : 'ok',
      error:failures[0] || null,
    })
    await persistAutomationRun(run)
    return res.status(200).json({
      ok:true, subscriptions:subscriptions.length, orphaned:orphaned.length, duplicated:duplicated.length,
      removed:removals.length - failures.length, failures:failures.length,
    })
  } catch (error) {
    console.error('[cron-cleanup-push-subs]', error)
    try { await persistAutomationRun(createAutomationRun('pushCleanup', { status:'error', startedAt, error:error?.message || error })) } catch {}
    return res.status(500).json({ error:'Push subscription cleanup failed' })
  }
}
