import { describe, expect, it } from 'vitest'
import packageJson from '../../package.json'
import { APP_CHANGELOG } from './changelog.js'

describe('APP_CHANGELOG', () => {
  it('identifica la versión desplegada y mantiene las entradas de más reciente a más antigua', () => {
    expect(APP_CHANGELOG[0].version).toBe(packageJson.version)
    const dates = APP_CHANGELOG.map(entry => Date.parse(`${entry.date}T00:00:00Z`))
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
  })

  it('explica al usuario los cambios materiales de la migración 4.6', () => {
    const entry = APP_CHANGELOG.find(e => e.version === '4.6.0')
    const releaseText = entry.items.join(' ')
    expect(releaseText).toContain('Supabase Auth')
    expect(releaseText).toContain('firma incrustada')
    expect(releaseText).toContain('RLS')
    expect(releaseText).toContain('versión instalada')
  })
})
