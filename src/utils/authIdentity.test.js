import { describe, expect, it } from 'vitest'
import { canLinkAuthIdentity, linkAuthIdentity } from './authIdentity.js'

describe('vinculación segura de Supabase Auth', () => {
  it('permite la primera vinculación y añade fecha de actualización', () => {
    expect(linkAuthIdentity({ id:'e1' }, 'auth-1', '2026-07-21T20:00:00.000Z')).toMatchObject({
      id:'e1', authId:'auth-1', _upd:'2026-07-21T20:00:00.000Z',
    })
  })

  it('acepta la misma identidad ya vinculada', () => {
    expect(canLinkAuthIdentity({ id:'e1', authId:'auth-1' }, 'auth-1')).toBe(true)
  })

  it('impide reemplazar una identidad por otra cuenta', () => {
    expect(canLinkAuthIdentity({ id:'e1', authId:'auth-1' }, 'auth-2')).toBe(false)
    expect(linkAuthIdentity({ id:'e1', auth_id:'auth-1' }, 'auth-2')).toBeNull()
  })
})
