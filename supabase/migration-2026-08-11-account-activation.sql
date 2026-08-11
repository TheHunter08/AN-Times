-- Limitación persistente de intentos para el alta inmediata mediante PIN.
-- Solo la función de servidor con service_role puede consultar o modificarla.

CREATE TABLE IF NOT EXISTS account_activation_attempts (
  emp_id text PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE account_activation_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_activation_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION register_account_activation_failure(p_emp_id text)
RETURNS TABLE(failed_attempts integer, locked_until timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
  INSERT INTO account_activation_attempts AS attempts(emp_id, failed_attempts, locked_until, updated_at)
  VALUES (p_emp_id, 1, NULL, now())
  ON CONFLICT (emp_id) DO UPDATE SET
    failed_attempts = CASE
      WHEN attempts.locked_until IS NOT NULL AND attempts.locked_until <= now() THEN 1
      ELSE attempts.failed_attempts + 1
    END,
    locked_until = CASE
      WHEN (CASE WHEN attempts.locked_until IS NOT NULL AND attempts.locked_until <= now() THEN 1 ELSE attempts.failed_attempts + 1 END) >= 5
      THEN now() + interval '15 minutes'
      ELSE NULL
    END,
    updated_at = now()
  RETURNING attempts.failed_attempts, attempts.locked_until;
END;
$$;

CREATE OR REPLACE FUNCTION clear_account_activation_failures(p_emp_id text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM account_activation_attempts WHERE emp_id = p_emp_id;
$$;

REVOKE ALL ON FUNCTION register_account_activation_failure(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION clear_account_activation_failures(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION register_account_activation_failure(text) TO service_role;
GRANT EXECUTE ON FUNCTION clear_account_activation_failures(text) TO service_role;
