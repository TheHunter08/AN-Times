/**
 * TIMES INC – Push Notification Server
 * ─────────────────────────────────────
 * Watches Firebase /pushQueue for new entries and delivers Web Push
 * to employees' browsers even when the phone is locked.
 *
 * Setup:
 *   npm install web-push
 *   node push-server.js
 *
 * Para producción, despliega este archivo en Railway, Render, Fly.io, etc.
 * Todos tienen tier gratuito. Sube el repo y fija NODE_ENV=production.
 */

import webpush from 'web-push'
import https from 'https'

const VAPID_PUBLIC  = 'BI4uEES76cujGjvpJ68hIKD4jeZfBUAHTmV9DTTbpnd91jAzld1iv_aeN9PkgKJ46J9m_r7GkvoiCeyOcsmm8q4'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || '0P7eNL8RBQfc5fy41k63OQuiT73_IKPgbM35I76rSvU'
const FB_BASE       = 'https://times-inc-default-rtdb.europe-west1.firebasedatabase.app'
const POLL_MS       = 5000

webpush.setVapidDetails('mailto:admin@times.inc', VAPID_PUBLIC, VAPID_PRIVATE)

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch { resolve(null) }
      })
    }).on('error', reject)
  })
}

function patch(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data)
    const u    = new URL(url)
    const req  = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      res.resume(); res.on('end', resolve)
    })
    req.on('error', reject)
    req.write(body); req.end()
  })
}

async function poll() {
  try {
    const queue = await get(`${FB_BASE}/pushQueue.json`)
    if (!queue) return

    for (const [id, entry] of Object.entries(queue)) {
      if (entry.processed) continue

      let subs = []
      if (entry.to === '__all__') {
        const all = await get(`${FB_BASE}/pushSubs.json`)
        if (all) subs = Object.values(all)
      } else {
        const sub = await get(`${FB_BASE}/pushSubs/${encodeURIComponent(entry.to)}.json`)
        if (sub?.endpoint) subs = [sub]
      }

      const payload = JSON.stringify({ title: entry.title, body: entry.body, tag: entry.tag || 'times', url: entry.url || '/' })

      await Promise.allSettled(subs.map(sub => webpush.sendNotification(sub, payload).catch(() => {})))
      await patch(`${FB_BASE}/pushQueue/${id}.json`, { processed: true })
      console.log(`[push] ✓ "${entry.title}" → ${entry.to === '__all__' ? 'todos' : entry.to} (${subs.length} subs)`)
    }
  } catch (e) {
    console.warn('[push] poll error:', e.message)
  }
}

setInterval(poll, POLL_MS)
poll()
console.log(`🔔 TIMES INC Push Server – polling cada ${POLL_MS / 1000}s`)
