-- Ejecutar después de scripts/repair-push-subscriptions.mjs --apply.
-- Un endpoint Web Push pertenece a un único dispositivo y no puede quedar
-- asociado simultáneamente a dos usuarios.
CREATE UNIQUE INDEX IF NOT EXISTS push_subs_endpoint_uidx ON push_subs(endpoint);

CREATE INDEX IF NOT EXISTS app_entities_push_delivery_idx
  ON app_entities(updated_at)
  WHERE collection = 'push_delivery';
