import { describe, expect, it } from 'vitest'
import { runMonthlyClose } from './auto-cierre-mensual.js'

describe('cierre mensual automático compartido', () => {
  it('no toca datos mientras el periodo anterior sigue abierto', async () => {
    const result = await runMonthlyClose(new Date(2026, 0, 1, 12, 0, 0))

    expect(result).toEqual({
      ok:true,
      mes:'2025-12',
      processed:0,
      skipped:'period-open',
    })
  })
})
