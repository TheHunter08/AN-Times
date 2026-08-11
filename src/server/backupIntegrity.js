import { createHash } from 'node:crypto'

const REQUIRED_COLLECTIONS = ['records', 'employees']
const REQUIRED_NORMALIZED_TABLES = ['companies', 'employees', 'records', 'cierres', 'app_entities', 'audit_events']

export function inspectBackupSnapshot(input, { expectedChecksum } = {}) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8')
  const checksum = createHash('sha256').update(bytes).digest('hex')
  const errors = []
  let snapshot = null

  try { snapshot = JSON.parse(bytes.toString('utf8')) }
  catch { errors.push('El archivo no contiene JSON válido') }

  if (snapshot) {
    if (!Number.isFinite(new Date(snapshot.timestamp).getTime())) errors.push('Falta un timestamp válido')
    if (snapshot.source === 'normalized') {
      if (!snapshot.tables || typeof snapshot.tables !== 'object') errors.push('Falta el bloque tables')
      for (const table of REQUIRED_NORMALIZED_TABLES) {
        if (!Array.isArray(snapshot.tables?.[table])) errors.push(`tables.${table} no es una colección`)
      }
    } else {
      if (!snapshot.hot || typeof snapshot.hot !== 'object') errors.push('Falta el bloque hot')
      for (const collection of REQUIRED_COLLECTIONS) {
        if (!Array.isArray(snapshot.hot?.[collection])) errors.push(`hot.${collection} no es una colección`)
      }
      if (snapshot.cold != null && typeof snapshot.cold !== 'object') errors.push('El bloque cold no es válido')
    }
  }
  if (expectedChecksum && checksum !== expectedChecksum) errors.push('El checksum SHA-256 no coincide')

  return {
    valid:errors.length === 0, errors, checksum,
    timestamp:snapshot?.timestamp || null,
    counts:{
      records:Array.isArray(snapshot?.tables?.records) ? snapshot.tables.records.length : (Array.isArray(snapshot?.hot?.records) ? snapshot.hot.records.length : 0),
      employees:Array.isArray(snapshot?.tables?.employees) ? snapshot.tables.employees.length : (Array.isArray(snapshot?.hot?.employees) ? snapshot.hot.employees.length : 0),
      coldRecords:Array.isArray(snapshot?.cold?.records) ? snapshot.cold.records.length : 0,
    },
    snapshot,
  }
}

export function buildRestorePlan(inspection) {
  if (!inspection?.valid) throw new Error(`Backup no restaurable: ${(inspection?.errors || []).join('; ')}`)
  if (inspection.snapshot.source === 'normalized') {
    return {
      mode:'dry-run', source:'normalized', targetRows:[],
      targetTables:Object.entries(inspection.snapshot.tables).map(([table, rows]) => ({ table, rows })),
      checksum:inspection.checksum, timestamp:inspection.timestamp, counts:inspection.counts,
    }
  }
  return {
    mode:'dry-run', source:'legacy-blob', targetTables:[],
    targetRows:[
      { id:1, data:inspection.snapshot.hot },
      ...(inspection.snapshot.cold ? [{ id:3, data:inspection.snapshot.cold }] : []),
    ],
    checksum:inspection.checksum, timestamp:inspection.timestamp, counts:inspection.counts,
  }
}
