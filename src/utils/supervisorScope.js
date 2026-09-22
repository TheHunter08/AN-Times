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
// Un jefe de centro también recibe isAdmin=true (mismo motivo que jefe de
// obra: acceso completo al panel), pero a diferencia de jefe de obra SÍ debe
// quedar acotado — a todo lo adscrito a su centro (obras cuyo centroTrabajo
// coincide con el suyo, y los empleados de esas obras), vía las mismas
// getScopedEmployees/getScopedOnlineRecords que ya usa encargado.
export function isScopedSupervisor(session) {
  const user = session?.user || {}
  if (session?.isJO || user.role === 'jefe_obra') return false
  if (session?.isJefeCentro || user.role === 'jefe_centro') return true
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

// El encargado (a diferencia del jefe de centro) debe coincidir en AMBAS
// dimensiones a la vez: solo gestiona empleados de su misma obra Y su mismo
// centro de trabajo. Un jefe de centro, en cambio, no tiene obras propias
// asignadas — su ámbito es todo el centro, así que para él basta con
// cualquiera de las dos coincidencias (en la práctica, solo la de centro,
// ya que normalmente no tendrá obrasAsignadas).
function isEncargado(supervisor) {
  return supervisor?.role === 'encargado' || (Boolean(supervisor?.isEnc) && supervisor?.role !== 'jefe_centro')
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
  const requireBoth = isEncargado(supervisor)

  return active.filter(employee => {
    const employeeCenter = normalize(employee.centroTrabajo || employee.dept)
    const employeeWorks = assignedWorks(employee)
    const employeeWorkCenters = [...employeeWorks].map(work => centersByWork.get(work)).filter(Boolean)
    const centerMatches = Boolean(supervisorCenter) && (employeeCenter === supervisorCenter || employeeWorkCenters.includes(supervisorCenter) || supervisorObraCenters.includes(employeeCenter))
    const workMatches = supervisorWorks.size > 0 && ([...supervisorWorks].some(work => employeeWorks.has(work)) || supervisorObraCenters.includes(employeeCenter))
    if (requireBoth) return centerMatches && workMatches
    // Jefe de centro (u otro rol acotado sin obras propias): basta con
    // cualquiera de las dos — en la práctica, solo la de centro.
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
  const requireBoth = isEncargado(supervisor)

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
      // El encargado necesita coincidir en las dos dimensiones a la vez; el
      // jefe de centro (sin obras propias) con cualquiera de las dos —
      // ver el comentario equivalente en getScopedEmployees más arriba.
      if (requireBoth) return centerMatches && workMatches
      return centerMatches || workMatches
    })
}
