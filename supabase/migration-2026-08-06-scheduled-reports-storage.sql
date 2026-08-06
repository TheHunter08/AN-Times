-- Fase segura: almacenamiento privado para informes generados por cron.
-- El worker usa exclusivamente service_role. No se abre acceso anon ni se
-- modifica ninguna política existente; puede revertirse eliminando el bucket
-- después de conservar los objetos que correspondan.
INSERT INTO storage.buckets (id, name, public)
VALUES ('scheduled-reports', 'scheduled-reports', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "scheduled_reports_anon_read" ON storage.objects;
DROP POLICY IF EXISTS "scheduled_reports_anon_write" ON storage.objects;
