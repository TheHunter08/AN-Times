// ── Parche puntual: sincroniza pin_hash + pin_len desde blob → tabla employees ──
// POST /api/patch-pins  (requiere Authorization: Bearer <CRON_SECRET>)
//
// Usar esto en lugar de re-ejecutar /api/migrate-to-tables si solo quieres
// reparar los PINs sin tocar registros de fichaje, vacaciones, etc.
//
// Prerequisito en Supabase SQL Editor:
//   ALTER TABLE employees ADD COLUMN IF NOT EXISTS pin_len int;
import { timingSafeEqual } from 'crypto'

const cleanEnv   = s => (s || '').replace(/^﻿/, '').trim()
const SB_URL     = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON    = cleanEnv(process.env.VITE_SB_ANON)
const SB_SERVICE = cleanEnv(process.env.SB_SERVICE_KEY)
const CRON_SECRET = process.env.CRON_SECRET

const KEY  = SB_SERVICE || SB_ANON
const SB_H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  if (!CRON_SECRET) return res.status(500).json({ error: 'CRON_SECRET no configurado' })
  const token = (req.headers['authorization'] || '').replace('Bearer ', '')
  if (token.length !== CRON_SECRET.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(CRON_SECRET))) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!SB_URL || !SB_ANON) return res.status(500).json({ error: 'Supabase config missing' })

  try {
    // 1. Leer blob
    const blobRes = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data`, {
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` }
    })
    const blobRows = await blobRes.json()
    const db = blobRows?.[0]?.data || {}
    const emps = (db.employees || []).filter(e => e.id && (e.pin || e.pinHash))

    if (!emps.length) {
      return res.status(400).json({ error: 'El blob no tiene empleados con PIN' })
    }

    // 2. Leer employees actuales de Supabase para saber cuáles existen
    const sbEmpsRes = await fetch(
      `${SB_URL}/rest/v1/employees?select=id,pin_hash,pin_len`,
      { headers: SB_H }
    )
    const sbEmps = await sbEmpsRes.json()
    const sbEmpSet = new Set((sbEmps || []).map(e => e.id))

    // 3. Actualizar pin_hash y pin_len uno a uno (PATCH por id)
    const results = []
    for (const e of emps) {
      if (!sbEmpSet.has(e.id)) { results.push({ id: e.id, skip: 'no existe en tabla' }); continue }
      const pinHash = e.pin || e.pinHash || null
      const pinLen  = e.pinLen || null
      const r = await fetch(
        `${SB_URL}/rest/v1/employees?id=eq.${encodeURIComponent(e.id)}`,
        {
          method: 'PATCH',
          headers: { ...SB_H, Prefer: 'return=minimal' },
          body: JSON.stringify({ pin_hash: pinHash, pin_len: pinLen, updated_at: new Date().toISOString() })
        }
      )
      results.push({ id: e.id, name: e.name, status: r.status, pin: pinHash ? '✓' : '✗' })
    }

    const ok  = results.filter(r => r.status === 204 || r.status === 200).length
    const err = results.filter(r => r.status && r.status !== 204 && r.status !== 200).length
    console.log(`[patch-pins] ${ok} ok, ${err} errores, ${results.filter(r=>r.skip).length} sin tabla`)

    return res.status(200).json({ ok: true, total: emps.length, patched: ok, errors: err, results })
  } catch (e) {
    console.error('[patch-pins] fatal:', e)
    return res.status(500).json({ error: e.message })
  }
}
