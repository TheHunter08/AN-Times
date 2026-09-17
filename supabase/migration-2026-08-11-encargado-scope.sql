-- Preparación aditiva del ámbito RLS del encargado.
-- Seguro durante dual-write: no elimina anon_all ni activa el corte Auth/RLS.
-- Las policies que consumen esta función están en policies_auth.sql y solo se
-- aplican cuando todos los perfiles estén vinculados y el piloto sea válido.

CREATE OR REPLACE FUNCTION auth_can_supervise_employee(target_emp_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
DECLARE
  actor employees%ROWTYPE;
  target employees%ROWTYPE;
  actor_center text;
  target_center text;
  actor_has_works boolean;
  centers_match boolean;
  works_match boolean;
  actor_work_reaches_target_center boolean;
BEGIN
  SELECT * INTO actor FROM employees WHERE auth_id = auth.uid() AND NOT baja LIMIT 1;
  SELECT * INTO target FROM employees WHERE id = target_emp_id AND NOT baja LIMIT 1;

  IF actor.id IS NULL OR target.id IS NULL
     OR actor.id = target.id
     OR actor.role <> 'encargado'
     OR actor.company_id IS DISTINCT FROM target.company_id
     OR target.role = 'admin' THEN
    RETURN false;
  END IF;

  actor_center := lower(NULLIF(btrim(actor.centro_trabajo), ''));
  target_center := lower(NULLIF(btrim(target.centro_trabajo), ''));
  actor_has_works := cardinality(COALESCE(actor.obras_asignadas, '{}'::text[])) > 0;

  SELECT EXISTS (
    SELECT 1 FROM obras work
    WHERE work.company_id = actor.company_id
      AND NOT COALESCE(work.deleted, false)
      AND EXISTS (
        SELECT 1 FROM unnest(COALESCE(actor.obras_asignadas, '{}'::text[])) actor_work
        WHERE lower(btrim(actor_work)) IN (lower(btrim(work.id)), lower(btrim(work.nombre)))
      )
      AND lower(NULLIF(btrim(COALESCE(work.data->>'centroTrabajo', work.data->>'centro_trabajo')), '')) = target_center
  ) INTO actor_work_reaches_target_center;

  centers_match := actor_center IS NOT NULL AND (
    target_center = actor_center
    OR EXISTS (
      SELECT 1 FROM obras work
      WHERE work.company_id = actor.company_id
        AND NOT COALESCE(work.deleted, false)
        AND lower(NULLIF(btrim(COALESCE(work.data->>'centroTrabajo', work.data->>'centro_trabajo')), '')) = actor_center
        AND EXISTS (
          SELECT 1 FROM unnest(COALESCE(target.obras_asignadas, '{}'::text[])) target_work
          WHERE lower(btrim(target_work)) IN (lower(btrim(work.id)), lower(btrim(work.nombre)))
        )
    )
    OR actor_work_reaches_target_center
  );

  works_match := actor_has_works AND (
    EXISTS (
      SELECT 1
      FROM unnest(COALESCE(actor.obras_asignadas, '{}'::text[])) actor_work
      JOIN unnest(COALESCE(target.obras_asignadas, '{}'::text[])) target_work
        ON lower(btrim(actor_work)) = lower(btrim(target_work))
    )
    OR actor_work_reaches_target_center
  );

  -- Antes se exigia centers_match Y works_match a la vez cuando el encargado
  -- tenia ambas dimensiones asignadas (caso habitual) — un empleado
  -- vinculado solo por obra o solo por centro quedaba fuera de su equipo.
  -- Ver el mismo fix en supervisorScope.js (getScopedEmployees, PWA).
  RETURN (actor_center IS NOT NULL OR actor_has_works) AND (centers_match OR works_match);
END;
$$;

REVOKE ALL ON FUNCTION auth_can_supervise_employee(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION auth_can_supervise_employee(text) TO authenticated, service_role;
