import { describe, expect, it } from 'vitest'
import { closureSignatureBacklog, pendingClosureSignatures } from './closureSignatures.js'

const now = new Date('2026-08-07T10:00:00+02:00')

describe('firmas pendientes de cierres mensuales', () => {
  it('solo incluye cierres terminados, vigentes e incompletos', () => {
    const closures = [
      { id:'missing-both', mes:'2026-07', estado:'pendiente' },
      { id:'missing-admin', mes:'2026-07', estado:'pendiente', firmaEmp:true },
      { id:'missing-employee', mes:'2026-07', estado:'pendiente', firmaAdmin:true },
      { id:'complete', mes:'2026-07', estado:'firmado', firmaAdmin:true, firmaEmp:true },
      { id:'legacy-complete', mes:'2026-07', estado:'firmado', firmaAdmin:true, firma:true },
      { id:'stale', mes:'2026-07', estado:'pendiente', desactualizado:true },
      { id:'rejected', mes:'2026-07', estado:'rechazado' },
      { id:'current-month', mes:'2026-08', estado:'pendiente' },
    ]

    expect(pendingClosureSignatures(closures, now).map(item => item.id)).toEqual([
      'missing-both', 'missing-admin', 'missing-employee',
    ])
  })

  it('separa las acciones pendientes de administrador y empleado', () => {
    const backlog = closureSignatureBacklog([
      { id:'both', mes:'2026-07', estado:'pendiente' },
      { id:'admin', mes:'2026-07', estado:'pendiente', firmaEmp:true },
      { id:'employee', mes:'2026-07', estado:'pendiente', firmaAdmin:true },
    ], now)

    expect(backlog.pending).toHaveLength(3)
    expect(backlog.admin.map(item => item.id)).toEqual(['both', 'admin'])
    expect(backlog.employee.map(item => item.id)).toEqual(['both', 'employee'])
  })
})
