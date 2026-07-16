function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('es')
}

function assignedWorks(employee) {
  return new Set((employee?.obrasAsignadas || []).map(normalize).filter(Boolean))
}

export function getScopedEmployees({ employees = [], supervisor, unrestricted = false }) {
  const active = employees.filter(employee => employee && !employee.baja && !employee.isAdmin && employee.role !== 'admin')
  if (unrestricted) return active

  const supervisorCenter = normalize(supervisor?.centroTrabajo || supervisor?.dept)
  const supervisorWorks = assignedWorks(supervisor)
  if (!supervisorCenter && supervisorWorks.size === 0) return []

  return active.filter(employee => {
    const employeeCenter = normalize(employee.centroTrabajo || employee.dept)
    const employeeWorks = assignedWorks(employee)
    const centerMatches = !supervisorCenter || employeeCenter === supervisorCenter
    const workMatches = supervisorWorks.size === 0 || [...supervisorWorks].some(work => employeeWorks.has(work))
    return centerMatches && workMatches
  })
}

/**
 * Devuelve los fichajes abiertos que pertenecen al ámbito del supervisor.
 * Si tiene centro y obras asignadas, ambos deben coincidir para evitar fugas
 * de información entre centros u obras.
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

  return records
    .filter(record => record && !record.fin && record.inicio)
    .map(record => ({ record, employee: employeeById.get(record.empId) }))
    .filter(({ employee }) => employee && !employee.baja)
    .filter(({ record, employee }) => {
      if (unrestricted) return true

      const employeeCenter = normalize(employee.centroTrabajo || employee.dept)
      const recordCenter = normalize(record.centro)
      const centerMatches = !supervisorCenter || employeeCenter === supervisorCenter || recordCenter === supervisorCenter

      const employeeWorks = assignedWorks(employee)
      const recordWorkId = workNames.get(recordCenter) || recordCenter
      const workMatches = supervisorWorks.size === 0 ||
        [...supervisorWorks].some(workId => employeeWorks.has(workId)) ||
        supervisorWorks.has(recordWorkId)

      // Sin ninguna asignación no se abre accidentalmente el acceso a todo.
      if (!supervisorCenter && supervisorWorks.size === 0) return false
      return centerMatches && workMatches
    })
}
