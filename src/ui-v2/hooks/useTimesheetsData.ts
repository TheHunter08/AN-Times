// Hook de SOLO LECTURA — igual que useDashboardData.ts, conecta la pantalla
// de Fichajes al store real reutilizando las utilidades puras existentes.
import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { ftime, fds, recWorkSecs, mhm } from '../../utils/time.js'
import { getScopedEmployees, isScopedSupervisor } from '../../utils/supervisorScope.js'
import type { TimesheetRow } from '../pages/Timesheets.js'

interface DbRecord {
  id: string
  empId: string
  empName?: string
  centro?: string
  inicio?: string
  fin?: string | null
  creadoPor?: string
  cerradoPor?: string
  motivoCierre?: string
  validadoBy?: string
  correcciones?: unknown[]
}
interface Db {
  records?: DbRecord[]
  employees?: { id: string; name: string; centroTrabajo?: string }[]
  obras?: unknown[]
  config?: { wdMin?: number }
}

export function useTimesheetsData(search: string): TimesheetRow[] {
  const db = useAppStore(s => s.db) as Db
  const session = useAppStore(s => s.session) as any
  const wdMin = db.config?.wdMin || 480
  const isScopedRole = isScopedSupervisor(session)

  return useMemo(() => {
    const employees = isScopedRole
      ? getScopedEmployees({ employees: (db.employees || []) as any, obras: (db.obras || []) as any, supervisor: session?.user, unrestricted: false })
      : (db.employees || [])
    const employeesById = new Map(employees.map(employee => [employee.id, employee]))
    const recs = (db.records || [])
      .filter(r => r.fin && (!isScopedRole || employeesById.has(r.empId)))
      .sort((a, b) => String(b.inicio || '').localeCompare(String(a.inicio || '')))
    const q = search.trim().toLowerCase()
    return recs
      .map(r => {
        const employee = employeesById.get(r.empId)
        const employeeName = employee?.name || r.empName || '—'
        const centro = r.centro || employee?.centroTrabajo || 'Sin centro'
        const workedMin = Math.floor(recWorkSecs(r) / 60)
        return {
          id: r.id,
          name: employeeName,
          centro,
          day: fds(r.inicio),
          entrada: ftime(r.inicio),
          salida: ftime(r.fin),
          worked: mhm(workedMin),
          over: workedMin > wdMin,
          history: [
            r.creadoPor ? `Iniciada por ${r.creadoPor}` : 'Iniciada por el empleado',
            r.cerradoPor ? `Finalizada por ${r.cerradoPor}${r.motivoCierre ? `: ${r.motivoCierre}` : ''}` : 'Finalizada por el empleado',
            r.validadoBy ? `Validada por ${r.validadoBy}` : '',
            r.correcciones?.length ? `${r.correcciones.length} corrección${r.correcciones.length === 1 ? '' : 'es'}` : '',
          ].filter(Boolean).join(' · '),
        }
      })
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.centro.toLowerCase().includes(q))
  }, [db.records, db.employees, db.obras, session, isScopedRole, search, wdMin])
}
