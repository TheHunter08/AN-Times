import { describe, expect, it } from 'vitest'
import { formatModelBytes, getLocalModelNetworkState } from './localAI.js'

describe('formatModelBytes', () => {
  it('muestra tamaños comprensibles sin decimales innecesarios', () => {
    expect(formatModelBytes(430 * 1024 * 1024)).toBe('430 MB')
    expect(formatModelBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB')
  })
})

describe('getLocalModelNetworkState', () => {
  it('no bloquea la descarga cuando el navegador no puede distinguir Wi-Fi de datos', () => {
    expect(getLocalModelNetworkState().allowed).toBe(true)
  })
})
