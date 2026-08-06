import { describe, expect, it, vi } from 'vitest'
import { createAutomationRun } from './automationHealth.js'
import { persistAutomationRun } from './persistAutomationHealth.js'

const response = (body, ok = true, status = 200) => ({ ok, status, json:vi.fn().mockResolvedValue(body) })

describe('persistAutomationRun', () => {
  it('mezcla la traza sobre la versión más reciente del blob', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response([{ data:{ records:[{ id:'r1' }], config:{ salidaTime:'21:00' } }, updated_at:'2026-08-06T10:00:00Z' }]))
      .mockResolvedValueOnce(response([{ id:1 }]))
    const run = createAutomationRun('sync', { startedAt:1000, finishedAt:2000, processed:2 })

    await persistAutomationRun(run, { sbUrl:'https://example.supabase.co', sbKey:'service-key', fetchImpl })

    const write = fetchImpl.mock.calls[1]
    const payload = JSON.parse(write[1].body)
    expect(write[0]).toContain('updated_at=eq.2026-08-06T10%3A00%3A00Z')
    expect(payload.data.records).toEqual([{ id:'r1' }])
    expect(payload.data.config.salidaTime).toBe('21:00')
    expect(payload.data.config.automationHealth.sync).toEqual(run)
  })

  it('relee y reintenta si otra escritura gana el lock optimista', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response([{ data:{ config:{} }, updated_at:'v1' }]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([{ data:{ config:{ preserved:true } }, updated_at:'v2' }]))
      .mockResolvedValueOnce(response([{ id:1 }]))

    await persistAutomationRun(createAutomationRun('backup'), { sbUrl:'https://example.supabase.co', sbKey:'service-key', fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(4)
    expect(JSON.parse(fetchImpl.mock.calls[3][1].body).data.config.preserved).toBe(true)
  })
})
