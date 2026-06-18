/**
 * TIMES INC – Archivado mensual de registros antiguos
 * Mueve registros con más de 3 meses de antigüedad a /an_times_data/recordsArchive.
 * Corre el 1º de cada mes vía GitHub Actions.
 * Mantiene la base de datos principal ligera.
 */

import https from 'https'

const FB_BASE    = 'https://times-inc-default-rtdb.europe-west1.firebasedatabase.app'
const FB_API_KEY = 'AIzaSyAYZdHMrGBnBb5O6p5oBIuikX1Qc9HgvjQ'

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
  if (!d?.idToken) throw new Error('Firebase auth failed')
  return d.idToken
}

function fbGet(path, token) {
  return new Promise((resolve, reject) => {
    https.get(`${FB_BASE}/${path}.json?auth=${token}`, res => {
      let buf = ''
      res.on('data', d => buf += d)
      res.on('end', () => { try { resolve(JSON.parse(buf)) } catch { resolve(null) } })
    }).on('error', reject)
  })
}

function fbPut(path, data, token) {
  return new Promise(resolve => {
    const body = JSON.stringify(data)
    const u    = new URL(`${FB_BASE}/${path}.json?auth=${token}`)
    const req  = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { res.resume(); res.on('end', resolve) })
    req.on('error', () => resolve())
    req.write(body); req.end()
  })
}

async function run() {
  const now    = new Date()
  // Fecha límite: hoy - 90 días
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 90)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  console.log(`Archivando registros anteriores a ${cutoffStr}...`)

  const token = await getToken()
  const db    = await fbGet('an_times_data', token)
  if (!db) { console.log('No se pudo leer Firebase.'); return }

  const records = db.records || []
  if (!records.length) { console.log('No hay registros.'); return }

  const toArchive = records.filter(r => r.inicio && r.inicio.slice(0, 10) < cutoffStr)
  const toKeep    = records.filter(r => !r.inicio || r.inicio.slice(0, 10) >= cutoffStr)

  if (!toArchive.length) {
    console.log('No hay registros para archivar.')
    return
  }

  // Combinar con el archivo existente
  const existing = db.recordsArchive || []
  const archive  = [...existing, ...toArchive]

  console.log(`Archivando ${toArchive.length} registros, manteniendo ${toKeep.length}...`)

  // Primero escribir el archivo (evitar pérdida de datos si falla)
  await fbPut('an_times_data/recordsArchive', archive, token)
  // Luego reducir los registros activos
  await fbPut('an_times_data/records', toKeep, token)

  console.log(`✓ Archivados ${toArchive.length} registros. Archivo total: ${archive.length}.`)
}

run().catch(e => { console.error('Error:', e.message); process.exit(1) })
