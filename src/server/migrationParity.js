import { ENTITY_COLLECTIONS, SINGLETON_COLLECTIONS } from '../services/tableSyncPlan.js'

const DEDICATED = [
  ['employees', 'employees'],
  ['records', 'records'],
  ['vacaciones', 'vacaciones'],
  ['cierres', 'cierres'],
  ['obras', 'obras'],
]

const CHECKPOINT_TIME_ZONE = 'Europe/Madrid'

export function migrationCheckpointDay(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone:CHECKPOINT_TIME_ZONE,
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
  }).formatToParts(date).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function validId(value) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

export function buildExpectedMigrationEntries(db = {}) {
  const expected = []
  for (const [collection, table] of DEDICATED) {
    for (const item of Array.isArray(db[collection]) ? db[collection] : []) {
      if (!item || item.deleted || !validId(item.id)) continue
      expected.push({ table, id:String(item.id), updatedAt:item._upd || null })
    }
  }
  for (const collection of ENTITY_COLLECTIONS) {
    for (const item of Array.isArray(db[collection]) ? db[collection] : []) {
      if (!item || item.deleted || !validId(item.id)) continue
      expected.push({ table:'app_entities', id:`${collection}:${String(item.id)}`, updatedAt:item._upd || null })
    }
  }
  for (const collection of SINGLETON_COLLECTIONS) {
    if (db[collection] === undefined) continue
    expected.push({ table:'app_entities', id:`${collection}:__singleton__`, updatedAt:null })
  }
  return expected
}

export function evaluateMigrationParity(db, tableRows = {}, { staleToleranceMs = 2000 } = {}) {
  const expected = buildExpectedMigrationEntries(db)
  const expectedKeys = new Set(expected.map(item => `${item.table}:${item.id}`))
  const actual = new Map()
  for (const [table, rows] of Object.entries(tableRows || {})) {
    for (const row of rows || []) {
      if (!row || row.deleted || !validId(row.id)) continue
      actual.set(`${table}:${String(row.id)}`, row)
    }
  }
  const missing = []
  const stale = []
  for (const item of expected) {
    const key = `${item.table}:${item.id}`
    const row = actual.get(key)
    if (!row) { missing.push(key); continue }
    const sourceTs = Date.parse(item.updatedAt || '')
    const tableTs = Date.parse(row.updated_at || '')
    if (Number.isFinite(sourceTs) && (!Number.isFinite(tableTs) || tableTs + staleToleranceMs < sourceTs)) stale.push(key)
  }
  const extra = [...actual.keys()].filter(key => !expectedKeys.has(key))
  return {
    consistent:missing.length === 0 && stale.length === 0,
    expected:expected.length,
    actual:actual.size,
    missingCount:missing.length,
    staleCount:stale.length,
    extraCount:extra.length,
    mismatchCount:missing.length + stale.length,
    missing:missing.slice(0, 25),
    stale:stale.slice(0, 25),
  }
}

export function buildMigrationCheckpoint(previous = {}, parity, nowIso = new Date().toISOString()) {
  const currentDay = migrationCheckpointDay(nowIso)
  const previousCountedDay = String(previous.lastCountedDay || migrationCheckpointDay(previous.lastCheckAt))
  const sameDay = previousCountedDay === currentDay
  return {
    ...parity,
    startedAt:parity.consistent ? (previous.consistent && previous.startedAt ? previous.startedAt : nowIso) : null,
    lastCheckAt:nowIso,
    lastCountedDay:parity.consistent ? (sameDay ? previousCountedDay : currentDay) : null,
    consecutiveConsistentChecks:parity.consistent
      ? (sameDay ? Math.max(1, Number(previous.consecutiveConsistentChecks) || 1) : (previous.consistent ? Number(previous.consecutiveConsistentChecks) || 0 : 0) + 1)
      : 0,
    rollbackReady:true,
    blobMode:'dual-write',
  }
}
