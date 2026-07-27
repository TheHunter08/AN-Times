-- TIMES INC — comprobación de la parte de identidades previa a RLS.
-- Este archivo es SOLO LECTURA: no cambia políticas ni datos.
-- IMPORTANTE: completar esta consulta NO significa que el runtime esté listo.
-- Ejecutar también `npm run audit:launch`; cualquier rlsRuntimeBlocker impide
-- activar policies_auth.sql.

WITH identity_status AS (
  SELECT e.*, u.id IS NOT NULL AS auth_user_exists
  FROM public.employees e
  LEFT JOIN auth.users u ON u.id = e.auth_id
)
SELECT
  count(*) FILTER (WHERE baja IS NOT TRUE) AS usuarios_activos,
  count(*) FILTER (
    WHERE baja IS NOT TRUE AND auth_id IS NOT NULL AND auth_user_exists
  ) AS usuarios_vinculados_validos,
  count(*) FILTER (WHERE baja IS NOT TRUE AND auth_id IS NULL) AS usuarios_pendientes,
  count(*) FILTER (
    WHERE baja IS NOT TRUE AND auth_id IS NOT NULL AND NOT auth_user_exists
  ) AS identidades_huerfanas,
  CASE
    WHEN count(*) FILTER (
      WHERE baja IS NOT TRUE AND (auth_id IS NULL OR NOT auth_user_exists)
    ) = 0 THEN 'IDENTIDADES_LISTAS_REVISAR_RUNTIME'
    ELSE 'NO_ACTIVAR_RLS_AUTH'
  END AS estado
FROM identity_status;

SELECT
  e.id,
  e.name,
  e.email,
  e.role,
  CASE
    WHEN e.auth_id IS NULL THEN 'SIN_AUTH_ID'
    ELSE 'AUTH_ID_NO_EXISTE_EN_AUTH_USERS'
  END AS problema
FROM public.employees e
LEFT JOIN auth.users u ON u.id = e.auth_id
WHERE e.baja IS NOT TRUE AND (e.auth_id IS NULL OR u.id IS NULL)
ORDER BY name;

-- Cualquier fila también bloquea la vinculación: el login no puede decidir
-- de forma segura a qué empleado pertenece una identidad compartida.
SELECT lower(trim(email)) AS email_normalizado, count(*) AS empleados
FROM public.employees
WHERE baja IS NOT TRUE AND email IS NOT NULL AND trim(email) <> ''
GROUP BY lower(trim(email))
HAVING count(*) > 1
ORDER BY email_normalizado;

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('companies','employees','records','vacaciones','notis','chats','cierres','audit','obras')
ORDER BY tablename, policyname;
