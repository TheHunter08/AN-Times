import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getStoredPinToken, storePinToken, clearPinToken, requestPinToken } from './pinAuthToken.js'

describe('pinAuthToken: almacenamiento y caducidad', () => {
  beforeEach(() => localStorage.clear())

  it('storePinToken + getStoredPinToken redondean el mismo valor', () => {
    storePinToken({ token: 'abc.def.ghi', expiresAt: Date.now() + 3_600_000, empId: 'e1' })
    expect(getStoredPinToken()).toMatchObject({ token: 'abc.def.ghi', empId: 'e1' })
  })

  it('un token ya caducado no se devuelve', () => {
    storePinToken({ token: 'x', expiresAt: Date.now() - 1000, empId: 'e1' })
    expect(getStoredPinToken()).toBeNull()
  })

  it('un token a punto de caducar (dentro del margen de 60s) tampoco se devuelve', () => {
    storePinToken({ token: 'x', expiresAt: Date.now() + 30_000, empId: 'e1' })
    expect(getStoredPinToken()).toBeNull()
  })

  it('clearPinToken borra la sesión', () => {
    storePinToken({ token: 'x', expiresAt: Date.now() + 3_600_000, empId: 'e1' })
    clearPinToken()
    expect(getStoredPinToken()).toBeNull()
  })

  it('sin nada guardado, o con basura corrupta, devuelve null sin lanzar', () => {
    expect(getStoredPinToken()).toBeNull()
    localStorage.setItem('an_times_pin_jwt', '{not json')
    expect(getStoredPinToken()).toBeNull()
  })
})

describe('requestPinToken: falla en silencio, nunca bloquea el login', () => {
  beforeEach(() => { localStorage.clear(); vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => vi.unstubAllGlobals())

  it('en éxito, guarda el token y lo devuelve', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, token: 'a.b.c', expiresAt: Date.now() + 3_600_000 }) })
    const token = await requestPinToken('e1', '1234')
    expect(token).toBe('a.b.c')
    expect(getStoredPinToken()?.token).toBe('a.b.c')
  })

  it('con respuesta no-ok, devuelve null y no guarda nada', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401 })
    expect(await requestPinToken('e1', '0000')).toBeNull()
    expect(getStoredPinToken()).toBeNull()
  })

  it('si fetch lanza (offline, endpoint no desplegado…), devuelve null sin propagar el error', async () => {
    fetch.mockRejectedValueOnce(new Error('network down'))
    await expect(requestPinToken('e1', '1234')).resolves.toBeNull()
  })
})
