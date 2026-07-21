import { describe, expect, it } from 'vitest'
import { isTrustedGithubClaims } from './syncAuth.js'

describe('autorización del despertador de sincronización', () => {
  const valid = {
    repository: 'TheHunter08/AN-Times',
    ref: 'refs/heads/main',
    workflow_ref: 'TheHunter08/AN-Times/.github/workflows/sync-ping.yml@refs/heads/main',
    event_name: 'schedule',
  }

  it('solo confía en el workflow programado de la rama principal', () => {
    expect(isTrustedGithubClaims(valid)).toBe(true)
    expect(isTrustedGithubClaims({ ...valid, repository: 'otro/repo' })).toBe(false)
    expect(isTrustedGithubClaims({ ...valid, ref: 'refs/heads/feature' })).toBe(false)
    expect(isTrustedGithubClaims({ ...valid, workflow_ref: 'TheHunter08/AN-Times/.github/workflows/otro.yml@refs/heads/main' })).toBe(false)
  })

  it('permite ejecución manual del mismo workflow para verificar producción', () => {
    expect(isTrustedGithubClaims({ ...valid, event_name: 'workflow_dispatch' })).toBe(true)
  })
})
