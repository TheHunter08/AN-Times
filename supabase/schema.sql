-- ================================================================
-- Times INC — Schema para tablas Supabase reales
-- ESTADO: Aplicado en producción (2026-07-10)
--
-- NOTA: IDs son text, no uuid, porque la app genera ids cortos
-- (e.g. "e1", "mqfbu0urtvyo") antes de migrar a crypto.randomUUID().
-- company_id sí es text con el UUID fijo de single-tenant.
-- ================================================================
--
-- PARCHE 2026-07-11: añadir pin_len a employees (si ya existe la tabla):
--   ALTER TABLE employees ADD COLUMN IF NOT EXISTS pin_len int;
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- companies
CREATE TABLE companies (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  cif        text,
  config     jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- employees
CREATE TABLE employees (
  id              text PRIMARY KEY,
  company_id      text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  email           text,
  pin_hash        text,
  pin_len         int,
  role            text DEFAULT 'empleado',
  centro_trabajo  text,
  obras_asignadas text[] DEFAULT '{}',
  reminder_time   text DEFAULT '08:30',
  salida_time     text,
  telefono        text,
  baja            boolean DEFAULT false,
  auth_id         uuid,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX ON employees(company_id);
CREATE INDEX ON employees(auth_id);

-- records (fichajes) — retención mínima 4 años (RDL 8/2019)
CREATE TABLE records (
  id           text PRIMARY KEY,
  company_id   text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  emp_id       text NOT NULL REFERENCES employees(id),
  emp_name     text,
  inicio       timestamptz NOT NULL,
  fin          timestamptz,
  centro       text,
  work_secs    int DEFAULT 0,
  break_secs   int DEFAULT 0,
  breaks       jsonb DEFAULT '[]',
  closed       boolean DEFAULT false,
  aceptada     boolean DEFAULT false,
  correcciones jsonb DEFAULT '[]',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
CREATE INDEX ON records(company_id, emp_id, inicio DESC);
CREATE INDEX ON records(company_id) WHERE fin IS NULL;

-- vacaciones / ausencias
CREATE TABLE vacaciones (
  id           text PRIMARY KEY,
  company_id   text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  emp_id       text NOT NULL REFERENCES employees(id),
  emp_name     text,
  fecha_inicio date,
  fecha_fin    date,
  tipo         text DEFAULT 'vacaciones',
  estado       text DEFAULT 'pendiente',
  motivo       text,
  resolucion   text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
CREATE INDEX ON vacaciones(company_id, emp_id);

-- notificaciones
CREATE TABLE notis (
  id         text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  emp_id     text NOT NULL REFERENCES employees(id),
  tipo       text,
  titulo     text,
  mensaje    text,
  leido      boolean DEFAULT false,
  deleted    boolean DEFAULT false,
  extra      jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON notis(company_id, emp_id, deleted, leido);

-- chats
CREATE TABLE chats (
  id         text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_id    text REFERENCES employees(id),
  to_id      text REFERENCES employees(id),
  to_role    text,
  mensaje    text NOT NULL,
  leido      boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON chats(company_id, to_id, leido);

-- cierres mensuales
CREATE TABLE cierres (
  id             text PRIMARY KEY,
  company_id     text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  emp_id         text NOT NULL REFERENCES employees(id),
  mes            text NOT NULL,
  total_min      int DEFAULT 0,
  extra_min      int DEFAULT 0,
  estado         text DEFAULT 'pendiente',
  firma_admin    text,
  firma_emp      text,
  desactualizado boolean DEFAULT false,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (company_id, emp_id, mes)
);

-- auditoria
CREATE TABLE audit (
  id         bigserial PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  accion     text NOT NULL,
  detalle    text,
  por        text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON audit(company_id, created_at DESC);

-- obras / centros (geofencing)
CREATE TABLE obras (
  id         text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nombre     text NOT NULL,
  coords     jsonb,
  radio      int DEFAULT 200,
  activa     boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- RLS en todas las tablas
ALTER TABLE companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees  ENABLE ROW LEVEL SECURITY;
ALTER TABLE records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE notis      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cierres    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit      ENABLE ROW LEVEL SECURITY;
ALTER TABLE obras      ENABLE ROW LEVEL SECURITY;
