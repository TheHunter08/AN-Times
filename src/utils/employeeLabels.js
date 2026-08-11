// Cuando dos empleados comparten el mismo nombre completo, un <select>
// nativo (o cualquier lista de solo texto) los deja indistinguibles. Añade
// el centro de trabajo — o, si no hay, el id — solo a quienes colisionan.
export function buildDuplicateNameLabels(employees) {
  const labels = new Map()
  for (const e of employees) {
    const collides = employees.some(other => other.id !== e.id && other.name === e.name)
    labels.set(e.id, collides ? `${e.name} (${e.dept || e.id})` : e.name)
  }
  return labels
}
