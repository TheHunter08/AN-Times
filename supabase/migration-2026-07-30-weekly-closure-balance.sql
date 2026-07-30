-- Normaliza el resultado de la regla laboral de 40 horas semanales.
-- Los valores siguen también dentro de `data` para compatibilidad y auditoría.
ALTER TABLE public.cierres
  ADD COLUMN IF NOT EXISTS target_min       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deficit_min      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_min      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS justified_min    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS non_contract_min integer NOT NULL DEFAULT 0;

UPDATE public.cierres
SET
  target_min = CASE WHEN data->>'targetMin' ~ '^-?[0-9]+$' THEN (data->>'targetMin')::integer ELSE target_min END,
  deficit_min = CASE WHEN data->>'deficitMin' ~ '^-?[0-9]+$' THEN (data->>'deficitMin')::integer ELSE deficit_min END,
  balance_min = CASE WHEN data->>'balanceMin' ~ '^-?[0-9]+$' THEN (data->>'balanceMin')::integer ELSE balance_min END,
  justified_min = CASE WHEN data->>'justifiedMin' ~ '^-?[0-9]+$' THEN (data->>'justifiedMin')::integer ELSE justified_min END,
  non_contract_min = CASE WHEN data->>'nonContractMin' ~ '^-?[0-9]+$' THEN (data->>'nonContractMin')::integer ELSE non_contract_min END;

COMMENT ON COLUMN public.cierres.target_min IS 'Minutos exigibles de semanas cerradas, descontando días justificados/no contractuales.';
COMMENT ON COLUMN public.cierres.deficit_min IS 'Déficit de semanas cerradas respecto al objetivo semanal ajustado.';
COMMENT ON COLUMN public.cierres.balance_min IS 'Saldo semanal neto: extra_min - deficit_min.';
COMMENT ON COLUMN public.cierres.justified_min IS 'Minutos no exigibles por vacaciones, bajas, ausencias aprobadas o festivos.';
COMMENT ON COLUMN public.cierres.non_contract_min IS 'Minutos no exigibles por quedar fuera de vigencia del contrato.';

NOTIFY pgrst, 'reload schema';
