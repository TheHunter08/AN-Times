// Hook de SOLO LECTURA — conecta el Dashboard de ui-v2 al store real de la
// app (useAppStore) sin tocar lógica de negocio, escrituras ni Supabase.
// Reutiliza las mismas utilidades puras (today/calcMin/mhm) que ya usa
// PanelDashboard.jsx en la app real, para no duplicar ni divergir cálculos.
import { useAppStore } from '../../store/appStore.js'
import { today, calcMin, mhm } from '../../utils/time.js'
import type { KPI, ActivityItem } from '../pages/Dashboard.js'

interface DbRecord {
  empId: string
  inicio?: string
  fin?: string | null
  empName?: string
}
interface DbEmployee {
  id: string
  name: string
  baja?: boolean
  isAdmin?: boolean
}
interface Db {
  employees?: DbEmployee[]
  records?: DbRecord[]
  audit?: { action: string; detail?: string; user?: string; ts?: string }[]
}

export interface DashboardData {
  greeting: string
  kpis: KPI[]
  activity: ActivityItem[]
}

export function useDashboardData(): DashboardData {
  const db = useAppStore(s => s.db) as Db
  const session = useAppStore(s => s.session)

  const todayStr = today()
  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
  const recs = db.records || []
  const liveRecs = recs.filter(r => !r.fin)
  const todayRecs = recs.filter(r => r.fin && r.inicio?.startsWith(todayStr))
  const todayMin = todayRecs.reduce((s, r) => s + calcMin(r), 0)

  const kpis: KPI[] = [
    { label: 'Activos ahora', value: `${liveRecs.length}/${emps.length}` },
    { label: 'Horas hoy', value: mhm(todayMin) },
    { label: 'Fichajes hoy', value: String(todayRecs.length) },
  ]

  const activity: ActivityItem[] = (db.audit || [])
    .slice(-8)
    .reverse()
    .map((a, i) => ({
      id: String(i),
      text: `${a.action}${a.detail ? ` — ${a.detail}` : ''}`,
      time: a.ts ? new Date(a.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '',
      tone: 'gray' as const,
    }))

  const name = session?.user?.name?.split(' ')?.[0] ?? ''
  return {
    greeting: name ? `Buenas, ${name} 👋` : 'Buenas 👋',
    kpis,
    activity,
  }
}
