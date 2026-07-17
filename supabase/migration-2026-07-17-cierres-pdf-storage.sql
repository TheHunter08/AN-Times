-- ================================================================
-- Times INC – Políticas RLS para el bucket de Storage "cierres-pdf"
-- Aplicar en: Dashboard > SQL Editor > New Query
-- (requiere haber creado ya el bucket privado "cierres-pdf" en Storage)
-- ================================================================
--
-- Crear un bucket (público o privado) NO concede automáticamente permisos
-- de lectura/escritura a la anon key — Supabase Storage tiene su propia
-- tabla storage.objects con RLS propia, igual que cualquier tabla de la
-- app. Sin estas políticas, cualquier intento de subir un PDF firmado
-- desde el cliente (supabase.storage.from('cierres-pdf').upload(...))
-- falla con "new row violates row-level security policy".
--
-- No se añade política de DELETE a propósito: son documentos legales
-- (cierres firmados, RD 8/2019, retención de 4 años) — igual que las
-- demás tablas de este proyecto, el borrado queda bloqueado para el
-- anon key salvo que se decida explícitamente lo contrario.

CREATE POLICY "cierres_pdf_insert_anon"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'cierres-pdf');

-- SELECT es necesario tanto para createSignedUrl() (la app la usa para
-- generar el enlace de descarga) como para el upsert:true del upload
-- (comprueba si el objeto ya existe antes de sobrescribirlo).
CREATE POLICY "cierres_pdf_select_anon"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'cierres-pdf');

-- UPDATE: el cliente sube con upsert:true (mismo empId+mes → mismo path),
-- así que re-firmar un cierre reemplaza el PDF anterior en vez de duplicar.
CREATE POLICY "cierres_pdf_update_anon"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'cierres-pdf')
  WITH CHECK (bucket_id = 'cierres-pdf');
