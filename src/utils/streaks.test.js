import { describe, expect, it } from 'vitest'
import { calcStreak } from './streaks.js'

const rec = (dateStr, empId = 'e1') => ({
  empId,
  inicio: `${dateStr}T08:00:00.000Z`,
  fin: `${dateStr}T16:00:00.000Z`,
})

describe('calcStreak', () => {
  it('cuenta días consecutivos trabajados dentro del mismo mes', () => {
    const records = [rec('2026-08-10'), rec('2026-08-11')]
    expect(calcStreak(records, 'e1', '2026-08-11')).toBe(2)
  })

  it('se reinicia al cruzar a un mes nuevo, sin arrastrar la racha del mes anterior', () => {
    // 2026-07-31 es viernes, 2026-08-01 es sábado (fin de semana, se salta) y
    // 2026-08-03 es el primer día laborable de agosto.
    const records = [
      rec('2026-07-29'), rec('2026-07-30'), rec('2026-07-31'),
      rec('2026-08-03'),
    ]
    expect(calcStreak(records, 'e1', '2026-08-03')).toBe(1)
  })

  it('el primer día del mes sin fichar todavía da racha 0, no la del mes anterior', () => {
    const records = [rec('2026-07-29'), rec('2026-07-30'), rec('2026-07-31')]
    expect(calcStreak(records, 'e1', '2026-08-03')).toBe(0)
  })

  it('un hueco entre semana corta la racha igual que antes', () => {
    const records = [rec('2026-08-10'), rec('2026-08-12')]
    expect(calcStreak(records, 'e1', '2026-08-12')).toBe(1)
  })
})
