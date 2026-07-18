-- ================================================================
-- Times INC — Denuncias privadas (canal ético anónimo)
-- Aplicar en: Dashboard > SQL Editor > New Query
-- ================================================================
--
-- Contexto: `denuncias` viajaba como una colección más de `app_entities`
-- (tabla genérica con política `USING (true)` para `anon` — ver
-- migration-2026-07-14-phase1.sql). Eso significa que CUALQUIERA con la
-- clave anon (pública, va en el bundle JS) puede leer el contenido de
-- TODAS las denuncias con una sola consulta a PostgREST, a pesar de que
-- EmployeeDenuncia.tsx promete anonimato/confidencialidad (Directiva UE
-- 2019/1937).
--
-- Solución: tabla dedicada, SIN ninguna política de lectura para `anon`.
-- Todo el acceso anónimo pasa por 2 funciones SECURITY DEFINER que solo
-- exponen exactamente lo necesario (insertar una denuncia; consultar UNA
-- denuncia por su código, nunca la lista completa). El negocio (admin
-- real, ver auth_is_true_admin() más abajo) puede leer/gestionar todas.
-- ================================================================

-- ── Helper: admin real (no confundir con auth_is_admin(), que en
-- policies_auth.sql incluye 'jefe_obra' — ese rol entra por PIN, sin
-- auth.uid(), así que una política basada en él nunca se cumpliría para
-- ellos). Comprueba también el flag `isAdmin` dentro del jsonb `data`,
-- porque hay encargados con acceso de administrador adicional que no
-- tienen role='admin'. ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth_is_true_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' OR (data->>'isAdmin')::boolean IS TRUE
     FROM employees WHERE auth_id = auth.uid() LIMIT 1),
    false
  );
$$;

CREATE TABLE IF NOT EXISTS denuncias (
  id         text PRIMARY KEY,
  anon_id    text NOT NULL UNIQUE,
  tipo       text NOT NULL,
  mensaje    text NOT NULL,
  estado     text NOT NULL DEFAULT 'nueva',
  respuesta  text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE denuncias ENABLE ROW LEVEL SECURITY;

-- Sin políticas para `anon` a propósito — todo el acceso anónimo pasa por
-- las funciones de abajo. Solo el admin real puede leer/gestionar directo.
DROP POLICY IF EXISTS "admin_read_denuncias" ON denuncias;
CREATE POLICY "admin_read_denuncias" ON denuncias
  FOR SELECT TO authenticated USING (auth_is_true_admin());
DROP POLICY IF EXISTS "admin_manage_denuncias" ON denuncias;
CREATE POLICY "admin_manage_denuncias" ON denuncias
  FOR ALL TO authenticated USING (auth_is_true_admin()) WITH CHECK (auth_is_true_admin());

-- ── RPC: enviar una denuncia. El código anónimo lo genera el cliente
-- (crypto.getRandomValues, ver EmployeeDenuncia.tsx) y se pasa como
-- parámetro — la función solo inserta, no expone nada de vuelta salvo
-- éxito/fracaso. ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION submit_denuncia(p_anon_id text, p_tipo text, p_mensaje text)
RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO denuncias (id, anon_id, tipo, mensaje)
  VALUES (p_anon_id, p_anon_id, p_tipo, p_mensaje);
$$;
GRANT EXECUTE ON FUNCTION submit_denuncia(text, text, text) TO anon, authenticated;

-- ── RPC: consultar el estado de UNA denuncia por su código. Nunca
-- devuelve más de una fila ni permite listar sin conocer el código. ─────
CREATE OR REPLACE FUNCTION track_denuncia(p_anon_id text)
RETURNS TABLE (anon_id text, tipo text, estado text, respuesta text, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT anon_id, tipo, estado, respuesta, created_at
  FROM denuncias WHERE anon_id = p_anon_id;
$$;
GRANT EXECUTE ON FUNCTION track_denuncia(text) TO anon, authenticated;

-- ── Backfill: recuperar las denuncias ya enviadas (guardadas hasta ahora
-- como colección 'denuncias' dentro de app_entities). No borra nada de
-- app_entities — solo copia. ────────────────────────────────────────────
INSERT INTO denuncias (id, anon_id, tipo, mensaje, estado, respuesta, created_at, updated_at)
SELECT
  entity_id,
  COALESCE(data->>'anonId', entity_id),
  COALESCE(data->>'tipo', 'otro'),
  COALESCE(data->>'mensaje', ''),
  COALESCE(data->>'estado', 'nueva'),
  data->>'respuesta',
  COALESCE((data->>'ts')::timestamptz, updated_at, now()),
  updated_at
FROM app_entities
WHERE collection = 'denuncias' AND deleted = false
ON CONFLICT (id) DO NOTHING;

-- Comprobación rápida tras aplicar (debe devolver las mismas denuncias que
-- ya existían en app_entities, ni una fila anónima leíble por `anon`):
--   SELECT count(*) FROM denuncias;
--   SELECT count(*) FROM app_entities WHERE collection = 'denuncias' AND deleted = false;
