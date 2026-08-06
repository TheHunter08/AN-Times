import migrateToTables from './adminEndpoints/migrate-to-tables.js'
import patchPins from './adminEndpoints/patch-pins.js'
import sendPushAll from './adminEndpoints/send-push-all.js'
import sendWhatsapp from './adminEndpoints/send-whatsapp.js'
import monthlyClose from './adminEndpoints/monthly-close.js'

const handlers = {
  'migrate-to-tables': migrateToTables,
  'patch-pins': patchPins,
  'send-push-all': sendPushAll,
  'send-whatsapp': sendWhatsapp,
  'monthly-close': monthlyClose,
}

export default function dispatchAdminEndpoint(req, res) {
  const operation = Array.isArray(req.query?.op) ? req.query.op[0] : req.query?.op
  const handler = handlers[operation]

  if (!handler) return res.status(404).json({ error: 'Endpoint interno no encontrado' })
  return handler(req, res)
}
