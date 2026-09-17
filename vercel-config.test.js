import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))

describe('cron de recordatorios en Vercel Hobby', () => {
  it('cubre mañana, mediodía, tarde y noche con rutas diarias únicas', () => {
    const reminders = config.crons.filter(item => item.path.startsWith('/api/cron-reminders'))

    expect(reminders).toHaveLength(4)
    expect(new Set(reminders.map(item => item.path)).size).toBe(4)
    expect(reminders.every(item => !/[,*-]/.test(item.schedule.split(' ')[1]))).toBe(true)
  })

  it('reutiliza funciones existentes para no aumentar funciones serverless', () => {
    // cron-reminders-evening/night reenvían a cron-reminders-and-autoclose
    // (fanout que ejecuta reminders + autoclose en una sola función) en vez
    // de a cron-reminders directamente — ambos destinos son funciones ya
    // existentes, ninguna alias crea una función serverless nueva.
    const aliases = config.rewrites.filter(item => item.source.startsWith('/api/cron-reminders-'))
    const reusedDestinations = new Set(['/api/cron-reminders', '/api/cron-reminders-and-autoclose'])

    expect(aliases).toHaveLength(3)
    expect(aliases.every(item => reusedDestinations.has(item.destination))).toBe(true)
  })
})
