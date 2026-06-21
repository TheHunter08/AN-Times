const webpush = require('web-push')
const { createClient } = require('@supabase/supabase-js')

const VAPID_PUBLIC  = 'BJLsu9gt57Oa3uflEpMVUfRXgawp49vhtgdMjU6nzb9zOjWgSxIxuuFQVe6z_uiNXNPUwbCPqUHUoZk_iVmjNfQ'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE
if (!VAPID_PRIVATE) { console.error('[sendpush] VAPID_PRIVATE env var not set'); }

webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { userId, title, body, tag } = req.body || {}
  if (!userId || !title) return res.status(400).json({ error: 'Missing userId or title' })

  const sbUrl  = process.env.VITE_SB_URL  || process.env.SB_URL
  const sbAnon = process.env.VITE_SB_ANON || process.env.SB_ANON
  if (!sbUrl || !sbAnon) return res.status(500).json({ error: 'Supabase not configured' })

  try {
    const sb = createClient(sbUrl, sbAnon)
    const { data: sub } = await sb
      .from('push_subs')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId)
      .maybeSingle()

    if (!sub?.endpoint) return res.status(200).json({ skipped: true, reason: 'no subscription' })

    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title, body: body || '', tag: tag || 'times' })
    )
    return res.status(200).json({ ok: true })
  } catch (err) {
    if (err.statusCode === 410) {
      const sb = createClient(sbUrl, sbAnon)
      await sb.from('push_subs').delete().eq('user_id', userId).catch(() => {})
      return res.status(200).json({ ok: false, reason: 'expired' })
    }
    console.error('[sendpush]', err.statusCode, err.body || err.message)
    return res.status(500).json({ error: err.message })
  }
}
