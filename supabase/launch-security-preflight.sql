-- Ejecutar antes de sustituir policies.sql por policies_auth.sql.
-- Falla de forma segura: nunca activa políticas Auth mientras queden cuentas
-- sin enlazar o UUID duplicados, lo que bloquearía la aplicación en producción.
DO $$
DECLARE
  missing_auth integer;
  missing_email integer;
  orphan_auth integer;
  duplicate_auth integer;
BEGIN
  SELECT count(*) INTO missing_auth
  FROM employees
  WHERE COALESCE(baja, false) = false AND auth_id IS NULL;

  SELECT count(*) INTO duplicate_auth
  FROM (
    SELECT auth_id FROM employees
    WHERE auth_id IS NOT NULL
    GROUP BY auth_id HAVING count(*) > 1
  ) duplicates;

  SELECT count(*) INTO missing_email
  FROM employees
  WHERE COALESCE(baja, false) = false
    AND (email IS NULL OR btrim(email) = '' OR email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

  SELECT count(*) INTO orphan_auth
  FROM employees e
  LEFT JOIN auth.users u ON u.id = e.auth_id
  WHERE COALESCE(e.baja, false) = false
    AND e.auth_id IS NOT NULL
    AND u.id IS NULL;

  IF missing_auth > 0 THEN
    RAISE EXCEPTION 'RLS Auth no activado: % empleados activos no tienen auth_id', missing_auth;
  END IF;
  IF duplicate_auth > 0 THEN
    RAISE EXCEPTION 'RLS Auth no activado: hay % auth_id duplicados', duplicate_auth;
  END IF;
  IF missing_email > 0 THEN
    RAISE EXCEPTION 'RLS Auth no activado: % empleados activos no tienen email válido', missing_email;
  END IF;
  IF orphan_auth > 0 THEN
    RAISE EXCEPTION 'RLS Auth no activado: % auth_id no existen en auth.users', orphan_auth;
  END IF;
END $$;
