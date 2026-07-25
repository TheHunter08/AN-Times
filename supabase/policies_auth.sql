-- ================================================================
-- Times INC — Políticas RLS con Supabase Auth real (Fase 3)
-- ESTADO: listo para activar — el login por PIN (api/pin-login.js) ya
-- emite JWT reales de Supabase Auth con auth_id poblado automáticamente
-- en cada login, así que no hace falta ningún paso manual de backfill.
--
-- DECISIÓN DE DISEÑO — dispositivo compartido (tablet de obra):
--   Varios empleados fichan por PIN en el MISMO dispositivo a lo largo del
--   día. Si el empleado A ficha sin conexión (queda en cola local) y luego
--   el empleado B inicia sesión en ese mismo tablet antes de que A
--   sincronice, la escritura de A se sube con el token de B (ver
--   withPinAuthHeader en src/services/dataService.js, que siempre usa el
--   token ACTUALMENTE guardado, no el que existía cuando se creó el
--   registro en cola). Restringir INSERT/UPDATE de `records` y
--   `vacaciones` a "solo tu propio emp_id" rechazaría esa sincronización
--   legítima y perdería fichajes reales.
--
--   Por eso estas dos tablas se protegen a nivel de EMPRESA (cualquier
--   empleado autenticado de tu empresa puede escribir fichajes/vacaciones
--   de cualquier compañero de la misma empresa), no a nivel de empleado
--   individual. Esto bloquea igual de bien al atacante anónimo de
--   internet (el problema real que resuelve activar RLS), y confía en
--   los compañeros que ya comparten el tablet físico — el mismo modelo de
--   confianza que ya existe hoy en la práctica. La app sigue aplicando el
--   control fino (cada quien edita su propio turno) en la capa de UI.
--
--   `cierres` (firma de cierre mensual) y `chats` SÍ quedan restringidos
--   al propio empleado: una firma de cierre es una atestación legal
--   personal, y un mensaje de chat no debería poder enviarse "como" otro
--   compañero — ninguna de las dos pasa por el mismo flujo de cola
--   offline + reparto de dispositivo que sí justifica la excepción de
--   arriba.
--
-- ACTIVACIÓN (en Dashboard > SQL Editor, fuera de horas punta):
--   1. Revisar que employees.auth_id esté poblado para el admin y los
--      empleados que ya hayan iniciado sesión al menos una vez desde que
--      se desplegó api/pin-login.js:
--        SELECT id, name, role, auth_id FROM employees WHERE NOT baja;
--      Cualquiera con auth_id NULL lo recibirá automáticamente en su
--      próximo login por PIN (ver api/pin-login.js) — no bloquea la
--      activación, simplemente ese empleado no podrá leer/escribir nada
--      hasta volver a iniciar sesión una vez más tras el cambio.
--   2. Ejecutar este script completo. Las líneas DROP POLICY IF EXISTS
--      "anon_all" ya están incluidas — no hace falta borrarlas a mano
--      antes.
--   3. Probar en caliente: iniciar sesión como admin y como un empleado
--      normal, fichar entrada/salida, y confirmar que se guarda.
--   4. Si algo falla, ejecutar policies_auth_rollback.sql para volver a
--      anon_all de inmediato sin perder datos.
-- ================================================================

-- Función helper: devuelve el emp_id del usuario autenticado actual
CREATE OR REPLACE FUNCTION auth_emp_id() RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM employees WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- Función helper: company_id del usuario autenticado actual
CREATE OR REPLACE FUNCTION auth_company_id() RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT company_id FROM employees WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- Función helper: true si el usuario es admin o jefe_obra
CREATE OR REPLACE FUNCTION auth_is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'jefe_obra') FROM employees WHERE auth_id = auth.uid() LIMIT 1),
    false
  );
$$;

-- ── companies ──────────────────────────────────────────────────────────────────
-- Solo admins pueden leer/escribir la empresa
DROP POLICY IF EXISTS "anon_all" ON companies;

CREATE POLICY "emp_read_company" ON companies
  FOR SELECT TO authenticated
  USING (id IN (SELECT company_id FROM employees WHERE auth_id = auth.uid()));

CREATE POLICY "admin_all_company" ON companies
  FOR ALL TO authenticated
  USING (auth_is_admin())
  WITH CHECK (auth_is_admin());

-- ── employees ──────────────────────────────────────────────────────────────────
-- Cada empleado lee su propia fila; admins leen todas.
DROP POLICY IF EXISTS "anon_all" ON employees;

CREATE POLICY "emp_read_self" ON employees
  FOR SELECT TO authenticated
  USING (auth_id = auth.uid() OR auth_is_admin());

CREATE POLICY "admin_write_employees" ON employees
  FOR ALL TO authenticated
  USING (auth_is_admin())
  WITH CHECK (auth_is_admin());

-- ── records (fichajes) ────────────────────────────────────────────────────────
-- Lectura: solo los propios (o admin). Escritura: cualquier compañero
-- autenticado de la misma empresa — ver "DECISIÓN DE DISEÑO" arriba.
DROP POLICY IF EXISTS "anon_all" ON records;

CREATE POLICY "emp_read_own_records" ON records
  FOR SELECT TO authenticated
  USING (emp_id = auth_emp_id() OR auth_is_admin());

CREATE POLICY "company_insert_records" ON records
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_is_admin() OR
    emp_id IN (SELECT id FROM employees WHERE company_id = auth_company_id())
  );

CREATE POLICY "company_update_records" ON records
  FOR UPDATE TO authenticated
  USING (
    auth_is_admin() OR
    emp_id IN (SELECT id FROM employees WHERE company_id = auth_company_id())
  )
  WITH CHECK (
    auth_is_admin() OR
    emp_id IN (SELECT id FROM employees WHERE company_id = auth_company_id())
  );

CREATE POLICY "admin_delete_records" ON records
  FOR DELETE TO authenticated
  USING (auth_is_admin());

-- ── vacaciones ────────────────────────────────────────────────────────────────
-- Mismo criterio que records: lectura propia, escritura por empresa.
DROP POLICY IF EXISTS "anon_all" ON vacaciones;

CREATE POLICY "emp_read_vacaciones" ON vacaciones
  FOR SELECT TO authenticated
  USING (emp_id = auth_emp_id() OR auth_is_admin());

CREATE POLICY "company_insert_vacaciones" ON vacaciones
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_is_admin() OR
    emp_id IN (SELECT id FROM employees WHERE company_id = auth_company_id())
  );

CREATE POLICY "admin_manage_vacaciones" ON vacaciones
  FOR ALL TO authenticated
  USING (auth_is_admin())
  WITH CHECK (auth_is_admin());

-- ── notis ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all" ON notis;

CREATE POLICY "emp_notis" ON notis
  FOR SELECT TO authenticated
  USING (emp_id = auth_emp_id() OR auth_is_admin());

CREATE POLICY "admin_write_notis" ON notis
  FOR ALL TO authenticated
  USING (auth_is_admin())
  WITH CHECK (auth_is_admin());

-- ── chats ─────────────────────────────────────────────────────────────────────
-- Se mantiene estricto por empleado (no pasa por el flujo de cola offline +
-- reparto de dispositivo): un mensaje no debería poder enviarse "como" otro.
DROP POLICY IF EXISTS "anon_all" ON chats;

CREATE POLICY "emp_chats" ON chats
  FOR SELECT TO authenticated
  USING (from_id = auth_emp_id() OR to_id = auth_emp_id() OR auth_is_admin());

CREATE POLICY "emp_send_chat" ON chats
  FOR INSERT TO authenticated
  WITH CHECK (from_id = auth_emp_id() OR auth_is_admin());

CREATE POLICY "admin_manage_chats" ON chats
  FOR ALL TO authenticated
  USING (auth_is_admin())
  WITH CHECK (auth_is_admin());

-- ── cierres ───────────────────────────────────────────────────────────────────
-- La firma de cierre es una atestación legal personal — se mantiene
-- estricta por empleado, igual que chats.
DROP POLICY IF EXISTS "anon_all" ON cierres;

CREATE POLICY "emp_cierres" ON cierres
  FOR SELECT TO authenticated
  USING (emp_id = auth_emp_id() OR auth_is_admin());

CREATE POLICY "emp_sign_cierre" ON cierres
  FOR UPDATE TO authenticated
  USING (emp_id = auth_emp_id())
  WITH CHECK (emp_id = auth_emp_id());

CREATE POLICY "admin_manage_cierres" ON cierres
  FOR ALL TO authenticated
  USING (auth_is_admin())
  WITH CHECK (auth_is_admin());

-- ── audit ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all" ON audit;

CREATE POLICY "admin_read_audit" ON audit
  FOR SELECT TO authenticated
  USING (auth_is_admin());

CREATE POLICY "server_insert_audit" ON audit
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ── obras ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all" ON obras;

CREATE POLICY "emp_read_obras" ON obras
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admin_manage_obras" ON obras
  FOR ALL TO authenticated
  USING (auth_is_admin())
  WITH CHECK (auth_is_admin());

-- ── app_entities (fase de migración granular) ───────────────────────────────
DROP POLICY IF EXISTS "app_entities_anon_phase1" ON app_entities;
CREATE POLICY "emp_read_entities" ON app_entities
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM employees WHERE auth_id = auth.uid()));
CREATE POLICY "admin_manage_entities" ON app_entities
  FOR ALL TO authenticated
  USING (auth_is_admin())
  WITH CHECK (auth_is_admin());

-- El registro de idempotencia no expone payloads; solo responsables pueden leerlo.
DROP POLICY IF EXISTS "sync_operations_anon_phase1" ON sync_operations;
CREATE POLICY "admin_read_sync_operations" ON sync_operations
  FOR SELECT TO authenticated USING (auth_is_admin());
CREATE POLICY "authenticated_insert_sync_operations" ON sync_operations
  FOR INSERT TO authenticated WITH CHECK (
    company_id IN (SELECT company_id FROM employees WHERE auth_id = auth.uid())
  );
