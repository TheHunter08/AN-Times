/**
 * TIMES INC – Push Notification Server
 * Gestionado por PM2 (arranca con Windows automáticamente)
 */

import https   from 'https'
import webpush from 'web-push'

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
      res.on('end', () => { try { resolve(JSON.parse(body)) } catch { resolve(null) } })
    }).on('error', reject)
  })
}

function patchFB(path, data) {
  return new Promise((resolve) => {
    const body = JSON.stringify(data)
    const u    = new URL(`${FB_BASE}/${path}.json`)
    const req  = https.request({
      hostname: u.hostname, path: u.pathname, method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { res.resume(); res.on('end', resolve) })
    req.on('error', () => resolve())
    req.write(body); req.end()
  })
}

async function poll() {
  try {
    const queue = await get(`${FB_BASE}/pushQueue.json`)
    if (!queue || typeof queue !== 'object') return

    for (const [id, entry] of Object.entries(queue)) {
      if (!entry || entry.processed) continue

      let subs = []
      if (entry.to === '__all__') {
        const all = await get(`${FB_BASE}/pushSubs.json`)
        if (all && typeof all === 'object') subs = Object.values(all)
      } else {
        const sub = await get(`${FB_BASE}/pushSubs/${encodeURIComponent(entry.to)}.json`)
        if (sub?.endpoint) subs = [sub]
      }

      const payload = JSON.stringify({
        title: entry.title || 'TIMES INC',
        body:  entry.body  || '',
        tag:   entry.tag   || 'times',
        url:   entry.url   || '/'
      })

      let sent = 0
      await Promise.allSettled(
        subs.map(sub =>
          webpush.sendNotification(sub, payload)
            .then(() => sent++)
            .catch(() => {})
        )
      )

      await patchFB(`pushQueue/${id}`, { processed: true })
      const dest = entry.to === '__all__' ? 'todos' : entry.to
      console.log(`[${new Date().toLocaleTimeString('es-ES')}] ✓ "${entry.title}" → ${dest} (${sent}/${subs.length})`)
    }
  } catch (e) {
    console.warn(`[${new Date().toLocaleTimeString('es-ES')}] ⚠`, e.message)
  }
}

setInterval(poll, POLL_MS)
poll()
console.log(`🔔 TIMES INC Push Server – comprobando cada ${POLL_MS / 1000}s`)
