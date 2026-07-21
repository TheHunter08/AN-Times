import { describe, expect, it } from 'vitest'
import { isRecordPendingValidation, recordValidationState, selectValidationRecords } from './recordValidation.js'

describe('estado de validación de jornadas', () => {
  it('unifica los campos legacy aceptada y validado', () => {
    expect(recordValidationState({ fin:'2026-07-20', aceptada:true })).toBe('approved')
    expect(recordValidationState({ fin:'2026-07-20', validado:true })).toBe('approved')
    expect(recordValidationState({ fin:'2026-07-20', rechazado:true, aceptada:true })).toBe('rejected')
    expect(recordValidationState({ fin:'2026-07-20' })).toBe('pending')
    expect(recordValidationState({ fin:null })).toBe('open')
  })

  it('solo considera pendientes las jornadas cerradas sin decisión', () => {
    expect(isRecordPendingValidation({ fin:'2026-07-20' })).toBe(true)
    expect(isRecordPendingValidation({ fin:'2026-07-20', validado:true })).toBe(false)
    expect(isRecordPendingValidation({ fin:null })).toBe(false)
  })

  it('mantiene visibles todos los pendientes antiguos y limita solo el historial resuelto', () => {
    const now = new Date('2026-07-21T12:00:00Z').getTime()
    const rows = selectValidationRecords([
      { id:'pending-old', inicio:'2026-06-01T08:00:00Z', fin:'2026-06-01T16:00:00Z' },
      { id:'approved-old', inicio:'2026-06-01T08:00:00Z', fin:'2026-06-01T16:00:00Z', validado:true },
      { id:'approved-new', inicio:'2026-07-20T08:00:00Z', fin:'2026-07-20T16:00:00Z', aceptada:true },
      { id:'open', inicio:'2026-07-21T08:00:00Z', fin:null },
    ], now)

    expect(rows.map(row => row.id)).toEqual(['approved-new', 'pending-old'])
  })
})
