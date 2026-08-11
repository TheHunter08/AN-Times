import { hasSignedDocumentArtifact } from './documentSigning.js'

export function summarizeDocumentReadiness(db = {}) {
  const employees = new Map((db.employees || []).map(employee => [String(employee.id), employee]))
  const documents = Array.isArray(db.documentos) ? db.documentos : []
  const signed = documents.filter(hasSignedDocumentArtifact)
  const signatureWithoutArtifact = documents.filter(document => document?.firma && !hasSignedDocumentArtifact(document))
  const privateWithoutAuth = documents.filter(document => {
    if (!document?.storagePath && !document?.signedStoragePath) return false
    if (document.fileData || document.data) return false
    const employee = employees.get(String(document.empId))
    return !employee?.authId && !employee?.auth_id
  })
  const signedWithoutIntegrity = signed.filter(document => !document?.firma?.signedSha256)

  return {
    total:documents.length,
    signed:signed.length,
    pending:documents.length - signed.length,
    signatureWithoutArtifact:signatureWithoutArtifact.length,
    privateWithoutAuth:privateWithoutAuth.length,
    signedWithoutIntegrity:signedWithoutIntegrity.length,
    ready:signatureWithoutArtifact.length === 0 && privateWithoutAuth.length === 0,
  }
}

