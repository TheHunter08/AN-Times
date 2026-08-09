import { describe, expect, it } from 'vitest'
import { buildEmployeeDayGuide } from './employeeDayGuide.js'

describe('buildEmployeeDayGuide', () => {
  it('proyecta la hora de objetivo durante una jornada activa', () => {
    const result = buildEmployeeDayGuide({ state:'working', now:new Date(2026, 7, 9, 14, 0), remainingMin:90, progressPct:75 })
    expect(result.metric).toBe('15:30')
    expect(result.title).toContain('15:30')
    expect(result.label).toBe('Proyección en vivo')
  })

  it('aclara que una proyección en descanso supone reanudar ahora', () => {
    const result = buildEmployeeDayGuide({ state:'break', now:new Date(2026, 7, 9, 10, 15), remainingMin:45 })
    expect(result.metric).toBe('11:00')
    expect(result.title).toContain('Si reanudas ahora')
    expect(result.tone).toBe('orange')
  })

  it('prioriza la protección offline frente a cualquier previsión', () => {
    const result = buildEmployeeDayGuide({ state:'working', remainingMin:120, syncStatus:'error' })
    expect(result.metric).toBe('Offline')
    expect(result.title).toBe('Tus cambios siguen seguros')
  })

  it('muestra el horario previsto antes de iniciar', () => {
    const result = buildEmployeeDayGuide({ state:'idle', shiftStart:'08:00', shiftEnd:'16:00' })
    expect(result.metric).toBe('08:00')
    expect(result.detail).toContain('08:00–16:00')
  })

  it('reconoce el objetivo diario completado', () => {
    const result = buildEmployeeDayGuide({ state:'working', remainingMin:0, progressPct:100 })
    expect(result.metric).toBe('100%')
    expect(result.tone).toBe('green')
  })
})
