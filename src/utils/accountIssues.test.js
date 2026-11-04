import { describe, expect, it } from 'vitest'
import { findAccountIssues } from './accountIssues.js'

describe('findAccountIssues', () => {
  it('no marca nada para una cuenta completa y única', () => {
    const employees = [{ id: 'e1', email: 'ana@times.es', authId: 'auth-1' }]
    const { items, summary } = findAccountIssues(employees)
    expect(items).toEqual([])
    expect(summary).toMatchObject({ authTotal: 1, authReady: 1, emailReady: 1, duplicatedEmails: 0, duplicatedAuthIds: 0 })
  })

  it('detecta sin correo y sin identidad vinculada por separado', () => {
    const employees = [
      { id: 'e1', email: '', authId: null },
      { id: 'e2', email: 'bea@times.es', authId: null },
    ]
    const { items } = findAccountIssues(employees)
    expect(items.find(i => i.id === 'e1')?.issues).toEqual(['sin_correo', 'sin_identidad'])
    expect(items.find(i => i.id === 'e2')?.issues).toEqual(['sin_identidad'])
  })

  it('detecta correo e identidad duplicados entre dos empleados distintos', () => {
    const employees = [
      { id: 'e1', email: 'mismo@times.es', authId: 'auth-1' },
      { id: 'e2', email: 'mismo@times.es', authId: 'auth-1' },
    ]
    const { items, summary } = findAccountIssues(employees)
    expect(items).toHaveLength(2)
    expect(items[0].issues).toEqual(['correo_duplicado', 'identidad_duplicada'])
    expect(summary.duplicatedEmails).toBe(1)
    expect(summary.duplicatedAuthIds).toBe(1)
  })

  it('ignora admins (incluida la fila "Administrador" sintética) y respeta mayúsculas/espacios al comparar correos', () => {
    const employees = [
      { id: 'admin', role: 'admin', isAdmin: true, email: '', authId: null },
      { id: 'e1', email: 'Ana@Times.es ', authId: 'auth-1' },
      { id: 'e2', email: ' ana@times.es', authId: 'auth-2' },
    ]
    const { items, summary } = findAccountIssues(employees)
    expect(summary.authTotal).toBe(2)
    expect(items.every(i => i.id !== 'admin')).toBe(true)
    expect(items).toHaveLength(2)
    expect(items[0].issues).toEqual(['correo_duplicado'])
  })

  it('marca baja para que la pantalla pueda distinguirlos', () => {
    const employees = [{ id: 'e1', baja: true, email: '', authId: null }]
    const { items } = findAccountIssues(employees)
    expect(items[0].baja).toBe(true)
  })
})
