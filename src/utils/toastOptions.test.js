import { describe, expect, it } from 'vitest'
import { normalizeToastOptions } from './toastOptions.js'

describe('normalizeToastOptions', () => {
  it('acepta la firma corta con tipos de la UI v2', () => {
    expect(normalizeToastOptions('success')).toEqual({ duration:3000, type:'ok' })
    expect(normalizeToastOptions('error')).toEqual({ duration:3000, type:'err' })
    expect(normalizeToastOptions('warning')).toEqual({ duration:3000, type:'warn' })
  })

  it('conserva la firma completa y sanea duraciones inválidas', () => {
    expect(normalizeToastOptions(4500, 'warn')).toEqual({ duration:4500, type:'warn' })
    expect(normalizeToastOptions(Number.NaN, 'err')).toEqual({ duration:3000, type:'err' })
  })
})
