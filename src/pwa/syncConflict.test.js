import { describe, expect, it } from 'vitest'
import { pickNewestSyncItem } from './syncConflict.js'

describe('conflictos del service worker', () => {
  it('no permite que un dato offline antiguo pise una aprobación nueva', () => {
    const server = { id:'v1', estado:'aprobada', _upd:'2026-07-21T12:00:00.000Z' }
    const offline = { id:'v1', estado:'pendiente', _upd:'2026-07-21T10:00:00.000Z' }
    expect(pickNewestSyncItem(server, offline)).toBe(server)
  })

  it('conserva un cambio offline realmente posterior', () => {
    const server = { id:'c1', firmaAdmin:false, _upd:'2026-07-21T10:00:00.000Z' }
    const offline = { id:'c1', firmaAdmin:true, _upd:'2026-07-21T12:00:00.000Z' }
    expect(pickNewestSyncItem(server, offline)).toBe(offline)
  })
})
