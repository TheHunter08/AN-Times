// ── Bot de fichaje por WhatsApp ────────────────────────────────────────────────
// Permite fichar entrada/salida/pausa respondiendo un mensaje de WhatsApp, sin
// abrir la app — útil cuando el móvil del empleado va justo de batería/datos o
// simplemente prefiere escribir un wasap. Identifica al empleado por su número
// de teléfono (mismo campo que ya se usa para los recordatorios).
//
// Requiere en Vercel:
//   WHATSAPP_TOKEN          → ya existe (se usa en send-whatsapp.js / cron-reminders.js)
//   WHATSAPP_PHONE_ID       → ya existe
//   WHATSAPP_VERIFY_TOKEN   → nuevo. Cadena que tú eliges (p.ej. un UUID) y que
//                              pegas también en Meta al configurar el webhook.
//   WHATSAPP_WEBHOOK_SECRET → nuevo. Otra cadena que tú eliges, se añade como
//                              query param a la URL del webhook (ver abajo). Sin
//                              esto, el endpoint RECHAZA todas las peticiones —
//                              es la única forma de evitar que cualquiera que
//                              adivine esta URL pueda fichar entrada/salida en
//                              nombre de cualquier empleado sabiendo su teléfono.
//                              (No usamos la firma HMAC de Meta porque verificarla
//                              exige el cuerpo crudo byte a byte, que este runtime
//                              de Vercel no expone de forma fiable; un secreto en
//                              la URL es igual de válido y mucho más simple.)
//
// Alta en Meta (cuando tengas la cuenta WhatsApp Business verificada):
//   1. Genera un secreto: node -e "console.log(require('crypto').randomUUID())"
//      y guárdalo como WHATSAPP_WEBHOOK_SECRET en Vercel.
//   2. Meta for Developers → tu app → WhatsApp → Configuration → Webhook
//   3. Callback URL: https://<tu-dominio>/api/whatsapp-webhook?secret=<ese-mismo-valor>
//   4. Verify token: el mismo valor que pongas en WHATSAPP_VERIFY_TOKEN
//   5. Suscribirse al campo "messages"
// ─────────────────────────────────────────────────────────────────────────────
import { timingSafeEqual } from 'crypto'
import { toRecordRow } from '../src/services/tableSyncPlan.js'
import { hardenApiResponse } from './_response.js'

const cleanEnv = s => (s || '').replace(/^﻿/, '').trim()
const SB_URL          = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON         = cleanEnv(process.env.VITE_SB_ANON)
const SB_SERVICE      = cleanEnv(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
const WA_TOKEN        = process.env.WHATSAPP_TOKEN
const WA_PHONE_ID     = process.env.WHATSAPP_PHONE_ID
const VERIFY_TOKEN    = process.env.WHATSAPP_VERIFY_TOKEN
const WEBHOOK_SECRET  = process.env.WHATSAPP_WEBHOOK_SECRET

const SB_H = { apikey:SB_ANON, Authorization:`Bearer ${SB_SERVICE || SB_ANON}` }

function isAuthorizedRequest(req) {
  if (!WEBHOOK_SECRET) return false
  const provided = String(req.query?.secret || '')
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(WEBHOOK_SECRET)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// Dedupe en memoria: Meta puede reintentar el mismo webhook si no respondemos
// rápido con 200. No es persistente entre cold starts, pero cubre el caso común.
const _seenMsgIds = new Map()
function isDuplicateMsg(id) {
  const now = Date.now()
  if (_seenMsgIds.has(id)) return true
  _seenMsgIds.set(id, now)
  if (_seenMsgIds.size > 500) {
    for (const [k, t] of _seenMsgIds) { if (now - t > 10 * 60_000) _seenMsgIds.delete(k) }
  }
  return false
}

async function getAppData() {
  const r = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data`, { headers: SB_H })
  if (!r.ok) return null
  const rows = await r.json()
  return rows?.[0]?.data || null
}

async function saveRecord(record) {
  const headers = { ...SB_H, 'Content-Type': 'application/json' }
  const [blobResult, tableResult] = await Promise.allSettled([
    fetch(`${SB_URL}/rest/v1/rpc/apply_app_data_delta`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_patch: { records: [record] }, p_deleted: {}, p_updated_at: record._upd }),
    }).then(response => {
      if (!response.ok) throw new Error(`blob delta ${response.status}`)
    }),
    fetch(`${SB_URL}/rest/v1/records?on_conflict=id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(toRecordRow(record)),
    }).then(response => {
      if (!response.ok) throw new Error(`record upsert ${response.status}`)
    }),
  ])

  const succeeded = [blobResult, tableResult].filter(result => result.status === 'fulfilled').length
  if (!succeeded) throw new Error('record persistence failed')
  if (succeeded < 2) console.warn('[whatsapp-webhook] partial persistence; reconciliation pending')
}

async function sendWhatsAppReply(to, message) {
  if (!WA_TOKEN || !WA_PHONE_ID) return
  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: message } })
    })
    if (!response.ok) console.error('[whatsapp-webhook] reply rejected', response.status)
  } catch (e) {
    console.error('[whatsapp-webhook] reply error', e.message)
  }
}

function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '')
}

// Quita tildes y pasa a minúsculas para que "fichár" == "fichar"
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

const ENTRADA_WORDS = ['entrada', 'entrar', 'empezar', 'empiezo', 'comienzo', 'comenzar']
const SALIDA_WORDS  = ['salida', 'salir', 'termino', 'terminar', 'finalizo', 'finalizar', 'acabo', 'acabar']
const PAUSA_WORDS   = ['pausa', 'descanso', 'break']
const REANUDAR_WORDS = ['reanudar', 'continuar', 'vuelvo', 'sigo']
const ESTADO_WORDS  = ['estado', 'horas', 'como voy', 'cuanto llevo']

// Coincidencia por palabra completa (\b), no por substring — "termino" no debe
// activar "entrada" solo porque contiene la letras "in" en medio.
function matchesAny(text, words) {
  return words.some(w => new RegExp(`\\b${w}\\b`, 'i').test(text))
}

export function classifyIntent(text) {
  const t = norm(text)
  if (matchesAny(t, ESTADO_WORDS)) return 'estado'
  if (matchesAny(t, PAUSA_WORDS)) return 'pausa'
  if (matchesAny(t, REANUDAR_WORDS)) return 'reanudar'
  if (matchesAny(t, ENTRADA_WORDS)) return 'entrada'
  if (matchesAny(t, SALIDA_WORDS)) return 'salida'
  return null
}

function mhm(min) {
  min = Math.max(0, Math.floor(min || 0))
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`
}

function gid() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

export async function handleMessage(db, emp, text) {
  const intent = classifyIntent(text)
  const records = db.records || []
  const openRec = records.find(r => r.empId === emp.id && !r.fin)
  const now = new Date().toISOString()

  if (!intent) {
    return { reply: `No he entendido "${text}". Responde con *entrada*, *salida*, *pausa*, *reanudar* o *estado*.`, changed: false }
  }

  if (intent === 'entrada') {
    if (openRec) return { reply: `Ya tienes una jornada abierta desde las ${new Date(openRec.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.`, changed: false }
    const newRec = { id: gid(), empId: emp.id, empName: emp.name, inicio: now, fin: null, centro: emp.centroTrabajo || '', breaks: [], workSecs: 0, breakSecs: 0, creadoPor: 'WhatsApp', _upd: now }
    db.records = [...records, newRec]
    return { reply: `✅ Entrada registrada a las ${new Date(now).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}. ¡Buena jornada!`, changed: true, record: newRec }
  }

  if (intent === 'salida') {
    if (!openRec) return { reply: 'No tienes ninguna jornada abierta ahora mismo.', changed: false }
    const breaks = [...(openRec.breaks || [])]
    if (openRec.enDescanso && openRec.bStartTs) breaks.push({ start: openRec.bStartTs, end: now })
    const workMs = new Date(now).getTime() - new Date(openRec.inicio).getTime()
    const breakMs = breaks.reduce((s, b) => s + (new Date(b.end || now).getTime() - new Date(b.start).getTime()), 0)
    const workSecs = Math.max(0, Math.floor((workMs - breakMs) / 1000))
    const closed = { ...openRec, fin: now, breaks, enDescanso: false, bStartTs: null, closed: true, workSecs, breakSecs: Math.floor(breakMs / 1000), _upd: now }
    db.records = records.map(r => r.id === openRec.id ? closed : r)
    return { reply: `✅ Salida registrada. Jornada de hoy: ${mhm(Math.floor(workSecs / 60))}.`, changed: true, record: closed }
  }

  if (intent === 'pausa') {
    if (!openRec) return { reply: 'No tienes ninguna jornada abierta para pausar.', changed: false }
    if (openRec.enDescanso) return { reply: 'Ya estás en pausa.', changed: false }
    const paused = { ...openRec, enDescanso: true, bStartTs: now, _upd: now }
    db.records = records.map(r => r.id === openRec.id ? paused : r)
    return { reply: '⏸ Pausa iniciada. Escribe *reanudar* cuando vuelvas.', changed: true, record: paused }
  }

  if (intent === 'reanudar') {
    if (!openRec) return { reply: 'No tienes ninguna jornada abierta.', changed: false }
    if (!openRec.enDescanso) return { reply: 'No estás en pausa ahora mismo.', changed: false }
    const breaks = [...(openRec.breaks || []), { start: openRec.bStartTs, end: now }]
    const breakSecs = breaks.reduce((s, b) => s + Math.max(0, Math.floor((new Date(b.end || now).getTime() - new Date(b.start).getTime()) / 1000)), 0)
    const resumed = { ...openRec, enDescanso: false, bStartTs: null, breaks, breakSecs, _upd: now }
    db.records = records.map(r => r.id === openRec.id ? resumed : r)
    return { reply: '▶ Jornada reanudada.', changed: true, record: resumed }
  }

  if (intent === 'estado') {
    if (!openRec) return { reply: 'No tienes ninguna jornada abierta ahora mismo.', changed: false }
    const workMin = Math.floor((Date.now() - new Date(openRec.inicio).getTime()) / 60000)
    return { reply: `⏱️ Llevas ${mhm(workMin)} desde las ${new Date(openRec.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}${openRec.enDescanso ? ' (en pausa)' : ''}.`, changed: false }
  }

  return { reply: 'No he podido procesar tu mensaje.', changed: false }
}

export default async function handler(req, res) {
  hardenApiResponse(res)
  // Sin WHATSAPP_WEBHOOK_SECRET configurado (o si no coincide), el endpoint
  // rechaza cualquier petición — incluida la verificación GET. Fallar cerrado:
  // mientras no se dé de alta en Meta, este endpoint no debe aceptar nada.
  if (!isAuthorizedRequest(req)) return res.status(403).send('Forbidden')

  // Verificación del webhook (Meta hace un GET al configurarlo)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    }
    return res.status(403).send('Forbidden')
  }

  if (req.method !== 'POST') return res.status(405).end()

  // Responder 200 rápido es importante: si Meta no recibe 200 en pocos segundos,
  // reintenta el mismo webhook (duplicando el fichaje si no fuéramos idempotentes).
  try {
    const entry = req.body?.entry?.[0]
    const change = entry?.changes?.[0]
    const value = change?.value
    const msg = value?.messages?.[0]

    if (!msg) return res.status(200).json({ ok: true, skipped: 'no message' })
    // El dedupe va ANTES de comprobar el tipo: si Meta reintenta el webhook
    // de un mensaje no-textual (no recibió 200 a tiempo), el chequeo de tipo
    // reenviaba la respuesta "solo puedo leer texto" en cada reintento.
    if (isDuplicateMsg(msg.id)) return res.status(200).json({ ok: true, deduped: true })
    if (msg.type !== 'text') {
      await sendWhatsAppReply(msg.from, 'Solo puedo leer mensajes de texto: *entrada*, *salida*, *pausa*, *reanudar* o *estado*.')
      return res.status(200).json({ ok: true, skipped: 'non-text' })
    }

    if (!SB_URL || !SB_ANON) return res.status(200).json({ ok: false, error: 'Supabase no configurado' })

    const fromPhone = normalizePhone(msg.from)
    if (fromPhone.length < 9 || fromPhone.length > 15) {
      return res.status(200).json({ ok: true, skipped: 'invalid sender' })
    }
    const db = await getAppData()
    if (!db) return res.status(200).json({ ok: false, error: 'no app_data' })

    const matchingEmployees = (db.employees || []).filter(e => !e.baja && normalizePhone(e.telefono) === fromPhone)
    if (matchingEmployees.length !== 1) {
      await sendWhatsAppReply(msg.from, 'No encuentro tu número asociado a ningún empleado de TIMES INC. Pide al administrador que revise tu teléfono en tu ficha.')
      return res.status(200).json({ ok: true, skipped: matchingEmployees.length ? 'ambiguous employee' : 'unknown employee' })
    }
    const emp = matchingEmployees[0]

    const messageText = String(msg.text?.body || '')
    if (messageText.length > 500) {
      await sendWhatsAppReply(msg.from, 'El mensaje es demasiado largo. Responde solo con *entrada*, *salida*, *pausa*, *reanudar* o *estado*.')
      return res.status(200).json({ ok: true, skipped: 'message too long' })
    }

    const { reply, changed, record } = await handleMessage(db, emp, messageText)
    if (changed) {
      try {
        await saveRecord(record)
      } catch (saveErr) {
        // Si el guardado falla, el empleado se quedaba sin fichaje Y sin ninguna
        // respuesta (creía haber fichado). Avisar del fallo en vez de silencio.
        console.error('[whatsapp-webhook] saveRecord failed', saveErr.message)
        await sendWhatsAppReply(msg.from, '⚠️ No se pudo registrar tu fichaje por un problema temporal. Vuelve a intentarlo en un momento.')
        return res.status(200).json({ ok: false, error: 'save failed' })
      }
    }
    await sendWhatsAppReply(msg.from, reply)

    return res.status(200).json({ ok: true, changed })
  } catch (e) {
    console.error('[whatsapp-webhook] fatal', e?.message || 'unknown error')
    // Devolver 200 igualmente: un 500 haría que Meta reintente y probablemente
    // vuelva a fallar igual, generando más ruido sin arreglar nada.
    return res.status(200).json({ ok: false, error: 'internal error' })
  }
}
