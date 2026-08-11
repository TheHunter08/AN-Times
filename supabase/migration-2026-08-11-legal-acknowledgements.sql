-- Evidencia inmutable de entrega de información legal al trabajador.
-- No representa consentimiento: registra qué versión informativa recibió.

CREATE TABLE IF NOT EXISTS legal_acknowledgements (
  id              text PRIMARY KEY,
  emp_id          text NOT NULL REFERENCES employees(id),
  auth_id         uuid NOT NULL,
  notice_version  text NOT NULL,
  event_type      text NOT NULL CHECK (event_type = 'information_received'),
  user_agent      text,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legal_ack_emp_version_idx
  ON legal_acknowledgements(emp_id, notice_version, acknowledged_at DESC);

ALTER TABLE legal_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "legal_ack_select_own_or_admin" ON legal_acknowledgements;
CREATE POLICY "legal_ack_select_own_or_admin"
  ON legal_acknowledgements FOR SELECT TO authenticated
  USING (
    auth_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM employees actor
      WHERE actor.auth_id = auth.uid()
        AND actor.baja IS NOT TRUE
        AND (actor.role IN ('admin', 'jefe_obra') OR (actor.data->>'isAdmin')::boolean IS TRUE)
    )
  );

DROP POLICY IF EXISTS "legal_ack_insert_own" ON legal_acknowledgements;
CREATE POLICY "legal_ack_insert_own"
  ON legal_acknowledgements FOR INSERT TO authenticated
  WITH CHECK (
    auth_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM employees employee
      WHERE employee.id = emp_id
        AND employee.auth_id = auth.uid()
        AND employee.baja IS NOT TRUE
    )
  );

-- Sin políticas UPDATE ni DELETE: una recepción confirmada es append-only.
