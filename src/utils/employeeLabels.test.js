import { describe, expect, it } from 'vitest'
import { buildDuplicateNameLabels } from './employeeLabels.js'

describe('buildDuplicateNameLabels', () => {
  it('deja el nombre tal cual cuando no hay colisiones', () => {
    const employees = [{ id: '1', name: 'Juan Pérez' }, { id: '2', name: 'María López' }]
    const labels = buildDuplicateNameLabels(employees)
    expect(labels.get('1')).toBe('Juan Pérez')
    expect(labels.get('2')).toBe('María López')
  })

  it('añade el centro de trabajo solo a quienes comparten nombre completo', () => {
    const employees = [
      { id: '1', name: 'Juan Pérez', dept: 'Obra Norte' },
      { id: '2', name: 'Juan Pérez', dept: 'Obra Sur' },
      { id: '3', name: 'María López', dept: 'Obra Norte' },
    ]
    const labels = buildDuplicateNameLabels(employees)
    expect(labels.get('1')).toBe('Juan Pérez (Obra Norte)')
    expect(labels.get('2')).toBe('Juan Pérez (Obra Sur)')
    expect(labels.get('3')).toBe('María López')
  })

  it('usa el id como respaldo si no hay centro de trabajo', () => {
    const employees = [{ id: 'e1', name: 'Ana Ruiz' }, { id: 'e2', name: 'Ana Ruiz' }]
    const labels = buildDuplicateNameLabels(employees)
    expect(labels.get('e1')).toBe('Ana Ruiz (e1)')
    expect(labels.get('e2')).toBe('Ana Ruiz (e2)')
  })
})
