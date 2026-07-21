const clean = value => String(value || '')
  .replace(/[\r\n\t]/g, '')
  .replace(/^["']|["']$/g, '')
  .trim()

export const CANONICAL_APP_ORIGIN = clean(process.env.PUBLIC_APP_ORIGIN) || 'https://times-inc.vercel.app'

export function normalizeOrigin(value) {
  try { return new URL(clean(value)).origin } catch { return '' }
}

export function isTrustedAppOrigin(value) {
  const origin = normalizeOrigin(value)
  if (!origin) return false
  if (origin === normalizeOrigin(CANONICAL_APP_ORIGIN)) return true
  if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true
  return false
}
