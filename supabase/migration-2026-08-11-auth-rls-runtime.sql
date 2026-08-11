-- Times INC - preparacion aditiva del runtime Auth/RLS.
-- Ejecutar antes de policies_auth.sql. No retira por si sola el acceso anon.

ALTER TABLE app_entities ADD COLUMN IF NOT EXISTS access_scope text NOT NULL DEFAULT 'admin';
ALTER TABLE app_entities ADD COLUMN IF NOT EXISTS subject_emp_id text;
ALTER TABLE app_entities ADD COLUMN IF NOT EXISTS participant_emp_ids text[] NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE app_entities ADD CONSTRAINT app_entities_access_scope_check
    CHECK (access_scope IN ('admin', 'company', 'employee'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Clasifica las filas legacy. Si no se puede demostrar su propietario quedan
-- solo para administracion, nunca expuestas por defecto.
UPDATE app_entities
SET
  subject_emp_id = COALESCE(
    NULLIF(data->>'empId', ''), NULLIF(data->>'employeeId', ''),
    NULLIF(data->>'trabajadorId', ''), NULLIF(data->>'userId', ''),
    NULLIF(data->>'empleadoId', '')
  ),
  participant_emp_ids = ARRAY_REMOVE(ARRAY[
    COALESCE(NULLIF(data->>'empId', ''), NULLIF(data->>'employeeId', ''), NULLIF(data->>'trabajadorId', ''), NULLIF(data->>'userId', '')),
    COALESCE(NULLIF(data->>'fromId', ''), NULLIF(data->>'from_id', ''), NULLIF(data->>'from', '')),
    COALESCE(NULLIF(data->>'toId', ''), NULLIF(data->>'to_id', ''), NULLIF(data->>'to', ''))
  ], NULL),
  access_scope = CASE
    WHEN collection IN ('audit', 'partesTrabajo', 'mensajes', 'monthSnapshots', 'anomalias_vistas') THEN 'admin'
    WHEN collection IN ('empresas', 'centrosTrabajo', 'notisSent', 'config') THEN 'company'
    WHEN COALESCE(data->>'empId', data->>'employeeId', data->>'trabajadorId', data->>'userId', data->>'empleadoId', data->>'from', data->>'to') IS NOT NULL THEN 'employee'
    ELSE 'admin'
  END;

-- La firma personal ya no se guarda como un mapa de toda la plantilla en una
-- sola fila. Se divide en una fila RLS por empleado.
INSERT INTO app_entities (
  id, company_id, collection, entity_id, data, revision, deleted,
  access_scope, subject_emp_id, participant_emp_ids, created_at, updated_at
)
SELECT
  'firmas:' || signature.key,
  source.company_id,
  'firmas',
  signature.key,
  signature.value,
  GREATEST(source.revision, 1),
  false,
  'employee',
  signature.key,
  ARRAY[signature.key],
  source.created_at,
  source.updated_at
FROM app_entities source
CROSS JOIN LATERAL jsonb_each(
  CASE WHEN jsonb_typeof(source.data) = 'object' THEN source.data ELSE '{}'::jsonb END
) signature
WHERE source.collection = 'firmas'
  AND source.entity_id = '__singleton__'
  AND source.deleted = false
ON CONFLICT (id) DO UPDATE SET
  data = EXCLUDED.data,
  access_scope = 'employee',
  subject_emp_id = EXCLUDED.subject_emp_id,
  participant_emp_ids = EXCLUDED.participant_emp_ids,
  deleted = false,
  updated_at = GREATEST(app_entities.updated_at, EXCLUDED.updated_at);

UPDATE app_entities
SET deleted = true, updated_at = now()
WHERE collection = 'firmas' AND entity_id = '__singleton__' AND deleted = false;

-- pinLockouts es exclusivamente local desde esta version.
UPDATE app_entities
SET deleted = true, updated_at = now()
WHERE collection = 'pinLockouts' AND deleted = false;

CREATE INDEX IF NOT EXISTS app_entities_subject_idx
  ON app_entities(company_id, subject_emp_id, collection) WHERE deleted = false;
CREATE INDEX IF NOT EXISTS app_entities_participants_idx
  ON app_entities USING gin(participant_emp_ids) WHERE deleted = false;

CREATE OR REPLACE FUNCTION auth_emp_id() RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT id FROM employees WHERE auth_id = auth.uid() AND NOT baja LIMIT 1;
$$;

-- Auditoría append-only: deja de viajar mezclada con documentos y bienestar.
CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_emp_id text REFERENCES employees(id),
  action text NOT NULL,
  detail text,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_company_time_idx
  ON audit_events(company_id, created_at DESC);
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='audit_events' AND policyname='audit_events_anon_phase1') THEN
    CREATE POLICY "audit_events_anon_phase1" ON audit_events FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

INSERT INTO audit_events(id, company_id, action, detail, data, created_at, updated_at)
SELECT
  entity_id, company_id,
  COALESCE(NULLIF(data->>'action', ''), 'evento'),
  data->>'detail', data,
  CASE WHEN COALESCE(data->>'ts', '') ~ '^\d{4}-\d{2}-\d{2}T'
    THEN (data->>'ts')::timestamptz ELSE updated_at END,
  updated_at
FROM app_entities
WHERE collection = 'audit' AND deleted = false
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION set_audit_actor() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN NEW.actor_emp_id := auth_emp_id(); END IF;
  NEW.updated_at := COALESCE(NEW.updated_at, NEW.created_at, now());
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS audit_events_set_actor ON audit_events;
CREATE TRIGGER audit_events_set_actor
BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION set_audit_actor();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE audit_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION get_app_sync_state(p_company_id text)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT GREATEST(
    COALESCE((SELECT max(updated_at) FROM employees WHERE company_id=p_company_id), '-infinity'::timestamptz),
    COALESCE((SELECT max(updated_at) FROM records WHERE company_id=p_company_id), '-infinity'::timestamptz),
    COALESCE((SELECT max(updated_at) FROM vacaciones WHERE company_id=p_company_id), '-infinity'::timestamptz),
    COALESCE((SELECT max(updated_at) FROM cierres WHERE company_id=p_company_id), '-infinity'::timestamptz),
    COALESCE((SELECT max(updated_at) FROM obras WHERE company_id=p_company_id), '-infinity'::timestamptz),
    COALESCE((SELECT max(updated_at) FROM app_entities WHERE company_id=p_company_id), '-infinity'::timestamptz),
    COALESCE((SELECT max(updated_at) FROM audit_events WHERE company_id=p_company_id), '-infinity'::timestamptz)
  );
$$;

-- Un endpoint push pertenece al usuario Auth que lo reclama. La funcion hace
-- atomica la reasignacion en tablets compartidas sin exponer las claves push.
CREATE OR REPLACE FUNCTION claim_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp_id text;
BEGIN
  v_emp_id := auth_emp_id();
  IF v_emp_id IS NULL THEN RAISE EXCEPTION 'official employee identity required' USING ERRCODE = '42501'; END IF;
  IF COALESCE(length(p_endpoint), 0) < 10 OR COALESCE(length(p_p256dh), 0) < 10 OR COALESCE(length(p_auth), 0) < 5 THEN
    RAISE EXCEPTION 'invalid push subscription' USING ERRCODE = '22023';
  END IF;
  DELETE FROM push_subs WHERE endpoint = p_endpoint OR user_id = v_emp_id;
  INSERT INTO push_subs(user_id, endpoint, p256dh, auth, last_online, last_sync, updated_at)
  VALUES(v_emp_id, p_endpoint, p_p256dh, p_auth, now(), now(), now());
END;
$$;

REVOKE ALL ON FUNCTION claim_push_subscription(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION claim_push_subscription(text, text, text) TO authenticated;
