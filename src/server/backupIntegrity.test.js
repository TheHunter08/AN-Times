import { describe, expect, it } from 'vitest'
import { buildRestorePlan, inspectBackupSnapshot } from './backupIntegrity.js'

const valid = JSON.stringify({
  timestamp:'2026-08-09T10:00:00.000Z',
  hot:{ records:[{ id:'r1' }], employees:[{ id:'e1' }] },
  cold:{ records:[{ id:'old' }] },
})

describe('backupIntegrity', () => {
  it('valida y materializa un plan de restauración sin escribir datos', () => {
    const inspection = inspectBackupSnapshot(valid)
    expect(inspection).toMatchObject({ valid:true, counts:{ records:1, employees:1, coldRecords:1 } })
    expect(buildRestorePlan(inspection).targetRows.map(row => row.id)).toEqual([1, 3])
  })

  it('rechaza JSON corrupto, estructura incompleta y checksums incorrectos', () => {
    expect(inspectBackupSnapshot('{').valid).toBe(false)
    expect(inspectBackupSnapshot(JSON.stringify({ timestamp:'bad', hot:{} })).errors).toHaveLength(3)
    expect(inspectBackupSnapshot(valid, { expectedChecksum:'0'.repeat(64) }).errors).toContain('El checksum SHA-256 no coincide')
  })
})
