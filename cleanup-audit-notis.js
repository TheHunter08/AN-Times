// TIMES INC – Limpieza periódica de audit y notis
// Corre 1 vez al mes vía GitHub Actions (ver .github/workflows/cleanup-audit-notis.yml)
//
// Por qué: `audit` y `notis` son tablas append-only sin ninguna purga —
// crecen para siempre. RD 8/2019 solo obliga a conservar 4 años los
// registros de jornada (`records`) y los cierres (`cierres`); el log de
// auditoría interno y las notificaciones ya leídas no tienen esa
// obligación legal. En un proyecto con cuota gratuita de Supabase
// (500 MB de base de datos), dejarlas crecer sin límite es el camino
// más rápido a quedarse sin espacio por datos que a nadie le hace falta
// conservar para siempre.
//
// Retención aplicada (conservadora, muy por encima de lo estrictamente
// necesario — ajusta si quieres ser más agresivo):
//   - notis:  se borran las YA LEÍDAS con más de 6 meses.
//             Las no leídas nunca se tocan, sin importar su antigüedad.
//   - audit:  se borran las de más de 2 años (muy por debajo de los
//             4 años legales de `records`/`cierres`, que este script
//             NUNCA toca).
const cleanEnv = s => (s || '').replace(/^﻿/, '').trim()
const SB_URL  = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON = cleanEnv(process.env.VITE_SB_ANON)
if (!SB_URL || !SB_ANON) { console.error('[cleanup] VITE_SB_URL / VITE_SB_ANON not set'); process.exit(1) }

const SB_HEADERS = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, Prefer: 'return=minimal,count=exact' }

const NOTIS_RETENTION_MONTHS = 6
const AUDIT_RETENTION_YEARS = 2

function isoMonthsAgo(months) {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString()
}

function isoYearsAgo(years) {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString()
}

async function deleteOldEntities(collection, cutoffIso, extraFilter = '') {
  const url = `${SB_URL}/rest/v1/app_entities?collection=eq.${collection}&updated_at=lt.${encodeURIComponent(cutoffIso)}${extraFilter}`
  const res = await fetch(url, { method:'DELETE', headers:SB_HEADERS })
  if (!res.ok) throw new Error(`[app_entities/${collection}] DELETE ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return parseInt(res.headers.get('content-range')?.split('/')[1] || '0', 10)
}

async function run() {
  const notisCutoff = isoMonthsAgo(NOTIS_RETENTION_MONTHS)
  const auditCutoff = isoYearsAgo(AUDIT_RETENTION_YEARS)

  console.log(`Borrando notis leídas anteriores a ${notisCutoff}...`)
  const notisDeleted = await deleteOldEntities('notis', notisCutoff, '&data->>leido=eq.true')
  console.log(`✓ ${notisDeleted} notis borradas`)

  console.log(`Borrando audit anterior a ${auditCutoff}...`)
  const auditDeleted = await deleteOldEntities('audit', auditCutoff)
  console.log(`✓ ${auditDeleted} entradas de audit borradas`)

  console.log(`Total: ${notisDeleted + auditDeleted} filas eliminadas`)
}

run().catch(e => { console.error('Error:', e.message); process.exit(1) })
