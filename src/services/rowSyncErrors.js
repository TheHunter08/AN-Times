// Los errores SQLSTATE 22xxx (datos/formato) y 23xxx
// (integridad/FK/UNIQUE) no mejoran repitiendo el mismo payload.
// Permisos, RLS, esquema y red sí pueden recuperarse sin editar la fila.
export function isPermanentRowError(error) {
  return /^(22|23)/.test(error?.code || '')
}
