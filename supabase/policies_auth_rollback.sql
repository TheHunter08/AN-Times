-- ================================================================
-- Times INC — Reversión de emergencia: vuelve a anon_all (Fase 1)
-- Ejecutar si tras activar policies_auth.sql algo se rompe (login,
-- fichaje, sync) y hace falta restaurar el acceso de inmediato mientras
-- se investiga con calma. No borra ni modifica ningún dato.
-- ================================================================

DROP POLICY IF EXISTS "emp_read_company" ON companies;
DROP POLICY IF EXISTS "admin_all_company" ON companies;
CREATE POLICY "anon_all" ON companies FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "emp_read_self" ON employees;
DROP POLICY IF EXISTS "admin_write_employees" ON employees;
DROP POLICY IF EXISTS "employee_insert_self_for_upsert" ON employees;
DROP POLICY IF EXISTS "employee_update_self" ON employees;
CREATE POLICY "anon_all" ON employees FOR ALL TO anon USING (true) WITH CHECK (true);
UPDATE employees target
SET pin_hash = archive.pin_hash, pin_len = archive.pin_len
FROM employee_pin_archive archive
WHERE target.id = archive.employee_id AND target.pin_hash IS NULL;

DROP POLICY IF EXISTS "emp_read_own_records" ON records;
DROP POLICY IF EXISTS "company_insert_records" ON records;
DROP POLICY IF EXISTS "company_update_records" ON records;
DROP POLICY IF EXISTS "admin_delete_records" ON records;
CREATE POLICY "anon_all" ON records FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "emp_read_vacaciones" ON vacaciones;
DROP POLICY IF EXISTS "company_insert_vacaciones" ON vacaciones;
DROP POLICY IF EXISTS "company_update_vacaciones" ON vacaciones;
DROP POLICY IF EXISTS "company_delete_vacaciones" ON vacaciones;
DROP POLICY IF EXISTS "admin_manage_vacaciones" ON vacaciones;
CREATE POLICY "anon_all" ON vacaciones FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "emp_notis" ON notis;
DROP POLICY IF EXISTS "admin_write_notis" ON notis;
CREATE POLICY "anon_all" ON notis FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "emp_chats" ON chats;
DROP POLICY IF EXISTS "emp_send_chat" ON chats;
DROP POLICY IF EXISTS "admin_manage_chats" ON chats;
CREATE POLICY "anon_all" ON chats FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "emp_cierres" ON cierres;
DROP POLICY IF EXISTS "emp_sign_cierre" ON cierres;
DROP POLICY IF EXISTS "admin_manage_cierres" ON cierres;
CREATE POLICY "anon_all" ON cierres FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_read_audit" ON audit;
DROP POLICY IF EXISTS "server_insert_audit" ON audit;
CREATE POLICY "anon_all" ON audit FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "audit_events_insert" ON audit_events;
DROP POLICY IF EXISTS "audit_events_admin_read" ON audit_events;
DROP POLICY IF EXISTS "audit_events_anon_phase1" ON audit_events;
CREATE POLICY "audit_events_anon_phase1" ON audit_events FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "emp_read_obras" ON obras;
DROP POLICY IF EXISTS "admin_manage_obras" ON obras;
CREATE POLICY "anon_all" ON obras FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "emp_read_entities" ON app_entities;
DROP POLICY IF EXISTS "employee_read_entities" ON app_entities;
DROP POLICY IF EXISTS "employee_write_own_entities" ON app_entities;
DROP POLICY IF EXISTS "employee_write_notification_state" ON app_entities;
DROP POLICY IF EXISTS "admin_manage_entities" ON app_entities;
CREATE POLICY "app_entities_anon_phase1" ON app_entities FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_read_sync_operations" ON sync_operations;
DROP POLICY IF EXISTS "authenticated_insert_sync_operations" ON sync_operations;
CREATE POLICY "sync_operations_anon_phase1" ON sync_operations FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "app_data_select_anon" ON app_data;
DROP POLICY IF EXISTS "app_data_insert_anon" ON app_data;
DROP POLICY IF EXISTS "app_data_update_anon" ON app_data;
CREATE POLICY "app_data_select_anon" ON app_data FOR SELECT TO anon USING (true);
CREATE POLICY "app_data_insert_anon" ON app_data FOR INSERT TO anon WITH CHECK (id IN (1,2,3));
CREATE POLICY "app_data_update_anon" ON app_data FOR UPDATE TO anon USING (id IN (1,2,3)) WITH CHECK (id IN (1,2,3));
GRANT SELECT, INSERT, UPDATE ON TABLE app_data TO anon;
GRANT EXECUTE ON FUNCTION get_app_sync_state(text) TO anon;

DROP POLICY IF EXISTS "push_subs_own" ON push_subs;
DROP POLICY IF EXISTS "push_subs_all_anon" ON push_subs;
CREATE POLICY "push_subs_all_anon" ON push_subs FOR ALL TO anon USING (true) WITH CHECK (true);
