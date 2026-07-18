-- ================================================================
-- Times INC — Restringe la lectura de Storage a admin real
-- Aplicar en: Dashboard > SQL Editor > New Query
-- Requiere: haber aplicado ya migration-2026-07-18-denuncias-privadas.sql
-- (define auth_is_true_admin(), usada aquí también).
-- ================================================================
--
-- Contexto: "documentos_empleado_select_anon" (migration-2026-07-17-
-- documentos-storage.sql) y "cierres_pdf_select_anon" (migration-2026-07-
-- 17-cierres-pdf-storage.sql) dejan leer/listar/descargar CUALQUIER fichero
-- de esos buckets a cualquiera con la clave anon — y como los `empId` son
-- cadenas cortas y predecibles (e1, e2...), un atacante puede enumerar y
-- descargar nóminas, contratos y PDFs de cierre firmados de otros
-- empleados.
--
-- Confirmado en el código (grep de createSignedUrl/upload en src/): la
-- LECTURA de ambos buckets (createSignedUrl) solo se llama desde
-- AppV2Admin.tsx (panel admin) — ningún flujo de empleado necesita leer
-- estos buckets directamente hoy. Restringir SELECT a admin real no rompe
-- nada que la app haga actualmente.
--
-- ═══════════════════════════════════════════════════════════════════════
-- documentos-empleado: se cierra del todo (lectura Y escritura)
-- ═══════════════════════════════════════════════════════════════════════
-- La subida (INSERT/UPDATE) también es solo desde AppV2Admin.tsx (Documents
-- Page) — ningún empleado sube aquí, así que pasa entero a admin-only.

DROP POLICY IF EXISTS "documentos_empleado_select_anon" ON storage.objects;
DROP POLICY IF EXISTS "documentos_empleado_insert_anon" ON storage.objects;
DROP POLICY IF EXISTS "documentos_empleado_update_anon" ON storage.objects;

CREATE POLICY "documentos_empleado_select_admin"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documentos-empleado' AND auth_is_true_admin());

CREATE POLICY "documentos_empleado_insert_admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos-empleado' AND auth_is_true_admin());

CREATE POLICY "documentos_empleado_update_admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documentos-empleado' AND auth_is_true_admin())
  WITH CHECK (bucket_id = 'documentos-empleado' AND auth_is_true_admin());

-- ═══════════════════════════════════════════════════════════════════════
-- cierres-pdf: SIN CAMBIOS por ahora — riesgo real de romper la firma
-- ═══════════════════════════════════════════════════════════════════════
-- A diferencia de documentos-empleado, la SUBIDA de cierres-pdf SÍ ocurre
-- desde el lado empleado (ModalCierreSign.jsx, al firmar su propio cierre
-- mensual — sesión por PIN, sin auth.uid()). El comentario original de
-- "cierres_pdf_select_anon" (migration-2026-07-17-cierres-pdf-storage.sql)
-- indica que esa misma política SELECT la usa también el upsert:true del
-- upload para comprobar si el objeto ya existe antes de sobrescribirlo.
-- No hay forma segura de comprobar, sin tocar producción, si retirar esa
-- política rompería la firma de cierres para empleados por PIN — así que
-- de momento se deja tal cual (misma exposición que ya existía) en vez de
-- arriesgar un flujo legal/de cumplimiento (RDL 8/2019).
--
-- Queda documentado como pendiente para cuando se aborde el problema de
-- identidad más amplio (ver memoria "RLS activación bloqueada"): la
-- solución real pasa por lo mismo — dar a las sesiones por PIN una
-- identidad verificable en el servidor (JWT propio o similar), momento en
-- el que sí se podrá aislar cierres-pdf por empleado sin romper la firma.

-- Comprobación tras aplicar (debe fallar con "permission denied" salvo que
-- estés autenticado como admin real):
--   SELECT * FROM storage.objects WHERE bucket_id = 'documentos-empleado' LIMIT 1;
