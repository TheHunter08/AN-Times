import { timingSafeEqual } from 'crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com'
const GITHUB_AUDIENCE = 'times-inc-sync'
const TRUSTED_REPOSITORY = 'TheHunter08/AN-Times'
const TRUSTED_WORKFLOW = `${TRUSTED_REPOSITORY}/.github/workflows/sync-ping.yml@refs/heads/main`
const GITHUB_JWKS = createRemoteJWKSet(new URL(`${GITHUB_ISSUER}/.well-known/jwks`))

function safeEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false
  return timingSafeEqual(Buffer.from(left), Buffer.from(right))
}

export function isTrustedGithubClaims(payload) {
  return payload?.repository === TRUSTED_REPOSITORY &&
    payload?.ref === 'refs/heads/main' &&
    payload?.workflow_ref === TRUSTED_WORKFLOW &&
    ['schedule', 'workflow_dispatch'].includes(payload?.event_name)
}

export async function authorizeSyncRequest(req, cronSecret = process.env.CRON_SECRET) {
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '')
  if (safeEqual(token, cronSecret)) return true
  if (!token) return false

  try {
    const { payload } = await jwtVerify(token, GITHUB_JWKS, {
      issuer: GITHUB_ISSUER,
      audience: GITHUB_AUDIENCE,
    })
    return isTrustedGithubClaims(payload)
  } catch {
    return false
  }
}
