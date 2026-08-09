// Vercel Cron: backup diario de app_data a Supabase Storage.
// Corre todos los días a las 03:00 UTC (ver vercel.json: "0 3 * * *").
// El comentario decía "semanal / domingos" pero el cron real está configurado
// a diario — se corrige aquí la documentación para que coincida con lo que
// de verdad ejecuta Vercel (un backup diario da más puntos de recuperación
// y el coste de almacenamiento de estos JSON es marginal).
// Requiere:
//   1. Bucket privado "backups" en Supabase Storage (Dashboard > Storage > New bucket)
//   2. Opcional: SB_SERVICE_KEY para subir con service role y saltarse RLS en Storage.
//      Si no está configurada, se usa el anon key (el bucket debe permitirlo).
//
// Retención recomendada: 4 años (RDL 8/2019 obliga a conservar registros de jornada).
// Puedes configurar una política de expiración en el bucket para borrar backups > 4 años.
import { createHash, timingSafeEqual } from 'crypto'
import { createAutomationRun } from '../src/server/automationHealth.js'
import { buildRestorePlan, inspectBackupSnapshot } from '../src/server/backupIntegrity.js'
import { persistAutomationRun } from '../src/server/persistAutomationHealth.js'

const cleanEnv    = s => (s || '').replace(/^﻿/, '').trim()
const SB_URL      = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON     = cleanEnv(process.env.VITE_SB_ANON)
const SB_SERVICE  = cleanEnv(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
const CRON_SECRET = process.env.CRON_SECRET

const SB_H_ANON    = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` }
const SB_H_STORAGE = SB_SERVICE
  ? { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` }
  : SB_H_ANON

export default async function handler(req, res) {
  if (!CRON_SECRET) return res.status(500).json({ error: 'CRON_SECRET no configurado' })
  const token = (req.headers['authorization'] || '').replace('Bearer ', '')
  const valid = token.length === CRON_SECRET.length &&
    timingSafeEqual(Buffer.from(token), Buffer.from(CRON_SECRET))
  if (!valid) return res.status(401).json({ error: 'Unauthorized' })

  if (!SB_URL || !SB_ANON) return res.status(500).json({ error: 'Supabase config missing' })

  const startedAt = Date.now()
  const recordRun = async details => {
    try { await persistAutomationRun(createAutomationRun('backup', { startedAt, ...details })) }
    catch (error) { console.error('[backup] automation health:', error.message) }
  }

  try {
    const [hotRes, coldRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data,updated_at`, { headers: SB_H_ANON }),
      fetch(`${SB_URL}/rest/v1/app_data?id=eq.3&select=data,updated_at`, { headers: SB_H_ANON }),
    ])

    const hot  = hotRes.ok  ? (await hotRes.json())[0]  : null
    const cold = coldRes.ok ? (await coldRes.json())[0] : null
    if (!hot?.data || !Array.isArray(hot.data.records) || !Array.isArray(hot.data.employees)) {
      await recordRun({ status:'error', error:'Backup source invalid' })
      return res.status(500).json({ error: 'Backup source invalid', detail: 'app_data principal no contiene records/employees válidos' })
    }

    const timestamp = new Date().toISOString()
    const body = JSON.stringify({
      timestamp,
      hot:  hot?.data  ?? null,
      cold: cold?.data ?? null,
    })
    const bodyBytes = Buffer.from(body, 'utf8')

    // Cada ejecución crea un objeto inmutable. Sobrescribir un nombre diario y
    // descargarlo inmediatamente permitía que Storage/CDN devolviera la versión
    // anterior durante un reintento, produciendo un falso checksum mismatch.
    const snapshotId = timestamp.replace(/[:.]/g, '-')
    const filename = `backup-${snapshotId}.json`
    const checksum = createHash('sha256').update(bodyBytes).digest('hex')
    const uploadRes = await fetch(`${SB_URL}/storage/v1/object/backups/${filename}`, {
      method:  'POST',
      headers: {
        ...SB_H_STORAGE,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'x-upsert': 'false',
        'x-metadata': JSON.stringify({ checksum, records: hot.data.records.length, employees: hot.data.employees.length }),
      },
      body: bodyBytes,
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      console.error('[backup] storage upload failed:', uploadRes.status, errText)
      await recordRun({ status:'error', error:`Storage upload failed ${uploadRes.status}` })
      return res.status(500).json({
        error: 'Storage upload failed',
        hint:  'Crea el bucket "backups" (privado) en Supabase Dashboard → Storage → New bucket',
        detail: errText.slice(0, 300),
      })
    }

    // Verificación real: descargar el objeto recién escrito y comparar hash.
    const verifyRes = await fetch(`${SB_URL}/storage/v1/object/backups/${filename}`, {
      headers: { ...SB_H_STORAGE, 'Cache-Control': 'no-cache' },
    })
    if (!verifyRes.ok) {
      await recordRun({ status:'error', error:`Backup verification download failed ${verifyRes.status}` })
      return res.status(500).json({ error: 'Backup verification download failed', status: verifyRes.status })
    }
    const verifiedBytes = Buffer.from(await verifyRes.arrayBuffer())
    const inspection = inspectBackupSnapshot(verifiedBytes, { expectedChecksum:checksum })
    if (!inspection.valid) {
      await recordRun({ status:'error', error:'Backup verification failed' })
      return res.status(500).json({ error:'Backup verification failed', detail:inspection.errors.join('; ') })
    }
    // Materializa el plan de restauración en memoria. No escribe datos, pero
    // garantiza que el snapshot recién creado no solo coincide byte a byte:
    // también tiene la estructura mínima necesaria para recuperar hot/cold.
    const restorePlan = buildRestorePlan(inspection)

    const sizeKB = Math.round(bodyBytes.byteLength / 1024)
    console.log(`[backup] ${filename} subido — ${sizeKB} KB`)
    await recordRun({ checked:hot.data.records.length, processed:1, delivered:1 })
    return res.status(200).json({ ok:true, verified:true, restorable:true, restoreRows:restorePlan.targetRows.length, filename, sizeKB, checksum, records:hot.data.records.length, employees:hot.data.employees.length })
  } catch (e) {
    console.error('[backup] fatal:', e)
    await recordRun({ status:'error', error:e.message })
    return res.status(500).json({ error: e.message })
  }
}
