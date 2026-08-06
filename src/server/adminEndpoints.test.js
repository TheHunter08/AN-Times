import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = vi.hoisted(() => ({
  migrate: vi.fn(),
  patchPins: vi.fn(),
  pushAll: vi.fn(),
  whatsapp: vi.fn(),
  monthlyClose: vi.fn(),
}))

vi.mock('./adminEndpoints/migrate-to-tables.js', () => ({ default: handlers.migrate }))
vi.mock('./adminEndpoints/patch-pins.js', () => ({ default: handlers.patchPins }))
vi.mock('./adminEndpoints/send-push-all.js', () => ({ default: handlers.pushAll }))
vi.mock('./adminEndpoints/send-whatsapp.js', () => ({ default: handlers.whatsapp }))
vi.mock('./adminEndpoints/monthly-close.js', () => ({ default: handlers.monthlyClose }))

import dispatchAdminEndpoint from './adminEndpoints.js'

function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
}

describe('dispatchAdminEndpoint', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ['migrate-to-tables', 'migrate'],
    ['patch-pins', 'patchPins'],
    ['send-push-all', 'pushAll'],
    ['send-whatsapp', 'whatsapp'],
    ['monthly-close', 'monthlyClose'],
  ])('conserva la ruta histórica %s', (op, handlerName) => {
    const req = { query: { op } }
    const res = response()

    dispatchAdminEndpoint(req, res)

    expect(handlers[handlerName]).toHaveBeenCalledWith(req, res)
  })

  it('rechaza operaciones que no están en la lista cerrada', () => {
    const res = response()

    dispatchAdminEndpoint({ query: { op: 'desconocida' } }, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ error: 'Endpoint interno no encontrado' })
  })
})
