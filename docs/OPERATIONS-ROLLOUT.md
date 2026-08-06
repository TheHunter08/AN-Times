# Despliegue del paquete operativo

## Centro operativo

La pantalla `Centro operativo` funciona sin infraestructura adicional para:

- revisar sincronización, Realtime y almacenamiento;
- medir cuántos empleados tienen `auth_id`;
- personalizar los KPI del dashboard;
- guardar la configuración de informes programados;
- comprobar la última ejecución confirmada de recordatorios, autocierre, informes y paridad de migración;
- seguir la fase de migración y mantener visible la vía de reversión.

Las programaciones se guardan en `db.config.reportSchedules`. `/api/cron-reports` procesa diariamente los periodos completos, crea de forma idempotente el bucket privado `scheduled-reports` si todavía no existe, genera PDF o Excel y registra el resultado en `db.config.reportRuns`. El periodo queda marcado con `lastRunKey`, por lo que un reintento no vuelve a enviarlo. La migración SQL conserva la misma configuración como infraestructura declarativa, pero el primer arranque no depende de una intervención manual.

Para el envío por correo deben configurarse `RESEND_API_KEY` y `REPORT_FROM_EMAIL`. Sin esas variables el archivo se genera y queda auditado como `generated`, pero no se afirma que haya sido enviado. Los enlaces firmados caducan a los siete días.

## Activación de Supabase Auth/RLS

1. Ejecutar `supabase/auth-readiness.sql` en un entorno de prueba.
2. Completar el email de todos los empleados activos que todavía no lo tengan.
3. Cada empleado crea su cuenta desde `Email` > `Primera vez: crear cuenta` y confirma el enlace recibido. El alta solo acepta emails que ya pertenezcan a un empleado activo.
4. Al primer acceso confirmado, la app vincula de forma segura `employees.auth_id` con `auth.users.id` y rechaza identidades distintas para un empleado ya vinculado.
5. Ejecutar `POST /api/migrate-to-tables` durante al menos siete días distintos. Cada comprobación consistente guarda un checkpoint; repetirla el mismo día no incrementa artificialmente el contador.
6. Confirmar en Centro operativo siete días y siete controles consecutivos sin diferencias.
7. Confirmar que el resultado de readiness es `LISTO_PARA_PRUEBA_CONTROLADA`.
8. Hacer backup de `app_data` y las tablas V2.
9. Aplicar `supabase/policies_auth.sql` primero en staging.
10. Probar empleado, encargado, jefe de obra y administrador, incluyendo acceso PIN, recuperación de contraseña y trabajo offline.
11. Activar en producción solo dentro de una ventana de mantenimiento con rollback preparado.

No se deben eliminar las políticas actuales ni `app_data` antes de completar la vinculación, la equivalencia sostenida y el piloto. Durante toda esta fase el modo permanece en `dual-write`; el rollback consiste en volver a lectura V1 conservando el blob.

`/api/cron-migration-checkpoint` ejecuta cada día una comprobación no destructiva. Compara IDs y recencia de `employees`, `records`, `vacaciones`, `cierres`, `obras` y `app_entities`; permite filas adicionales en tablas, pero bloquea el checkpoint si falta una fila del blob o la copia tabular está obsoleta. Nunca reescribe las tablas ni activa RLS.

El autocierre, los recordatorios y el despertar de sincronización comparten un único workflow semihorario (`operational-crons.yml`). Sustituye cuatro schedules que llegaban a crear 372 jobs diarios y saturaban la cola de runners. Cada paso llama a un endpoint idempotente de producción y se reintenta ante fallos transitorios. `/api/cron-autoclose` mantiene además una ejecución diaria de respaldo en Vercel para que una saturación de GitHub no deje jornadas abiertas indefinidamente.

Los recordatorios tampoco dependen exclusivamente de GitHub: Vercel los invoca mediante cuatro rutas diarias (mañana, mediodía, tarde y noche). Las rutas de tarde y noche ejecutan después, y aunque falle el recordatorio, una comprobación adicional de autocierre. Así el autocierre dispone de tres ventanas diarias de respaldo sin superar los diez crons del plan Hobby. Las rutas separadas toleran la precisión horaria de ese plan porque los procesos son idempotentes: los recordatorios envían únicamente avisos ya vencidos y conservan claves de deduplicación en `notisSent`, mientras que el autocierre ignora cualquier jornada que ya tenga salida.

El cierre mensual usa el mismo generador tanto en el script manual como en `/api/cron-monthly-close`. La ejecución diaria principal está en Vercel, donde dispone de la credencial de servicio de Supabase; el workflow antiguo queda únicamente como respaldo manual. La generación sigue siendo idempotente, conserva el lock optimista del blob y hace upsert de las filas de `cierres` antes de notificar.

## Informes programados

El worker es idempotente y guarda por cada ejecución: `scheduleId`, periodo, formato, estado, fecha, error, ruta privada y número de filas. Un mismo periodo no se envía dos veces aunque el proceso se reintente.
