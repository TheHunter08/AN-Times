import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore.js'
import type { EmployeeRow } from '../pages/Employees.js'
import { mhm, calcMin, today, localDateStr } from '../../utils/time.js'

interface DbEmployee {
  id: string
  name: string
  dept?: string
  role?: string
  baja?: boolean
  isAdmin?: boolean
  email?: string
  telefono?: string
  phone?: string
  centroTrabajo?: string
  reminderTime?: string
  obrasAsignadas?: string[]
  isEnc?: boolean
  isJO?: boolean
}
interface DbRecord {
  empId: string
  inicio?: string
  fin?: string | null
  enDescanso?: boolean
  centro?: string
}

export function useEmployeesData() {
  const db = useAppStore(s => s.db) as { employees?: DbEmployee[]; records?: DbRecord[]; obras?: any[] }
  return useMemo(() => {
    const emps  = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
    const recs  = db.records || []
    const obras = db.obras || []
    const todayStr = today()
    const liveByEmployee = new Map<string, DbRecord>()
    const minutesTodayByEmployee = new Map<string, number>()
    const obrasById = new Map(obras.map((obra: any) => [obra.id, obra]))

    for (const record of recs) {
      if (!record.fin) {
        if (!liveByEmployee.has(record.empId)) liveByEmployee.set(record.empId, record)
        continue
      }
      if (record.inicio && localDateStr(new Date(record.inicio)) === todayStr) {
        minutesTodayByEmployee.set(
          record.empId,
          (minutesTodayByEmployee.get(record.empId) || 0) + calcMin(record),
        )
      }
    }

    return emps.map((e): EmployeeRow => {
    const liveRec  = liveByEmployee.get(e.id)
    // localDateStr(new Date(r.inicio)) (no r.inicio?.startsWith(todayStr)): inicio se
    // guarda en UTC, todayStr es local — un fichaje nocturno no contaba en "hoy".
    const todayMin = minutesTodayByEmployee.get(e.id) || 0

    let status: EmployeeRow['status'] = 'off'
    if (liveRec) status = liveRec.enDescanso ? 'break' : 'active'

    // e.role || isEnc/isJO (no solo e.role): algunos empleados solo tienen el
    // modelo legacy de rol marcado por estos booleans, sin el campo role
    // string — igual que ya contempla EmployeesPage.openEdit al editar.
    const resolvedRole = e.role || (e.isAdmin ? 'admin' : e.isEnc ? 'encargado' : e.isJO ? 'jefe_obra' : 'empleado')
    const roleLabel =
      resolvedRole === 'empleado'    ? 'Empleado' :
      resolvedRole === 'encargado'   ? 'Encargado' :
      resolvedRole === 'jefe_obra'   ? 'Jefe de obra' :
      resolvedRole === 'admin'       ? 'Administrador' :
      resolvedRole || '—'

    const obrasNames = (e.obrasAsignadas || [])
      .map((id: string) => obrasById.get(id)?.nombre || id)
      .filter(Boolean)

    return {
      id: e.id,
      name: e.name,
      dept: e.centroTrabajo || e.dept || '—',
      role: roleLabel,
      status,
      horasHoy: todayMin > 0 ? mhm(todayMin) : undefined,
      // Solo mostrar "ubicación actual" cuando de verdad está fichado ahora —
      // si no, duplicaba visualmente el mismo texto que "dept" (centroTrabajo).
      location: liveRec?.centro || undefined,
      email: e.email || undefined,
      phone: e.telefono || e.phone || undefined,
      obrasAsignadas: obrasNames.length ? obrasNames : undefined,
      centroTrabajo: e.centroTrabajo || undefined,
    }
    })
  }, [db.employees, db.records, db.obras])
}
