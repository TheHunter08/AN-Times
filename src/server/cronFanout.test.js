import { describe, expect, it, vi } from 'vitest'
import { runCronFanout } from './cronFanout.js'

describe('runCronFanout', () => {
  it('runs every job sequentially and keeps their individual result', async () => {
    const order = []
    const first = vi.fn(async (_req, res) => {
      order.push('reminders')
      return res.status(200).json({ sent:2 })
    })
    const second = vi.fn(async (_req, res) => {
      order.push('autoclose')
      return res.status(200).json({ closed:1 })
    })

    const result = await runCronFanout({ headers:{} }, [
      ['reminders', first],
      ['autoclose', second],
    ])

    expect(order).toEqual(['reminders', 'autoclose'])
    expect(result).toEqual({
      ok:true,
      statusCode:200,
      results:[
        { name:'reminders', statusCode:200, payload:{ sent:2 } },
        { name:'autoclose', statusCode:200, payload:{ closed:1 } },
      ],
    })
  })

  it('still runs autoclose when reminders fails and reports the combined failure', async () => {
    const autoclose = vi.fn(async (_req, res) => res.status(200).json({ closed:0 }))
    const result = await runCronFanout({ headers:{} }, [
      ['reminders', async (_req, res) => res.status(500).json({ error:'push failed' })],
      ['autoclose', autoclose],
    ])

    expect(autoclose).toHaveBeenCalledOnce()
    expect(result.ok).toBe(false)
    expect(result.statusCode).toBe(500)
    expect(result.results[1]).toMatchObject({ name:'autoclose', statusCode:200 })
  })
})
