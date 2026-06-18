/**
 * TIMES INC – Push one-shot (GitHub Actions)
 * Procesa todos los mensajes pendientes en /pushQueue y termina.
 * Usa auth anónima de Firebase igual que la app cliente.
 */

import https   from 'https'
import webpush from 'web-push'

const VAPID_PUBLIC  = 'BI4uEES76cujGjvpJ68hIKD4jeZfBUAHTmV9DTTbpnd91jAzld1iv_aeN9PkgKJ46J9m_r7GkvoiCeyOcsmm8q4'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || '0P7eNL8RBQfc5fy41k63OQuiT73_IKPgbM35I76rSvU'
const FB_BASE       = 'https://times-inc-default-rtdb.europe-west1.firebasedatabase.app'
const FB_API_KEY    = 'AIzaSyAYZdHMrGBnBb5O6p5oBIuikX1Qc9HgvjQ'

webpush.setVapidDetails('mailto:admin@times.inc', VAPID_PUBLIC, VAPID_PRIVATE)

// ─── Firebase anonymous auth (igual que en dataService.js) ─────────────────
function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const u    = new URL(url)
    const req  = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let buf = ''
      res.on('data', d => buf += d)
      res.on('end', () => { try { resolve(JSON.parse(buf)) } catch { resolve(null) } })
    })
    req.on('error', reject)
    req.write(data); req.end()
  })
}

async function getToken() {
  const d = await post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FB_API_KEY}`,
    { returnSecureToken: true }
  )
  if (!d?.idToken) throw new Error('No se pudo autenticar con Firebase')
  return d.idToken
}

function fbGet(path, token) {
  return new Promise((resolve, reject) => {
    const url = `${FB_BASE}/${path}.json?auth=${token}`
    https.get(url, res => {
      let buf = ''
      res.on('data', d => buf += d)
      res.on('end', () => { try { resolve(JSON.parse(buf)) } catch { resolve(null) } })
    }).on('error', reject)
  })
}

function fbPatch(path, data, token) {
  return new Promise(resolve => {
    const body = JSON.stringify(data)
    const u    = new URL(`${FB_BASE}/${path}.json?auth=${token}`)
    const req  = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { res.resume(); res.on('end', resolve) })
    req.on('error', () => resolve())
    req.write(body); req.end()
  })
}

function fbDelete(path, token) {
  return new Promise(resolve => {
    const u   = new URL(`${FB_BASE}/${path}.json?auth=${token}`)
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'DELETE' },
      res => { res.resume(); res.on('end', resolve) })
    req.on('error', () => resolve())
    req.end()
  })
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function run() {
  console.log('🔔 TIMES INC Push — autenticando…')
  const token = await getToken()
  console.log('✓ Auth OK')

  const queue = await fbGet('pushQueue', token)
  if (!queue || typeof queue !== 'object') { console.log('Cola vacía.'); return }

  const pending = Object.entries(queue).filter(([, e]) => e && !e.processed)
  if (!pending.length) { console.log('Sin notificaciones pendientes.'); return }

  console.log(`Procesando ${pending.length} notificación(es)…`)

  for (const [id, entry] of pending) {
    let subsWithKeys = []
    if (entry.to === '__all__') {
      const all = await fbGet('pushSubs', token)
      if (all && typeof all === 'object') {
        subsWithKeys = Object.entries(all).map(([uid, sub]) => ({ uid, sub }))
      }
    } else {
      const sub = await fbGet(`pushSubs/${encodeURIComponent(entry.to)}`, token)
      if (sub?.endpoint) subsWithKeys = [{ uid: entry.to, sub }]
    }

    const payload = JSON.stringify({
      title: entry.title || 'TIMES INC',
      body:  entry.body  || '',
      tag:   entry.tag   || 'times',
      url:   entry.url   || '/'
    })

    let sent = 0, expired = 0
    await Promise.allSettled(
      subsWithKeys.map(async ({ uid, sub }) => {
        try {
          await webpush.sendNotification(sub, payload)
          sent++
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await fbDelete(`pushSubs/${encodeURIComponent(uid)}`, token)
            expired++
          }
        }
      })
    )

    await fbPatch(`pushQueue/${id}`, { processed: true, processedAt: Date.now() }, token)
    const dest = entry.to === '__all__' ? 'todos' : entry.to
    console.log(`✓ "${entry.title}" → ${dest} (${sent}/${subsWithKeys.length} entregadas${expired ? `, ${expired} subs expiradas borradas` : ''})`)
  }

  // Limpiar entradas procesadas con más de 24h de antigüedad
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const toClean = Object.entries(queue).filter(([, e]) => e?.processed && e?.processedAt && e.processedAt < cutoff)
  if (toClean.length) {
    await Promise.all(toClean.map(([id]) => fbDelete(`pushQueue/${id}`, token)))
    console.log(`Limpiados ${toClean.length} mensajes procesados`)
  }
}

run().catch(e => { console.error('Error:', e.message); process.exit(1) })
