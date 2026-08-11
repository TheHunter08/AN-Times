import { describe, expect, it } from 'vitest'
import { documentDataKind, documentInlineArtifact, findLegacyJornadaClosure, hasSignedDocumentArtifact, sha256DataUrl, shouldUsePrivateDocumentStorage } from './documentSigning.js'

describe('document signing state', () => {
  it('does not treat signature metadata without a signed file as completed', () => {
    expect(hasSignedDocumentArtifact({ firma:{ firmadoAt:'2026-08-11' }, storagePath:'e1/original.pdf' })).toBe(false)
  })

  it('accepts embedded and Storage-backed signed files', () => {
    expect(hasSignedDocumentArtifact({ firma:{}, fileData:'data:application/pdf;base64,AA==' })).toBe(true)
    expect(hasSignedDocumentArtifact({ firma:{}, signedStoragePath:'e1/signed/document.pdf' })).toBe(true)
  })

  it('recognizes a PDF even when Storage returns a generic content type', () => {
    expect(documentDataKind('data:application/octet-stream;base64,AA==', { name:'contrato.PDF' })).toBe('pdf')
  })

  it('calculates a stable SHA-256 fingerprint for signed evidence', async () => {
    expect(await sha256DataUrl('data:text/plain;base64,YWJj')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('does not preview the original inline file over a signed Storage artifact', () => {
    expect(documentInlineArtifact({ data:'original', signedStoragePath:'e1/d1-signed.pdf' })).toBeNull()
    expect(documentInlineArtifact({ data:'original', fileData:'signed' })).toBe('signed')
  })

  it('uses private Storage only for a recipient with an official Auth identity', () => {
    expect(shouldUsePrivateDocumentStorage({ authId:'auth-1' }, true)).toBe(true)
    expect(shouldUsePrivateDocumentStorage({ id:'e1' }, true)).toBe(false)
    expect(shouldUsePrivateDocumentStorage({ auth_id:'auth-1' }, false)).toBe(false)
  })

  it('recovers the monthly closure for a legacy jornada document without a file', () => {
    const older = { id:'c-old', empId:'e1', mes:'2026-06', _upd:'2026-06-30T10:00:00Z' }
    const newer = { id:'c-new', empId:'e1', mes:'2026-06', _upd:'2026-07-01T10:00:00Z' }
    expect(findLegacyJornadaClosure(
      { id:'d1', tipo:'jornada', empId:'e1', mes:'2026-06', firma:{} },
      { cierres:[older, newer, { id:'other', empId:'e2', mes:'2026-06' }] },
    )).toBe(newer)
    expect(findLegacyJornadaClosure(
      { tipo:'jornada', empId:'e1', mes:'2026-06', data:'original' },
      { cierres:[newer] },
    )).toBeNull()
  })
})
