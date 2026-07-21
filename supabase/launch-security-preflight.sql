-- Ejecutar antes de sustituir policies.sql por policies_auth.sql.
-- Falla de forma segura: nunca activa políticas Auth mientras queden cuentas
-- sin enlazar o UUID duplicados, lo que bloquearía la aplicación en producción.
DO $$
DECLARE
  missing_auth integer;
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

  IF missing_auth > 0 THEN
    RAISE EXCEPTION 'RLS Auth no activado: % empleados activos no tienen auth_id', missing_auth;
  END IF;
  IF duplicate_auth > 0 THEN
    RAISE EXCEPTION 'RLS Auth no activado: hay % auth_id duplicados', duplicate_auth;
  END IF;
END $$;
