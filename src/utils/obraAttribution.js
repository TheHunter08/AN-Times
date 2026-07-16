const normalize = value => String(value ?? '').trim().toLocaleLowerCase('es')

function obraAliases(obra) {
  return new Set([obra?.id, obra?.nombre, obra?.name, obra?.codigo].map(normalize).filter(Boolean))
}

function findObra(value, obras) {
  const key = normalize(value)
  if (!key) return null
  return (obras || []).find(obra => obraAliases(obra).has(key)) || null
}

export function employeeBelongsToObra(employee, obra) {
  const aliases = obraAliases(obra)
  if (aliases.has(normalize(employee?.centroTrabajo)) || aliases.has(normalize(employee?.dept))) return true
  return (employee?.obrasAsignadas || []).some(value => aliases.has(normalize(value)))
}

export function employeeObraOptions(employee, obras, legacyCenters = []) {
  const assignedReferences = employee?.obrasAsignadas || []
  const assignedNames = assignedReferences.map(reference => {
    const obra = findObra(reference, obras)
    return obra?.nombre || obra?.name || obra?.id || String(reference ?? '').trim()
  })
  const current = String(employee?.centroTrabajo || employee?.dept || '').trim()
  const candidates = assignedReferences.length
    ? [...assignedNames, current]
    : [current, ...(legacyCenters || [])]

  const seen = new Set()
  return candidates.filter(value => {
    const key = normalize(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Devuelve la obra inequívoca de un fichaje.
 *
 * Los fichajes modernos llevan el centro/obra que el empleado seleccionó al
 * iniciar la jornada. Para históricos sin esa referencia se admite el fallback
 * de una única obra asignada; con dos o más asignaciones no se adivina para no
 * duplicar horas en varios proyectos.
 */
export function resolveRecordObraId(record, employee, obras) {
  const explicitReferences = [record?.obraId, record?.obra_id, record?.obra, record?.centro]
    .map(value => String(value ?? '').trim())
    .filter(Boolean)

  for (const reference of explicitReferences) {
    const match = findObra(reference, obras)
    if (match) return match.id
  }
  if (explicitReferences.length) return null

  const employeeCenter = findObra(employee?.centroTrabajo || employee?.dept, obras)
  if (employeeCenter) return employeeCenter.id

  const assigned = [...new Set((employee?.obrasAsignadas || [])
    .map(value => findObra(value, obras)?.id)
    .filter(Boolean))]
  return assigned.length === 1 ? assigned[0] : null
}
