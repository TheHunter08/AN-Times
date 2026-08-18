function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('es')
}

// El jefe de obra ya recibe acceso completo de administrador al iniciar
// sesión (session.isAdmin=true en LoginV2, todas las PAGES visibles en
// AppV2Admin) — solo el encargado queda restringido a su centro/obra. Antes
// isJO se trataba igual que isEnc aquí, así que un jefe de obra con acceso
// de página completo solo veía a un subconjunto de sus empleados en
// Planning, Fichajes, Solicitudes, etc.
// Se excluye jefe_obra explícitamente (no solo "no lo cuenta como scoped"):
// un empleado ascendido de encargado a jefe de obra sin que se limpiara el
// booleano legacy `isEnc` (_roleFlagsFromProfile en appStore.js hace
// isEnc:role==='encargado'||!!profile?.isEnc, así que un `isEnc` antiguo
// persiste aunque el rol ya sea otro) volvía a quedar restringido pese a
// tener acceso completo — justo el mismo síntoma para jefe de obra que el
// bug de arriba para encargado.
export function isScopedSupervisor(session) {
  const user = session?.user || {}
  if (session?.isJO || user.role === 'jefe_obra') return false
  return Boolean(session?.isEnc || user.role === 'encargado')
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

  // Centros a los que pertenecen las obras asignadas al supervisor.
  // Si el supervisor tiene obra X y la obra X tiene centroTrabajo C,
  // los empleados con centroTrabajo C también son de su ámbito aunque
  // no tengan esa obra en obrasAsignadas.
  const supervisorObraCenters = [...supervisorWorks].map(w => centersByWork.get(w)).filter(Boolean)

  return active.filter(employee => {
    const employeeCenter = normalize(employee.centroTrabajo || employee.dept)
    const employeeWorks = assignedWorks(employee)
    const employeeWorkCenters = [...employeeWorks].map(work => centersByWork.get(work)).filter(Boolean)
    const centerMatches = Boolean(supervisorCenter) && (employeeCenter === supervisorCenter || employeeWorkCenters.includes(supervisorCenter) || supervisorObraCenters.includes(employeeCenter))
    const workMatches = supervisorWorks.size > 0 && ([...supervisorWorks].some(work => employeeWorks.has(work)) || supervisorObraCenters.includes(employeeCenter))
    // Cuando el supervisor tiene AMBAS dimensiones (centro y obras), basta con
    // que el empleado encaje en cualquiera de las dos — antes se exigían las
    // dos a la vez, así que un empleado asignado solo por obra (sin
    // centroTrabajo igual al del supervisor) o solo por centro (sin ninguna
    // de las obras del supervisor) desaparecía del directorio aunque
    // perteneciera realmente a su equipo.
    return centerMatches || workMatches
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
      const centerMatches = Boolean(supervisorCenter) && (
        employeeCenter === supervisorCenter ||
        recordCenter === supervisorCenter ||
        employeeWorkCenters.includes(supervisorCenter) ||
        recordWorkCenter === supervisorCenter)

      // supervisorWorks puede contener nombres o IDs; recordWorkId es siempre
      // el ID (convertido por workNames). Se comprueba también recordCenter
      // (el nombre en bruto) por si obrasAsignadas guarda nombres.
      const supervisorObraCenters = [...supervisorWorks].map(wId => centersByWork.get(wId)).filter(Boolean)
      const workMatches = supervisorWorks.size > 0 && (
        [...supervisorWorks].some(workId => employeeWorks.has(workId)) ||
        supervisorWorks.has(recordWorkId) ||
        supervisorWorks.has(recordCenter) ||
        supervisorObraCenters.includes(employeeCenter) ||
        supervisorObraCenters.includes(recordCenter))

      // Sin ninguna asignación no se abre accidentalmente el acceso a todo.
      if (!supervisorCenter && supervisorWorks.size === 0) return false
      // Con las dos dimensiones configuradas, basta con que encaje en
      // cualquiera de las dos — ver el comentario equivalente en
      // getScopedEmployees más arriba.
      return centerMatches || workMatches
    })
}
