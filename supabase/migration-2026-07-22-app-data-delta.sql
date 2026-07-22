-- Escritura atómica y granular del blob de compatibilidad.
-- Evita descargar/subir app_data completo en cada fichaje, sin perder la
-- protección contra escrituras concurrentes de varios dispositivos.

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
  collection_name text;
  incoming_value jsonb;
  incoming_item jsonb;
  existing_item jsonb;
  entity_id text;
  deleted_id jsonb;
  merged_array jsonb;
  incoming_ts timestamptz;
  existing_ts timestamptz;
BEGIN
  SELECT data INTO current_data FROM public.app_data WHERE id = 1 FOR UPDATE;
  IF current_data IS NULL THEN
    current_data := '{}'::jsonb;
  END IF;
  next_data := current_data;

  FOR collection_name, incoming_value IN SELECT key, value FROM jsonb_each(COALESCE(p_patch, '{}'::jsonb))
  LOOP
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
        IF NOT merged_array @> jsonb_build_array(incoming_item) THEN
          merged_array := merged_array || jsonb_build_array(incoming_item);
        END IF;
        CONTINUE;
      END IF;

      SELECT value INTO existing_item
      FROM jsonb_array_elements(merged_array)
      WHERE value ->> 'id' = entity_id
      LIMIT 1;

      BEGIN
        incoming_ts := COALESCE(NULLIF(incoming_item ->> '_upd', '')::timestamptz, NULLIF(incoming_item ->> 'ts', '')::timestamptz, '-infinity'::timestamptz);
      EXCEPTION WHEN OTHERS THEN incoming_ts := '-infinity'::timestamptz;
      END;
      BEGIN
        existing_ts := COALESCE(NULLIF(existing_item ->> '_upd', '')::timestamptz, NULLIF(existing_item ->> 'ts', '')::timestamptz, '-infinity'::timestamptz);
      EXCEPTION WHEN OTHERS THEN existing_ts := '-infinity'::timestamptz;
      END;

      IF existing_item IS NULL OR incoming_ts >= existing_ts THEN
        SELECT COALESCE(jsonb_agg(value), '[]'::jsonb) INTO merged_array
        FROM jsonb_array_elements(merged_array)
        WHERE value ->> 'id' IS DISTINCT FROM entity_id;
        merged_array := merged_array || jsonb_build_array(incoming_item);
      END IF;
    END LOOP;
    next_data := jsonb_set(next_data, ARRAY[collection_name], merged_array, true);
  END LOOP;

  FOR collection_name, incoming_value IN SELECT key, value FROM jsonb_each(COALESCE(p_deleted, '{}'::jsonb))
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

  INSERT INTO public.app_data(id, data, updated_at)
  VALUES (1, next_data, p_updated_at)
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

  RETURN QUERY SELECT p_updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_app_data_delta(jsonb, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_app_data_delta(jsonb, jsonb, timestamptz) TO anon, authenticated;
