-- Times INC — Migración gradual Supabase, fase 1 (aditiva e idempotente)
-- Mantiene app_data como respaldo mientras cada colección pasa a filas granulares.

CREATE TABLE IF NOT EXISTS app_entities (
  id          text PRIMARY KEY,
  company_id  text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  collection  text NOT NULL,
  entity_id   text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}',
  revision    bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, collection, entity_id)
);

CREATE INDEX IF NOT EXISTS app_entities_collection_idx
  ON app_entities(company_id, collection, updated_at DESC);
CREATE INDEX IF NOT EXISTS app_entities_live_idx
  ON app_entities(company_id, collection) WHERE deleted = false;

ALTER TABLE app_entities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_entities' AND policyname='app_entities_anon_phase1') THEN
    CREATE POLICY "app_entities_anon_phase1" ON app_entities
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Metadatos que antes solo sobrevivían dentro del blob.
ALTER TABLE records ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1;
ALTER TABLE records ADD COLUMN IF NOT EXISTS operation_id uuid;
ALTER TABLE records ADD COLUMN IF NOT EXISTS validado boolean NOT NULL DEFAULT false;
ALTER TABLE records ADD COLUMN IF NOT EXISTS rechazado boolean NOT NULL DEFAULT false;
ALTER TABLE records ADD COLUMN IF NOT EXISTS modificado boolean NOT NULL DEFAULT false;
ALTER TABLE records ADD COLUMN IF NOT EXISTS validado_by text;
ALTER TABLE records ADD COLUMN IF NOT EXISTS validado_at timestamptz;
ALTER TABLE records ADD COLUMN IF NOT EXISTS cerrado_por text;
ALTER TABLE records ADD COLUMN IF NOT EXISTS cerrado_por_id text;
ALTER TABLE records ADD COLUMN IF NOT EXISTS cierre_manual boolean NOT NULL DEFAULT false;
ALTER TABLE records ADD COLUMN IF NOT EXISTS motivo_cierre text;
ALTER TABLE records ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;
ALTER TABLE records ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS records_operation_id_uidx
  ON records(operation_id) WHERE operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS records_live_company_idx
  ON records(company_id, inicio DESC) WHERE deleted = false;

-- Registro idempotente de operaciones para reintentos offline.
CREATE TABLE IF NOT EXISTS sync_operations (
  operation_id uuid PRIMARY KEY,
  company_id   text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,
  entity_id    text NOT NULL,
  action       text NOT NULL,
  payload_hash text,
  applied_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_operations_entity_idx
  ON sync_operations(company_id, entity_type, entity_id, applied_at DESC);
ALTER TABLE sync_operations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sync_operations' AND policyname='sync_operations_anon_phase1') THEN
    CREATE POLICY "sync_operations_anon_phase1" ON sync_operations
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION register_record_operation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.operation_id IS NOT NULL THEN
    INSERT INTO sync_operations(operation_id, company_id, entity_type, entity_id, action)
    VALUES (NEW.operation_id, NEW.company_id, 'record', NEW.id, CASE WHEN TG_OP='INSERT' THEN 'insert' ELSE 'update' END)
    ON CONFLICT (operation_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS records_register_operation ON records;
CREATE TRIGGER records_register_operation
AFTER INSERT OR UPDATE ON records
FOR EACH ROW EXECUTE FUNCTION register_record_operation();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE app_entities;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Comprobación rápida después de ejecutar el script.
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('app_entities', 'sync_operations');
