import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))

describe('cron de recordatorios en Vercel Hobby', () => {
  it('cubre mañana, mediodía, tarde y noche con rutas diarias únicas', () => {
    const reminders = config.crons.filter(item => item.path.startsWith('/api/cron-reminders'))

    expect(reminders).toHaveLength(4)
    expect(new Set(reminders.map(item => item.path)).size).toBe(4)
    expect(reminders.every(item => !/[,*-]/.test(item.schedule.split(' ')[1]))).toBe(true)
  })

  it('reutiliza la función existente para no aumentar funciones serverless', () => {
    const aliases = config.rewrites.filter(item => item.source.startsWith('/api/cron-reminders-'))

    expect(aliases).toHaveLength(3)
    expect(aliases.every(item => item.destination === '/api/cron-reminders')).toBe(true)
  })
})
