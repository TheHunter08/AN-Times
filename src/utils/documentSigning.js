export function hasSignedDocumentArtifact(document) {
  return Boolean(document?.firma && (document?.fileData || document?.signedStoragePath))
}

export function documentInlineArtifact(document) {
  if (document?.fileData) return document.fileData
  // `data` puede seguir conteniendo el original cuando el artefacto firmado
  // ya vive en Storage; no debe ganar por orden de fallback.
  if (document?.signedStoragePath) return null
  return document?.data || null
}

export function shouldUsePrivateDocumentStorage(employee, authClientAvailable = true) {
  return Boolean(authClientAvailable && (employee?.authId || employee?.auth_id))
}

export function findLegacyJornadaClosure(document, db = {}) {
  if (document?.tipo !== 'jornada' || !document?.empId || !document?.mes) return null
  if (document?.fileData || document?.data || document?.storagePath || document?.signedStoragePath) return null
  const matches = (db.cierres || []).filter(closure =>
    String(closure?.empId) === String(document.empId)
    && closure?.mes === document.mes
    && !closure?.deleted
  )
  return matches.sort((left, right) =>
    String(right?._upd || right?.generadoAt || '').localeCompare(String(left?._upd || left?.generadoAt || ''))
  )[0] || null
}

export function documentDataKind(dataUrl, { mime = '', name = '' } = {}) {
  const normalizedMime = String(mime || '').toLowerCase()
  const normalizedName = String(name || '').toLowerCase().split(/[?#]/)[0]
  const header = String(dataUrl || '').slice(0, 80).toLowerCase()

  if (header.startsWith('data:application/pdf') || normalizedMime === 'application/pdf' || normalizedName.endsWith('.pdf')) return 'pdf'
  if (header.startsWith('data:image/') || normalizedMime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/.test(normalizedName)) return 'image'
  return 'unsupported'
}

function dataUrlBytes(dataUrl) {
  const encoded = String(dataUrl || '').split(',')[1]
  if (!encoded) throw new Error('Documento sin contenido codificado')
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export async function sha256DataUrl(dataUrl) {
  if (!globalThis.crypto?.subtle) throw new Error('Este dispositivo no permite verificar la integridad del documento')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', dataUrlBytes(dataUrl))
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}
