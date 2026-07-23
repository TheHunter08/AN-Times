// Endpoint público de verificación de la huella de datos de un cierre firmado.
// GET /api/verify-cierre?hash=<sha256 impreso al pie del PDF firmado>
//
// No requiere login: el objetivo es que cualquiera con el PDF en la mano
// (p.ej. un inspector de trabajo) pueda confirmar en segundos que el
// documento no se alteró desde que se firmó, sin depender de que la
// empresa le dé acceso a la app. El hash en sí no es adivinable (SHA-256),
// así que exponer esta consulta sin autenticación no filtra datos que el
// propio PDF no muestre ya en texto plano (nombre del empleado, mes,
// fecha de firma).
const cleanEnv = s => (s || '').replace(/^﻿/, '').trim()
const SB_URL  = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON = cleanEnv(process.env.VITE_SB_ANON)
const SB_H    = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` }

const HASH_RE = /^[a-f0-9]{64}$/i

// Sin autenticación por diseño (ver comentario de arriba) — pero sin límite
// alguno, un script podía golpear /rest/v1/cierres en Supabase sin ningún
// coste, agotando cuota/causando throttling que afecta al resto de la app
// (comparte la misma instancia). Mismo patrón in-memory por IP que sendpush.js.
const _rl = new Map()
function rateLimit(ip) {
  const now = Date.now()
  const window = 60_000
  const max = 20
  const entry = _rl.get(ip) || { count: 0, reset: now + window }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + window }
  entry.count++
  _rl.set(ip, entry)
  if (_rl.size > 2000) { for (const [k, v] of _rl) { if (now > v.reset) _rl.delete(k) } }
  return entry.count > max
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
  if (rateLimit(ip)) return res.status(429).json({ error: 'Too many requests' })

  const hash = String(req.query.hash || '').trim()
  if (!HASH_RE.test(hash)) {
    return res.status(400).json({ error: 'Parámetro "hash" inválido — debe ser un SHA-256 en hexadecimal (64 caracteres)' })
  }
  if (!SB_URL || !SB_ANON) return res.status(500).json({ error: 'Supabase config missing' })

  try {
    // El hash se guarda dentro de la columna JSONB `data` (cierre.integrityHash),
    // no en una columna propia — se filtra con el operador ->> de PostgREST.
    const url = `${SB_URL}/rest/v1/cierres?select=mes,emp_name,estado,generado_at,data&data->>integrityHash=eq.${encodeURIComponent(hash)}&limit=1`
    const r = await fetch(url, { headers: SB_H })
    if (!r.ok) return res.status(502).json({ error: 'No se pudo consultar el registro' })
    const rows = await r.json()
    const row = rows[0]

    if (!row) {
      return res.status(200).json({ verified: false, message: 'No se encontró ningún cierre firmado con ese hash de integridad.' })
    }

    const firma = row.data?.firma || row.data?.firmaEmp
    return res.status(200).json({
      verified: true,
      empleado: row.emp_name || row.data?.empName || null,
      mes: row.mes,
      estado: row.estado,
      firmadoAt: firma?.firmadoAt || null,
      generadoAt: row.generado_at || null,
      message: 'La huella coincide con los datos de un cierre mensual firmado conservado en TIMES INC.',
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
