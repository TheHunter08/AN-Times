import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(process.cwd(), 'supabase/launch-security-preflight.sql'), 'utf8')

describe('preflight SQL de seguridad', () => {
  it('bloquea todos los estados que harían insegura la activación de RLS', () => {
    expect(sql).toContain('auth.users')
    expect(sql).toContain('orphan_auth')
    expect(sql).toContain('missing_email')
    expect(sql).toContain('duplicate_email')
    expect(sql).toContain('missing_company')
    expect(sql.match(/RAISE EXCEPTION/g)).toHaveLength(6)
  })

  it('normaliza los correos antes de buscar duplicados', () => {
    expect(sql).toContain('lower(btrim(email))')
    expect(sql).toContain('COALESCE(baja, false) = false')
  })
})
