-- ================================================================
-- Times INC – Bloqueo de firma de cierre antes de fin de mes
-- Aplicar en: Dashboard > SQL Editor > New Query
-- ================================================================
--
-- Contexto: el cliente (canCloseMonth en src/utils/adminHelpers.js) ya
-- impide firmar un cierre mensual (empleado, encargado o admin) antes
-- del último día natural del mes que cubre. Ese control es solo de UI:
-- cualquiera con el anon key puede escribir directamente en la tabla
-- `cierres` (vía PostgREST) y saltárselo. Este trigger reproduce la
-- misma regla dentro de Postgres para que sea imposible de evitar,
-- incluso si el cliente tiene un bug o alguien llama a la API a mano.
--
-- Caso real que motivó esto: el cierre de julio 2026 se generó y firmó
-- a mitad de mes por error, bloqueando la validación de horas de todo
-- el mes en curso.
--
-- Nota: el trigger solo actúa cuando `firma_admin` o `firma_emp` pasan
-- de NULL/vacío a un valor no vacío (el momento de la firma). No afecta
-- a UPDATE que solo tocan otras columnas (p.ej. reabrir un cierre, que
-- vuelve firma_admin/firma_emp a NULL, siempre está permitido).
-- ================================================================

CREATE OR REPLACE FUNCTION cierres_enforce_month_end_signature()
RETURNS trigger AS $$
DECLARE
  last_day     date;
  today_madrid date;
  was_signed_admin boolean;
  was_signed_emp   boolean;
  is_signed_admin  boolean;
  is_signed_emp    boolean;
BEGIN
  was_signed_admin := (TG_OP = 'UPDATE') AND OLD.firma_admin IS NOT NULL AND OLD.firma_admin <> '';
  was_signed_emp   := (TG_OP = 'UPDATE') AND OLD.firma_emp   IS NOT NULL AND OLD.firma_emp   <> '';
  is_signed_admin  := NEW.firma_admin IS NOT NULL AND NEW.firma_admin <> '';
  is_signed_emp    := NEW.firma_emp   IS NOT NULL AND NEW.firma_emp   <> '';

  -- Solo validar la transición "no firmado -> firmado"
  IF (is_signed_admin AND NOT was_signed_admin) OR (is_signed_emp AND NOT was_signed_emp) THEN
    -- NEW.mes tiene forma 'YYYY-MM'
    last_day     := (to_date(NEW.mes || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
    today_madrid := (now() AT TIME ZONE 'Europe/Madrid')::date;

    IF today_madrid < last_day THEN
      RAISE EXCEPTION
        'cierre %: no se puede firmar el mes % antes de su último día natural (%), hoy es %',
        NEW.id, NEW.mes, last_day, today_madrid
        USING ERRCODE = '23514'; -- check_violation, para que el cliente lo distinga de un error genérico
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cierres_enforce_month_end ON cierres;
CREATE TRIGGER trg_cierres_enforce_month_end
  BEFORE INSERT OR UPDATE ON cierres
  FOR EACH ROW
  EXECUTE FUNCTION cierres_enforce_month_end_signature();

-- Verificación rápida tras aplicar (debe fallar con el mensaje de arriba):
--   update cierres set firma_admin = 'test' where mes >= to_char(now(), 'YYYY-MM') limit 1;
