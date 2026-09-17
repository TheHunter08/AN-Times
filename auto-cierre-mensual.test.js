import { afterEach, describe, expect, it, vi } from 'vitest'
import { runMonthlyClose } from './auto-cierre-mensual.js'

const jsonResponse = (body, ok = true) => ({
  ok, status: ok ? 200 : 500,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

describe('cierre mensual automático compartido', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('no toca datos mientras el periodo anterior sigue abierto', async () => {
    const result = await runMonthlyClose(new Date(2026, 0, 1, 12, 0, 0))

    expect(result).toEqual({
      ok:true,
      mes:'2025-12',
      processed:0,
      skipped:'period-open',
    })
  })

  it('lee de las tablas normalizadas (nunca del blob app_data) y acota los fichajes al mes en curso', async () => {
    const calls = []
    const fetchMock = vi.fn(async (url, opts) => {
      const u = url.toString()
      calls.push(u)
      if (u.includes('/rest/v1/employees')) {
        return jsonResponse([{ id:'emp1', name:'Ana', role:'empleado', baja:false }])
      }
      if (u.includes('/rest/v1/records')) {
        return jsonResponse([
          { id:'r1', emp_id:'emp1', inicio:'2026-01-10T08:00:00.000Z', fin:'2026-01-10T16:00:00.000Z', centro:null, work_secs:28800, break_secs:0, closed:true },
        ])
      }
      if (u.includes('/rest/v1/cierres') && (!opts || opts.method === undefined)) {
        return jsonResponse([]) // sin cierre previo para enero 2026
      }
      if (u.includes('/rest/v1/vacaciones')) return jsonResponse([])
      if (u.includes('/rest/v1/app_entities')) return jsonResponse([])
      if (u.includes('sendpush')) return jsonResponse({ ok:true })
      if (u.includes('/rest/v1/cierres') && opts?.method === 'POST') return jsonResponse([], true)
      throw new Error('fetch inesperado en el test: ' + u)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runMonthlyClose(new Date(2026, 1, 10, 12, 0, 0)) // cierra enero 2026

    expect(result.ok).toBe(true)
    expect(result.mes).toBe('2026-01')
    expect(result.processed).toBe(1)

    const touchedBlob = calls.some(u => u.includes('/rest/v1/app_data'))
    expect(touchedBlob).toBe(false)

    const recordsCall = calls.find(u => u.includes('/rest/v1/records?'))
    expect(recordsCall).toBeDefined()
    // Acotado al mes de enero (y un pequeño margen hacia febrero), nunca al
    // histórico completo de la empresa.
    expect(recordsCall).toContain('inicio=gte.2026-01-01')
    expect(recordsCall).toContain('inicio=lt.2026-02-08')
  })

  it('omite a un empleado que ya tiene cierre generado para ese mes', async () => {
    const fetchMock = vi.fn(async url => {
      const u = url.toString()
      if (u.includes('/rest/v1/employees')) return jsonResponse([{ id:'emp1', name:'Ana', role:'empleado', baja:false }])
      if (u.includes('/rest/v1/records')) return jsonResponse([
        { id:'r1', emp_id:'emp1', inicio:'2026-01-10T08:00:00.000Z', fin:'2026-01-10T16:00:00.000Z', work_secs:28800, break_secs:0 },
      ])
      if (u.includes('/rest/v1/cierres')) return jsonResponse([{ id:'cierre_2026-01_emp1', emp_id:'emp1', mes:'2026-01', estado:'pendiente' }])
      if (u.includes('/rest/v1/vacaciones')) return jsonResponse([])
      if (u.includes('/rest/v1/app_entities')) return jsonResponse([])
      throw new Error('fetch inesperado en el test: ' + u)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runMonthlyClose(new Date(2026, 1, 10, 12, 0, 0))

    expect(result).toEqual({ ok:true, mes:'2026-01', processed:0, skipped:'nothing-to-generate' })
  })
})
