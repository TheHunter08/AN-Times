import { authSupabase } from './authService.js'

export function pendingLegalAcknowledgements(items, { empId = null, authId = null } = {}) {
  return (Array.isArray(items) ? items : []).filter(item =>
    item?.id
    && item.evidenceState !== 'confirmed'
    && item.serverConfirmed !== true
    && item.authId
    && (!empId || item.empId === empId)
    && (!authId || item.authId === authId)
  )
}

export async function persistLegalAcknowledgement(item) {
  if (!authSupabase || !item?.authId) return { ok:false, reason:'auth_required' }
  try {
    const { error } = await authSupabase.from('legal_acknowledgements').insert({
      id:item.id,
      emp_id:item.empId,
      auth_id:item.authId,
      notice_version:item.noticeVersion,
      event_type:item.eventType,
      user_agent:item.userAgent,
      acknowledged_at:item.acknowledgedAt,
    })
    if (!error || error.code === '23505') return { ok:true }
    console.warn('[legal] No se pudo confirmar la recepción en el servidor:', error.message)
    return { ok:false, reason:error.code || 'server_error' }
  } catch (error) {
    console.warn('[legal] No se pudo confirmar la recepción en el servidor:', error?.message)
    return { ok:false, reason:'network_error' }
  }
}

export async function syncPendingLegalAcknowledgements(items, identity = {}) {
  const pending = pendingLegalAcknowledgements(items, identity)
  const confirmedIds = []
  for (const item of pending) {
    const result = await persistLegalAcknowledgement(item)
    if (result.ok) confirmedIds.push(item.id)
    // Un fallo de red suele afectar a todo el lote; no multiplicar timeouts.
    if (!result.ok && result.reason === 'network_error') break
  }
  return { ok:confirmedIds.length === pending.length, attempted:pending.length, confirmedIds }
}
