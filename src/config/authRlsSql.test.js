import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = name => readFileSync(resolve(process.cwd(), 'supabase', name), 'utf8')

describe('activación SQL Auth/RLS', () => {
  it('prepara metadatos privados, auditoría append-only y claim push autenticado', () => {
    const migration = sql('migration-2026-08-11-auth-rls-runtime.sql')
    expect(migration).toContain('subject_emp_id')
    expect(migration).toContain("'firmas:' || signature.key")
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS audit_events')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION claim_push_subscription')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION claim_push_subscription')
  })

  it('retira anon y protege decisiones reservadas a responsables', () => {
    const policies = sql('policies_auth.sql')
    expect(policies).toContain('REVOKE ALL ON TABLE app_data FROM anon, authenticated')
    expect(policies).toContain('protect_employee_record_fields')
    expect(policies).toContain('protect_employee_vacation_fields')
    expect(policies).toContain('enforce_entity_access_metadata')
    expect(policies).toContain("data = COALESCE(data, '{}'::jsonb) - 'pin' - 'pinHash' - 'pinLen'")
    expect(policies).toContain('audit_events_admin_read')
  })

  it('limita al encargado a empleados de su centro u obras asignadas', () => {
    const migration = sql('migration-2026-08-11-encargado-scope.sql')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION auth_can_supervise_employee')
    expect(migration).toContain("actor.role <> 'encargado'")
    expect(migration).toContain('actor.id = target.id')
    expect(migration).toContain('actor.centro_trabajo')
    expect(migration).toContain('actor.obras_asignadas')
    expect(migration).toContain("work.data->>'centroTrabajo'")
    expect(migration).toContain('REVOKE ALL ON FUNCTION auth_can_supervise_employee(text) FROM PUBLIC, anon')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION auth_can_supervise_employee(text) TO authenticated, service_role')
  })

  it('aplica el alcance del encargado sin abrir colecciones sensibles', () => {
    const policies = sql('policies_auth.sql')
    expect(policies).toMatch(/CREATE POLICY "emp_read_self" ON employees[\s\S]*?auth_can_supervise_employee\(id\)/)
    expect(policies).toMatch(/CREATE POLICY "emp_read_own_records" ON records[\s\S]*?auth_can_supervise_employee\(emp_id\)/)
    expect(policies).toMatch(/CREATE POLICY "emp_read_vacaciones" ON vacaciones[\s\S]*?auth_can_supervise_employee\(emp_id\)/)
    expect(policies).toMatch(/CREATE POLICY "emp_cierres" ON cierres[\s\S]*?auth_can_supervise_employee\(emp_id\)/)

    const supervisorEntities = policies.match(
      /CREATE POLICY "supervisor_read_team_entities"[\s\S]*?(?=CREATE OR REPLACE FUNCTION enforce_entity_access_metadata)/,
    )?.[0] || ''
    expect(supervisorEntities).toContain("collection IN ('correccionesFichaje','chats','notis','turnos')")
    expect(supervisorEntities).toContain('auth_can_supervise_employee(subject_emp_id)')
    expect(supervisorEntities).not.toMatch(/collection IN \([^)]*(documentos|firmas|medicos|wellbeing|legalAcknowledgements|gastos)/)
  })

  it('da lectura de empresa al auditor de solo lectura sin abrir escritura', () => {
    const policies = sql('policies_auth.sql')
    expect(policies).toContain('CREATE OR REPLACE FUNCTION auth_is_auditor')
    expect(policies).toMatch(/CREATE POLICY "emp_read_self" ON employees[\s\S]*?auth_is_auditor\(\)/)
    expect(policies).toMatch(/CREATE POLICY "emp_read_own_records" ON records[\s\S]*?auth_is_auditor\(\)/)
    expect(policies).toMatch(/CREATE POLICY "emp_read_vacaciones" ON vacaciones[\s\S]*?auth_is_auditor\(\)/)
    expect(policies).toMatch(/CREATE POLICY "emp_cierres" ON cierres[\s\S]*?auth_is_auditor\(\)/)

    // auth_is_auditor() no debe aparecer en ninguna política de escritura
    // (INSERT/UPDATE/DELETE/ALL) de estas cuatro tablas — el rol es de solo
    // lectura por diseño.
    const writePolicyBlocks = policies.match(
      /CREATE POLICY "[^"]+" ON (employees|records|vacaciones|cierres)\s+FOR (INSERT|UPDATE|DELETE|ALL)[\s\S]*?;/g,
    ) || []
    expect(writePolicyBlocks.length).toBeGreaterThan(0)
    for (const block of writePolicyBlocks) expect(block).not.toContain('auth_is_auditor')
  })

  it('incluye rollback recuperable sin borrar evidencias', () => {
    const rollback = sql('policies_auth_rollback.sql')
    expect(rollback).toContain('employee_pin_archive')
    expect(rollback).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE app_data TO anon')
    expect(rollback).not.toMatch(/DROP\s+TABLE\s+(records|cierres|audit_events)/i)
  })
})
