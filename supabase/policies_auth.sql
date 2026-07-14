-- ================================================================
-- Times INC — Políticas RLS con Supabase Auth real
-- ESTADO: Listo para activar cuando auth_id esté poblado
--
-- PASOS PREVIOS:
--   1. Crear usuarios en Supabase Auth (dashboard > Authentication > Users)
--      para cada empleado o usar invitaciones por email.
--   2. Rellenar employees.auth_id con el UUID de cada usuario Auth:
--        UPDATE employees SET auth_id = '<uuid-del-user-auth>' WHERE id = '<emp-id>';
--   3. El admin mantiene su auth_id también para poder leer/escribir todo.
--
-- ACTIVACIÓN:
--   Ejecutar este script DESPUÉS de eliminar las políticas anon_all:
--     DROP POLICY IF EXISTS "anon_all" ON companies;
--     DROP POLICY IF EXISTS "anon_all" ON employees;
--     -- (etc. para todas las tablas)
--   Luego ejecutar este script.
-- ================================================================

-- Función helper: devuelve el emp_id del usuario autenticado actual
CREATE OR REPLACE FUNCTION auth_emp_id() RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM employees WHERE auth_id = auth.uid() LIMIT 1;
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
-- Empleado: solo lee y escribe sus propios fichajes.
-- Admin: acceso total.
DROP POLICY IF EXISTS "anon_all" ON records;

CREATE POLICY "emp_read_own_records" ON records
  FOR SELECT TO authenticated
  USING (emp_id = auth_emp_id() OR auth_is_admin());

CREATE POLICY "emp_insert_own_records" ON records
  FOR INSERT TO authenticated
  WITH CHECK (emp_id = auth_emp_id() OR auth_is_admin());

CREATE POLICY "emp_update_own_records" ON records
  FOR UPDATE TO authenticated
  USING (emp_id = auth_emp_id() OR auth_is_admin())
  WITH CHECK (emp_id = auth_emp_id() OR auth_is_admin());

CREATE POLICY "admin_delete_records" ON records
  FOR DELETE TO authenticated
  USING (auth_is_admin());

-- ── vacaciones ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all" ON vacaciones;

CREATE POLICY "emp_vacaciones" ON vacaciones
  FOR SELECT TO authenticated
  USING (emp_id = auth_emp_id() OR auth_is_admin());

CREATE POLICY "emp_insert_vacaciones" ON vacaciones
  FOR INSERT TO authenticated
  WITH CHECK (emp_id = auth_emp_id() OR auth_is_admin());

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
