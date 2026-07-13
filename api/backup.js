// Vercel Cron: backup semanal de app_data a Supabase Storage.
// Corre los domingos a las 03:00 UTC (ver vercel.json).
// Requiere:
//   1. Bucket privado "backups" en Supabase Storage (Dashboard > Storage > New bucket)
//   2. Opcional: SB_SERVICE_KEY para subir con service role y saltarse RLS en Storage.
//      Si no está configurada, se usa el anon key (el bucket debe permitirlo).
//
// Retención recomendada: 4 años (RDL 8/2019 obliga a conservar registros de jornada).
// Puedes configurar una política de expiración en el bucket para borrar backups > 4 años.
import { createHash, timingSafeEqual } from 'crypto'

const cleanEnv    = s => (s || '').replace(/^﻿/, '').trim()
const SB_URL      = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON     = cleanEnv(process.env.VITE_SB_ANON)
const SB_SERVICE  = cleanEnv(process.env.SB_SERVICE_KEY)
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

  try {
    const [hotRes, coldRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data,updated_at`, { headers: SB_H_ANON }),
      fetch(`${SB_URL}/rest/v1/app_data?id=eq.3&select=data,updated_at`, { headers: SB_H_ANON }),
    ])

    const hot  = hotRes.ok  ? (await hotRes.json())[0]  : null
    const cold = coldRes.ok ? (await coldRes.json())[0] : null
    if (!hot?.data || !Array.isArray(hot.data.records) || !Array.isArray(hot.data.employees)) {
      return res.status(500).json({ error: 'Backup source invalid', detail: 'app_data principal no contiene records/employees válidos' })
    }

    const date = new Date().toISOString().slice(0, 10)
    const body = JSON.stringify({
      timestamp: new Date().toISOString(),
      hot:  hot?.data  ?? null,
      cold: cold?.data ?? null,
    })

    const filename  = `backup-${date}.json`
    const checksum = createHash('sha256').update(body).digest('hex')
    const uploadRes = await fetch(`${SB_URL}/storage/v1/object/backups/${filename}`, {
      method:  'POST',
      headers: { ...SB_H_STORAGE, 'Content-Type': 'application/json', 'x-upsert': 'true', 'x-metadata': JSON.stringify({ checksum, records: hot.data.records.length, employees: hot.data.employees.length }) },
      body,
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      console.error('[backup] storage upload failed:', uploadRes.status, errText)
      return res.status(500).json({
        error: 'Storage upload failed',
        hint:  'Crea el bucket "backups" (privado) en Supabase Dashboard → Storage → New bucket',
        detail: errText.slice(0, 300),
      })
    }

    // Verificación real: descargar el objeto recién escrito y comparar hash.
    const verifyRes = await fetch(`${SB_URL}/storage/v1/object/backups/${filename}`, { headers: SB_H_STORAGE })
    if (!verifyRes.ok) return res.status(500).json({ error: 'Backup verification download failed', status: verifyRes.status })
    const verifiedBody = await verifyRes.text()
    const verifiedChecksum = createHash('sha256').update(verifiedBody).digest('hex')
    if (verifiedChecksum !== checksum) return res.status(500).json({ error: 'Backup checksum mismatch' })

    const sizeKB = Math.round(body.length / 1024)
    console.log(`[backup] ${filename} subido — ${sizeKB} KB`)
    return res.status(200).json({ ok: true, verified: true, filename, sizeKB, checksum, records: hot.data.records.length, employees: hot.data.employees.length })
  } catch (e) {
    console.error('[backup] fatal:', e)
    return res.status(500).json({ error: e.message })
  }
}
