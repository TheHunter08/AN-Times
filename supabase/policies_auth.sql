-- ================================================================
-- Times INC — Políticas RLS con Supabase Auth real (Fase 3)
-- ESTADO: RUNTIME IMPLEMENTADO; ACTIVAR SOLO TRAS PASAR audit:launch.
--
-- En el build auth_rls el PIN queda retirado, PostgREST usa el JWT oficial,
-- las tablas son la fuente primaria y el SW nunca sincroniza con anon.
--
-- Este archivo describe el objetivo de políticas, no es por sí solo un
-- procedimiento de activación. La fuente de verdad ejecutable es
-- `npm run audit:launch`: solo continuar cuando devuelva
-- LISTO_PARA_PRUEBA_CONTROLADA y no presente rlsRuntimeBlockers.
--
-- DISPOSITIVO COMPARTIDO:
--   La caché y la cola offline se separan por auth.uid(). El empleado B nunca
--   sube operaciones pendientes de A; A las recupera al volver a iniciar su
--   sesión. Esto permite aplicar RLS estricta por empleado también a fichajes,
--   vacaciones, cierres, documentos, gastos y conversaciones.
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

-- Función helper: true si el usuario es auditor (solo lectura, p.ej. para una
-- inspección de la Inspección de Trabajo y Seguridad Social). No concede
-- ningún permiso de escritura por sí sola — solo se añade a las políticas
-- SELECT de las tablas que necesita el Paquete de inspección.
CREATE OR REPLACE FUNCTION auth_is_auditor() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT role = 'auditor' FROM employees WHERE auth_id = auth.uid() AND NOT baja LIMIT 1),
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

-- Ambito operativo del encargado. Replica el filtro de la PWA sin confiar en
-- datos enviados por el navegador: misma empresa y coincidencia de centro O,
-- cuando el encargado tiene obras asignadas, de obra o del centro al que
-- pertenece esa obra. Un encargado sin centro ni obra no obtiene equipo.
-- Antes se exigian centro Y obra a la vez cuando el encargado tenia las dos
-- cosas asignadas (caso habitual) — un empleado vinculado solo por obra (con
-- otro centro) o solo por centro (con otra obra) quedaba fuera del equipo
-- del encargado en la base de datos aunque la PWA (ya corregida) lo mostrara
-- en pantalla. Ver el mismo fix en supervisorScope.js (getScopedEmployees).
CREATE OR REPLACE FUNCTION auth_can_supervise_employee(target_emp_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
DECLARE
  actor employees%ROWTYPE;
  target employees%ROWTYPE;
  actor_center text;
  target_center text;
  actor_has_works boolean;
  centers_match boolean;
  works_match boolean;
  actor_work_reaches_target_center boolean;
BEGIN
  SELECT * INTO actor FROM employees WHERE auth_id = auth.uid() AND NOT baja LIMIT 1;
  SELECT * INTO target FROM employees WHERE id = target_emp_id AND NOT baja LIMIT 1;

  IF actor.id IS NULL OR target.id IS NULL
     OR actor.id = target.id
     OR actor.role <> 'encargado'
     OR actor.company_id IS DISTINCT FROM target.company_id
     OR target.role = 'admin' THEN
    RETURN false;
  END IF;

  actor_center := lower(NULLIF(btrim(actor.centro_trabajo), ''));
  target_center := lower(NULLIF(btrim(target.centro_trabajo), ''));
  actor_has_works := cardinality(COALESCE(actor.obras_asignadas, '{}'::text[])) > 0;

  SELECT EXISTS (
    SELECT 1 FROM obras work
    WHERE work.company_id = actor.company_id
      AND NOT COALESCE(work.deleted, false)
      AND EXISTS (
        SELECT 1 FROM unnest(COALESCE(actor.obras_asignadas, '{}'::text[])) actor_work
        WHERE lower(btrim(actor_work)) IN (lower(btrim(work.id)), lower(btrim(work.nombre)))
      )
      AND lower(NULLIF(btrim(COALESCE(work.data->>'centroTrabajo', work.data->>'centro_trabajo')), '')) = target_center
  ) INTO actor_work_reaches_target_center;

  centers_match := actor_center IS NOT NULL AND (
    target_center = actor_center
    OR EXISTS (
      SELECT 1 FROM obras work
      WHERE work.company_id = actor.company_id
        AND NOT COALESCE(work.deleted, false)
        AND lower(NULLIF(btrim(COALESCE(work.data->>'centroTrabajo', work.data->>'centro_trabajo')), '')) = actor_center
        AND EXISTS (
          SELECT 1 FROM unnest(COALESCE(target.obras_asignadas, '{}'::text[])) target_work
          WHERE lower(btrim(target_work)) IN (lower(btrim(work.id)), lower(btrim(work.nombre)))
        )
    )
    OR actor_work_reaches_target_center
  );

  works_match := actor_has_works AND (
    EXISTS (
      SELECT 1
      FROM unnest(COALESCE(actor.obras_asignadas, '{}'::text[])) actor_work
      JOIN unnest(COALESCE(target.obras_asignadas, '{}'::text[])) target_work
        ON lower(btrim(actor_work)) = lower(btrim(target_work))
    )
    OR actor_work_reaches_target_center
  );

  RETURN (actor_center IS NOT NULL OR actor_has_works) AND (centers_match OR works_match);
END;
$$;

REVOKE ALL ON FUNCTION auth_can_supervise_employee(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION auth_can_supervise_employee(text) TO authenticated, service_role;

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
  USING (
    auth_id = auth.uid()
    OR (auth_is_admin() AND auth_same_company(company_id))
    OR auth_can_supervise_employee(id)
    OR (auth_is_auditor() AND auth_same_company(company_id))
  );

CREATE POLICY "admin_write_employees" ON employees
  FOR ALL TO authenticated
  USING (auth_is_admin() AND auth_same_company(company_id))
  WITH CHECK (auth_is_admin() AND auth_same_company(company_id));

CREATE POLICY "employee_insert_self_for_upsert" ON employees
  FOR INSERT TO authenticated
  WITH CHECK (id = auth_emp_id() AND auth_id = auth.uid() AND auth_same_company(company_id));

CREATE POLICY "employee_update_self" ON employees
  FOR UPDATE TO authenticated
  USING (id = auth_emp_id() AND auth_id = auth.uid())
  WITH CHECK (id = auth_emp_id() AND auth_id = auth.uid() AND auth_same_company(company_id));

CREATE OR REPLACE FUNCTION protect_employee_security_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_admin() THEN
    IF OLD.auth_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'employee identity mismatch' USING ERRCODE = '42501';
    END IF;
    NEW.company_id := OLD.company_id;
    NEW.role := OLD.role;
    NEW.auth_id := OLD.auth_id;
    NEW.pin_hash := OLD.pin_hash;
    NEW.pin_len := OLD.pin_len;
    NEW.data := COALESCE(NEW.data, '{}'::jsonb) - 'pin' - 'pinHash' - 'pinLen';
    NEW.baja := OLD.baja;
    NEW.obras_asignadas := OLD.obras_asignadas;
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS employees_protect_security_fields ON employees;
CREATE TRIGGER employees_protect_security_fields
BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION protect_employee_security_fields();

-- El PIN deja de ser credencial en modo seguro. Se conserva una copia de
-- rollback inaccesible al cliente y se retira el hash de la tabla que lee la
-- PWA, evitando ataques offline contra hashes descargados.
CREATE TABLE IF NOT EXISTS employee_pin_archive (
  employee_id text PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  pin_hash text,
  pin_len int,
  archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE employee_pin_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE employee_pin_archive FROM anon, authenticated;
INSERT INTO employee_pin_archive(employee_id, pin_hash, pin_len)
SELECT id, pin_hash, pin_len FROM employees WHERE pin_hash IS NOT NULL
ON CONFLICT (employee_id) DO UPDATE SET
  pin_hash = EXCLUDED.pin_hash, pin_len = EXCLUDED.pin_len, archived_at = now();
UPDATE employees SET pin_hash = NULL, pin_len = NULL WHERE pin_hash IS NOT NULL;
UPDATE employees
SET data = COALESCE(data, '{}'::jsonb) - 'pin' - 'pinHash' - 'pinLen', updated_at = now()
WHERE COALESCE(data, '{}'::jsonb) ?| ARRAY['pin', 'pinHash', 'pinLen'];

-- ── records (fichajes) ────────────────────────────────────────────────────────
-- Lectura y escritura propias; responsables autorizados gestionan la empresa.
DROP POLICY IF EXISTS "anon_all" ON records;

CREATE POLICY "emp_read_own_records" ON records
  FOR SELECT TO authenticated
  USING (
    emp_id = auth_emp_id()
    OR (auth_is_admin() AND auth_same_company(company_id))
    OR (auth_same_company(company_id) AND auth_can_supervise_employee(emp_id))
    OR (auth_is_auditor() AND auth_same_company(company_id))
  );

CREATE POLICY "company_insert_records" ON records
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_same_company(company_id)
    AND (emp_id = auth_emp_id() OR auth_is_admin() OR auth_can_supervise_employee(emp_id))
  );

CREATE POLICY "company_update_records" ON records
  FOR UPDATE TO authenticated
  USING (
    auth_same_company(company_id)
    AND (emp_id = auth_emp_id() OR auth_is_admin() OR auth_can_supervise_employee(emp_id))
  )
  WITH CHECK (
    auth_same_company(company_id)
    AND (emp_id = auth_emp_id() OR auth_is_admin() OR auth_can_supervise_employee(emp_id))
  );

CREATE POLICY "admin_delete_records" ON records
  FOR DELETE TO authenticated
  USING (
    auth_same_company(company_id)
    AND (auth_is_admin() OR auth_can_supervise_employee(emp_id))
  );

CREATE OR REPLACE FUNCTION protect_employee_record_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_admin() THEN
    IF auth_can_supervise_employee(CASE WHEN TG_OP = 'INSERT' THEN NEW.emp_id ELSE OLD.emp_id END) THEN
      NEW.company_id := auth_company_id();
      IF TG_OP = 'INSERT' THEN
        NEW.emp_name := (SELECT name FROM employees WHERE id = NEW.emp_id LIMIT 1);
        NEW.deleted := false; NEW.deleted_at := NULL;
      ELSE
        NEW.company_id := OLD.company_id; NEW.emp_id := OLD.emp_id; NEW.emp_name := OLD.emp_name;
        NEW.created_at := OLD.created_at;
      END IF;
    ELSE
      NEW.company_id := auth_company_id();
      NEW.emp_id := auth_emp_id();
      IF TG_OP = 'INSERT' THEN
        NEW.aceptada := false; NEW.validado := false; NEW.rechazado := false;
        NEW.validado_by := NULL; NEW.validado_at := NULL;
        NEW.deleted := false; NEW.deleted_at := NULL;
      ELSE
        NEW.company_id := OLD.company_id; NEW.emp_id := OLD.emp_id; NEW.emp_name := OLD.emp_name;
        NEW.aceptada := OLD.aceptada; NEW.validado := OLD.validado; NEW.rechazado := OLD.rechazado;
        NEW.validado_by := OLD.validado_by; NEW.validado_at := OLD.validado_at;
        NEW.deleted := OLD.deleted; NEW.deleted_at := OLD.deleted_at;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS records_protect_employee_fields ON records;
CREATE TRIGGER records_protect_employee_fields
BEFORE INSERT OR UPDATE ON records FOR EACH ROW EXECUTE FUNCTION protect_employee_record_fields();

-- ── vacaciones ────────────────────────────────────────────────────────────────
-- Mismo criterio que records: cada empleado opera sus solicitudes.
DROP POLICY IF EXISTS "anon_all" ON vacaciones;
DROP POLICY IF EXISTS "admin_manage_vacaciones" ON vacaciones;

CREATE POLICY "emp_read_vacaciones" ON vacaciones
  FOR SELECT TO authenticated
  USING (
    emp_id = auth_emp_id()
    OR (auth_is_admin() AND auth_same_company(company_id))
    OR (auth_same_company(company_id) AND auth_can_supervise_employee(emp_id))
    OR (auth_is_auditor() AND auth_same_company(company_id))
  );

CREATE POLICY "company_insert_vacaciones" ON vacaciones
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_same_company(company_id)
    AND (emp_id = auth_emp_id() OR auth_is_admin())
  );

CREATE POLICY "company_update_vacaciones" ON vacaciones
  FOR UPDATE TO authenticated
  USING (auth_same_company(company_id) AND (emp_id = auth_emp_id() OR auth_is_admin() OR auth_can_supervise_employee(emp_id)))
  WITH CHECK (auth_same_company(company_id) AND (emp_id = auth_emp_id() OR auth_is_admin() OR auth_can_supervise_employee(emp_id)));

CREATE POLICY "company_delete_vacaciones" ON vacaciones
  FOR DELETE TO authenticated
  USING (auth_same_company(company_id) AND (emp_id = auth_emp_id() OR auth_is_admin()));

CREATE OR REPLACE FUNCTION protect_employee_vacation_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_admin() THEN
    IF TG_OP = 'UPDATE' AND auth_can_supervise_employee(OLD.emp_id) THEN
      NEW.company_id := OLD.company_id; NEW.emp_id := OLD.emp_id; NEW.emp_name := OLD.emp_name;
      NEW.fecha_inicio := OLD.fecha_inicio; NEW.fecha_fin := OLD.fecha_fin;
      NEW.tipo := OLD.tipo; NEW.motivo := OLD.motivo;
      NEW.deleted := OLD.deleted; NEW.deleted_at := OLD.deleted_at; NEW.created_at := OLD.created_at;
      NEW.data := COALESCE(OLD.data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'estado', NEW.estado,
        'resolucion', NEW.resolucion,
        'resolvedAt', NEW.data->'resolvedAt',
        'resolvedBy', NEW.data->'resolvedBy',
        'motivoRechazo', NEW.data->'motivoRechazo',
        '_upd', NEW.data->'_upd'
      ));
    ELSE
      NEW.company_id := auth_company_id();
      NEW.emp_id := auth_emp_id();
      IF TG_OP = 'INSERT' THEN
        NEW.estado := 'pendiente'; NEW.resolucion := NULL;
      ELSE
        NEW.company_id := OLD.company_id; NEW.emp_id := OLD.emp_id; NEW.emp_name := OLD.emp_name;
        NEW.estado := OLD.estado; NEW.resolucion := OLD.resolucion;
        NEW.deleted := OLD.deleted; NEW.deleted_at := OLD.deleted_at;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS vacaciones_protect_employee_fields ON vacaciones;
CREATE TRIGGER vacaciones_protect_employee_fields
BEFORE INSERT OR UPDATE ON vacaciones FOR EACH ROW EXECUTE FUNCTION protect_employee_vacation_fields();

-- ── notis ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all" ON notis;

CREATE POLICY "emp_notis" ON notis
  FOR SELECT TO authenticated
  USING (
    emp_id = auth_emp_id()
    OR (auth_is_admin() AND auth_same_company(company_id))
    OR (auth_same_company(company_id) AND auth_can_supervise_employee(emp_id))
  );

CREATE POLICY "admin_write_notis" ON notis
  FOR ALL TO authenticated
  USING (auth_is_admin() AND auth_same_company(company_id))
  WITH CHECK (auth_is_admin() AND auth_same_company(company_id));

DROP POLICY IF EXISTS "supervisor_write_team_notis" ON notis;
CREATE POLICY "supervisor_write_team_notis" ON notis
  FOR ALL TO authenticated
  USING (auth_same_company(company_id) AND auth_can_supervise_employee(emp_id))
  WITH CHECK (auth_same_company(company_id) AND auth_can_supervise_employee(emp_id));

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
  USING (
    emp_id = auth_emp_id()
    OR (auth_is_admin() AND auth_same_company(company_id))
    OR (auth_same_company(company_id) AND auth_can_supervise_employee(emp_id))
    OR (auth_is_auditor() AND auth_same_company(company_id))
  );

CREATE POLICY "emp_sign_cierre" ON cierres
  FOR UPDATE TO authenticated
  USING (emp_id = auth_emp_id() AND auth_same_company(company_id))
  WITH CHECK (emp_id = auth_emp_id() AND auth_same_company(company_id));

CREATE POLICY "admin_manage_cierres" ON cierres
  FOR ALL TO authenticated
  USING (auth_is_admin() AND auth_same_company(company_id))
  WITH CHECK (auth_is_admin() AND auth_same_company(company_id));

DROP POLICY IF EXISTS "supervisor_refresh_team_cierres" ON cierres;
CREATE POLICY "supervisor_refresh_team_cierres" ON cierres
  FOR UPDATE TO authenticated
  USING (auth_same_company(company_id) AND auth_can_supervise_employee(emp_id))
  WITH CHECK (auth_same_company(company_id) AND auth_can_supervise_employee(emp_id));

CREATE OR REPLACE FUNCTION protect_employee_closure_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  allowed_data jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_admin() THEN
    IF auth_can_supervise_employee(OLD.emp_id) THEN
      IF OLD.firma_admin IS NOT NULL OR OLD.firma_emp IS NOT NULL OR OLD.estado = 'firmado' THEN
        RAISE EXCEPTION 'signed closure cannot be changed by supervisor' USING ERRCODE = '42501';
      END IF;
      NEW.company_id := OLD.company_id;
      NEW.emp_id := OLD.emp_id;
      NEW.mes := OLD.mes;
      NEW.firma_admin := OLD.firma_admin;
      NEW.firma_emp := OLD.firma_emp;
      NEW.created_at := OLD.created_at;
      NEW.data := COALESCE(NEW.data, '{}'::jsonb)
        - 'firma' - 'firmaEmp' - 'firmaAdmin' - 'pdfData' - 'documentoId' - 'integrityHash';
    ELSIF OLD.emp_id IS DISTINCT FROM auth_emp_id() THEN
      RAISE EXCEPTION 'closure does not belong to current employee' USING ERRCODE = '42501';
    ELSE
      NEW.company_id := OLD.company_id;
      NEW.emp_id := OLD.emp_id;
      NEW.mes := OLD.mes;
      NEW.total_min := OLD.total_min;
      NEW.extra_min := OLD.extra_min;
      NEW.target_min := OLD.target_min;
      NEW.deficit_min := OLD.deficit_min;
      NEW.balance_min := OLD.balance_min;
      NEW.justified_min := OLD.justified_min;
      NEW.non_contract_min := OLD.non_contract_min;
      NEW.firma_admin := OLD.firma_admin;
      NEW.desactualizado := OLD.desactualizado;
      NEW.created_at := OLD.created_at;
      IF NEW.estado NOT IN ('pendiente_firma_admin', 'firmado') THEN NEW.estado := OLD.estado; END IF;
      allowed_data := jsonb_strip_nulls(jsonb_build_object(
        'firma', NEW.data->'firma',
        'firmaEmp', NEW.data->'firmaEmp',
        'estado', NEW.data->'estado',
        '_upd', NEW.data->'_upd',
        'pdfData', NEW.data->'pdfData',
        'documentoId', NEW.data->'documentoId',
        'integrityHash', NEW.data->'integrityHash'
      ));
      NEW.data := COALESCE(OLD.data, '{}'::jsonb) || allowed_data;
      IF NEW.estado = 'firmado' AND (
        NEW.firma_emp IS NULL
        OR COALESCE(NEW.data->>'integrityHash', '') !~ '^[a-fA-F0-9]{64}$'
      ) THEN
        RAISE EXCEPTION 'signed closure requires signature and SHA-256 evidence' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cierres_protect_employee_fields ON cierres;
CREATE TRIGGER cierres_protect_employee_fields
BEFORE UPDATE ON cierres FOR EACH ROW EXECUTE FUNCTION protect_employee_closure_fields();

-- ── audit ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all" ON audit;

CREATE POLICY "admin_read_audit" ON audit
  FOR SELECT TO authenticated
  USING (auth_is_admin() AND auth_same_company(company_id));

CREATE POLICY "server_insert_audit" ON audit
  FOR INSERT TO authenticated
  WITH CHECK (auth_same_company(company_id));

DROP POLICY IF EXISTS "audit_events_anon_phase1" ON audit_events;
DROP POLICY IF EXISTS "audit_events_insert" ON audit_events;
DROP POLICY IF EXISTS "audit_events_admin_read" ON audit_events;
CREATE POLICY "audit_events_insert" ON audit_events
  FOR INSERT TO authenticated
  WITH CHECK (auth_same_company(company_id));
CREATE POLICY "audit_events_admin_read" ON audit_events
  FOR SELECT TO authenticated
  USING (auth_is_admin() AND auth_same_company(company_id));

-- ── obras ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all" ON obras;

CREATE POLICY "emp_read_obras" ON obras
  FOR SELECT TO authenticated
  USING (auth_same_company(company_id));

CREATE POLICY "admin_manage_obras" ON obras
  FOR ALL TO authenticated
  USING (auth_is_admin() AND auth_same_company(company_id))
  WITH CHECK (auth_is_admin() AND auth_same_company(company_id));

-- ── app_entities (filas granulares con propietario) ────────────────────────
DROP POLICY IF EXISTS "app_entities_anon_phase1" ON app_entities;
DROP POLICY IF EXISTS "emp_read_entities" ON app_entities;
DROP POLICY IF EXISTS "employee_read_entities" ON app_entities;
DROP POLICY IF EXISTS "employee_write_own_entities" ON app_entities;
DROP POLICY IF EXISTS "employee_write_notification_state" ON app_entities;
DROP POLICY IF EXISTS "supervisor_read_team_entities" ON app_entities;
DROP POLICY IF EXISTS "supervisor_manage_team_entities" ON app_entities;
CREATE POLICY "admin_manage_entities" ON app_entities
  FOR ALL TO authenticated
  USING (auth_is_admin() AND auth_same_company(company_id))
  WITH CHECK (auth_is_admin() AND auth_same_company(company_id));

CREATE POLICY "employee_read_entities" ON app_entities
  FOR SELECT TO authenticated
  USING (
    auth_same_company(company_id)
    AND (
      access_scope = 'company'
      OR subject_emp_id = auth_emp_id()
      OR auth_emp_id() = ANY(participant_emp_ids)
    )
  );

CREATE POLICY "employee_write_own_entities" ON app_entities
  FOR ALL TO authenticated
  USING (
    access_scope = 'employee'
    AND collection IN ('medicos','ausencias','notis','documentos','correccionesFichaje','chats','gastos','wellbeing','legalAcknowledgements','firmas')
    AND (subject_emp_id = auth_emp_id() OR auth_emp_id() = ANY(participant_emp_ids))
  )
  WITH CHECK (
    auth_same_company(company_id)
    AND access_scope = 'employee'
    AND collection IN ('medicos','ausencias','notis','documentos','correccionesFichaje','chats','gastos','wellbeing','legalAcknowledgements','firmas')
    AND (subject_emp_id = auth_emp_id() OR auth_emp_id() = ANY(participant_emp_ids))
  );

-- Este mapa solo evita recordatorios duplicados; no contiene documentos,
-- conversaciones ni contenido laboral.
CREATE POLICY "employee_write_notification_state" ON app_entities
  FOR ALL TO authenticated
  USING (collection = 'notisSent' AND access_scope = 'company' AND auth_same_company(company_id))
  WITH CHECK (collection = 'notisSent' AND access_scope = 'company' AND auth_same_company(company_id));

-- El encargado solo recibe las colecciones que utiliza su panel limitado.
-- Documentos, firmas, datos médicos, bienestar, legal y gastos permanecen
-- privados aunque pertenezcan a un empleado de su centro/obra.
CREATE POLICY "supervisor_read_team_entities" ON app_entities
  FOR SELECT TO authenticated
  USING (
    auth_same_company(company_id)
    AND access_scope = 'employee'
    AND collection IN ('correccionesFichaje','chats','notis','turnos')
    AND (
      auth_can_supervise_employee(subject_emp_id)
      OR EXISTS (
        SELECT 1 FROM unnest(participant_emp_ids) participant
        WHERE auth_can_supervise_employee(participant)
      )
    )
  );

CREATE POLICY "supervisor_manage_team_entities" ON app_entities
  FOR ALL TO authenticated
  USING (
    auth_same_company(company_id)
    AND access_scope = 'employee'
    AND collection IN ('correccionesFichaje','chats','notis','turnos')
    AND (
      auth_can_supervise_employee(subject_emp_id)
      OR EXISTS (
        SELECT 1 FROM unnest(participant_emp_ids) participant
        WHERE auth_can_supervise_employee(participant)
      )
    )
  )
  WITH CHECK (
    auth_same_company(company_id)
    AND access_scope = 'employee'
    AND collection IN ('correccionesFichaje','chats','notis','turnos')
    AND (
      auth_can_supervise_employee(subject_emp_id)
      OR EXISTS (
        SELECT 1 FROM unnest(participant_emp_ids) participant
        WHERE auth_can_supervise_employee(participant)
      )
    )
  );

CREATE OR REPLACE FUNCTION enforce_entity_access_metadata() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_subject text;
  v_participants text[];
BEGIN
  IF NEW.collection IN ('audit', 'partesTrabajo', 'mensajes', 'monthSnapshots', 'anomalias_vistas') THEN
    NEW.access_scope := 'admin'; NEW.subject_emp_id := NULL; NEW.participant_emp_ids := '{}';
  ELSIF NEW.collection IN ('empresas', 'centrosTrabajo', 'notisSent', 'config') THEN
    NEW.access_scope := 'company'; NEW.subject_emp_id := NULL; NEW.participant_emp_ids := '{}';
  ELSE
    v_subject := CASE WHEN NEW.collection = 'firmas' THEN NEW.entity_id ELSE COALESCE(
      NULLIF(NEW.data->>'empId', ''), NULLIF(NEW.data->>'employeeId', ''),
      NULLIF(NEW.data->>'trabajadorId', ''), NULLIF(NEW.data->>'userId', ''),
      NULLIF(NEW.data->>'empleadoId', '')
    ) END;
    v_participants := ARRAY_REMOVE(ARRAY[
      v_subject,
      COALESCE(NULLIF(NEW.data->>'fromId', ''), NULLIF(NEW.data->>'from_id', ''), NULLIF(NEW.data->>'from', '')),
      COALESCE(NULLIF(NEW.data->>'toId', ''), NULLIF(NEW.data->>'to_id', ''), NULLIF(NEW.data->>'to', ''))
    ], NULL);
    NEW.subject_emp_id := v_subject;
    NEW.participant_emp_ids := v_participants;
    NEW.access_scope := CASE WHEN v_subject IS NOT NULL OR cardinality(v_participants) > 0 THEN 'employee' ELSE 'admin' END;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS app_entities_enforce_access_metadata ON app_entities;
CREATE TRIGGER app_entities_enforce_access_metadata
BEFORE INSERT OR UPDATE ON app_entities FOR EACH ROW EXECUTE FUNCTION enforce_entity_access_metadata();

-- El registro de idempotencia no expone payloads; solo responsables pueden leerlo.
DROP POLICY IF EXISTS "sync_operations_anon_phase1" ON sync_operations;
CREATE POLICY "admin_read_sync_operations" ON sync_operations
  FOR SELECT TO authenticated USING (auth_is_admin() AND auth_same_company(company_id));
CREATE POLICY "authenticated_insert_sync_operations" ON sync_operations
  FOR INSERT TO authenticated WITH CHECK (auth_same_company(company_id));

-- ── retirada definitiva del blob compartido ────────────────────────────────
DROP POLICY IF EXISTS "app_data_select_anon" ON app_data;
DROP POLICY IF EXISTS "app_data_insert_anon" ON app_data;
DROP POLICY IF EXISTS "app_data_update_anon" ON app_data;
REVOKE ALL ON TABLE app_data FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_app_sync_state(text) FROM anon;
GRANT EXECUTE ON FUNCTION get_app_sync_state(text) TO authenticated;

-- ── suscripciones push privadas ────────────────────────────────────────────
DROP POLICY IF EXISTS "push_subs_all_anon" ON push_subs;
DROP POLICY IF EXISTS "push_subs_own" ON push_subs;
CREATE POLICY "push_subs_own" ON push_subs
  FOR ALL TO authenticated
  USING (user_id = auth_emp_id() OR auth_is_admin())
  WITH CHECK (user_id = auth_emp_id() OR auth_is_admin());
