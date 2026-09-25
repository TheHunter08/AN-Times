// Reconstruye el objeto "empleado" que usan los cron jobs a partir de una
// fila de la tabla `employees` (columnas propias + `data`, la copia
// completa del objeto local — ver toEmployeeRow en tableSyncPlan.js).
// Extraído para poder testearlo: vive fuera de api/ porque Vercel trata
// cualquier .js dentro de esa carpeta como una función desplegable.
export function employeeFromRow(row) {
  return {
    ...(row.data || {}),
    id:row.id,
    name:row.name,
    role:row.role,
    baja:row.baja,
    telefono:row.telefono,
    reminderTime:row.reminder_time,
    salidaTime:row.salida_time,
    // isAdmin: OR con row.data?.isAdmin (no solo la columna `role`) — una
    // ficha de administrador antigua, creada antes de que `role` existiera
    // como columna propia, puede tener isAdmin:true en `data` sin que la
    // columna llegara sincronizada a 'admin'. Sobrescribirlo solo con
    // row.role la dejaría fuera, en silencio, de recordatorios y resúmenes
    // que solo se envían a administradores.
    isAdmin:row.role === 'admin' || row.data?.isAdmin === true,
  }
}
