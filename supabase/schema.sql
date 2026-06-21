-- Ejecuta esto en Supabase → SQL Editor

-- Tabla principal de datos de la app
CREATE TABLE IF NOT EXISTS app_data (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  data       JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Solo puede existir una fila (id = 1)
ALTER TABLE app_data ADD CONSTRAINT app_data_single_row CHECK (id = 1);

-- Acceso público (la app usa PIN propio, no auth de Supabase)
ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_rw" ON app_data FOR ALL USING (true) WITH CHECK (true);

-- Tabla de push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subs (
  user_id    TEXT PRIMARY KEY,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE push_subs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_rw" ON push_subs FOR ALL USING (true) WITH CHECK (true);

-- Habilitar Realtime en app_data (necesario para sync instantáneo)
ALTER PUBLICATION supabase_realtime ADD TABLE app_data;
