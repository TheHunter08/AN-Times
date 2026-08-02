# Despliegue del paquete operativo

## Centro operativo

La pantalla `Centro operativo` funciona sin infraestructura adicional para:

- revisar sincronización, Realtime y almacenamiento;
- medir cuántos empleados tienen `auth_id`;
- personalizar los KPI del dashboard;
- guardar la configuración de informes programados.

Las programaciones se guardan en `db.config.reportSchedules`. No envían correos por sí solas: un proceso de servidor debe leer las programaciones activas, generar el informe y registrar el resultado. La interfaz lo indica expresamente para no prometer automatizaciones inexistentes.

## Activación de Supabase Auth/RLS

1. Ejecutar `npm run backup:production` y conservar el JSON junto a su checksum fuera del repositorio.
2. Ejecutar `supabase/auth-readiness.sql` y `supabase/launch-security-preflight.sql` en un entorno de prueba.
3. Completar el email de todos los empleados activos que todavía no lo tengan.
4. Cada empleado crea su cuenta desde `Email` > `Primera vez: crear cuenta` y confirma el enlace recibido. El alta solo acepta emails que ya pertenezcan a un empleado activo.
5. Al primer acceso confirmado, la app vincula de forma segura `employees.auth_id` con `auth.users.id` y rechaza identidades distintas para un empleado ya vinculado.
6. Confirmar que `SB_SERVICE_KEY` existe en las funciones servidor y que `npm run verify:rls-readiness` no devuelve bloqueos.
7. Desplegar primero con `VITE_DATA_AUTH_MODE=authenticated`, sin cambiar todavía las políticas, y probar sesiones email, Realtime y sincronización.
8. Aplicar `supabase/policies_auth.sql` primero en staging. El script protege también `app_data`, `push_subs` y el RPC de delta.
9. Probar empleado, encargado, jefe de obra y administrador: entrada, pausa, salida, vacaciones, gastos, chat, documentos, push y cierre.
10. Activar en producción solo dentro de una ventana de mantenimiento. Ante cualquier fallo, ejecutar inmediatamente `supabase/policies_auth_rollback.sql` y volver a `VITE_DATA_AUTH_MODE=phase1-anon`.

No se deben eliminar las políticas actuales antes de completar la vinculación de todos los usuarios activos.

## Informes programados

El futuro worker debe ser idempotente y guardar por cada ejecución: `scheduleId`, periodo, destinatarios, estado, fecha, error y checksum del archivo. Un mismo periodo no debe enviarse dos veces aunque el proceso se reintente.
