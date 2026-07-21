// API endpoint: POST /api/sendpush — envía Web Push a un usuario via Supabase.
// Formato ESM porque package.json tiene "type": "module".
import webpush from 'web-push'
import { timingSafeEqual } from 'crypto'
import { CANONICAL_APP_ORIGIN, isTrustedAppOrigin } from './_origin.js'

// ── In-memory rate limiter (per IP): max 30 requests per minute ──────────────
const _rl = new Map()
function rateLimit(ip) {
  const now = Date.now()
  const window = 60_000
  const max = 30
  const entry = _rl.get(ip) || { count: 0, reset: now + window }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + window }
  entry.count++
  _rl.set(ip, entry)
  if (_rl.size > 2000) { for (const [k, v] of _rl) { if (now > v.reset) _rl.delete(k) } }
  return entry.count > max
}

// ── Rate limiter aparte, mucho más estricto, para el broadcast a '__all__' ──
// Este endpoint autentica peticiones de navegador solo por el header Origin,
// que cualquier cliente no-navegador puede falsificar (curl, etc.) — no es
// autenticación real de identidad/rol. Mientras no se sustituya por algo
// verificable en servidor, limitar agresivamente el broadcast (una acción de
// admin infrecuente en uso normal) reduce el daño de un abuso: como mucho
// unos pocos intentos de spam a toda la plantilla por IP y por hora, en vez
// de los 30/min que permite el límite general pensado para pushes individuales.
const _rlAll = new Map()
function rateLimitAll(ip) {
  const now = Date.now()
  const window = 60 * 60_000
  const max = 5
  const entry = _rlAll.get(ip) || { count: 0, reset: now + window }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + window }
  entry.count++
  _rlAll.set(ip, entry)
  if (_rlAll.size > 500) { for (const [k, v] of _rlAll) { if (now > v.reset) _rlAll.delete(k) } }
  return entry.count > max
}

// ── Dedupe: si el mismo userId+tag+title+body llega en <5min, se ignora ──────
const _dedupe = new Map()
const _DEDUPE_TTL = 5 * 60 * 1000
function isDuplicate(userId, tag, title, body) {
  const now = Date.now()
  const key = `${userId}|${tag}|${title}|${body}`
  const last = _dedupe.get(key) || 0
  if (now - last < _DEDUPE_TTL) return true
  _dedupe.set(key, now)
  if (_dedupe.size > 500) { for (const [k, t] of _dedupe) { if (now - t > _DEDUPE_TTL) _dedupe.delete(k) } }
  return false
}

const cleanEnv  = s => (s || '').replace(/^﻿/, '').trim()
const toB64Url  = s => cleanEnv(s).replace(/^["']|["']$/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const isValidVapidPub = s => /^[A-Za-z0-9\-_]{86,90}$/.test(s)
const isValidVapidPrv = s => /^[A-Za-z0-9\-_]{42,46}$/.test(s)
const _vpub = toB64Url(process.env.VAPID_PUBLIC)
const _vprv = toB64Url(process.env.VAPID_PRIVATE)
const VAPID_PUBLIC  = isValidVapidPub(_vpub) ? _vpub : null
const VAPID_PRIVATE = isValidVapidPrv(_vprv) ? _vprv : null
const SB_URL        = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON       = cleanEnv(process.env.VITE_SB_ANON)
if (!SB_URL || !SB_ANON) console.error('[sendpush] VITE_SB_URL / VITE_SB_ANON not set')
const PUSH_SECRET   = process.env.PUSH_SECRET

let _loadError = null
if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  _loadError = 'VAPID_PUBLIC/VAPID_PRIVATE env var no configurada o inválida'
  console.error('[sendpush] FATAL:', _loadError)
} else {
  try {
    webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)
  } catch (e) {
    _loadError = 'setVapidDetails failed: ' + e.message
    console.error('[sendpush] FATAL:', _loadError)
  }
}

async function sbGet(userId) {
  if (!SB_URL || !SB_ANON) return null
  const url = `${SB_URL}/rest/v1/push_subs?user_id=eq.${encodeURIComponent(userId)}&select=user_id,endpoint,p256dh,auth&order=updated_at.desc&limit=1`
  const r = await fetch(url, { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } })
  if (!r.ok) return null
  const rows = await r.json()
  return rows?.[0] || null
}

async function sbGetAll() {
  if (!SB_URL || !SB_ANON) return []
  const url = `${SB_URL}/rest/v1/push_subs?select=user_id,endpoint,p256dh,auth`
  const r = await fetch(url, { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } })
  if (!r.ok) return []
  return await r.json()
}

async function sbDelete(userId) {
  if (!SB_URL || !SB_ANON) return
  const url = `${SB_URL}/rest/v1/push_subs?user_id=eq.${encodeURIComponent(userId)}`
  await fetch(url, { method: 'DELETE', headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } }).catch(() => {})
}

async function sendOne(sub, payload) {
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    payload
  )
}

export default async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', CANONICAL_APP_ORIGIN)
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') return res.status(200).end()
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    if (_loadError) return res.status(500).json({ error: _loadError })

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
    if (rateLimit(ip)) return res.status(429).json({ error: 'Too many requests' })

    const authHeader = req.headers['authorization'] || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const hasValidToken = PUSH_SECRET && token && token.length === PUSH_SECRET.length && timingSafeEqual(Buffer.from(token), Buffer.from(PUSH_SECRET))
    const hasValidOrigin = isTrustedAppOrigin(req.headers.origin)
    // Server-to-server calls: require PUSH_SECRET. Browser calls: require valid origin.
    if (!hasValidToken && !hasValidOrigin) return res.status(401).json({ error: 'Unauthorized' })

    if (!SB_URL || !SB_ANON) return res.status(500).json({ error: 'Missing Supabase config' })

    const { userId, title, body, tag, url } = req.body || {}
    if (!userId || !title) return res.status(400).json({ error: 'Missing userId or title' })
    if (userId === '__all__' && !hasValidToken) return res.status(403).json({ error: 'Broadcast requires server authorization' })

    const safeUrl = typeof url === 'string' && url.startsWith('/') ? url : '/'
    const _tag = tag || 'times'
    const _body = body || ''

    if (isDuplicate(userId, _tag, title, _body)) {
      return res.status(200).json({ ok: true, deduped: true })
    }

    const payload = JSON.stringify({ title, body: _body, tag: _tag, url: safeUrl })

    if (userId === '__all__') {
      if (rateLimitAll(ip)) return res.status(429).json({ error: 'Too many broadcast requests' })
      const subs = await sbGetAll()
      await Promise.allSettled(subs.map(async sub => {
        try { await sendOne(sub, payload) }
        catch (err) { if (err.statusCode === 410) await sbDelete(sub.user_id) }
      }))
      return res.status(200).json({ ok: true, sent: subs.length })
    }

    try {
      const sub = await sbGet(userId)
      if (!sub || !sub.endpoint) return res.status(200).json({ skipped: true, reason: 'no subscription' })
      await sendOne(sub, payload)
      return res.status(200).json({ ok: true })
    } catch (err) {
      if (err.statusCode === 410) {
        await sbDelete(userId)
        return res.status(200).json({ ok: false, reason: 'expired' })
      }
      console.error('[sendpush]', err.statusCode, err.body || err.message)
      return res.status(500).json({ error: err.message, statusCode: err.statusCode })
    }
  } catch (fatal) {
    console.error('[sendpush] uncaught:', fatal)
    try { return res.status(500).json({ error: 'uncaught: ' + (fatal?.message || String(fatal)) }) } catch { return }
  }
}
