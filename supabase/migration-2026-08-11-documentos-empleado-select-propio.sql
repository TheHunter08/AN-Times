-- ================================================================
-- Times INC — Permite al propio empleado leer sus documentos en Storage
-- Aplicar en: Dashboard > SQL Editor > New Query
-- Requiere: haber aplicado ya migration-2026-07-18-storage-admin-only-read.sql
-- (esta migración AÑADE una política sobre el mismo bucket, no sustituye la
-- del admin — las dos conviven).
-- ================================================================
--
-- Contexto: migration-2026-07-18-storage-admin-only-read.sql restringió la
-- lectura de "documentos-empleado" a auth_is_true_admin(), bajo la premisa
-- documentada de que "ningún flujo de empleado necesita leer estos buckets
-- directamente hoy" (confirmado entonces con un grep de createSignedUrl).
--
-- Esa premisa era incorrecta: ModalDocumentos.jsx (lado empleado) SÍ llama a
-- createSignedUrl sobre este mismo bucket, tanto para previsualizar como
-- para descargar el contenido antes de estampar la firma (ver firmarDoc).
-- Sin esta política, cualquier empleado que intente ver o firmar un
-- documento subido a Storage desde AppV2Admin (nóminas, contratos, PDFs de
-- "jornada mensual") recibe "permission denied" al pedir la URL firmada; la
-- app lo reporta como fallo de descarga y dejaba el documento sin firmar.
--
-- Los objetos se guardan como "<empId>/<docId>-<nombre>" (ver uploadFile en
-- AppV2Admin.tsx), así que basta con comparar el primer segmento de la ruta
-- con el emp_id del usuario autenticado actual. Esto solo funciona para
-- empleados con employees.auth_id ya vinculado (ver el paso "Cuenta" del
-- asistente obligatorio en OnboardingModal.jsx); un empleado sin cuenta
-- vinculada todavía no tiene auth.uid() y seguirá sin poder leer aquí.

CREATE OR REPLACE FUNCTION auth_owns_storage_path(object_name text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT id FROM employees WHERE auth_id = auth.uid() AND NOT baja LIMIT 1) = split_part(object_name, '/', 1),
    false
  );
$$;

DROP POLICY IF EXISTS "documentos_empleado_select_propio" ON storage.objects;
CREATE POLICY "documentos_empleado_select_propio"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documentos-empleado' AND auth_owns_storage_path(name));

-- Comprobación tras aplicar (autenticado como un empleado con auth_id ya
-- vinculado a su cuenta, dueño de al menos un documento en Storage):
--   SELECT * FROM storage.objects WHERE bucket_id = 'documentos-empleado';
-- Debe devolver solo los objetos cuyo primer segmento de ruta sea su propio
-- emp_id. Autenticado como otro empleado (o sin vincular todavía), debe
-- devolver 0 filas salvo que sea admin real (esa lectura ya la cubre la
-- política "documentos_empleado_select_admin" existente).
