import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetConnectivityForTests,
  getConnectivitySnapshot,
  probeConnectivity,
} from './useConnectivity.js'

describe('detección real de conectividad', () => {
  beforeEach(() => {
    _resetConnectivityForTests()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    _resetConnectivityForTests()
  })

  it('no declara sin cobertura si iOS deja navigator.onLine en false pero el backend responde', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    await expect(probeConnectivity()).resolves.toBe(true)
    expect(getConnectivitySnapshot().online).toBe(true)
  })

  it('confirma la desconexión solo después de dos fallos reales consecutivos', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(probeConnectivity()).resolves.toBe(false)
    expect(getConnectivitySnapshot().online).toBe(true)

    await expect(probeConnectivity()).resolves.toBe(false)
    expect(getConnectivitySnapshot().online).toBe(false)
  })

  it('no confunde un timeout aislado del servidor con falta de Internet', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('timeout')))

    await probeConnectivity()
    expect(getConnectivitySnapshot().online).toBe(true)

    await probeConnectivity()
    expect(getConnectivitySnapshot().online).toBe(false)
  })
})
