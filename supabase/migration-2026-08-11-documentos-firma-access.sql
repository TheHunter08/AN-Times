-- Times INC — acceso seguro a documentos para firma y responsables
--
-- Corrige la política de 2026-07-18: ModalDocumentos sí necesita descargar
-- el original para incrustar la firma. El primer directorio del objeto es el
-- id del empleado (`<empId>/<docId>-<nombre>`), por lo que se puede autorizar
-- sin hacer público el bucket.

DROP POLICY IF EXISTS "documentos_empleado_select_admin" ON storage.objects;
DROP POLICY IF EXISTS "documentos_empleado_insert_admin" ON storage.objects;
DROP POLICY IF EXISTS "documentos_empleado_update_admin" ON storage.objects;

CREATE OR REPLACE FUNCTION auth_can_manage_employee_document(object_name text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM employees actor
    WHERE actor.auth_id = auth.uid()
      AND actor.baja IS NOT TRUE
      AND (
        actor.role IN ('admin', 'jefe_obra')
        OR (storage.foldername(object_name))[1] = actor.id
        OR ((actor.data->>'isAdmin')::boolean IS TRUE)
      )
  ), false);
$$;

REVOKE ALL ON FUNCTION auth_can_manage_employee_document(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_can_manage_employee_document(text) TO authenticated;

CREATE POLICY "documentos_empleado_select_scoped"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documentos-empleado'
    AND auth_can_manage_employee_document(name)
  );

CREATE POLICY "documentos_empleado_insert_scoped"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documentos-empleado'
    AND auth_can_manage_employee_document(name)
  );

CREATE POLICY "documentos_empleado_update_scoped"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documentos-empleado'
    AND auth_can_manage_employee_document(name)
  )
  WITH CHECK (
    bucket_id = 'documentos-empleado'
    AND auth_can_manage_employee_document(name)
  );
