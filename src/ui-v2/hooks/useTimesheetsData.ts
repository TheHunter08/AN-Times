// Hook de SOLO LECTURA — igual que useDashboardData.ts, conecta la pantalla
// de Fichajes al store real reutilizando las utilidades puras existentes.
import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { ftime, fds, recWorkSecs, mhm } from '../../utils/time.js'
import type { TimesheetRow } from '../pages/Timesheets.js'

interface DbRecord {
  id: string
  empId: string
  empName?: string
  centro?: string
  inicio?: string
  fin?: string | null
}
interface Db {
  records?: DbRecord[]
  config?: { wdMin?: number }
}

export function useTimesheetsData(search: string): TimesheetRow[] {
  const db = useAppStore(s => s.db) as Db
  const wdMin = db.config?.wdMin || 480

  return useMemo(() => {
    const recs = (db.records || []).filter(r => r.fin).slice(-40).reverse()
    const q = search.trim().toLowerCase()
    return recs
      .filter(r => !q || r.empName?.toLowerCase().includes(q) || r.centro?.toLowerCase().includes(q))
      .map(r => {
        const workedMin = Math.floor(recWorkSecs(r) / 60)
        return {
          id: r.id,
          name: r.empName || '—',
          centro: r.centro || 'Sin centro',
          day: fds(r.inicio),
          entrada: ftime(r.inicio),
          salida: ftime(r.fin),
          worked: mhm(workedMin),
          over: workedMin > wdMin,
        }
      })
  }, [db.records, search, wdMin])
}
