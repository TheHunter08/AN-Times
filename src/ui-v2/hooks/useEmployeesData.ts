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
  const emps  = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
  const recs  = db.records || []
  const obras = db.obras || []
  const todayStr = today()

  return emps.map((e): EmployeeRow => {
    const liveRec  = recs.find(r => r.empId === e.id && !r.fin)
    // localDateStr(new Date(r.inicio)) (no r.inicio?.startsWith(todayStr)): inicio se
    // guarda en UTC, todayStr es local — un fichaje nocturno no contaba en "hoy".
    const todayMin = recs
      .filter(r => r.empId === e.id && r.fin && r.inicio && localDateStr(new Date(r.inicio)) === todayStr)
      .reduce((s, r) => s + calcMin(r), 0)

    let status: EmployeeRow['status'] = 'off'
    if (liveRec) status = liveRec.enDescanso ? 'break' : 'active'

    const roleLabel =
      e.role === 'empleado'    ? 'Empleado' :
      e.role === 'encargado'   ? 'Encargado' :
      e.role === 'jefe_obra'   ? 'Jefe de obra' :
      e.role === 'admin'       ? 'Administrador' :
      e.role || '—'

    const obrasNames = (e.obrasAsignadas || [])
      .map((id: string) => obras.find((o: any) => o.id === id)?.nombre || id)
      .filter(Boolean)

    return {
      id: e.id,
      name: e.name,
      dept: e.centroTrabajo || e.dept || '—',
      role: roleLabel,
      status,
      horasHoy: todayMin > 0 ? mhm(todayMin) : undefined,
      location: liveRec?.centro || e.centroTrabajo || undefined,
      email: e.email || undefined,
      phone: e.telefono || e.phone || undefined,
      obrasAsignadas: obrasNames.length ? obrasNames : undefined,
      centroTrabajo: e.centroTrabajo || undefined,
    }
  })
}
