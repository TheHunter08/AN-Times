-- ================================================================
-- PARCHE 2026-07-11 — Times INC
-- Ejecutar en: Supabase Dashboard > SQL Editor > New Query
--
-- PASO 1 — Columnas faltantes
-- PASO 2 — Tablas pre-V2 (si no existen aún)
-- PASO 3 — Llamar endpoint para poblar PINs
-- ================================================================

-- ── PASO 1: columna pin_len en employees ────────────────────────
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pin_len int;

-- ── PASO 2a: tabla app_data (blob principal) ─────────────────────
-- Solo crear si no existe (idempotente).
CREATE TABLE IF NOT EXISTS app_data (
  id         int PRIMARY KEY,
  data       jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

-- Políticas para app_data (idempotentes con IF NOT EXISTS en PG 15+;
-- en versiones anteriores ignorar el error "already exists")
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_data' AND policyname='app_data_select_anon') THEN
    CREATE POLICY "app_data_select_anon" ON app_data FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_data' AND policyname='app_data_insert_anon') THEN
    CREATE POLICY "app_data_insert_anon" ON app_data FOR INSERT TO anon WITH CHECK (id IN (1,2,3));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_data' AND policyname='app_data_update_anon') THEN
    CREATE POLICY "app_data_update_anon" ON app_data FOR UPDATE TO anon
      USING (id IN (1,2,3)) WITH CHECK (id IN (1,2,3));
  END IF;
END $$;

-- ── PASO 2b: tabla push_subs ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subs (
  user_id    text PRIMARY KEY,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  last_online timestamptz DEFAULT now(),
  last_sync   timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE push_subs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='push_subs' AND policyname='push_subs_all_anon') THEN
    CREATE POLICY "push_subs_all_anon" ON push_subs FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Verificación final ────────────────────────────────────────────
-- Ejecutar para confirmar que todo está bien:
--
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'employees' ORDER BY ordinal_position;
--
-- SELECT id, name,
--        CASE WHEN pin_hash IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS pin_status,
--        pin_len
-- FROM employees ORDER BY name;

-- ================================================================
-- PASO 3 — Poblar pin_hash + pin_len desde el blob
--
-- Ejecutar desde terminal (requiere CRON_SECRET):
--
--   curl -X POST https://<tu-dominio>.vercel.app/api/patch-pins \
--        -H "Authorization: Bearer <CRON_SECRET>"
--
-- Respuesta esperada: { "ok": true, "patched": N, "errors": 0 }
-- ================================================================
