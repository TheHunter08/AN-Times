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
CREATE POLICY "anon_all" ON employees FOR ALL TO anon USING (true) WITH CHECK (true);

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

DROP POLICY IF EXISTS "emp_read_obras" ON obras;
DROP POLICY IF EXISTS "admin_manage_obras" ON obras;
CREATE POLICY "anon_all" ON obras FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "emp_read_entities" ON app_entities;
DROP POLICY IF EXISTS "admin_manage_entities" ON app_entities;
CREATE POLICY "app_entities_anon_phase1" ON app_entities FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_read_sync_operations" ON sync_operations;
DROP POLICY IF EXISTS "authenticated_insert_sync_operations" ON sync_operations;
CREATE POLICY "sync_operations_anon_phase1" ON sync_operations FOR ALL TO anon USING (true) WITH CHECK (true);
