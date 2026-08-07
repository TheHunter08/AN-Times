-- Times INC · comprobación previa a Supabase Auth/RLS
-- Solo lectura: ejecutar antes de policies_auth.sql. La migración NO es segura
-- mientras cualquiera de estas consultas devuelva incidencias.

-- 1) Empleados activos todavía sin identidad Auth vinculada.
SELECT id, name, email, role
FROM employees
WHERE COALESCE(baja, false) = false
  AND auth_id IS NULL
ORDER BY role, name;

-- 2) Una identidad Auth no puede pertenecer a más de un empleado.
SELECT auth_id, count(*) AS employee_count, array_agg(id ORDER BY id) AS employee_ids
FROM employees
WHERE auth_id IS NOT NULL
GROUP BY auth_id
HAVING count(*) > 1;

-- 3) Identidades vinculadas que ya no existen en auth.users.
SELECT e.id, e.name, e.email, e.auth_id
FROM employees e
LEFT JOIN auth.users u ON u.id = e.auth_id
WHERE e.auth_id IS NOT NULL AND u.id IS NULL;

-- 4) Perfiles que no pueden completar el acceso seguro o quedarían fuera del
-- aislamiento por empresa.
SELECT id, name, email, company_id,
  CASE
    WHEN email IS NULL OR btrim(email) = '' THEN 'EMAIL_AUSENTE'
    WHEN email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN 'EMAIL_INVALIDO'
    WHEN company_id IS NULL THEN 'EMPRESA_AUSENTE'
  END AS incidencia
FROM employees
WHERE COALESCE(baja, false) = false
  AND (
    email IS NULL OR btrim(email) = ''
    OR email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    OR company_id IS NULL
  )
ORDER BY name;

SELECT lower(btrim(email)) AS normalized_email, count(*) AS employee_count,
  array_agg(id ORDER BY id) AS employee_ids
FROM employees
WHERE COALESCE(baja, false) = false AND email IS NOT NULL AND btrim(email) <> ''
GROUP BY lower(btrim(email))
HAVING count(*) > 1;

-- 5) Políticas permisivas que deben desaparecer en la activación final.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    policyname = 'anon_all'
    OR roles::text LIKE '%anon%'
  )
ORDER BY tablename, policyname;

-- 6) Tablas públicas con RLS desactivado.
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY c.relname;

-- 7) Resumen: todos los contadores deben quedar a cero antes de activar RLS.
SELECT
  (SELECT count(*) FROM employees WHERE COALESCE(baja, false) = false AND auth_id IS NULL) AS active_without_auth,
  (SELECT count(*) FROM (
    SELECT auth_id FROM employees WHERE auth_id IS NOT NULL GROUP BY auth_id HAVING count(*) > 1
  ) duplicates) AS duplicated_auth_ids,
  (SELECT count(*) FROM employees e LEFT JOIN auth.users u ON u.id = e.auth_id
    WHERE e.auth_id IS NOT NULL AND u.id IS NULL) AS missing_auth_users,
  (SELECT count(*) FROM employees WHERE COALESCE(baja, false) = false
    AND (email IS NULL OR btrim(email) = '' OR email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')) AS invalid_or_missing_emails,
  (SELECT count(*) FROM (
    SELECT lower(btrim(email)) FROM employees
    WHERE COALESCE(baja, false) = false AND email IS NOT NULL AND btrim(email) <> ''
    GROUP BY lower(btrim(email)) HAVING count(*) > 1
  ) duplicates) AS duplicated_emails,
  (SELECT count(*) FROM employees WHERE COALESCE(baja, false) = false AND company_id IS NULL) AS missing_company_ids,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
    AND (policyname = 'anon_all' OR roles::text LIKE '%anon%')) AS anonymous_policies;
