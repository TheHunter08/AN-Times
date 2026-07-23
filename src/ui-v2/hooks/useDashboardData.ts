// Hook de SOLO LECTURA — conecta el Dashboard de ui-v2 al store real de la
// app (useAppStore) sin tocar lógica de negocio, escrituras ni Supabase.
// Reutiliza las mismas utilidades puras (today/calcMin/mhm) que ya usa
// PanelDashboard.jsx en la app real, para no duplicar ni divergir cálculos.
import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { today, calcMin, mhm, localDateStr } from '../../utils/time.js'
import type { KPI, ActivityItem } from '../pages/Dashboard.js'
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
interface DbVac {
  empId?: string
  estado?: string
  fechaInicio?: string
  fechaFin?: string
}
interface Db {
  employees?: DbEmployee[]
  records?: DbRecord[]
  vacaciones?: DbVac[]
  audit?: { action: string; detail?: string; user?: string; ts?: string }[]
  config?: { wdMin?: number }
}

export interface DashboardData {
  greeting: string
  kpis: KPI[]
  activity: ActivityItem[]
  trend: AreaChartPoint[]
  compareTrend: AreaChartPoint[]
}

const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function activityTone(action = ''): ActivityItem['tone'] {
  const a = action.toLowerCase()
  if (a.includes('entrada') || a.includes('jornada') || a.includes('inicio') || a.includes('aprobad')) return 'green'
  if (a.includes('salida') || a.includes('rechazad') || a.includes('baja') || a.includes('error')) return 'red'
  if (a.includes('pausa') || a.includes('descanso') || a.includes('solicitud') || a.includes('pendiente')) return 'orange'
  if (a.includes('vacac') || a.includes('mensaje') || a.includes('chat')) return 'purple'
  return 'gray'
}

export function useDashboardData(): DashboardData {
  const db = useAppStore(s => s.db) as Db
  const session = useAppStore(s => s.session)

  const computed = useMemo(() => {
    const todayStr = today()
    const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
    const wdMin = db.config?.wdMin || 480
    const dayMinutes = new Map<string, number>()
    const presentTodayIds = new Set<string>()
    let workingCount = 0
    let breakCount = 0

    for (const record of db.records || []) {
      if (!record.fin) {
        presentTodayIds.add(record.empId)
        record.enDescanso ? breakCount++ : workingCount++
        continue
      }
      if (!record.inicio) continue
      // La fecha local se calcula una sola vez por registro, no una vez por
      // cada punto de las dos gráficas semanales.
      const day = localDateStr(new Date(record.inicio))
      const minutes = calcMin(record)
      dayMinutes.set(day, (dayMinutes.get(day) || 0) + minutes)
      if (day === todayStr) presentTodayIds.add(record.empId)
    }

    const buildTrend = (offsetWeeks: number): AreaChartPoint[] => {
      const result: AreaChartPoint[] = []
      for (let i = 6; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i - offsetWeeks * 7)
        const dayMin = dayMinutes.get(localDateStr(date)) || 0
        result.push({ label:DOW[date.getDay()], value:Math.min(100, Math.round((dayMin / wdMin) * 100)) })
      }
      return result
    }

    // Un empleado de vacaciones aprobadas hoy no fichó, pero tampoco está
    // "ausente" (sin justificar) — sin este filtro, "Ausentes hoy" contaba
    // igual a alguien de vacaciones que a alguien que simplemente no fichó.
    const onLeaveTodayIds = new Set(
      (db.vacaciones || [])
        .filter(v => v.estado === 'aprobada' && v.empId && v.fechaInicio && v.fechaFin && v.fechaInicio <= todayStr && todayStr <= v.fechaFin)
        .map(v => v.empId as string)
    )
    const absentCount = emps.filter(e => !presentTodayIds.has(e.id) && !onLeaveTodayIds.has(e.id)).length

    const kpis: KPI[] = [
      { label:'Empleados activos', value:String(emps.length), tone:'primary' },
      { label:'Trabajando ahora', value:String(workingCount), tone:'cyan' },
      { label:'En descanso', value:String(breakCount), tone:'amber' },
      { label:'Ausentes hoy', value:String(absentCount), tone:'accent' },
      { label:'Horas trabajadas hoy', value:mhm(dayMinutes.get(todayStr) || 0), tone:'primary' },
    ]
    const activity: ActivityItem[] = (db.audit || []).slice(-10).reverse().map((entry, index) => ({
      id:String(index),
      text:`${entry.action}${entry.detail ? ` — ${entry.detail}` : ''}${entry.user ? ` · ${entry.user}` : ''}`,
      time:entry.ts ? new Date(entry.ts).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' }) : '',
      tone:activityTone(entry.action),
    }))
    return { kpis, activity, trend:buildTrend(0), compareTrend:buildTrend(1) }
  }, [db.employees, db.records, db.vacaciones, db.audit, db.config?.wdMin])

  const name = session?.user?.name?.split(' ')?.[0] ?? ''
  return {
    greeting: name ? `Buenos días, ${name}` : 'Buenos días',
    ...computed,
  }
}
