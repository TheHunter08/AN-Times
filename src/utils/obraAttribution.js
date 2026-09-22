const normalize = value => String(value ?? '').trim().toLocaleLowerCase('es')

function obraAliases(obra) {
  return new Set([obra?.id, obra?.nombre, obra?.name, obra?.codigo].map(normalize).filter(Boolean))
}

export function findObra(value, obras) {
  const key = normalize(value)
  if (!key) return null
  return (obras || []).find(obra => obraAliases(obra).has(key)) || null
}

export function employeeBelongsToObra(employee, obra) {
  const aliases = obraAliases(obra)
  if (aliases.has(normalize(employee?.centroTrabajo)) || aliases.has(normalize(employee?.dept))) return true
  return (employee?.obrasAsignadas || []).some(value => aliases.has(normalize(value)))
}

function dedupe(values) {
  const seen = new Set()
  return values.filter(value => {
    const key = normalize(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Cambio de modelo: al fichar, el empleado SOLO elige una obra — nunca su
// centro de trabajo directamente, aunque ese campo se siga usando para
// clasificar/agrupar empleados y obras. Con obras asignadas directamente
// (obrasAsignadas), se ofrecen esas. Sin ninguna, se ofrecen las obras
// ADSCRITAS a su centro de trabajo (mismo vínculo obra→centro que ya usa
// supervisorScope.js) — nunca el nombre del centro en sí. Un empleado sin
// obra propia ni obra adscrita a su centro no tiene ninguna opción para
// fichar: hace falta que un admin le asigne una obra.
export function employeeObraOptions(employee, obras) {
  const assignedReferences = employee?.obrasAsignadas || []
  if (assignedReferences.length) {
    return dedupe(assignedReferences.map(reference => {
      const obra = findObra(reference, obras)
      return obra?.nombre || obra?.name || obra?.id || String(reference ?? '').trim()
    }))
  }

  const employeeCenter = normalize(employee?.centroTrabajo || employee?.dept)
  if (!employeeCenter) return []
  return dedupe((obras || [])
    .filter(obra => normalize(obra?.centroTrabajo) === employeeCenter)
    .map(obra => obra?.nombre || obra?.name || obra?.id))
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
