// ── Push masivo desde admin ────────────────────────────────────────────────────
// POST /api/send-push-all
// Body: { title, body, url?, target }
//   target: 'all' | 'activos' | { role: 'jefe_obra'|'encargado'|'empleado' } | { empIds: [...] }
// Auth: Authorization: Bearer <CRON_SECRET>  o  x-admin-secret: <CRON_SECRET>
// ─────────────────────────────────────────────────────────────────────────────
import webpush from 'web-push'
import { timingSafeEqual } from 'crypto'
import { isAuthRlsServerMode } from '../securityMode.js'
import { readAllRestRows } from '../../../scripts/read-all-rest-rows.mjs'

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
const SB_SERVICE = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SB_SERVICE_KEY)
const SB_KEY = SB_SERVICE || SB_ANON
const AUTH_RLS_MODE = isAuthRlsServerMode()
if (!SB_URL || !SB_KEY) console.error('[send-push-all] Supabase config not set')

// Usar solo CRON_SECRET (sin prefijo VITE_) para que no quede expuesto en el bundle del cliente
const CRON_SECRET = process.env.CRON_SECRET

const SB_H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }

// Este endpoint (broadcast a toda/parte de la plantilla) no tenía ningún
// rate-limit — dado que la vía "browser" solo autentica por Origin (falsificable
// por un cliente no-navegador, ver comprobación de auth más abajo), limitar
// agresivamente por IP reduce el daño de un abuso mientras no se sustituya
// por autenticación real verificable en servidor.
const _rl = new Map()
function rateLimit(ip) {
  const now = Date.now()
  const window = 60 * 60_000
  const max = 5
  const entry = _rl.get(ip) || { count: 0, reset: now + window }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + window }
  entry.count++
  _rl.set(ip, entry)
  if (_rl.size > 500) { for (const [k, v] of _rl) { if (now > v.reset) _rl.delete(k) } }
  return entry.count > max
}

try {
  webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)
} catch (e) {
  console.error('[send-push-all] setVapidDetails failed:', e.message)
}

async function getAppData() {
  if (AUTH_RLS_MODE) {
    const [employeesResponse, recordsResponse] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/employees?select=id,name,role,baja&company_id=eq.ffffffff-ffff-ffff-ffff-ffffffffffff`, { headers:SB_H }),
      fetch(`${SB_URL}/rest/v1/records?select=emp_id,inicio,fin&company_id=eq.ffffffff-ffff-ffff-ffff-ffffffffffff&fin=is.null&deleted=eq.false`, { headers:SB_H }),
    ])
    if (!employeesResponse.ok || !recordsResponse.ok) return null
    return {
      employees:(await employeesResponse.json()).map(row => ({ id:row.id, name:row.name, role:row.role, baja:!!row.baja, isAdmin:row.role === 'admin' })),
      records:(await recordsResponse.json()).map(row => ({ empId:row.emp_id, inicio:row.inicio, fin:row.fin })),
    }
  }
  const r = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data`, { headers: SB_H })
  if (!r.ok) return null
  const rows = await r.json()
  return rows?.[0]?.data || null
}

// readAllRestRows pagina con Range — sin esto, un broadcast a toda la
// plantilla podía omitir en silencio los dispositivos que caían pasado el
// límite por página de PostgREST (1000 filas) según creciera el número de
// suscripciones (varios dispositivos por empleado).
async function getPushSubs() {
  try {
    return await readAllRestRows({ baseUrl: SB_URL, path: 'push_subs?select=user_id,endpoint,p256dh,auth', headers: SB_H })
  } catch {
    return []
  }
}

async function deleteSub(userId) {
  await fetch(`${SB_URL}/rest/v1/push_subs?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE', headers: SB_H
  }).catch(() => {})
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  if (!SB_URL || !SB_KEY || (AUTH_RLS_MODE && !SB_SERVICE)) {
    return res.status(500).json({ error:AUTH_RLS_MODE ? 'Supabase service role missing' : 'Supabase config missing' })
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
  if (rateLimit(ip)) return res.status(429).json({ error: 'Too many requests' })

  const secret = (req.headers['x-admin-secret'] || req.headers['authorization'] || '').replace('Bearer ', '')
  const hasValidSecret = CRON_SECRET && secret && secret.length === CRON_SECRET.length && timingSafeEqual(Buffer.from(secret), Buffer.from(CRON_SECRET))
  // Un broadcast nunca se autoriza solo por Origin: ese encabezado se puede
  // falsificar fuera del navegador. Solo procesos internos con CRON_SECRET.
  if (!hasValidSecret) return res.status(401).json({ error: 'Unauthorized' })

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
      // "Activos" = tiene la jornada abierta ahora mismo (!r.fin) — no importa
      // qué día empezó. El filtro anterior exigía además que `inicio`
      // empezara por la fecha de HOY en Madrid, comparando un string de fecha
      // en Madrid contra `inicio` tal cual (guardado en UTC): a quien fichaba
      // justo después de medianoche en Madrid (mientras el UTC seguía en el
      // día anterior) o a quien llevaba un turno abierto desde el día
      // anterior (nocturno, o pendiente de autocierre) se le dejaba fuera del
      // broadcast pese a estar fichado en ese momento.
      const activeIds = new Set((db.records || []).filter(r => !r.fin).map(r => r.empId))
      recipients = allEmps.filter(e => activeIds.has(e.id))
    } else if (target?.role) {
      recipients = allEmps.filter(e => e.role === target.role)
    } else if (Array.isArray(target?.empIds)) {
      const ids = new Set(target.empIds)
      recipients = allEmps.filter(e => ids.has(e.id))
    } else {
      // Un target no reconocido (typo, objeto malformado) antes caía aquí y
      // terminaba enviando a TODA la plantilla en vez de fallar explícitamente
      // — con la autenticación débil de este endpoint (ver más abajo), eso
      // amplificaba el impacto de cualquier petición mal formada.
      return res.status(400).json({ error: `target no reconocido: ${JSON.stringify(target)}` })
    }

    const safeUrl = (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) ? url : '/'

    // Envío en paralelo con Promise.allSettled — evita timeout de Vercel por ejecución secuencial
    const toSend = recipients.filter(e => subMap.get(e.id)?.endpoint)
    const noSub  = recipients.length - toSend.length

    const results = await Promise.allSettled(
      toSend.map(async emp => {
        const sub = subMap.get(emp.id)
        const payload = JSON.stringify({ title, body, tag: 'admin-broadcast', url: safeUrl, userId: emp.id })
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
