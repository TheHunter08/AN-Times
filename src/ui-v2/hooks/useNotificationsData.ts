import { useAppStore } from '../../store/appStore.js'
import type { NotificationItem } from '../pages/Notifications.js'

interface DbNoti {
  id: string
  action?: string
  detail?: string
  ts?: string
  leido?: boolean
  deleted?: boolean
  empId?: string
  target?: string
  url?: string
}

function relativeTime(ts?: string): string {
  if (!ts) return ''
  try {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1)  return 'Hace un momento'
    if (mins < 60) return `Hace ${mins} min`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24)  return `Hace ${hrs}h`
    if (hrs < 48)  return 'Ayer'
    return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  } catch { return '' }
}

function ageGroup(ts?: string): 'hoy' | 'ayer' | 'semana' {
  if (!ts) return 'semana'
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 86400000)  return 'hoy'
  if (diff < 172800000) return 'ayer'
  return 'semana'
}

function classifyAction(action?: string): NotificationItem['type'] {
  if (!action) return 'sistema'
  const a = action.toLowerCase()
  if (a.includes('fichaj') || a.includes('entrada') || a.includes('salida') || a.includes('jornada')) return 'fichaje'
  if (a.includes('vacac') || a.includes('solicitud') || a.includes('aprobad') || a.includes('rechazad')) return 'solicitud'
  if (a.includes('mensaje') || a.includes('chat'))    return 'mensaje'
  if (a.includes('anomalía') || a.includes('anomal')) return 'anomalia'
  if (a.includes('aniversario') || a.includes('cumpleaños')) return 'aniversario'
  return 'sistema'
}

function notificationDestination(action = '', explicit?: string): string {
  if (explicit) {
    const match = explicit.match(/go=admin:([^:&]+)/)
    if (match?.[1]) return match[1]
  }
  const a = action.toLowerCase()
  if (a.includes('correcci')) return 'solicitudes'
  if (a.includes('vacac') || a.includes('solicitud')) return 'solicitudes'
  if (a.includes('mensaje') || a.includes('chat')) return 'mensajes'
  if (a.includes('document')) return 'documentos'
  if (a.includes('cierre') || a.includes('firma')) return 'cierre'
  if (a.includes('anomal')) return 'anomalias'
  if (a.includes('fichaj') || a.includes('entrada') || a.includes('salida') || a.includes('jornada')) return 'fichajes'
  if (a.includes('emplead') || a.includes('aniversario') || a.includes('cumple')) return 'empleados'
  return 'auditoria'
}

export function useNotificationsData(): {
  items: NotificationItem[]
  markRead: (id: string) => void
  markAllRead: () => void
  dismiss: (id: string) => void
} {
  const db      = useAppStore(s => s.db) as { notis?: DbNoti[] }
  const saveDB  = useAppStore(s => s.saveDB)

  // empId === '__admin__' (no todas): db.notis es compartido por toda la
  // app — sin este filtro, el centro de notificaciones del admin mostraba
  // también los recordatorios personales de cada empleado (fichaje,
  // vacaciones, cierre pendiente…), pareciendo notis "duplicadas" cuando en
  // realidad eran avisos de distintos empleados con el mismo texto genérico.
  const items: NotificationItem[] = (db.notis || [])
    .filter(n => !n.deleted && n.empId === '__admin__')
    .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))
    .slice(0, 50)
    .map((n): NotificationItem => ({
      id: n.id,
      type: classifyAction(n.action),
      title: n.action || 'Notificación',
      body: n.detail || '',
      time: relativeTime(n.ts),
      read: !!n.leido,
      group: ageGroup(n.ts),
      destination: notificationDestination(n.action, n.target || n.url),
    }))

  const markRead = (id: string) => {
    saveDB((freshDb: { notis?: DbNoti[] }) => ({
      notis: (freshDb.notis || []).map(n => n.id === id ? { ...n, leido: true } : n)
    }))
  }

  const markAllRead = () => {
    saveDB((freshDb: { notis?: DbNoti[] }) => ({
      notis: (freshDb.notis || []).map(n => n.empId === '__admin__' ? { ...n, leido: true } : n)
    }))
  }

  const dismiss = (id: string) => {
    saveDB((freshDb: { notis?: DbNoti[] }) => ({
      notis: (freshDb.notis || []).map(n => n.id === id ? { ...n, deleted: true } : n)
    }))
  }

  return { items, markRead, markAllRead, dismiss }
}
