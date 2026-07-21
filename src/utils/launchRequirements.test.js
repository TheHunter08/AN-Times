import { describe, expect, it } from 'vitest'
import { getLaunchRequirements, hasEmployeeSignature } from './launchRequirements.js'

describe('requisitos obligatorios de lanzamiento', () => {
  const db = { firmas: { emp1: { main: { data: 'data:image/jpeg;base64,firma' } } } }

  it('solo acepta una firma con datos reales', () => {
    expect(hasEmployeeSignature(db, 'emp1')).toBe(true)
    expect(hasEmployeeSignature({ firmas: { emp1: { main: {} } } }, 'emp1')).toBe(false)
  })

  it('exige simultáneamente firma y registro push confirmado', () => {
    expect(getLaunchRequirements(db, 'emp1', true).ready).toBe(true)
    expect(getLaunchRequirements(db, 'emp1', false).ready).toBe(false)
    expect(getLaunchRequirements({}, 'emp1', true).ready).toBe(false)
  })
})
