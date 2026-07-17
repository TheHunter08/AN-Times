-- ================================================================
-- Times INC – Políticas RLS para el bucket de Storage "documentos-empleado"
-- Aplicar en: Dashboard > SQL Editor > New Query
-- (requiere haber creado ya el bucket privado "documentos-empleado" en Storage)
-- ================================================================
--
-- Mismo caso que cierres-pdf: crear el bucket no da permisos automáticos
-- a la anon key sobre storage.objects. Sin estas políticas, la subida de
-- contratos/nóminas/certificados desde el admin (DocumentsPage en
-- AppV2Admin.tsx) falla con "new row violates row-level security policy".
--
-- Sin política de DELETE a propósito: la UI actual (DocumentsPage en
-- AppV2Admin.tsx) no tiene ningún botón para borrar un documento subido,
-- así que no se concede ese permiso hasta que exista esa función —
-- mismo principio de mínimo privilegio que el resto de este proyecto.

CREATE POLICY "documentos_empleado_insert_anon"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'documentos-empleado');

CREATE POLICY "documentos_empleado_select_anon"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'documentos-empleado');

-- UPDATE: el cliente sube con upsert:true (mismo empId+docId+nombre → mismo
-- path), así que en teoría nunca colisiona, pero se deja por si se reintenta
-- una subida fallida a medias.
CREATE POLICY "documentos_empleado_update_anon"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'documentos-empleado')
  WITH CHECK (bucket_id = 'documentos-empleado');
