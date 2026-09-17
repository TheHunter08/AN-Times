import { afterEach, describe, expect, it, vi } from 'vitest'

process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-secret'
process.env.SB_SERVICE_KEY = process.env.SB_SERVICE_KEY || 'service-key'
process.env.VAPID_PUBLIC = process.env.VAPID_PUBLIC || 'BDusP6xEUzBLyW0_9ocp4qzL9Xjmg7xng1HkN9uc3E6idPZlT3DcbvuX5FfruBf1lwiCcc1VtkI6YZ7uyeHgCD4'
process.env.VAPID_PRIVATE = process.env.VAPID_PRIVATE || 'MiCU5tDhLTf2P8yvMb35qt_hH_osK6IaQ0yW2WRXHgo'

const jsonResponse = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body, text: async () => JSON.stringify(body) })

function mockFetch(routes) {
  const calls = []
  const fn = vi.fn(async (url) => {
    const u = url.toString()
    calls.push(u)
    for (const [pattern, handler] of routes) if (u.includes(pattern)) return handler(u)
    throw new Error('fetch inesperado en el test: ' + u)
  })
  fn.calls = calls
  return fn
}

const authedReq = body => ({
  method: 'POST',
  headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  body,
  socket: {},
})
const res = () => {
  const r = {}
  r.status = code => { r.statusCode = code; return r }
  r.json = body => { r.body = body; return r }
  r.end = () => r
  return r
}

describe('send-push-all: target "activos"', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

  it('incluye a quien fichó justo después de medianoche en Madrid, aunque el UTC siga en el día anterior', async () => {
    // 00:30 hora de Madrid del 16 de septiembre == 22:30 UTC del 15.
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-15T22:30:00.000Z'))
    const employees = [{ id: 'emp1', name: 'Ana', role: 'empleado', baja: false }]
    const records = [
      // Fichó a las 00:15 hora de Madrid (16 sep), guardado en UTC como 15 sep 22:15Z.
      { empId: 'emp1', inicio: '2026-09-15T22:15:00.000Z', fin: null },
    ]
    const fetchMock = mockFetch([
      ['/rest/v1/app_data?id=eq.1&select=data', () => jsonResponse([{ data: { employees, records } }])],
      ['/rest/v1/push_subs?select=', () => jsonResponse([{ user_id: 'emp1', endpoint: 'https://push.example/a', p256dh: 'p', auth: 'a' }])],
    ])
    vi.stubGlobal('fetch', fetchMock)

    const webpushModule = await import('web-push')
    const sent = []
    webpushModule.default.sendNotification = async sub => { sent.push(sub.endpoint); return { statusCode: 201 } }

    const { default: handler } = await import('./send-push-all.js')
    const response = res()
    await handler(authedReq({ title: 'Aviso', body: 'Hola', target: 'activos' }), response)

    expect(response.statusCode).toBe(200)
    expect(response.body.sent).toBe(1)
    expect(sent).toEqual(['https://push.example/a'])
    vi.useRealTimers()
  })

  it('incluye un turno nocturno todavía abierto desde el día anterior', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-16T10:00:00.000Z'))
    const employees = [{ id: 'emp1', name: 'Ana', role: 'empleado', baja: false }]
    const records = [
      { empId: 'emp1', inicio: '2026-09-15T20:00:00.000Z', fin: null }, // empezó ayer, sigue abierto
    ]
    const fetchMock = mockFetch([
      ['/rest/v1/app_data?id=eq.1&select=data', () => jsonResponse([{ data: { employees, records } }])],
      ['/rest/v1/push_subs?select=', () => jsonResponse([{ user_id: 'emp1', endpoint: 'https://push.example/a', p256dh: 'p', auth: 'a' }])],
    ])
    vi.stubGlobal('fetch', fetchMock)

    const webpushModule = await import('web-push')
    const sent = []
    webpushModule.default.sendNotification = async sub => { sent.push(sub.endpoint); return { statusCode: 201 } }

    const { default: handler } = await import('./send-push-all.js')
    const response = res()
    await handler(authedReq({ title: 'Aviso', body: 'Hola', target: 'activos' }), response)

    expect(response.statusCode).toBe(200)
    expect(response.body.sent).toBe(1)
    vi.useRealTimers()
  })

  it('excluye a quien ya fichó la salida', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-16T10:00:00.000Z'))
    const employees = [{ id: 'emp1', name: 'Ana', role: 'empleado', baja: false }]
    const records = [
      { empId: 'emp1', inicio: '2026-09-16T08:00:00.000Z', fin: '2026-09-16T09:00:00.000Z' },
    ]
    const fetchMock = mockFetch([
      ['/rest/v1/app_data?id=eq.1&select=data', () => jsonResponse([{ data: { employees, records } }])],
      ['/rest/v1/push_subs?select=', () => jsonResponse([{ user_id: 'emp1', endpoint: 'https://push.example/a', p256dh: 'p', auth: 'a' }])],
    ])
    vi.stubGlobal('fetch', fetchMock)

    const { default: handler } = await import('./send-push-all.js')
    const response = res()
    await handler(authedReq({ title: 'Aviso', body: 'Hola', target: 'activos' }), response)

    expect(response.statusCode).toBe(200)
    expect(response.body.total).toBe(0)
    vi.useRealTimers()
  })
})
