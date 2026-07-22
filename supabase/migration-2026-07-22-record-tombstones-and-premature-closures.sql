-- Integridad de jornadas y cierres mensuales.
-- 1) Los tombstones se conservan dentro de app_data y ganan frente a clientes
--    antiguos que intenten volver a subir una jornada eliminada.
-- 2) Una fila records ya borrada no puede resucitar mediante UPSERT.
-- 3) Los cierres del mes actual/futuro quedan invalidados hasta que el periodo
--    haya terminado; se conserva su trazabilidad, pero no sus firmas ni bloqueo.

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

CREATE OR REPLACE FUNCTION public.prevent_deleted_record_resurrection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.deleted IS TRUE AND NEW.deleted IS NOT TRUE THEN
    NEW.deleted := TRUE;
    NEW.deleted_at := COALESCE(OLD.deleted_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS records_prevent_resurrection ON public.records;
CREATE TRIGGER records_prevent_resurrection
BEFORE UPDATE ON public.records
FOR EACH ROW EXECUTE FUNCTION public.prevent_deleted_record_resurrection();

-- Reconciliar borrados históricos: algunas filas ya estaban soft-deleted en la
-- tabla pero seguían dentro del blob, por eso reaparecían al siguiente fetch.
DO $$
DECLARE
  deleted_ids jsonb;
  existing_tombstones jsonb;
  merged_tombstones jsonb;
  cleaned_records jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(id)), '[]'::jsonb)
  INTO deleted_ids
  FROM public.records
  WHERE deleted IS TRUE;

  IF jsonb_array_length(deleted_ids) > 0 THEN
    SELECT COALESCE(data -> '_deleted' -> 'records', '[]'::jsonb),
           COALESCE((
             SELECT jsonb_agg(item)
             FROM jsonb_array_elements(COALESCE(data -> 'records', '[]'::jsonb)) item
             WHERE NOT (deleted_ids @> jsonb_build_array(item ->> 'id'))
           ), '[]'::jsonb)
    INTO existing_tombstones, cleaned_records
    FROM public.app_data
    WHERE id = 1;

    SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb)
    INTO merged_tombstones
    FROM jsonb_array_elements(existing_tombstones || deleted_ids);

    UPDATE public.app_data
    SET data = jsonb_set(
          jsonb_set(
            jsonb_set(data, '{records}', cleaned_records, true),
            '{_deleted}', COALESCE(data -> '_deleted', '{}'::jsonb), true
          ),
          '{_deleted,records}', merged_tombstones, true
        ),
        updated_at = now()
    WHERE id = 1;
  END IF;
END;
$$;

-- Invalidar cierres del mes actual o futuro en la tabla normalizada.
UPDATE public.cierres
SET firma_admin = NULL,
    firma_emp = NULL,
    estado = 'pendiente',
    desactualizado = TRUE,
    data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
      'firmaAdmin', NULL, 'firmaEmp', NULL, 'firma', NULL,
      'estado', 'pendiente', 'desactualizado', TRUE,
      '_upd', now()::text
    ),
    updated_at = now()
WHERE mes >= to_char(timezone('Europe/Madrid', now()), 'YYYY-MM')
  AND deleted IS NOT TRUE;

-- Aplicar la misma invalidación al blob de compatibilidad.
UPDATE public.app_data
SET data = jsonb_set(
      data,
      '{cierres}',
      COALESCE((
        SELECT jsonb_agg(
          CASE
            WHEN value ->> 'mes' >= to_char(timezone('Europe/Madrid', now()), 'YYYY-MM')
            THEN value || jsonb_build_object(
              'firmaAdmin', NULL, 'firmaEmp', NULL, 'firma', NULL,
              'estado', 'pendiente', 'desactualizado', TRUE,
              '_upd', now()::text
            )
            ELSE value
          END
        )
        FROM jsonb_array_elements(COALESCE(data -> 'cierres', '[]'::jsonb))
      ), '[]'::jsonb),
      true
    ),
    updated_at = now()
WHERE id = 1;
