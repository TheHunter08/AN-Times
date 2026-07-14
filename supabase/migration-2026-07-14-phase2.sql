-- Times INC — Supabase fase 2 (aditiva, reversible e idempotente)
-- Las tablas pasan a contener una copia JSON lossless de cada entidad.
-- app_data se conserva como respaldo de escritura durante la transición.

ALTER TABLE employees  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';
ALTER TABLE records    ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';
ALTER TABLE vacaciones ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';
ALTER TABLE cierres    ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';
ALTER TABLE obras      ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';

ALTER TABLE vacaciones ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;
ALTER TABLE vacaciones ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE cierres    ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;
ALTER TABLE cierres    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE obras      ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;
ALTER TABLE obras      ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE obras      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Listas legacy de valores simples se guardan como singleton porque sus
-- elementos no tienen id propio (empresas y centrosTrabajo).
INSERT INTO app_entities (
  id, company_id, collection, entity_id, data, revision, deleted, updated_at
)
SELECT
  source.collection || ':__singleton__',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  source.collection, '__singleton__', blob.data->source.collection, 1, false, now()
FROM app_data blob
CROSS JOIN (VALUES ('empresas'), ('centrosTrabajo')) source(collection)
WHERE blob.id = 1 AND blob.data ? source.collection
ON CONFLICT (id) DO UPDATE SET
  data = EXCLUDED.data, deleted = false, updated_at = EXCLUDED.updated_at;

CREATE INDEX IF NOT EXISTS vacaciones_live_company_idx
  ON vacaciones(company_id, updated_at DESC) WHERE deleted = false;
CREATE INDEX IF NOT EXISTS cierres_live_company_idx
  ON cierres(company_id, updated_at DESC) WHERE deleted = false;
CREATE INDEX IF NOT EXISTS obras_live_company_idx
  ON obras(company_id, updated_at DESC) WHERE deleted = false;

-- Backfill lossless desde el respaldo legacy. No elimina ni reemplaza filas.
UPDATE employees target SET data = source.item
FROM app_data blob
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(blob.data->'employees', '[]'::jsonb)) source(item)
WHERE blob.id = 1 AND target.id = source.item->>'id' AND target.data = '{}'::jsonb;

UPDATE records target SET data = source.item
FROM app_data blob
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(blob.data->'records', '[]'::jsonb)) source(item)
WHERE blob.id = 1 AND target.id = source.item->>'id' AND target.data = '{}'::jsonb;

UPDATE vacaciones target SET data = source.item
FROM app_data blob
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(blob.data->'vacaciones', '[]'::jsonb)) source(item)
WHERE blob.id = 1 AND target.id = source.item->>'id' AND target.data = '{}'::jsonb;

-- Algunas solicitudes antiguas usan desde/hasta en vez de fechaInicio/fechaFin.
-- Se normalizan sin perder su payload original.
INSERT INTO vacaciones (
  id, company_id, emp_id, emp_name, fecha_inicio, fecha_fin,
  tipo, estado, motivo, resolucion, data, deleted, deleted_at, updated_at
)
SELECT
  value->>'id', 'ffffffff-ffff-ffff-ffff-ffffffffffff', value->>'empId', value->>'empName',
  COALESCE(value->>'fechaInicio', value->>'desde')::date,
  COALESCE(value->>'fechaFin', value->>'hasta', value->>'fechaInicio', value->>'desde')::date,
  COALESCE(value->>'tipo', 'vacaciones'), COALESCE(value->>'estado', 'pendiente'),
  COALESCE(value->>'motivo', value->>'nota'), value->>'resolucion',
  value, false, NULL,
  COALESCE(NULLIF(value->>'_upd', '')::timestamptz, now())
FROM app_data blob
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(blob.data->'vacaciones', '[]'::jsonb)) item(value)
WHERE blob.id = 1
  AND value->>'id' IS NOT NULL
  AND COALESCE(value->>'fechaInicio', value->>'desde') IS NOT NULL
  AND EXISTS (SELECT 1 FROM employees e WHERE e.id = value->>'empId')
ON CONFLICT (id) DO UPDATE SET
  emp_id = EXCLUDED.emp_id, emp_name = EXCLUDED.emp_name,
  fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin,
  tipo = EXCLUDED.tipo, estado = EXCLUDED.estado, motivo = EXCLUDED.motivo,
  resolucion = EXCLUDED.resolucion, data = EXCLUDED.data,
  deleted = false, deleted_at = NULL, updated_at = EXCLUDED.updated_at;

UPDATE cierres target SET data = source.item
FROM app_data blob
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(blob.data->'cierres', '[]'::jsonb)) source(item)
WHERE blob.id = 1 AND target.id = source.item->>'id' AND target.data = '{}'::jsonb;

-- Cierres eliminados del estado vigente no deben reaparecer desde una tabla
-- poblada por una migracion anterior (especialmente cierres del mes en curso).
UPDATE cierres target
SET deleted = true, deleted_at = now(), updated_at = now()
WHERE target.deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM app_data blob
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(blob.data->'cierres', '[]'::jsonb)) item(value)
    WHERE blob.id = 1 AND value->>'id' = target.id
  );

UPDATE obras target SET data = source.item
FROM app_data blob
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(blob.data->'obras', '[]'::jsonb)) source(item)
WHERE blob.id = 1 AND target.id = source.item->>'id' AND target.data = '{}'::jsonb;

-- Reloj barato de sincronización: sustituye la consulta a app_data.updated_at.
-- Todos los borrados de estas tablas son lógicos desde esta fase.
CREATE OR REPLACE FUNCTION get_app_sync_state(p_company_id text)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT GREATEST(
    COALESCE((SELECT max(updated_at) FROM employees  WHERE company_id = p_company_id), '-infinity'::timestamptz),
    COALESCE((SELECT max(updated_at) FROM records    WHERE company_id = p_company_id), '-infinity'::timestamptz),
    COALESCE((SELECT max(updated_at) FROM vacaciones WHERE company_id = p_company_id), '-infinity'::timestamptz),
    COALESCE((SELECT max(updated_at) FROM cierres    WHERE company_id = p_company_id), '-infinity'::timestamptz),
    COALESCE((SELECT max(updated_at) FROM obras      WHERE company_id = p_company_id), '-infinity'::timestamptz),
    COALESCE((SELECT max(updated_at) FROM app_entities WHERE company_id = p_company_id), '-infinity'::timestamptz)
  );
$$;

GRANT EXECUTE ON FUNCTION get_app_sync_state(text) TO anon, authenticated;

SELECT
  (SELECT count(*) FROM employees  WHERE data <> '{}'::jsonb) AS employees_lossless,
  (SELECT count(*) FROM records    WHERE data <> '{}'::jsonb) AS records_lossless,
  (SELECT count(*) FROM vacaciones WHERE data <> '{}'::jsonb) AS vacaciones_lossless,
  (SELECT count(*) FROM cierres    WHERE data <> '{}'::jsonb) AS cierres_lossless,
  (SELECT count(*) FROM obras      WHERE data <> '{}'::jsonb) AS obras_lossless;
