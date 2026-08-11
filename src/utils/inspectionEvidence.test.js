import { describe, expect, it } from 'vitest'
import { buildInspectionEvidenceSummary } from './inspectionEvidence.js'
import { LEGAL_NOTICE_VERSION } from './legalCompliance.js'

describe('buildInspectionEvidenceSummary', () => {
  it('builds a verifiable single-company evidence inventory', () => {
    const result = buildInspectionEvidenceSummary({
      employees:[{ id:'e1', name:'Ana' }, { id:'admin', role:'admin', name:'Admin' }],
      config:{ legal:{ controllerName:'Empresa Ejemplo SL' } },
      legalAcknowledgements:[{ empId:'e1', noticeVersion:LEGAL_NOTICE_VERSION }],
      documentos:[{ id:'d1', empId:'e1', nombre:'Contrato.pdf', firma:{ firmadoAt:'2026-08-11T10:00:00Z', signedSha256:'doc-hash' } }],
      cierres:[{ id:'c1', empId:'e1', mes:'2026-07', integrityHash:'close-hash' }],
    })
    expect(result).toMatchObject({ companyName:'Empresa Ejemplo SL', workers:1, informedWorkers:1 })
    expect(result.signedDocuments[0]).toMatchObject({ name:'Contrato.pdf', employee:'Ana', sha256:'doc-hash' })
    expect(result.signedClosures[0]).toMatchObject({ month:'2026-07', employee:'Ana', sha256:'close-hash' })
  })
})

