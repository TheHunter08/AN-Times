/**
 * TIMES INC – Archivado mensual de registros antiguos
 * Mueve registros con más de 90 días a monthSnapshots en Supabase.
 * Corre el 1º de cada mes vía GitHub Actions.
 * Mantiene la base de datos principal ligera.
 */

// Limpia BOM (﻿) y espacios que GitHub Secrets puede incluir al copiar desde Windows
const cleanEnv = s => (s || '').replace(/^﻿/, '').trim()
const SB_URL  = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON = cleanEnv(process.env.VITE_SB_ANON)
if (!SB_URL || !SB_ANON) { console.error('[archive] VITE_SB_URL / VITE_SB_ANON not set'); process.exit(1) }

const SB_HEADERS = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` }

async function sbReadData() {
  const res = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data`, { headers: SB_HEADERS })
  const rows = await res.json()
  return rows?.[0]?.data || null
}

async function sbWriteData(data) {
  const res = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1`, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ data: { ...data, _ts: Date.now() }, updated_at: new Date().toISOString() })
  })
  return res.ok
}

async function run() {
  const now    = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 90)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  console.log(`Archivando registros anteriores a ${cutoffStr}...`)

  const db = await sbReadData()
  if (!db) { console.log('No se pudo leer Supabase.'); return }

  const records = db.records || []
  if (!records.length) { console.log('No hay registros.'); return }

  const toArchive = records.filter(r => r.inicio && r.inicio.slice(0, 10) < cutoffStr)
  const toKeep    = records.filter(r => !r.inicio || r.inicio.slice(0, 10) >= cutoffStr)

  if (!toArchive.length) {
    console.log('No hay registros para archivar.')
    return
  }

  // Almacenar registros archivados en monthSnapshots keyed by YYYY-MM
  const existingSnapshots = db.monthSnapshots || {}
  const newSnapshots = { ...existingSnapshots }
  for (const rec of toArchive) {
    const monthKey = rec.inicio.slice(0, 7) // "YYYY-MM"
    if (!newSnapshots[monthKey]) newSnapshots[monthKey] = { records: [] }
    newSnapshots[monthKey].records = [...(newSnapshots[monthKey].records || []), rec]
  }

  console.log(`Archivando ${toArchive.length} registros, manteniendo ${toKeep.length}...`)

  const updated = { ...db, records: toKeep, monthSnapshots: newSnapshots }
  const ok = await sbWriteData(updated)

  if (ok) {
    console.log(`✓ Archivados ${toArchive.length} registros. Activos: ${toKeep.length}.`)
  } else {
    console.error('✗ Error al escribir en Supabase')
    process.exit(1)
  }
}

run().catch(e => { console.error('Error:', e.message); process.exit(1) })
