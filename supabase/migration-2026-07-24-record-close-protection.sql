-- Protección de cierres de jornada frente a ticks de horas en vivo.
--
-- Contexto: useTimer persiste workSecs periódicamente con _upd nuevo. Si un
-- encargado cierra la jornada desde otro dispositivo y el móvil del empleado
-- (con señal débil) aún no ha descargado ese cierre, su siguiente tick sube
-- una copia ABIERTA del mismo registro con _upd más reciente — y la resolución
-- "el _upd más nuevo gana" reabría la jornada. Como en la app no existe
-- "reabrir jornada" (los ids son aleatorios y las correcciones nunca vuelven
-- fin a null), la regla segura es: una copia cerrada nunca pierde contra una
-- copia abierta del mismo id. Este archivo aplica esa regla en:
--   1) apply_app_data_delta (blob app_data) — misma versión que la migración
--      2026-07-22 + el guard de records.
--   2) Un trigger BEFORE UPDATE en la tabla records que ignora cualquier
--      UPDATE que intente pasar fin -> NULL sobre una fila ya cerrada.
-- El cliente aplica la regla equivalente en _mergeRecords (dataService.js),
-- _mergeRecordsSW (sw.js) y mergeRecordVersions (dataServiceV2.js).

CREATE OR REPLACE FUNCTION public.apply_app_data_delta(
  p_patch jsonb,
  p_deleted jsonb DEFAULT '{}'::jsonb,
  p_updated_at timestamptz DEFAULT now()
)
RETURNS TABLE(updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_data jsonb;
  next_data jsonb;
  persistent_deleted jsonb;
  collection_name text;
  incoming_value jsonb;
  incoming_item jsonb;
  existing_item jsonb;
  entity_id text;
  deleted_id jsonb;
  merged_array jsonb;
  deleted_array jsonb;
  incoming_ts timestamptz;
  existing_ts timestamptz;
BEGIN
  SELECT data INTO current_data FROM public.app_data WHERE id = 1 FOR UPDATE;
  IF current_data IS NULL THEN current_data := '{}'::jsonb; END IF;
  next_data := current_data;
  persistent_deleted := CASE
    WHEN jsonb_typeof(current_data -> '_deleted') = 'object' THEN current_data -> '_deleted'
    ELSE '{}'::jsonb
  END;

  -- Unir tombstones enviados como parte del payload y como borrado de esta
  -- operación. Nunca se reemplazan por una lista más antigua o más corta.
  FOR collection_name, incoming_value IN
    SELECT key, value FROM jsonb_each(
      CASE WHEN jsonb_typeof(p_patch -> '_deleted') = 'object' THEN p_patch -> '_deleted' ELSE '{}'::jsonb END
    )
  LOOP
    IF jsonb_typeof(incoming_value) <> 'array' THEN CONTINUE; END IF;
    deleted_array := COALESCE(persistent_deleted -> collection_name, '[]'::jsonb);
    SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb) INTO deleted_array
    FROM jsonb_array_elements(deleted_array || incoming_value);
    persistent_deleted := jsonb_set(persistent_deleted, ARRAY[collection_name], deleted_array, true);
  END LOOP;

  FOR collection_name, incoming_value IN SELECT key, value FROM jsonb_each(COALESCE(p_deleted, '{}'::jsonb))
  LOOP
    IF jsonb_typeof(incoming_value) <> 'array' THEN CONTINUE; END IF;
    deleted_array := COALESCE(persistent_deleted -> collection_name, '[]'::jsonb);
    SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb) INTO deleted_array
    FROM jsonb_array_elements(deleted_array || incoming_value);
    persistent_deleted := jsonb_set(persistent_deleted, ARRAY[collection_name], deleted_array, true);
  END LOOP;
  next_data := jsonb_set(next_data, '{_deleted}', persistent_deleted, true);

  FOR collection_name, incoming_value IN SELECT key, value FROM jsonb_each(COALESCE(p_patch, '{}'::jsonb))
  LOOP
    IF collection_name = '_deleted' THEN CONTINUE; END IF;
    IF jsonb_typeof(incoming_value) <> 'array' THEN
      next_data := jsonb_set(next_data, ARRAY[collection_name], incoming_value, true);
      CONTINUE;
    END IF;

    merged_array := CASE
      WHEN jsonb_typeof(next_data -> collection_name) = 'array' THEN next_data -> collection_name
      ELSE '[]'::jsonb
    END;

    FOR incoming_item IN SELECT value FROM jsonb_array_elements(incoming_value)
    LOOP
      entity_id := incoming_item ->> 'id';
      IF entity_id IS NULL OR entity_id = '' THEN
        IF NOT merged_array @> jsonb_build_array(incoming_item) THEN merged_array := merged_array || jsonb_build_array(incoming_item); END IF;
        CONTINUE;
      END IF;

      -- Un id borrado deliberadamente nunca puede volver desde una cola offline
      -- o una copia local antigua.
      IF COALESCE(persistent_deleted -> collection_name, '[]'::jsonb) @> jsonb_build_array(entity_id) THEN
        CONTINUE;
      END IF;

      SELECT value INTO existing_item FROM jsonb_array_elements(merged_array) WHERE value ->> 'id' = entity_id LIMIT 1;

      -- Guard de jornadas: una copia abierta (sin fin) nunca sustituye a la
      -- cerrada ya almacenada, sea cual sea su _upd.
      IF collection_name = 'records'
         AND existing_item IS NOT NULL
         AND COALESCE(existing_item ->> 'fin', '') <> ''
         AND COALESCE(incoming_item ->> 'fin', '') = '' THEN
        CONTINUE;
      END IF;

      BEGIN
        incoming_ts := COALESCE(NULLIF(incoming_item ->> '_upd', '')::timestamptz, NULLIF(incoming_item ->> 'ts', '')::timestamptz, '-infinity'::timestamptz);
      EXCEPTION WHEN OTHERS THEN incoming_ts := '-infinity'::timestamptz; END;
      BEGIN
        existing_ts := COALESCE(NULLIF(existing_item ->> '_upd', '')::timestamptz, NULLIF(existing_item ->> 'ts', '')::timestamptz, '-infinity'::timestamptz);
      EXCEPTION WHEN OTHERS THEN existing_ts := '-infinity'::timestamptz; END;

      IF existing_item IS NULL OR incoming_ts >= existing_ts THEN
        SELECT COALESCE(jsonb_agg(value), '[]'::jsonb) INTO merged_array
        FROM jsonb_array_elements(merged_array) WHERE value ->> 'id' IS DISTINCT FROM entity_id;
        merged_array := merged_array || jsonb_build_array(incoming_item);
      END IF;
    END LOOP;
    next_data := jsonb_set(next_data, ARRAY[collection_name], merged_array, true);
  END LOOP;

  -- Aplicar físicamente los borrados además de conservar su tombstone.
  FOR collection_name, incoming_value IN SELECT key, value FROM jsonb_each(persistent_deleted)
  LOOP
    IF jsonb_typeof(incoming_value) <> 'array' OR jsonb_typeof(next_data -> collection_name) <> 'array' THEN CONTINUE; END IF;
    merged_array := next_data -> collection_name;
    FOR deleted_id IN SELECT value FROM jsonb_array_elements(incoming_value)
    LOOP
      SELECT COALESCE(jsonb_agg(value), '[]'::jsonb) INTO merged_array
      FROM jsonb_array_elements(merged_array)
      WHERE value ->> 'id' IS DISTINCT FROM trim(both '"' from deleted_id::text);
    END LOOP;
    next_data := jsonb_set(next_data, ARRAY[collection_name], merged_array, true);
  END LOOP;

  INSERT INTO public.app_data(id, data, updated_at) VALUES (1, next_data, p_updated_at)
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;
  RETURN QUERY SELECT p_updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_app_data_delta(jsonb, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_app_data_delta(jsonb, jsonb, timestamptz) TO anon, authenticated;

-- Tabla records: ignorar cualquier UPDATE que intente reabrir (fin -> NULL)
-- una fila ya cerrada. Los upserts del cliente/SW son incondicionales, así que
-- este trigger es la última línea de defensa contra copias abiertas obsoletas.
CREATE OR REPLACE FUNCTION public.prevent_record_reopen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.fin IS NOT NULL AND NEW.fin IS NULL THEN
    -- Conservar la fila cerrada tal cual: la copia entrante es un tick de
    -- horas en vivo anterior al cierre, no una reapertura legítima.
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS records_prevent_reopen ON public.records;
CREATE TRIGGER records_prevent_reopen
BEFORE UPDATE ON public.records
FOR EACH ROW EXECUTE FUNCTION public.prevent_record_reopen();
