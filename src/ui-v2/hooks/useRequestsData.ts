import { useAppStore } from '../../store/appStore.js'
import type { RequestRow } from '../pages/Requests.js'

interface DbVac {
  id: string
  empId?: string
  empName?: string
  tipo?: string
  fechaInicio?: string
  fechaFin?: string
  motivo?: string
  estado: 'pendiente' | 'aprobada' | 'rechazada'
  ts?: string
}

function daysBetween(a?: string, b?: string) {
  if (!a || !b) return undefined
  const ms = new Date(b).getTime() - new Date(a).getTime()
  return Math.max(1, Math.round(ms / 86400000) + 1)
}

function fmtDate(ts?: string) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  } catch { return '' }
}

export function useRequestsData(
  onApprove: (id: string) => void,
  onReject:  (id: string) => void
): RequestRow[] {
  const db = useAppStore(s => s.db) as { vacaciones?: DbVac[] }
  const vacs = [...(db.vacaciones || [])].sort((a, b) =>
    String(b.ts || '').localeCompare(String(a.ts || ''))
  )

  return vacs.map((v): RequestRow => {
    const statusMap = { pendiente: 'pending', aprobada: 'approved', rechazada: 'rejected' } as const
    return {
      id: v.id,
      type: v.tipo === 'ausencia' ? 'Baja' : v.tipo === 'teletrabajo' ? 'Teletrabajo' : 'Vacaciones',
      employeeName: v.empName || '—',
      requestedOn: fmtDate(v.ts),
      status: statusMap[v.estado] ?? 'pending',
      days: daysBetween(v.fechaInicio, v.fechaFin),
      note: v.motivo || undefined,
      onApprove,
      onReject,
    }
  })
}
