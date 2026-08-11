import { getLegalConfig, LEGAL_NOTICE_VERSION } from './legalCompliance.js'

export function buildInspectionEvidenceSummary(db = {}) {
  const workers = (db.employees || []).filter(employee => !employee.baja && employee.role !== 'admin' && !employee.isAdmin)
  const currentAcknowledged = new Set((db.legalAcknowledgements || [])
    .filter(item => item?.noticeVersion === LEGAL_NOTICE_VERSION)
    .map(item => String(item.empId)))
  const legal = getLegalConfig(db)

  return {
    companyName:legal.controllerName || db.empresas?.[0]?.nombre || db.empresas?.[0]?.name || 'TIMES INC',
    legalNoticeVersion:LEGAL_NOTICE_VERSION,
    workers:workers.length,
    informedWorkers:workers.filter(employee => currentAcknowledged.has(String(employee.id))).length,
    signedDocuments:(db.documentos || []).filter(document => document?.firma?.signedSha256).map(document => ({
      id:document.id,
      name:document.nombre || document.titulo || document.name || document.id,
      employee:document.empName || workers.find(employee => employee.id === document.empId)?.name || document.empId,
      signedAt:document.firma.firmadoAt || document._upd || '',
      sha256:document.firma.signedSha256,
    })),
    signedClosures:(db.cierres || []).filter(closure => closure?.integrityHash).map(closure => ({
      id:closure.id,
      month:closure.mes,
      employee:closure.empName || workers.find(employee => employee.id === closure.empId)?.name || closure.empId,
      sha256:closure.integrityHash,
    })),
  }
}

