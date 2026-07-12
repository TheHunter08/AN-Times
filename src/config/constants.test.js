import { describe, expect, it } from 'vitest'
import { INITIAL_DB } from './constants.js'

describe('INITIAL_DB', () => {
  it('contains structure only and never seeds demo business data', () => {
    expect(INITIAL_DB.employees).toEqual([])
    expect(INITIAL_DB.empresas).toEqual([])
    expect(INITIAL_DB.obras).toEqual([])
    expect(INITIAL_DB.centrosTrabajo).toEqual([])
    expect(INITIAL_DB.config).toEqual({})
  })
})
