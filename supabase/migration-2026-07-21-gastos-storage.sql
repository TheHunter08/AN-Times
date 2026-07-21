-- ================================================================
-- Times INC – Políticas RLS para el bucket de Storage "gastos-fotos"
-- Aplicar en: Dashboard > SQL Editor > New Query
-- Crea también el bucket privado "gastos-fotos" si todavía no existe.
-- ================================================================
--
-- Mismo caso que documentos-empleado y cierres-pdf: las fotos de tickets
-- de gastos se guardaban en base64 dentro de cada gasto, dentro del blob
-- único de app_data, lo que infla ~33% su tamaño y consume la cuota
-- gratuita de BASE DE DATOS (500 MB) en vez de la de Storage (1 GB,
-- separada). A diferencia de un contrato o certificado (ocasional), un
-- gasto con foto de ticket es habitual — este era uno de los mayores
-- focos de crecimiento continuo del blob con el uso normal de la app.
--
-- ═══════════════════════════════════════════════════════════════════════
-- Por qué SELECT sigue siendo anon (mismo caso que cierres-pdf, no el de
-- documentos-empleado)
-- ═══════════════════════════════════════════════════════════════════════
-- migration-2026-07-18-storage-admin-only-read.sql cerró documentos-
-- empleado a admin-only porque ningún flujo de empleado necesitaba leerlo
-- directamente. Aquí SÍ: el propio empleado necesita ver la miniatura de
-- su ticket recién subido en "Mis gastos" (EmployeeGastos.tsx, vía
-- createSignedUrl), y esa sesión es por PIN — sin auth.uid() verificable,
-- igual que la firma de cierres-pdf. No hay forma de restringir SELECT a
-- "solo el dueño del archivo" sin esa identidad, así que se acepta la
-- misma exposición ya documentada para cierres-pdf (enumerable por quien
-- conozca/adivine el empId) en vez de romper la vista previa del ticket.
-- Pendiente de resolver junto con cierres-pdf cuando las sesiones por PIN
-- tengan una identidad verificable en el servidor.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gastos-fotos',
  'gastos-fotos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Los DROP hacen que la migración sea repetible: es seguro volver a
-- ejecutarla si el bucket ya existía o una ejecución anterior quedó a medias.
DROP POLICY IF EXISTS "gastos_fotos_insert_anon" ON storage.objects;
DROP POLICY IF EXISTS "gastos_fotos_select_anon" ON storage.objects;
DROP POLICY IF EXISTS "gastos_fotos_update_anon" ON storage.objects;

CREATE POLICY "gastos_fotos_insert_anon"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'gastos-fotos');

-- SELECT es necesario para createSignedUrl() (miniatura del ticket en "Mis
-- gastos") y para el upsert:true del upload (comprueba si ya existe antes
-- de sobrescribir).
CREATE POLICY "gastos_fotos_select_anon"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'gastos-fotos');

-- UPDATE: el cliente sube con upsert:true (mismo empId+gastoId → mismo
-- path), así que en teoría nunca colisiona, pero se deja por si se
-- reintenta una subida fallida a medias.
--
-- Sin política de DELETE a propósito: la UI actual (EmployeeGastos.tsx) no
-- permite al empleado eliminar un gasto ya enviado, así que no se concede
-- ese permiso hasta que exista esa función — mismo principio de mínimo
-- privilegio que el resto de este proyecto.
CREATE POLICY "gastos_fotos_update_anon"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'gastos-fotos')
  WITH CHECK (bucket_id = 'gastos-fotos');
