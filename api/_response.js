export function hardenApiResponse(res) {
  res.setHeader?.('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader?.('Pragma', 'no-cache')
  res.setHeader?.('X-Robots-Tag', 'noindex, nofollow')
  return res
}
