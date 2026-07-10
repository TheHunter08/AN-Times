-- ================================================================
-- Times INC – Row Level Security para Supabase
-- Aplicar en: Dashboard > SQL Editor > New Query
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- Tabla: app_data
-- El anon key (incluido en el bundle JS del cliente) puede leer y
-- actualizar las filas 1–3, pero NO puede borrar ni insertar filas
-- con id > 3. Esto evita el borrado accidental o malintencionado
-- de los datos de la empresa (fila 1 = datos activos).
-- ────────────────────────────────────────────────────────────────
ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier petición autenticada con el anon key puede leer
CREATE POLICY "app_data_select_anon"
  ON app_data FOR SELECT TO anon
  USING (true);

-- INSERT: solo filas 1–3 (upsert necesita poder insertar si la fila aún no existe)
CREATE POLICY "app_data_insert_anon"
  ON app_data FOR INSERT TO anon
  WITH CHECK (id IN (1, 2, 3));

-- UPDATE: solo filas 1–3
CREATE POLICY "app_data_update_anon"
  ON app_data FOR UPDATE TO anon
  USING  (id IN (1, 2, 3))
  WITH CHECK (id IN (1, 2, 3));

-- DELETE: sin política → bloqueado para el anon key.
-- El service_role (si se configura en las funciones serverless)
-- ignora RLS y conserva acceso completo.


-- ────────────────────────────────────────────────────────────────
-- Tabla: push_subs
-- Suscripciones de push por dispositivo. Todas las operaciones
-- necesarias (suscribir, heartbeat, limpiar expiradas) se hacen
-- desde el cliente o desde sync-ping con el anon key, así que se
-- permiten todas. La clave VAPID privada permanece solo en el
-- servidor, por lo que el acceso a los endpoints no permite
-- enviar notificaciones directamente.
-- ────────────────────────────────────────────────────────────────
ALTER TABLE push_subs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subs_all_anon"
  ON push_subs FOR ALL TO anon
  USING (true)
  WITH CHECK (true);
