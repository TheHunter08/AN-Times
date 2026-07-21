# Despliegue del paquete operativo

## Centro operativo

La pantalla `Centro operativo` funciona sin infraestructura adicional para:

- revisar sincronización, Realtime y almacenamiento;
- medir cuántos empleados tienen `auth_id`;
- personalizar los KPI del dashboard;
- guardar la configuración de informes programados.

Las programaciones se guardan en `db.config.reportSchedules`. No envían correos por sí solas: un proceso de servidor debe leer las programaciones activas, generar el informe y registrar el resultado. La interfaz lo indica expresamente para no prometer automatizaciones inexistentes.

## Activación de Supabase Auth/RLS

1. Ejecutar `supabase/auth-readiness.sql` en un entorno de prueba.
2. Completar el email de todos los empleados activos que todavía no lo tengan.
3. Cada empleado crea su cuenta desde `Email` > `Primera vez: crear cuenta` y confirma el enlace recibido. El alta solo acepta emails que ya pertenezcan a un empleado activo.
4. Al primer acceso confirmado, la app vincula de forma segura `employees.auth_id` con `auth.users.id` y rechaza identidades distintas para un empleado ya vinculado.
5. Confirmar que el resultado de readiness es `LISTO_PARA_PRUEBA_CONTROLADA`.
6. Hacer backup de `app_data` y las tablas V2.
7. Aplicar `supabase/policies_auth.sql` primero en staging.
8. Probar empleado, encargado, jefe de obra y administrador.
9. Activar en producción solo dentro de una ventana de mantenimiento con rollback preparado.

No se deben eliminar las políticas actuales antes de completar la vinculación de todos los usuarios activos.

## Informes programados

El futuro worker debe ser idempotente y guardar por cada ejecución: `scheduleId`, periodo, destinatarios, estado, fecha, error y checksum del archivo. Un mismo periodo no debe enviarse dos veces aunque el proceso se reintente.
