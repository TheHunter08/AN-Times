import { describe, expect, it } from 'vitest'
import { summarizeDocumentReadiness } from './documentReadiness.js'

describe('summarizeDocumentReadiness', () => {
  it('detects false signatures and private files inaccessible to PIN-only profiles', () => {
    expect(summarizeDocumentReadiness({
      employees:[{ id:'e1' }, { id:'e2', authId:'u2' }],
      documentos:[
        { id:'d1', empId:'e1', firma:{} },
        { id:'d2', empId:'e1', storagePath:'e1/d2.pdf' },
        { id:'d3', empId:'e2', storagePath:'e2/d3.pdf' },
      ],
    })).toMatchObject({ total:3, signed:0, signatureWithoutArtifact:1, privateWithoutAuth:1, ready:false })
  })

  it('accepts signed inline and signed Storage artifacts', () => {
    expect(summarizeDocumentReadiness({
      employees:[{ id:'e1' }, { id:'e2', auth_id:'u2' }],
      documentos:[
        { empId:'e1', firma:{ signedSha256:'a' }, fileData:'data:application/pdf;base64,AA==' },
        { empId:'e2', firma:{ signedSha256:'b' }, signedStoragePath:'e2/signed.pdf' },
      ],
    })).toMatchObject({ signed:2, pending:0, signatureWithoutArtifact:0, privateWithoutAuth:0, ready:true })
  })
})

