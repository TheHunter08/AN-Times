-- ================================================================
-- Times INC — Políticas de acceso para tablas V2 (schema.sql)
-- Aplicar en: Dashboard > SQL Editor > New Query
-- Aplicar DESPUÉS de schema.sql y ANTES de migrate-to-tables.
--
-- Fase 1 (actual): políticas permisivas con anon key — misma seguridad
-- que el blob actual. Suficiente para una app single-tenant donde el
-- anon key está en el bundle JS y es compartido.
--
-- Fase 2 (futuro, cuando se implemente Supabase Auth):
--   DROP POLICY "anon_all" ON <tabla>;
--   CREATE POLICY "own_company" ON <tabla> FOR ALL TO authenticated
--     USING (company_id = (
--       SELECT company_id FROM employees WHERE auth_id = auth.uid() LIMIT 1
--     ));
-- ================================================================

CREATE POLICY "anon_all" ON companies  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON employees  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON records    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON vacaciones FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON notis      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON chats      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON cierres    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON audit      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON obras      FOR ALL TO anon USING (true) WITH CHECK (true);
