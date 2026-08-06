import remindersHandler from './cron-reminders.js'
import autocloseHandler from './cron-autoclose.js'
import { runCronFanout } from '../src/server/cronFanout.js'

export default async function handler(req, res) {
  const result = await runCronFanout(req, [
    ['reminders', remindersHandler],
    ['autoclose', autocloseHandler],
  ])
  const jobs = Object.fromEntries(result.results.map(item => [item.name, {
    statusCode:item.statusCode,
    result:item.payload,
  }]))
  return res.status(result.statusCode).json({ ok:result.ok, jobs })
}
