import { timingSafeEqual } from 'crypto'
import { runMonthlyClose } from '../../../auto-cierre-mensual.js'
import { createAutomationRun } from '../automationHealth.js'
import { persistAutomationRun } from '../persistAutomationHealth.js'

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

  const startedAt = Date.now()
  const recordRun = async details => {
    try { await persistAutomationRun(createAutomationRun('monthlyClose', { startedAt, ...details })) }
    catch (error) { console.error('[cron-monthly-close] automation health:', error.message) }
  }
  try {
    const result = await runMonthlyClose()
    await recordRun({ processed:result.processed || 0 })
    return res.status(200).json(result)
  } catch (error) {
    console.error('[cron-monthly-close]', error)
    await recordRun({ status:'error', error:error.message })
    return res.status(500).json({ error:error.message })
  }
}
