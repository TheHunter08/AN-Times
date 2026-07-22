function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('es')
}

export function isScopedSupervisor(session) {
  const user = session?.user || {}
  return Boolean(session?.isEnc || session?.isJO || user.role === 'encargado' || user.role === 'jefe_obra')
}

function assignedWorks(employee) {
  return new Set((employee?.obrasAsignadas || []).map(normalize).filter(Boolean))
}

// Centro de trabajo al que está adscrita cada obra (campo opcional en la
// ficha de la obra, ver ObraModal/ObrasPage) — permite que un supervisor
// con centro asignado vea también a los empleados de las obras adscritas a
// ese centro, sin tener que replicar manualmente el centro en cada
// empleado uno a uno además de marcarle la obra.
function obraCenterMap(obras) {
  const map = new Map()
  for (const obra of obras || []) {
    const center = normalize(obra?.centroTrabajo)
    if (!center) continue
    const id = normalize(obra?.id)
    const name = normalize(obra?.nombre || obra?.name)
    if (id) map.set(id, center)
    if (name) map.set(name, center)
  }
  return map
}

export function getScopedEmployees({ employees = [], obras = [], supervisor, unrestricted = false }) {
  const active = employees.filter(employee => employee && !employee.baja && !employee.isAdmin && employee.role !== 'admin')
  if (unrestricted) return active

  const supervisorCenter = normalize(supervisor?.centroTrabajo || supervisor?.dept)
  const supervisorWorks = assignedWorks(supervisor)
  if (!supervisorCenter && supervisorWorks.size === 0) return []

  const centersByWork = obraCenterMap(obras)

  return active.filter(employee => {
    const employeeCenter = normalize(employee.centroTrabajo || employee.dept)
    const employeeWorks = assignedWorks(employee)
    const employeeWorkCenters = [...employeeWorks].map(work => centersByWork.get(work)).filter(Boolean)
    const centerMatches = !supervisorCenter || employeeCenter === supervisorCenter || employeeWorkCenters.includes(supervisorCenter)
    const workMatches = supervisorWorks.size === 0 || [...supervisorWorks].some(work => employeeWorks.has(work))
    return centerMatches && workMatches
  })
}

/**
 * Devuelve los fichajes abiertos que pertenecen al ámbito del supervisor.
 * Si tiene centro y obras asignadas, ambos deben coincidir para evitar fugas
 * de información entre centros u obras — salvo que la propia obra del
 * empleado/fichaje esté adscrita al centro del supervisor (obraCenterMap),
 * en cuyo caso ese vínculo cuenta también como coincidencia de centro.
 */
export function getScopedOnlineRecords({ records = [], employees = [], obras = [], supervisor, unrestricted = false }) {
  const employeeById = new Map(employees.map(employee => [employee.id, employee]))
  const supervisorCenter = normalize(supervisor?.centroTrabajo || supervisor?.dept)
  const supervisorWorks = assignedWorks(supervisor)
  const workNames = new Map(obras.flatMap(work => {
    const id = normalize(work.id)
    const name = normalize(work.nombre || work.name)
    return [[id, id], [name, id]].filter(([key]) => key)
  }))
  const centersByWork = obraCenterMap(obras)

  return records
    .filter(record => record && !record.fin && record.inicio)
    .map(record => ({ record, employee: employeeById.get(record.empId) }))
    .filter(({ employee }) => employee && !employee.baja)
    .filter(({ record, employee }) => {
      if (unrestricted) return true

      const employeeCenter = normalize(employee.centroTrabajo || employee.dept)
      const recordCenter = normalize(record.centro)
      const employeeWorks = assignedWorks(employee)
      const recordWorkId = workNames.get(recordCenter) || recordCenter

      const employeeWorkCenters = [...employeeWorks].map(work => centersByWork.get(work)).filter(Boolean)
      const recordWorkCenter = centersByWork.get(recordWorkId)
      const centerMatches = !supervisorCenter ||
        employeeCenter === supervisorCenter ||
        recordCenter === supervisorCenter ||
        employeeWorkCenters.includes(supervisorCenter) ||
        recordWorkCenter === supervisorCenter

      const workMatches = supervisorWorks.size === 0 ||
        [...supervisorWorks].some(workId => employeeWorks.has(workId)) ||
        supervisorWorks.has(recordWorkId)

      // Sin ninguna asignación no se abre accidentalmente el acceso a todo.
      if (!supervisorCenter && supervisorWorks.size === 0) return false
      return centerMatches && workMatches
    })
}
