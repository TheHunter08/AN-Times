// ── WhatsApp Cloud API (Meta) ─────────────────────────────────────────────────
// POST /api/send-whatsapp  { to: "34612345678", message: "Texto" }
// Requiere en Vercel env vars:
//   WHATSAPP_TOKEN     → Bearer token del System User de Meta
//   WHATSAPP_PHONE_ID  → Phone Number ID de tu número de WhatsApp Business
//
// Cómo obtenerlos:
//   1. Meta for Developers → crear App → añadir producto "WhatsApp"
//   2. En WhatsApp > Getting Started encontrarás Phone Number ID y un token temporal
//   3. Para producción: crea un System User permanente con token de larga duración
// ─────────────────────────────────────────────────────────────────────────────

const PHONE_ID = process.env.WHATSAPP_PHONE_ID
const TOKEN    = process.env.WHATSAPP_TOKEN
const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const isCron = req.headers['x-vercel-cron'] === '1'
  if (!isCron && CRON_SECRET) {
    const tok = (req.headers['authorization'] || '').replace('Bearer ', '')
    if (tok !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!PHONE_ID || !TOKEN) {
    return res.status(503).json({ error: 'WHATSAPP_TOKEN / WHATSAPP_PHONE_ID no configurados' })
  }

  const { to, message } = req.body || {}
  if (!to || !message) return res.status(400).json({ error: 'to y message son requeridos' })

  const phone = String(to).replace(/\D/g, '')
  if (phone.length < 9) return res.status(400).json({ error: 'Número inválido' })

  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: message }
      })
    })
    const data = await r.json()
    if (!r.ok) {
      console.error('[send-whatsapp] Meta API error', data)
      return res.status(502).json({ error: data?.error?.message || 'Meta API error', detail: data })
    }
    console.log(`[send-whatsapp] sent to ${phone}`, data?.messages?.[0]?.id)
    return res.status(200).json({ ok: true, messageId: data?.messages?.[0]?.id })
  } catch (e) {
    console.error('[send-whatsapp] fetch error', e.message)
    return res.status(500).json({ error: e.message })
  }
}
