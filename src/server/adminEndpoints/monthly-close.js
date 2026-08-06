import { timingSafeEqual } from 'crypto'
import { runMonthlyClose } from '../../../auto-cierre-mensual.js'

const CRON_SECRET = process.env.CRON_SECRET

function authorized(req) {
  if (!CRON_SECRET) return false
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  return token.length === CRON_SECRET.length && timingSafeEqual(Buffer.from(token), Buffer.from(CRON_SECRET))
}

export default async function monthlyCloseHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()
  if (!CRON_SECRET) return res.status(500).json({ error:'CRON_SECRET no configurado' })
  if (!authorized(req)) return res.status(401).json({ error:'Unauthorized' })

  try {
    return res.status(200).json(await runMonthlyClose())
  } catch (error) {
    console.error('[cron-monthly-close]', error)
    return res.status(500).json({ error:error.message })
  }
}
