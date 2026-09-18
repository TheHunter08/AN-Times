import { afterEach, describe, expect, it, vi } from 'vitest'

process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-secret'
process.env.SB_SERVICE_KEY = process.env.SB_SERVICE_KEY || 'service-key'

const jsonResponse = (body, ok = true) => ({
  ok, status: ok ? 200 : 500,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

function mockFetch(routes) {
  const calls = []
  const fn = vi.fn(async (url, opts) => {
    const u = url.toString()
    calls.push({ url: u, method: opts?.method })
    for (const [pattern, handler] of routes) if (u.includes(pattern)) return handler(u, opts)
    throw new Error('fetch inesperado en el test: ' + u)
  })
  fn.calls = calls
  return fn
}

const authedReq = { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }
const res = () => {
  const r = {}
  r.status = code => { r.statusCode = code; return r }
  r.json = body => { r.body = body; return r }
  return r
}

describe('cron-reports (informes programados)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

  it('sin informes debidos no toca app_data, fichajes ni Storage', async () => {
    const fetchMock = mockFetch([
      ['/rest/v1/app_entities?id=eq.config%3A__singleton__&select=data,updated_at', () =>
        jsonResponse([{ data:{ reportSchedules:[] }, updated_at:'2026-09-14T00:00:00Z' }])],
      ['/rest/v1/app_entities?id=eq.config%3A__singleton__&updated_at=', () => jsonResponse([{ id:'config:__singleton__' }])],
    ])
    vi.stubGlobal('fetch', fetchMock)

    const { default: handler } = await import('./api/cron-reports.js')
    const response = res()
    await handler(authedReq, response)

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ ok:true, checked:0, due:0, runs:[] })
    expect(fetchMock.calls.some(c => c.url.includes('/rest/v1/app_data'))).toBe(false)
    expect(fetchMock.calls.some(c => c.url.includes('/rest/v1/records'))).toBe(false)
    expect(fetchMock.calls.some(c => c.url.includes('/storage/'))).toBe(false)
  })

  it('genera un informe semanal debido acotando los fichajes por fecha, nunca leyendo app_data', async () => {
    let configState = {
      reportSchedules:[{ id:'sched1', enabled:true, frequency:'weekly', format:'pdf', name:'Semanal Obra A', recipients:'jefe@example.com', lastRunKey:null }],
      reportRuns:[],
    }
    const fetchMock = mockFetch([
      ['/rest/v1/app_entities?id=eq.config%3A__singleton__&select=data,updated_at', () =>
        jsonResponse([{ data:configState, updated_at:'2026-09-14T00:00:00Z' }])],
      ['/rest/v1/app_entities?id=eq.config%3A__singleton__&updated_at=', (u, opts) => {
        configState = JSON.parse(opts.body).data
        return jsonResponse([{ id:'config:__singleton__' }])
      }],
      ['/rest/v1/employees?select=*&baja=eq.false', () => jsonResponse([{ id:'emp1', name:'Ana', role:'empleado', baja:false }])],
      ['/rest/v1/records?select=*', () => jsonResponse([
        { id:'r1', emp_id:'emp1', inicio:'2026-09-08T08:00:00.000Z', fin:'2026-09-08T16:00:00.000Z', work_secs:28800 },
      ])],
      ['/storage/v1/bucket/scheduled-reports', () => jsonResponse({ id:'scheduled-reports' })],
      ['/storage/v1/object/scheduled-reports/', () => jsonResponse({})],
      ['/storage/v1/object/sign/scheduled-reports/', () => jsonResponse({ signedURL:'/storage/v1/object/sign/scheduled-reports/sched1/x.pdf?token=abc' })],
    ])
    vi.stubGlobal('fetch', fetchMock)

    const { default: handler } = await import('./api/cron-reports.js')
    const response = res()
    await handler(authedReq, response)

    expect(response.statusCode).toBe(200)
    expect(fetchMock.calls.some(c => c.url.includes('/rest/v1/app_data'))).toBe(false)

    const recordsCall = fetchMock.calls.find(c => c.url.includes('/rest/v1/records?'))
    expect(recordsCall).toBeDefined()
    expect(recordsCall.url).toContain('inicio=gte.')

    expect(response.body.runs).toHaveLength(1)
    expect(['generated', 'sent']).toContain(response.body.runs[0].status)
    expect(configState.reportSchedules[0].lastRunKey).not.toBeNull()
  })

  it('si falla la reserva (claimSchedule) de un informe, no aborta el resto del lote ni pierde el que ya se completó', async () => {
    let configState = {
      reportSchedules: [
        { id: 'sched1', enabled: true, frequency: 'weekly', format: 'pdf', name: 'Semanal Obra A', recipients: 'a@example.com', lastRunKey: null },
        { id: 'sched2', enabled: true, frequency: 'weekly', format: 'pdf', name: 'Semanal Obra B', recipients: 'b@example.com', lastRunKey: null },
      ],
      reportRuns: [],
    }
    let configUpdatedAt = '2026-09-14T00:00:00Z'
    const fetchMock = mockFetch([
      ['/rest/v1/app_entities?id=eq.config%3A__singleton__&select=data,updated_at', () =>
        jsonResponse([{ data: configState, updated_at: configUpdatedAt }])],
      ['/rest/v1/app_entities?id=eq.config%3A__singleton__&updated_at=', (u, opts) => {
        const body = JSON.parse(opts.body)
        // Simula un conflicto persistente SOLO al reservar sched2 (otro cron
        // sigue escribiendo esa misma fila) — todas las demás escrituras
        // (reservar sched1, y el guardado final tras el bucle) tienen éxito.
        const claimingSched2 = body.data.reportSchedules.some((s) => s.id === 'sched2' && s.runningKey)
        if (claimingSched2) return jsonResponse([])
        configState = body.data
        configUpdatedAt = body.updated_at
        return jsonResponse([{ id: 'config:__singleton__' }])
      }],
      ['/rest/v1/employees?select=*&baja=eq.false', () => jsonResponse([{ id: 'emp1', name: 'Ana', role: 'empleado', baja: false }])],
      ['/rest/v1/records?select=*', () => jsonResponse([
        { id: 'r1', emp_id: 'emp1', inicio: '2026-09-08T08:00:00.000Z', fin: '2026-09-08T16:00:00.000Z', work_secs: 28800 },
      ])],
      ['/storage/v1/bucket/scheduled-reports', () => jsonResponse({ id: 'scheduled-reports' })],
      ['/storage/v1/object/scheduled-reports/', () => jsonResponse({})],
      ['/storage/v1/object/sign/scheduled-reports/', () => jsonResponse({ signedURL: '/storage/v1/object/sign/scheduled-reports/sched1/x.pdf?token=abc' })],
    ])
    vi.stubGlobal('fetch', fetchMock)

    const { default: handler } = await import('./api/cron-reports.js')
    const response = res()
    await handler(authedReq, response)

    expect(response.statusCode).toBe(200)
    const runIds = response.body.runs.map((r) => r.scheduleId)
    expect(runIds).toContain('sched1')
    expect(runIds).toContain('sched2')

    const sched1Final = configState.reportSchedules.find((s) => s.id === 'sched1')
    const sched2Final = configState.reportSchedules.find((s) => s.id === 'sched2')
    // sched1 sí se generó, subió y envió — no debe perderse aunque sched2 fallara
    expect(sched1Final.lastRunKey).not.toBeNull()
    // sched2 falló al reservarse: queda pendiente para reintentar, no marcado como completado
    expect(sched2Final.lastRunKey).toBeNull()
    expect(sched2Final.lastRunStatus).toBe('error')
  })
})
