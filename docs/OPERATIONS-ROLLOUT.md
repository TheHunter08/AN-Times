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
2. El empleado se identifica primero con su PIN. Si no tiene email, `auth_id` verificado o confirmación pendiente, la app bloquea el acceso normal y abre la activación obligatoria.
3. El empleado introduce o confirma su email y crea su contraseña. El servidor vuelve a comprobar el PIN, crea o recupera la identidad confirmada en Supabase Auth y enlaza la ficha de forma inmediata; no se utiliza una contraseña común ni se depende del correo para el alta inicial.
4. Al primer acceso confirmado, la app vincula de forma segura `employees.auth_id` con `auth.users.id` y rechaza identidades distintas para un empleado ya vinculado.
5. Ejecutar `POST /api/migrate-to-tables` durante al menos siete días distintos. Cada comprobación consistente guarda un checkpoint; repetirla el mismo día no incrementa artificialmente el contador.
6. Confirmar en Centro operativo siete días y siete controles consecutivos sin diferencias.
7. Confirmar que el resultado de readiness es `LISTO_PARA_PRUEBA_CONTROLADA`.
8. Hacer backup de `app_data` y las tablas V2.
9. Aplicar primero en staging, por orden, `migration-2026-08-11-documentos-firma-access.sql`, `migration-2026-08-11-legal-acknowledgements.sql`, `migration-2026-08-11-auth-rls-runtime.sql` y finalmente `policies_auth.sql`.
10. Probar empleado, encargado, jefe de obra y administrador mediante Auth oficial, incluyendo recuperación de contraseña, trabajo offline y cierre de sesión en un dispositivo compartido. El PIN no es una vía de acceso válida en modo Auth/RLS.
11. Activar en producción solo dentro de una ventana de mantenimiento con rollback preparado.

No se deben eliminar las políticas actuales ni `app_data` antes de completar la vinculación, la equivalencia sostenida y el piloto. Durante toda esta fase el modo permanece en `dual-write`; el rollback consiste en volver a lectura V1 conservando el blob.

### Estado del corte de producción de 2026-08-11

- Migraciones preparatorias de documentos, evidencia legal y runtime Auth/RLS: aplicadas.
- Acceso obligatorio de activación: desplegado en `https://times-inc.vercel.app` en modo transitorio.
- Supabase Auth: email habilitado y confirmado, `Site URL` y redirección permitida corregidas a `https://times-inc.vercel.app`.
- Correo de Auth: SMTP propio pendiente. Ya no limita las altas iniciales, que son inmediatas tras verificar el PIN, pero sigue siendo necesario para recuperación de contraseña y avisos de seguridad sin el límite básico de dos mensajes por hora.
- Protección del alta: cinco intentos de PIN y bloqueo persistente de quince minutos; correo único, contraseña individual y auditoría de cada activación.
- Continuidad del alta tras RLS: desplegada en producción (`dpl_JD1tEu62LvCe6Ho5GNhx5zBZca3P`). El buscador público devuelve solo `id`, nombre, centro y longitud del PIN para un texto de al menos dos caracteres; nunca expone email, `auth_id`, empresa, PIN ni hash. La verificación utiliza `employee_pin_archive` cuando el corte ya ha retirado el hash de `employees`.
- Alta del administrador: el alias configurado ya no concede una sesión administrativa sin identidad enlazada. Desde `dpl_DdKEucP9EMnagt9xBRDQ9Kh9F633`, el administrador también debe elegir `Primera vez: vincular mi cuenta`, buscar su ficha y acreditar su PIN; solo entonces el servidor crea o recupera Supabase Auth y guarda `employees.auth_id`. Este paso evita que el corte RLS deje al administrador autenticado pero sin permisos sobre los datos.
- Revocación de sesiones heredadas: `dpl_F5mW33GZZXFT967J5Ap6gsVytC2q` rechaza sesiones oficiales antiguas con `isAdmin` pero sin ficha, aunque el correo continúe en `adminEmails`. También compara cualquier indicador `isAdmin`, `isJO` o `isEnc` guardado en el navegador con el rol actual de la ficha enlazada; modificar `localStorage` no concede privilegios.
- Paridad V1/V2: consistente, sin faltantes ni filas obsoletas; cuatro checkpoints diarios consecutivos registrados.
- Backup posterior a la migración: verificado y restaurable (`backup-2026-08-11T22-49-31-854Z.json`, SHA-256 `dce27874f5e894d674ff125cc4e5d55b85a03d26ed61d7f10675b1478f868261`).
- RLS final: pendiente. No aplicar `policies_auth.sql` ni activar el sello hasta alcanzar siete checkpoints distintos y vincular todos los empleados activos.
- Alcance del encargado: la función aditiva `auth_can_supervise_employee` ya está instalada, con ejecución revocada a `anon`. Cruza empresa, centro y obras asignadas; excluye al propio encargado, administradores y perfiles dados de baja. Las políticas finales para empleados, fichajes, vacaciones, cierres y entidades del panel están preparadas, pero no se activan antes del corte RLS. En producción se validó dentro de una transacción reversible que un empleado coincidente devuelve `true`, uno ajeno devuelve `false` y que el SQL final completo compila contra el esquema real.
- Versión transitoria actual: Times INC `4.5.1`, publicada en `https://times-inc.vercel.app`. La integración compila con TypeScript limpio, 478 pruebas unitarias y 2 E2E Auth/RLS; el chequeo posterior mantiene 7/7 automatizaciones sanas y paridad tabular sin faltantes ni obsoletos.

Auditoría final de la integración 4.5.1: producción responde `healthy`, las siete automatizaciones están sanas y la paridad V1/V2 mantiene cero faltantes y cero filas obsoletas. Continúan 12 perfiles activos, 2 identidades verificadas y 10 activaciones personales pendientes. No existen vínculos duplicados ni huérfanos. Hay al menos un `jefe_obra` vinculado, pero el perfil con rol `admin` todavía no ha completado su activación; el corte final sigue bloqueado para no perder el acceso administrativo principal. El 11 de agosto se volvió a ejecutar `policies_auth.sql` completo dentro de `BEGIN`/`ROLLBACK` contra producción: compiló correctamente, la transacción devolvió `POLICIES_AUTH_TRANSACTION_OK` y una consulta posterior confirmó cero políticas finales activas y catorce políticas transitorias conservadas.

El checkpoint del 12 de agosto detectó y corrigió una comparación de fecha UTC en el contador diario. Desde esta revisión, el día operativo se calcula explícitamente en `Europe/Madrid` y se conserva `lastCountedDay`, evitando tanto perder una comprobación hecha después de medianoche como contar dos veces al cruzar la medianoche UTC. El primer checkpoint afectado se reparó de 3 a 4 únicamente después de repetir la paridad con cero faltantes y cero filas obsoletas; la reparación quedó identificada en `migrationVerification.timezoneRepair`.

Documentos históricos: se recalculó y guardó la huella SHA-256 del único PDF firmado que conservaba el artefacto pero no su integridad. Dos registros legacy de jornada de junio de 2026 contienen la imagen de firma, pero nunca guardaron PDF, `data`, URL ni ruta de Storage. La versión de producción `dpl_6qc4ha68nJTYzxkxuqgx7dA1UAPh` los mantiene pendientes y ofrece `Reparar firma`: tras la acción expresa del empleado reconstruye un PDF sin firma desde el cierre mensual canónico, estampa una firma nueva con fecha actual, calcula ambas huellas y guarda el artefacto en Storage. La firma antigua nunca se reutiliza silenciosamente como evidencia nueva.

`/api/cron-migration-checkpoint` ejecuta cada día una comprobación no destructiva. Compara IDs y recencia de `employees`, `records`, `vacaciones`, `cierres`, `obras` y `app_entities`; permite filas adicionales en tablas, pero bloquea el checkpoint si falta una fila del blob o la copia tabular está obsoleta. Nunca reescribe las tablas ni activa RLS.

El autocierre, los recordatorios y el despertar de sincronización comparten un único workflow semihorario (`operational-crons.yml`). Sustituye cuatro schedules que llegaban a crear 372 jobs diarios y saturaban la cola de runners. Cada paso llama a un endpoint idempotente de producción y se reintenta ante fallos transitorios. `/api/cron-autoclose` mantiene además una ejecución diaria de respaldo en Vercel para que una saturación de GitHub no deje jornadas abiertas indefinidamente.

Los recordatorios tampoco dependen exclusivamente de GitHub: Vercel los invoca mediante cuatro rutas diarias (mañana, mediodía, tarde y noche). Las rutas de tarde y noche ejecutan después, y aunque falle el recordatorio, una comprobación adicional de autocierre. Así el autocierre dispone de tres ventanas diarias de respaldo sin superar los diez crons del plan Hobby. Las rutas separadas toleran la precisión horaria de ese plan porque los procesos son idempotentes: los recordatorios envían únicamente avisos ya vencidos y conservan claves de deduplicación en `notisSent`, mientras que el autocierre ignora cualquier jornada que ya tenga salida.

El cierre mensual usa el mismo generador tanto en el script manual como en `/api/cron-monthly-close`. La ejecución diaria principal está en Vercel, donde dispone de la credencial de servicio de Supabase; el workflow antiguo queda únicamente como respaldo manual. La generación sigue siendo idempotente, conserva el lock optimista del blob y hace upsert de las filas de `cierres` antes de notificar.

Los workflows antiguos `anomaly-detector`, `weekly-summary` y `supabase-keepalive` ya no tienen programación propia. Sus disparos manuales delegan en los endpoints seguros de Vercel (`cron-autoclose`, `cron-reminders` y `health`) y no leen ni escriben `app_data` con la clave anónima. El backup de GitHub también delega en `/api/backup`, que guarda y verifica un snapshot normalizado cuando Auth/RLS está activo.

La limpieza mensual requiere `SB_SERVICE_KEY`; conserva auditoría legacy y `audit_events` durante un mínimo de cuatro años. Las notificaciones leídas mantienen su plazo operativo separado de seis meses y las evidencias legales no se eliminan con esa tarea.

## Informes programados

El worker es idempotente y guarda por cada ejecución: `scheduleId`, periodo, formato, estado, fecha, error, ruta privada y número de filas. Un mismo periodo no se envía dos veces aunque el proceso se reintente.
