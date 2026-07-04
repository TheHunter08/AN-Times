// Hook de SOLO LECTURA — conecta el Dashboard de ui-v2 al store real de la
// app (useAppStore) sin tocar lógica de negocio, escrituras ni Supabase.
// Reutiliza las mismas utilidades puras (today/calcMin/mhm) que ya usa
// PanelDashboard.jsx en la app real, para no duplicar ni divergir cálculos.
import { useAppStore } from '../../store/appStore.js'
import { today, calcMin, mhm } from '../../utils/time.js'
import type { KPI, ActivityItem, TeamMember } from '../pages/Dashboard.js'
import type { AreaChartPoint } from '../components/AreaChart.js'

interface DbRecord {
  empId: string
  inicio?: string
  fin?: string | null
  empName?: string
  enDescanso?: boolean
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
  config?: { wdMin?: number }
}

export interface DashboardData {
  greeting: string
  kpis: KPI[]
  activity: ActivityItem[]
  team: TeamMember[]
  trend: AreaChartPoint[]
}

const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export function useDashboardData(): DashboardData {
  const db = useAppStore(s => s.db) as Db
  const session = useAppStore(s => s.session)

  const todayStr = today()
  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
  const recs = db.records || []
  const liveRecs = recs.filter(r => !r.fin)
  const todayRecs = recs.filter(r => r.fin && r.inicio?.startsWith(todayStr))
  const todayMin = todayRecs.reduce((s, r) => s + calcMin(r), 0)
  const wdMin = db.config?.wdMin || 480

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

  const liveByEmp = new Map(liveRecs.map(r => [r.empId, r]))
  const team: TeamMember[] = emps.slice(0, 8).map(e => {
    const rec = liveByEmp.get(e.id)
    if (!rec) return { id: e.id, name: e.name, status: 'off', detail: 'Sin jornada hoy' }
    if (rec.enDescanso) return { id: e.id, name: e.name, status: 'break', detail: 'En pausa' }
    return { id: e.id, name: e.name, status: 'active', detail: rec.inicio ? `Desde ${new Date(rec.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'Activo' }
  })

  // Tendencia: minutos trabajados por día en los últimos 7 días, como %
  // sobre la jornada estándar configurada (wdMin) — mismo dato que ya usa
  // la app real, solo re-expresado como serie temporal para el gráfico.
  const trend: AreaChartPoint[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const dayMin = recs.filter(r => r.fin && r.inicio?.startsWith(dStr)).reduce((s, r) => s + calcMin(r), 0)
    trend.push({ label: DOW[d.getDay()], value: Math.min(100, Math.round((dayMin / wdMin) * 100)) })
  }

  const name = session?.user?.name?.split(' ')?.[0] ?? ''
  return {
    greeting: name ? `Buenas, ${name} 👋` : 'Buenas 👋',
    kpis,
    activity,
    team,
    trend,
  }
}
