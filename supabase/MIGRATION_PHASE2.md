# Supabase Fase 2

Estado: aplicada en producción el 14 de julio de 2026.

## Objetivo

- Leer desde tablas sin descargar `app_data`.
- Conservar todos los campos mediante `data jsonb` por fila.
- Usar borrado lógico persistente.
- Sincronizar solo filas modificadas desde el último `updated_at` conocido.

## Aplicación

Ejecutar `migration-2026-07-14-phase2.sql` después de la Fase 1. El script es
idempotente y mantiene `app_data` como respaldo dual-write.

## Rollback

No es necesario revertir el esquema. El cliente conserva fallback automático a
`app_data` si `get_app_sync_state()` o las columnas `data` no están disponibles.

## Verificación esperada

- RPC `get_app_sync_state`: HTTP 200.
- Vacaciones activas: 2.
- Cierres activos: 0; tombstones conservados: 11.
- Singletons `empresas` y `centrosTrabajo`: presentes en `app_entities`.
- Lectura incremental sin cambios: aproximadamente 1 KB frente a ~414 KB de una
  lectura completa por tablas y ~644 KB del modo híbrido anterior.
