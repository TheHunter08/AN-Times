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
//   - audit:  se conserva un mínimo de 4 años, igual que la evidencia de
//             jornada a la que puede quedar vinculada.
const cleanEnv = s => (s || '').replace(/^﻿/, '').trim()
const SB_URL  = cleanEnv(process.env.VITE_SB_URL)
const SB_SERVICE = cleanEnv(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
if (!SB_URL || !SB_SERVICE) { console.error('[cleanup] VITE_SB_URL / SB_SERVICE_KEY not set'); process.exit(1) }

// Las eliminaciones de retención son administrativas: nunca deben depender
// de políticas anon y deben seguir funcionando después de activar Auth/RLS.
const SB_HEADERS = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, Prefer: 'return=minimal,count=exact' }

const NOTIS_RETENTION_MONTHS = 6
const AUDIT_RETENTION_YEARS = 4

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

async function deleteOldAuditEvents(cutoffIso) {
  const url = `${SB_URL}/rest/v1/audit_events?created_at=lt.${encodeURIComponent(cutoffIso)}`
  const res = await fetch(url, { method:'DELETE', headers:SB_HEADERS })
  if (!res.ok) {
    // Compatibilidad durante el despliegue previo a crear audit_events.
    if (res.status === 400 || res.status === 404) return 0
    throw new Error(`[audit_events] DELETE ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  return parseInt(res.headers.get('content-range')?.split('/')[1] || '0', 10)
}

async function run() {
  const notisCutoff = isoMonthsAgo(NOTIS_RETENTION_MONTHS)
  const auditCutoff = isoYearsAgo(AUDIT_RETENTION_YEARS)

  console.log(`Borrando notis leídas anteriores a ${notisCutoff}...`)
  const notisDeleted = await deleteOldEntities('notis', notisCutoff, '&data->>leido=eq.true')
  console.log(`✓ ${notisDeleted} notis borradas`)

  console.log(`Borrando audit anterior a ${auditCutoff}...`)
  const [legacyAuditDeleted, auditEventsDeleted] = await Promise.all([
    deleteOldEntities('audit', auditCutoff),
    deleteOldAuditEvents(auditCutoff),
  ])
  const auditDeleted = legacyAuditDeleted + auditEventsDeleted
  console.log(`Audit eliminado tras 4 años: ${auditDeleted} entradas`)

  const pushDeliveryCutoff = isoMonthsAgo(1)
  console.log(`Borrando claves de deduplicación push anteriores a ${pushDeliveryCutoff}...`)
  const pushDeliveryDeleted = await deleteOldEntities('push_delivery', pushDeliveryCutoff)
  console.log(`Claves push borradas: ${pushDeliveryDeleted}`)

  console.log(`Total: ${notisDeleted + auditDeleted + pushDeliveryDeleted} filas eliminadas`)
}

run().catch(e => { console.error('Error:', e.message); process.exit(1) })
