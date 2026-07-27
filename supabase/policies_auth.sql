-- ================================================================
-- Times INC — Políticas RLS con Supabase Auth real (Fase 3)
-- ESTADO: NO ACTIVAR TODAVÍA.
--
-- Bloqueos de runtime confirmados:
--   1. El acceso PIN no dispone todavía de una sesión oficial de Supabase
--      Auth. El antiguo JWT HS256 personalizado está retirado.
--   2. dataService fuerza PostgREST al rol anon durante la Fase 1.
--   3. app_data conserva el blob completo y políticas anon propias; proteger
--      solo las tablas V2 no elimina esa vía de lectura/escritura.
--
-- Este archivo describe el objetivo de políticas, no es por sí solo un
-- procedimiento de activación. La fuente de verdad ejecutable es
-- `npm run audit:launch`: solo continuar cuando devuelva
-- LISTO_PARA_PRUEBA_CONTROLADA y no presente rlsRuntimeBlockers.
--
-- DECISIÓN DE DISEÑO — dispositivo compartido (tablet de obra):
--   Varios empleados fichan por PIN en el MISMO dispositivo a lo largo del
--   día. Si el empleado A ficha sin conexión (queda en cola local) y luego
--   el empleado B inicia sesión en ese mismo tablet antes de que A
--   sincronice, una futura capa autenticada podría subir la escritura de A
--   con la sesión oficial de B: la cola no conserva una sesión de usuario.
--   Restringir INSERT/UPDATE de `records` y
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
-- ACTIVACIÓN FUTURA (en Dashboard > SQL Editor, fuera de horas punta):
--   1. Exigir que cada employees.auth_id corresponda a un usuario real:
--        SELECT e.id, e.name, e.role, e.auth_id
--        FROM employees e
--        LEFT JOIN auth.users u ON u.id = e.auth_id
--        WHERE NOT e.baja AND (e.auth_id IS NULL OR u.id IS NULL);
--      Cualquier fila bloquea la activación: ese usuario perdería acceso.
--   2. Retirar/proteger app_data y validar clientes de datos + Realtime con
--      sesiones email y PIN reales.
--   3. Ejecutar este script completo. Las líneas DROP POLICY IF EXISTS
--      "anon_all" ya están incluidas — no hace falta borrarlas a mano
--      antes.
--   4. Probar en caliente: iniciar sesión como admin y como un empleado
--      normal, fichar entrada/salida, y confirmar que se guarda.
--   5. Si algo falla, ejecutar policies_auth_rollback.sql para volver a
--      anon_all de inmediato sin perder datos.
-- ================================================================

-- Función helper: devuelve el emp_id del usuario autenticado actual
CREATE OR REPLACE FUNCTION auth_emp_id() RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT id FROM employees WHERE auth_id = auth.uid() AND NOT baja LIMIT 1;
$$;

-- Función helper: company_id del usuario autenticado actual
CREATE OR REPLACE FUNCTION auth_company_id() RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT company_id FROM employees WHERE auth_id = auth.uid() AND NOT baja LIMIT 1;
$$;

-- Función helper: true si el usuario es admin o jefe_obra
CREATE OR REPLACE FUNCTION auth_is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'jefe_obra') FROM employees WHERE auth_id = auth.uid() AND NOT baja LIMIT 1),
    false
  );
$$;

-- Helpers SECURITY DEFINER: las políticas de employees solo dejan ver la fila
-- propia. Consultar employees directamente desde otra policy haría que RLS
-- ocultase a los compañeros y rompería la cola de un dispositivo compartido.
CREATE OR REPLACE FUNCTION auth_same_company(target_company_id text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT target_company_id IS NOT NULL
    AND target_company_id = (SELECT company_id FROM employees WHERE auth_id = auth.uid() AND NOT baja LIMIT 1);
$$;

CREATE OR REPLACE FUNCTION auth_employee_in_company(target_emp_id text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM employees target
    WHERE target.id = target_emp_id
      AND target.company_id = (SELECT company_id FROM employees current_emp WHERE current_emp.auth_id = auth.uid() AND NOT current_emp.baja LIMIT 1)
  );
$$;

-- ── companies ──────────────────────────────────────────────────────────────────
-- Solo admins pueden leer/escribir la empresa
DROP POLICY IF EXISTS "anon_all" ON companies;

CREATE POLICY "emp_read_company" ON companies
  FOR SELECT TO authenticated
  USING (auth_same_company(id));

CREATE POLICY "admin_all_company" ON companies
  FOR ALL TO authenticated
  USING (auth_is_admin() AND auth_same_company(id))
  WITH CHECK (auth_is_admin() AND auth_same_company(id));

-- ── employees ──────────────────────────────────────────────────────────────────
-- Cada empleado lee su propia fila; admins leen todas.
DROP POLICY IF EXISTS "anon_all" ON employees;

CREATE POLICY "emp_read_self" ON employees
  FOR SELECT TO authenticated
  USING (auth_id = auth.uid() OR (auth_is_admin() AND auth_same_company(company_id)));

CREATE POLICY "admin_write_employees" ON employees
  FOR ALL TO authenticated
  USING (auth_is_admin() AND auth_same_company(company_id))
  WITH CHECK (auth_is_admin() AND auth_same_company(company_id));

-- ── records (fichajes) ────────────────────────────────────────────────────────
-- Lectura: solo los propios (o admin). Escritura: cualquier compañero
-- autenticado de la misma empresa — ver "DECISIÓN DE DISEÑO" arriba.
DROP POLICY IF EXISTS "anon_all" ON records;

CREATE POLICY "emp_read_own_records" ON records
  FOR SELECT TO authenticated
  USING (emp_id = auth_emp_id() OR (auth_is_admin() AND auth_same_company(company_id)));

CREATE POLICY "company_insert_records" ON records
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_same_company(company_id)
    AND auth_employee_in_company(emp_id)
  );

CREATE POLICY "company_update_records" ON records
  FOR UPDATE TO authenticated
  USING (
    auth_same_company(company_id)
    AND auth_employee_in_company(emp_id)
  )
  WITH CHECK (
    auth_same_company(company_id)
    AND auth_employee_in_company(emp_id)
  );

CREATE POLICY "admin_delete_records" ON records
  FOR DELETE TO authenticated
  USING (auth_is_admin() AND auth_same_company(company_id));

-- ── vacaciones ────────────────────────────────────────────────────────────────
-- Mismo criterio que records: lectura propia, escritura por empresa.
DROP POLICY IF EXISTS "anon_all" ON vacaciones;
DROP POLICY IF EXISTS "admin_manage_vacaciones" ON vacaciones;

CREATE POLICY "emp_read_vacaciones" ON vacaciones
  FOR SELECT TO authenticated
  USING (emp_id = auth_emp_id() OR (auth_is_admin() AND auth_same_company(company_id)));

CREATE POLICY "company_insert_vacaciones" ON vacaciones
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_same_company(company_id)
    AND auth_employee_in_company(emp_id)
  );

CREATE POLICY "company_update_vacaciones" ON vacaciones
  FOR UPDATE TO authenticated
  USING (auth_same_company(company_id) AND auth_employee_in_company(emp_id))
  WITH CHECK (auth_same_company(company_id) AND auth_employee_in_company(emp_id));

CREATE POLICY "company_delete_vacaciones" ON vacaciones
  FOR DELETE TO authenticated
  USING (auth_same_company(company_id) AND auth_employee_in_company(emp_id));

-- ── notis ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all" ON notis;

CREATE POLICY "emp_notis" ON notis
  FOR SELECT TO authenticated
  USING (emp_id = auth_emp_id() OR (auth_is_admin() AND auth_same_company(company_id)));

CREATE POLICY "admin_write_notis" ON notis
  FOR ALL TO authenticated
  USING (auth_is_admin() AND auth_same_company(company_id))
  WITH CHECK (auth_is_admin() AND auth_same_company(company_id));

-- ── chats ─────────────────────────────────────────────────────────────────────
-- Se mantiene estricto por empleado (no pasa por el flujo de cola offline +
-- reparto de dispositivo): un mensaje no debería poder enviarse "como" otro.
DROP POLICY IF EXISTS "anon_all" ON chats;

CREATE POLICY "emp_chats" ON chats
  FOR SELECT TO authenticated
  USING (
    auth_same_company(company_id)
    AND (from_id = auth_emp_id() OR to_id = auth_emp_id() OR auth_is_admin())
  );

CREATE POLICY "emp_send_chat" ON chats
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_same_company(company_id)
    AND (from_id = auth_emp_id() OR auth_is_admin())
  );

CREATE POLICY "admin_manage_chats" ON chats
  FOR ALL TO authenticated
  USING (auth_is_admin() AND auth_same_company(company_id))
  WITH CHECK (auth_is_admin() AND auth_same_company(company_id));

-- ── cierres ───────────────────────────────────────────────────────────────────
-- La firma de cierre es una atestación legal personal — se mantiene
-- estricta por empleado, igual que chats.
DROP POLICY IF EXISTS "anon_all" ON cierres;

CREATE POLICY "emp_cierres" ON cierres
  FOR SELECT TO authenticated
  USING (emp_id = auth_emp_id() OR (auth_is_admin() AND auth_same_company(company_id)));

CREATE POLICY "emp_sign_cierre" ON cierres
  FOR UPDATE TO authenticated
  USING (emp_id = auth_emp_id() AND auth_same_company(company_id))
  WITH CHECK (emp_id = auth_emp_id() AND auth_same_company(company_id));

CREATE POLICY "admin_manage_cierres" ON cierres
  FOR ALL TO authenticated
  USING (auth_is_admin() AND auth_same_company(company_id))
  WITH CHECK (auth_is_admin() AND auth_same_company(company_id));

-- ── audit ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all" ON audit;

CREATE POLICY "admin_read_audit" ON audit
  FOR SELECT TO authenticated
  USING (auth_is_admin() AND auth_same_company(company_id));

CREATE POLICY "server_insert_audit" ON audit
  FOR INSERT TO authenticated
  WITH CHECK (auth_same_company(company_id));

-- ── obras ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all" ON obras;

CREATE POLICY "emp_read_obras" ON obras
  FOR SELECT TO authenticated
  USING (auth_same_company(company_id));

CREATE POLICY "admin_manage_obras" ON obras
  FOR ALL TO authenticated
  USING (auth_is_admin() AND auth_same_company(company_id))
  WITH CHECK (auth_is_admin() AND auth_same_company(company_id));

-- ── app_entities (fase de migración granular) ───────────────────────────────
DROP POLICY IF EXISTS "app_entities_anon_phase1" ON app_entities;
CREATE POLICY "emp_read_entities" ON app_entities
  FOR SELECT TO authenticated
  USING (auth_same_company(company_id));
CREATE POLICY "admin_manage_entities" ON app_entities
  FOR ALL TO authenticated
  USING (auth_is_admin() AND auth_same_company(company_id))
  WITH CHECK (auth_is_admin() AND auth_same_company(company_id));

-- El registro de idempotencia no expone payloads; solo responsables pueden leerlo.
DROP POLICY IF EXISTS "sync_operations_anon_phase1" ON sync_operations;
CREATE POLICY "admin_read_sync_operations" ON sync_operations
  FOR SELECT TO authenticated USING (auth_is_admin() AND auth_same_company(company_id));
CREATE POLICY "authenticated_insert_sync_operations" ON sync_operations
  FOR INSERT TO authenticated WITH CHECK (auth_same_company(company_id));
