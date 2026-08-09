import { createHash } from 'node:crypto'

const REQUIRED_COLLECTIONS = ['records', 'employees']

export function inspectBackupSnapshot(input, { expectedChecksum } = {}) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8')
  const checksum = createHash('sha256').update(bytes).digest('hex')
  const errors = []
  let snapshot = null

  try {
    snapshot = JSON.parse(bytes.toString('utf8'))
  } catch {
    errors.push('El archivo no contiene JSON válido')
  }

  if (snapshot) {
    if (!Number.isFinite(new Date(snapshot.timestamp).getTime())) errors.push('Falta un timestamp válido')
    if (!snapshot.hot || typeof snapshot.hot !== 'object') errors.push('Falta el bloque hot')
    for (const collection of REQUIRED_COLLECTIONS) {
      if (!Array.isArray(snapshot.hot?.[collection])) errors.push(`hot.${collection} no es una colección`)
    }
    if (snapshot.cold != null && typeof snapshot.cold !== 'object') errors.push('El bloque cold no es válido')
  }
  if (expectedChecksum && checksum !== expectedChecksum) errors.push('El checksum SHA-256 no coincide')

  return {
    valid:errors.length === 0,
    errors,
    checksum,
    timestamp:snapshot?.timestamp || null,
    counts:{
      records:Array.isArray(snapshot?.hot?.records) ? snapshot.hot.records.length : 0,
      employees:Array.isArray(snapshot?.hot?.employees) ? snapshot.hot.employees.length : 0,
      coldRecords:Array.isArray(snapshot?.cold?.records) ? snapshot.cold.records.length : 0,
    },
    snapshot,
  }
}

export function buildRestorePlan(inspection) {
  if (!inspection?.valid) throw new Error(`Backup no restaurable: ${(inspection?.errors || []).join('; ')}`)
  return {
    mode:'dry-run',
    targetRows:[
      { id:1, data:inspection.snapshot.hot },
      ...(inspection.snapshot.cold ? [{ id:3, data:inspection.snapshot.cold }] : []),
    ],
    checksum:inspection.checksum,
    timestamp:inspection.timestamp,
    counts:inspection.counts,
  }
}
