-- ================================================================
-- Times INC — Habilitar Realtime (postgres_changes) en tablas clave
-- ESTADO: Ejecutar una vez en Supabase SQL Editor
--
-- Necesario para que startTableRealtime() (dataServiceV2.js) reciba
-- eventos de INSERT/UPDATE/DELETE directamente desde las tablas,
-- sin depender del canal broadcast entre sesiones activas.
-- ================================================================

-- Habilitar Realtime en records y employees
ALTER PUBLICATION supabase_realtime ADD TABLE records;
ALTER PUBLICATION supabase_realtime ADD TABLE employees;

-- Opcional: también vacaciones y cierres para sincronizar solicitudes
-- y firmados en tiempo real entre admin y encargado.
ALTER PUBLICATION supabase_realtime ADD TABLE vacaciones;
ALTER PUBLICATION supabase_realtime ADD TABLE cierres;
