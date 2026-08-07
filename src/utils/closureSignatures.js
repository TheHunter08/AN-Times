import { canCloseMonth } from './monthClose.js'

export function pendingClosureSignatures(closures, now = new Date()) {
  return (closures || []).filter(closure => {
    if (!closure || closure.desactualizado || closure.estado === 'rechazado') return false
    if (!canCloseMonth(closure.mes, now)) return false
    const employeeSigned = Boolean(closure.firmaEmp || closure.firma)
    return !(closure.firmaAdmin && employeeSigned)
  })
}

export function closureSignatureBacklog(closures, now = new Date()) {
  const pending = pendingClosureSignatures(closures, now)
  return {
    pending,
    admin: pending.filter(closure => !closure.firmaAdmin),
    employee: pending.filter(closure => !(closure.firmaEmp || closure.firma)),
  }
}
