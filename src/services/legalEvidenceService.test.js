import { describe, expect, it } from 'vitest'
import { pendingLegalAcknowledgements } from './legalEvidenceService.js'

describe('pendingLegalAcknowledgements', () => {
  const rows = [
    { id:'a1', empId:'e1', authId:'u1', evidenceState:'pending_sync' },
    { id:'a2', empId:'e1', authId:'u1', evidenceState:'confirmed', serverConfirmed:true },
    { id:'a3', empId:'e2', authId:'u2', evidenceState:'pending_sync' },
    { id:'a4', empId:'e1', authId:null, evidenceState:'pending_sync' },
  ]

  it('retries only unconfirmed evidence for the official current identity', () => {
    expect(pendingLegalAcknowledgements(rows, { empId:'e1', authId:'u1' }).map(item => item.id)).toEqual(['a1'])
  })

  it('keeps PIN-only evidence pending until an official identity exists', () => {
    expect(pendingLegalAcknowledgements(rows).map(item => item.id)).toEqual(['a1', 'a3'])
  })
})
