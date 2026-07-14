# Migración Supabase — fase 1

Esta fase es aditiva: `app_data` sigue siendo el respaldo y no se elimina ninguna tabla ni columna.

## Despliegue

1. Descargar una copia de `app_data` desde el panel administrativo o Supabase.
2. Ejecutar `migration-2026-07-14-phase1.sql` en SQL Editor.
3. Desplegar la aplicación y el endpoint actualizado.
4. Ejecutar una sola vez:

   `POST /api/migrate-to-tables`

   Cabecera: `Authorization: Bearer <CRON_SECRET>`.
5. Confirmar que `verification.consistent` sea `true` y que `mismatch` esté vacío.
6. Usar la aplicación normalmente durante el periodo de verificación. Las escrituras seguirán llegando a `app_data` y, en segundo plano, a las tablas granulares.

## Qué migra

- Metadatos completos de fichajes: revisión, operación idempotente, validación y cierre manual.
- Colecciones sin tabla dedicada mediante `app_entities`, una fila por elemento.
- Configuraciones y mapas mediante entidades singleton.
- Registro de operaciones en `sync_operations`.

## Reversión segura

No es necesario borrar datos. Si `app_entities` no está disponible, el cliente detecta la ausencia y continúa leyendo y escribiendo mediante `app_data`. Para una reversión temporal basta con no ejecutar el migrador o retirar la migración del despliegue; no se debe eliminar `app_data`.

## Condición para la fase 2

No activar las políticas de `policies_auth.sql` ni retirar el blob hasta completar un periodo de equivalencia sin diferencias y poblar `employees.auth_id` para todos los usuarios.
