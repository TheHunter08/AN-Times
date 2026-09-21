import { describe, expect, it } from 'vitest'
import { documentDataKind, documentInlineArtifact, findLegacyJornadaClosure, findMissingVacacionDocuments, hasSignedDocumentArtifact, sha256DataUrl, shouldUsePrivateDocumentStorage } from './documentSigning.js'

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

  it('detects a vacation firmada without a matching documento (documento nunca sincronizó)', () => {
    const vac = {
      id:'v1', empId:'e1', empName:'Ana', estado:'aprobada', firmaEmp:true,
      fechaInicio:'2026-08-17', fechaFin:'2026-08-23',
      firma:{ signatureData:'data:image/png;base64,AA==', firmadoAt:'2026-08-10T09:00:00.000Z' },
    }
    const stubs = findMissingVacacionDocuments({ vacaciones:[vac], documentos:[] })
    expect(stubs).toHaveLength(1)
    expect(stubs[0]).toMatchObject({ vacId:'v1', empId:'e1', tipo:'vacaciones', needsRegeneration:true })
  })

  it('no duplica una vacación cuyo documento sí llegó a sincronizarse (mismo empId + firmadoAt)', () => {
    const vac = {
      id:'v1', empId:'e1', empName:'Ana', estado:'aprobada', firmaEmp:true,
      fechaInicio:'2026-08-17', fechaFin:'2026-08-23',
      firma:{ signatureData:'data:image/png;base64,AA==', firmadoAt:'2026-08-10T09:00:00.000Z' },
    }
    const doc = { id:'d1', empId:'e1', tipo:'vacaciones', firma:{ firmadoAt:'2026-08-10T09:00:00.000Z' }, signedStoragePath:'e1/v1.pdf' }
    expect(findMissingVacacionDocuments({ vacaciones:[vac], documentos:[doc] })).toEqual([])
  })

  it('ignora vacaciones sin firmar o sin firma dibujada', () => {
    const sinFirmar = { id:'v2', empId:'e1', estado:'aprobada', firmaEmp:false }
    const sinDatoDeFirma = { id:'v3', empId:'e1', estado:'aprobada', firmaEmp:true, firma:{ firmadoAt:'2026-08-10T09:00:00.000Z' } }
    expect(findMissingVacacionDocuments({ vacaciones:[sinFirmar, sinDatoDeFirma], documentos:[] })).toEqual([])
  })
})
