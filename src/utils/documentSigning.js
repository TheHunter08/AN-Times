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

// El PDF de vacaciones firmadas (ModalVacSign.jsx) se genera y se guarda en
// `documentos` en el MISMO saveDB que marca `vacaciones.firmaEmp = true` —
// pero son escrituras separadas al sincronizar con Supabase (tabla
// `vacaciones` vs colección `documentos` en app_entities), sin garantía de
// atomicidad entre ambas. Si la del documento falla (o no ha terminado de
// sincronizar en este dispositivo) mientras la de la vacación sí llega, el
// empleado y el jefe de obra ven la vacación como "firmada" mientras el PDF
// nunca aparece en Documentos, sin ningún aviso ni forma de recuperarlo.
//
// Como `buildVacacionPDF` solo necesita datos que YA viven en el propio
// registro de `vacaciones` (fechas, firma dibujada), el documento se puede
// reconstruir sin depender de que aquella subida a Storage haya funcionado.
// Se cruza por empId + firma.firmadoAt (fijado una sola vez, al firmar) en
// vez de por un `vacId` que los documentos creados antes de esta corrección
// no tienen, para no duplicar los que sí llegaron a sincronizarse bien.
export function findMissingVacacionDocuments(db = {}) {
  const existingKeys = new Set(
    (db.documentos || [])
      .filter(document => document?.tipo === 'vacaciones' && document?.empId && document?.firma?.firmadoAt)
      .map(document => `${document.empId}|${document.firma.firmadoAt}`)
  )
  return (db.vacaciones || [])
    .filter(vac => vac?.estado === 'aprobada' && vac?.firmaEmp && vac?.firma?.signatureData && vac?.firma?.firmadoAt
      && !existingKeys.has(`${vac.empId}|${vac.firma.firmadoAt}`))
    .map(vac => ({
      id: `vac-regen:${vac.id}`, vacId: vac.id, empId: vac.empId, empName: vac.empName, tipo: 'vacaciones',
      nombre: `Vacaciones firmadas ${vac.fechaInicio} - ${vac.fechaFin}`,
      firma: vac.firma, createdAt: vac.firma.firmadoAt, _upd: vac.firma.firmadoAt,
      needsRegeneration: true, _vac: vac,
    }))
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
