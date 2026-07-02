/**
 * TIMES INC – Archivado mensual de registros antiguos
 * Mueve registros con más de 90 días fuera de la fila principal (id=1) de
 * app_data, a una fila aparte (id=2) que el sync normal de la app NUNCA lee
 * ni escucha por Realtime — así no viaja en cada sincronización.
 * Corre el 1º de cada mes vía GitHub Actions.
 *
 * Bug corregido: antes esto guardaba los registros archivados en
 * `monthSnapshots` DENTRO de la misma fila (id=1) — es decir, no aligeraba
 * nada, solo movía los datos de una clave a otra del mismo JSON que se
 * descarga en cada fichaje, cron y sincronización. La base de datos crecía
 * para siempre pese al nombre "archivado".
 */

// Limpia BOM (﻿) y espacios que GitHub Secrets puede incluir al copiar desde Windows
const cleanEnv = s => (s || '').replace(/^﻿/, '').trim()
const SB_URL  = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON = cleanEnv(process.env.VITE_SB_ANON)
if (!SB_URL || !SB_ANON) { console.error('[archive] VITE_SB_URL / VITE_SB_ANON not set'); process.exit(1) }

const SB_HEADERS = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` }
const ARCHIVE_ROW_ID = 2

async function sbReadData(id) {
  const res = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.${id}&select=data`, { headers: SB_HEADERS })
  const rows = await res.json()
  return rows?.[0]?.data || null
}

async function sbWriteData(id, data) {
  const res = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ data, updated_at: new Date().toISOString() })
  })
  return res.ok
}

// La fila de archivo puede no existir todavía la primera vez — se crea con upsert.
async function sbUpsertArchive(data) {
  const res = await fetch(`${SB_URL}/rest/v1/app_data`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: ARCHIVE_ROW_ID, data, updated_at: new Date().toISOString() })
  })
  return res.ok
}

async function run() {
  const now    = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 90)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  console.log(`Archivando registros anteriores a ${cutoffStr}...`)

  const db = await sbReadData(1)
  if (!db) { console.log('No se pudo leer Supabase.'); return }

  const records = db.records || []
  if (!records.length) { console.log('No hay registros.'); return }

  const toArchive = records.filter(r => r.inicio && r.inicio.slice(0, 10) < cutoffStr)
  const toKeep    = records.filter(r => !r.inicio || r.inicio.slice(0, 10) >= cutoffStr)

  if (!toArchive.length) {
    console.log('No hay registros para archivar.')
    return
  }

  // Fila de archivo (id=2): la app nunca la lee en su ciclo normal de sync.
  const archiveDb = (await sbReadData(ARCHIVE_ROW_ID)) || { monthSnapshots: {} }
  const newSnapshots = { ...(archiveDb.monthSnapshots || {}) }
  for (const rec of toArchive) {
    const monthKey = rec.inicio.slice(0, 7) // "YYYY-MM"
    if (!newSnapshots[monthKey]) newSnapshots[monthKey] = { records: [] }
    newSnapshots[monthKey].records = [...(newSnapshots[monthKey].records || []), rec]
  }

  console.log(`Archivando ${toArchive.length} registros, manteniendo ${toKeep.length}...`)

  const archiveOk = await sbUpsertArchive({ ...archiveDb, monthSnapshots: newSnapshots })
  if (!archiveOk) { console.error('✗ Error al escribir el archivo (fila 2)'); process.exit(1) }

  const mainOk = await sbWriteData(1, { ...db, records: toKeep, _ts: Date.now() })
  if (mainOk) {
    console.log(`✓ Archivados ${toArchive.length} registros a la fila de archivo. Activos: ${toKeep.length}.`)
  } else {
    console.error('✗ Error al escribir en Supabase (fila principal)')
    process.exit(1)
  }
}

run().catch(e => { console.error('Error:', e.message); process.exit(1) })
