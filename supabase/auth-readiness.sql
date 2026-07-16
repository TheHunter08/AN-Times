-- TIMES INC — comprobación segura previa a activar Supabase Auth/RLS
-- Este archivo es SOLO LECTURA: no cambia políticas ni datos.

SELECT
  count(*) FILTER (WHERE baja IS NOT TRUE) AS usuarios_activos,
  count(*) FILTER (WHERE baja IS NOT TRUE AND auth_id IS NOT NULL) AS usuarios_vinculados,
  count(*) FILTER (WHERE baja IS NOT TRUE AND auth_id IS NULL) AS usuarios_pendientes,
  CASE
    WHEN count(*) FILTER (WHERE baja IS NOT TRUE AND auth_id IS NULL) = 0 THEN 'LISTO_PARA_PRUEBA_CONTROLADA'
    ELSE 'NO_ACTIVAR_RLS_AUTH'
  END AS estado
FROM employees;

SELECT id, name, email, role
FROM employees
WHERE baja IS NOT TRUE AND auth_id IS NULL
ORDER BY name;

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('companies','employees','records','vacaciones','notis','chats','cierres','audit','obras')
ORDER BY tablename, policyname;
