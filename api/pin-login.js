// ── Login por PIN → sesión real de Supabase Auth ────────────────────────────
// POST /api/pin-login  { empId, pin }
//
// Contexto: el login por PIN nunca pasa por Supabase Auth (ni email ni OAuth),
// así que esos empleados no tienen auth.uid() — las políticas RLS de
// policies_auth.sql (TO authenticated, auth_id = auth.uid()) los dejarían sin
// acceso a nada en cuanto se active RLS de verdad. Este endpoint verifica el
// PIN en el servidor (mismo algoritmo que src/utils/pinSecurity.js) y, si es
// correcto, firma un JWT con el mismo formato que emite Supabase Auth —
// firmado con el Legacy JWT Secret del proyecto (Settings → API → JWT
// Settings), así que Postgres/PostgREST lo acepta exactamente igual que un
// login por email real. auth_id se reutiliza el MISMO campo que ya usan las
// cuentas de email/OAuth (ver linkAuthIdentity en src/utils/authIdentity.js),
// así que policies_auth.sql no necesita ningún cambio: emp_read_self /
// auth_emp_id() cubren el login por PIN tal cual están escritas.
//
// Requiere en Vercel:
//   SUPABASE_JWT_SECRET — Legacy JWT Secret de Supabase (NO la clave anon).
//   Si el proyecto ya migró por completo a claves de firma asimétricas (JWKS,
//   ES256) y no conserva el legacy secret, este endpoint no puede funcionar
//   tal cual — habría que emitir la sesión vía la Admin API de Supabase en su
//   lugar (requiere service_role key), un cambio de estrategia mayor.
import { randomUUID, createHmac, timingSafeEqual } from 'crypto'
import { verifyPin } from '../src/utils/pinSecurity.js'

const cleanEnv = s => (s || '').replace(/^﻿/, '').trim()
const SB_URL      = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON     = cleanEnv(process.env.VITE_SB_ANON)
const SB_SERVICE  = cleanEnv(process.env.SB_SERVICE_KEY)
const JWT_SECRET  = process.env.SUPABASE_JWT_SECRET

// Preferir service_role si está disponible: sigue funcionando cuando RLS se
// active de verdad (Fase 3), momento en el que anon ya no podría escribir
// auth_id bajo la política admin_write_employees. Hoy, con RLS permisivo,
// cualquiera de las dos sirve.
const KEY  = SB_SERVICE || SB_ANON
const SB_H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const TOKEN_TTL_SEC = 12 * 60 * 60 // 12h — cubre un turno largo con margen

// ── JWT HS256 sin dependencias externas (jsonwebtoken/jose no están en package.json) ──
export function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function signSupabaseJWT(claims, secret, expiresInSec) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = { ...claims, iat: now, exp: now + expiresInSec }
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const sig = createHmac('sha256', secret).update(data).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return { token: `${data}.${sig}`, exp: payload.exp }
}

// ── Rate limiting en memoria (mismo patrón que api/sendpush.js) ─────────────
const _rl = new Map()
function rateLimited(key, max, windowMs) {
  const now = Date.now()
  const entry = _rl.get(key) || { count: 0, reset: now + windowMs }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs }
  entry.count++
  _rl.set(key, entry)
  if (_rl.size > 5000) { for (const [k, v] of _rl) { if (now > v.reset) _rl.delete(k) } }
  return entry.count > max
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!JWT_SECRET) return res.status(500).json({ error: 'SUPABASE_JWT_SECRET no configurado' })
  if (!SB_URL || !KEY) return res.status(500).json({ error: 'Supabase config missing' })

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
  if (rateLimited(`ip:${ip}`, 30, 60_000)) return res.status(429).json({ error: 'Demasiados intentos, espera un momento' })

  const { empId, pin } = req.body || {}
  if (!empId || typeof empId !== 'string' || !pin || typeof pin !== 'string') {
    return res.status(400).json({ error: 'Faltan empId o pin' })
  }
  // Defensa en profundidad además del lockout del cliente (que vive en el
  // blob y no es autoritativo): sin esto, este endpoint sería una vía de
  // fuerza bruta más rápida que verificar contra Supabase directamente.
  if (rateLimited(`emp:${empId}`, 8, 5 * 60_000)) {
    return res.status(429).json({ error: 'Demasiados intentos para este empleado, espera unos minutos' })
  }

  try {
    const empRes = await fetch(
      `${SB_URL}/rest/v1/employees?id=eq.${encodeURIComponent(empId)}&select=id,pin_hash,baja,auth_id,role`,
      { headers: SB_H },
    )
    if (!empRes.ok) return res.status(502).json({ error: 'No se pudo consultar el empleado' })
    const rows = await empRes.json()
    const emp = rows[0]

    // Mismo mensaje tanto si el empleado no existe como si el PIN es
    // incorrecto — no dar pistas de qué ids son válidos.
    if (!emp || emp.baja) return res.status(401).json({ error: 'Credenciales inválidas' })

    const ok = await verifyPin(pin, emp.pin_hash, emp.id)
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' })

    let authId = emp.auth_id
    if (!authId) {
      authId = randomUUID()
      const patchRes = await fetch(
        `${SB_URL}/rest/v1/employees?id=eq.${encodeURIComponent(emp.id)}&auth_id=is.null`,
        {
          method: 'PATCH',
          headers: { ...SB_H, Prefer: 'return=representation' },
          body: JSON.stringify({ auth_id: authId }),
        },
      )
      const patched = await patchRes.json().catch(() => [])
      if (!patched?.length) {
        // Otra petición concurrente ya lo asignó primero (carrera improbable
        // pero posible con reintentos de red) — usar el valor que quedó
        // guardado, nunca el que acabamos de generar nosotros, para no emitir
        // dos identidades distintas para el mismo empleado.
        const reread = await fetch(
          `${SB_URL}/rest/v1/employees?id=eq.${encodeURIComponent(emp.id)}&select=auth_id`,
          { headers: SB_H },
        ).then(r => r.json()).catch(() => [])
        authId = reread?.[0]?.auth_id || authId
      }
    }

    const { token, exp } = signSupabaseJWT(
      { sub: authId, role: 'authenticated', aud: 'authenticated', emp_id: emp.id },
      JWT_SECRET,
      TOKEN_TTL_SEC,
    )
    return res.status(200).json({ ok: true, token, expiresAt: exp * 1000 })
  } catch (e) {
    console.error('[pin-login] fatal:', e)
    return res.status(500).json({ error: e.message })
  }
}
