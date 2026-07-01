// ── Cron de recordatorios ─────────────────────────────────────────────────────
// Ejecutado por Vercel Cron cada hora (ver vercel.json: "0 * * * *").
// Cubre TODOS los recordatorios críticos para cuando la app está cerrada:
//   1. Recordatorio de fichaje (no ha registrado entrada hoy)
//   2. Jornada larga (> 7h45m sin fichar salida)
//   3. Salida olvidada (jornada abierta después de la hora de salida)
//   4. Documentos pendientes de firma (≥9h)
//   5. Cierre mensual pendiente (≥9h)
//
// Las claves de dedup se marcan en db.notisSent (Supabase) para evitar
// duplicados entre el cron y el cliente (cuando la app está en background).
// ─────────────────────────────────────────────────────────────────────────────
import webpush from 'web-push'

const cleanEnv  = s => (s || '').replace(/^﻿/, '').trim()
const toB64Url  = s => cleanEnv(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const isValid   = s => /^[A-Za-z0-9\-_]{40,}$/.test(s)

const VAPID_PUBLIC  = isValid(toB64Url(process.env.VAPID_PUBLIC))  ? toB64Url(process.env.VAPID_PUBLIC)  : null
const VAPID_PRIVATE = isValid(toB64Url(process.env.VAPID_PRIVATE)) ? toB64Url(process.env.VAPID_PRIVATE) : null
const SB_URL        = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON       = cleanEnv(process.env.VITE_SB_ANON)
if (!SB_URL || !SB_ANON) console.error('[cron-reminders] VITE_SB_URL / VITE_SB_ANON not set')
const CRON_SECRET   = process.env.CRON_SECRET

let _cronVapidError = null
if (!VAPID_PRIVATE) {
  _cronVapidError = 'VAPID_PRIVATE env var no configurada'
  console.error('[cron-reminders] FATAL:', _cronVapidError)
} else {
  try {
    webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)
  } catch (e) {
    _cronVapidError = 'setVapidDetails failed: ' + e.message
    console.error('[cron-reminders] FATAL:', _cronVapidError)
  }
}

const SB_H = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` }

async function getAppData() {
  const r = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data`, { headers: SB_H })
  if (!r.ok) return null
  const rows = await r.json()
  return rows?.[0]?.data || null
}

async function markNotisSent(current, keys) {
  if (!current) return
  const merged = { ...current, notisSent: { ...(current.notisSent || {}), ...keys }, _ts: Date.now() }
  await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1`, {
    method: 'PATCH',
    headers: { ...SB_H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ data: merged, updated_at: new Date().toISOString() })
  }).catch(e => console.warn('[cron] markNotisSent patch error', e.message))
}

async function getPushSubs() {
  const r = await fetch(`${SB_URL}/rest/v1/push_subs?select=user_id,endpoint,p256dh,auth`, { headers: SB_H })
  if (!r.ok) return []
  return r.json()
}

async function deleteSub(userId) {
  await fetch(`${SB_URL}/rest/v1/push_subs?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE', headers: SB_H
  }).catch(() => {})
}

function nowInSpain() {
  const str = new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' })
  return new Date(str)
}

function todayInSpain() {
  const d = nowInSpain()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function p2(n) { return String(n).padStart(2, '0') }

async function sendPush(sub, payload, empName) {
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    payload
  )
  console.log(`[cron] push sent → ${empName}`)
}

const WA_TOKEN    = process.env.WHATSAPP_TOKEN
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID

async function sendWhatsApp(phone, message, empName) {
  if (!WA_TOKEN || !WA_PHONE_ID) return false
  const clean = String(phone || '').replace(/\D/g, '')
  if (clean.length < 9) return false
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: clean, type: 'text', text: { body: message } })
    })
    if (r.ok) { console.log(`[cron] whatsapp sent → ${empName}`); return true }
    console.warn(`[cron] whatsapp error → ${empName}:`, await r.text())
    return false
  } catch (e) {
    console.warn(`[cron] whatsapp fetch error → ${empName}:`, e.message)
    return false
  }
}

export default async function handler(req, res) {
  if (CRON_SECRET) {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '')
    if (token !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' })
  }
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()

  if (_cronVapidError) return res.status(500).json({ error: _cronVapidError })

  try {
    const db = await getAppData()
    if (!db) return res.status(500).json({ error: 'no app_data' })

    const now       = nowInSpain()
    const today     = todayInSpain()
    const nowH      = now.getHours()
    const nowM      = now.getMinutes()
    const nowMs     = Date.now()

    const isValidTime = s => /^\d{1,2}:\d{2}$/.test(String(s || ''))
    const safeTimeSplit = (s, def) => {
      const t = isValidTime(s) ? s : def
      return t.split(':').map(Number)
    }

    const employees = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
    const records   = db.records    || []
    const notisSent = db.notisSent  || {}
    const cierres   = db.cierres    || []
    const docs      = db.documentos || []
    const cfgSalidaTime = db.config?.salidaTime || '21:00'

    const subs   = await getPushSubs()
    const subMap = new Map(subs.map(s => [s.user_id, s]))

    const toSend = []
    const newKeys = {}

    const mkPayload = (title, body, tag, url = '/') =>
      JSON.stringify({ title, body, tag, url: (typeof url === 'string' && url.startsWith('/')) ? url : '/' })

    const waToSend = []
    const schedule = (emp, sub, key, keyVal, title, body, tag, url) => {
      if (sub?.endpoint) {
        toSend.push({ emp, sub, payload: mkPayload(title, body, tag, url) })
      } else if (emp.telefono) {
        // Sin push sub → intentar WhatsApp como canal alternativo
        waToSend.push({ emp, message: `*${title}*\n${body}`, key, keyVal })
      }
      newKeys[key] = keyVal
    }

    for (const emp of employees) {
     try {
      const sub = subMap.get(emp.id)
      const empRecs = records.filter(r => r.empId === emp.id)
      const openRec = empRecs.find(r => !r.fin)
      const todayRecs = empRecs.filter(r => typeof r.inicio === 'string' && r.inicio.startsWith(today))
      const hasFichado = todayRecs.length > 0

      // ── 1. Recordatorio de fichaje ──────────────────────────────────────────
      {
        const entradaTimes = db.config?.reminders?.entrada?.length
          ? db.config.reminders.entrada
          : (emp.reminderTime ? [emp.reminderTime] : ['08:30'])
        for (const remTime of entradaTimes) {
          const [rh, rm] = safeTimeSplit(remTime, '08:30')
          const slot = String(remTime || '').replace(':', '')
          const key  = `an_rem_${emp.id}_${slot}`
          if (notisSent[key] !== today && !hasFichado && ((nowH - rh) * 60 + (nowM - rm)) >= 0) {
            schedule(emp, sub, key, today,
              '⏰ Recordatorio de fichaje',
              '¿Has fichado hoy? No olvides registrar tu jornada laboral.',
              'reminder-fichar', '/?tab=inicio')
          }
        }
      }

      // ── 2. Jornada larga (> 7h 45min sin fichar salida) ────────────────────
      if (openRec) {
        const elapsedMin = (nowMs - new Date(openRec.inicio).getTime()) / 60000
        if (elapsedMin >= 465) {
          const key = 'an_warn_14h_' + openRec.id
          if (!notisSent[key]) {
            const hh = Math.floor(elapsedMin / 60), mm2 = Math.floor(elapsedMin % 60)
            schedule(emp, sub, key, '1',
              '⏳ Jornada larga',
              `Llevas ${hh}h ${p2(mm2)}m trabajando. Recuerda fichar la salida.`,
              'jornada', '/?tab=jornada')
          }
        }
      }

      // ── 3. Salida olvidada ──────────────────────────────────────────────────
      if (openRec) {
        const salidaTimes = db.config?.reminders?.salida?.length
          ? db.config.reminders.salida
          : [emp.salidaTime || cfgSalidaTime || '21:00']
        for (const salidaT of salidaTimes) {
          const [sh, sm] = safeTimeSplit(salidaT, '21:00')
          const slot = String(salidaT || '').replace(':', '')
          const key  = `an_salida_${openRec.id}_${slot}`
          if (!notisSent[key] && ((nowH - sh) * 60 + (nowM - sm)) >= 0) {
            const elapsedMin = Math.floor((nowMs - new Date(openRec.inicio).getTime()) / 60000)
            const hh2 = Math.floor(elapsedMin / 60), mm2 = Math.floor(elapsedMin % 60)
            schedule(emp, sub, key, '1',
              '🔔 ¿Olvidaste fichar la salida?',
              `Llevas ${hh2}h ${p2(mm2)}m con la jornada abierta. ¿Ya has terminado?`,
              'jornada', '/?tab=jornada')
          }
        }
      }

      // ── 4. Documentos pendientes de firma (≥9h, una vez al día) ────────────
      if (nowH >= 9) {
        const pendDocs = docs.filter(d => d.empId === emp.id && !d.firma)
        if (pendDocs.length > 0) {
          const key = 'an_docs_' + emp.id
          if (notisSent[key] !== today) {
            schedule(emp, sub, key, today,
              '📄 Documentos pendientes',
              `Tienes ${pendDocs.length} documento${pendDocs.length > 1 ? 's' : ''} pendiente${pendDocs.length > 1 ? 's' : ''} de firma.`,
              'documentos', '/?go=emp:documentos')
          }
        }
      }

      // ── 5. Cierre mensual pendiente (≥9h, una vez al día) ──────────────────
      if (nowH >= 9) {
        const pendCierres = cierres.filter(c => c.empId === emp.id && c.estado === 'pendiente' && !c.desactualizado)
        if (pendCierres.length > 0) {
          const key = 'an_cierre_' + emp.id
          if (notisSent[key] !== today) {
            schedule(emp, sub, key, today,
              '📋 Cierre mensual pendiente',
              `Tienes ${pendCierres.length} resumen${pendCierres.length > 1 ? 'es' : ''} mensual pendiente${pendCierres.length > 1 ? 's' : ''} de firma.`,
              'cierre', '/?go=emp:perfil')
          }
        }
      }
     } catch (e) {
       // Aislar el fallo a este empleado: un registro/reminder malformado no debe
       // tumbar el cron entero (antes un solo dato inválido devolvía 500 y ningún
       // empleado recibía recordatorio).
       console.error(`[cron-reminders] error procesando empleado ${emp.id}:`, e.message)
     }
    }

    // ── 6. Alerta a admin/JO: jornada abierta > umbral configurable ───────────
    {
      const ALERT_MIN = Math.round((db.config?.reminders?.alertHoras ?? 10) * 60)
      const allEmps = db.employees || []
      const longRecs = records.filter(r => {
        if (r.fin) return false
        const elapsed = (nowMs - new Date(r.inicio).getTime()) / 60000
        return elapsed >= ALERT_MIN
      })
      if (longRecs.length > 0) {
        const recipients = allEmps.filter(e => !e.baja && (e.isAdmin || e.role === 'jefe_obra'))
        const hourKey = `${today}_${p2(nowH)}`
        for (const rec of longRecs) {
          const emp = allEmps.find(e => e.id === rec.empId)
          if (!emp) continue
          const elapsedMin = Math.floor((nowMs - new Date(rec.inicio).getTime()) / 60000)
          const hh = Math.floor(elapsedMin / 60), mm2 = Math.floor(elapsedMin % 60)
          for (const admin of recipients) {
            const adminSub = subMap.get(admin.id)
            const key = `an_alert10h_${admin.id}_${rec.empId}_${hourKey}`
            if (!notisSent[key]) {
              schedule(admin, adminSub, key, '1',
                '🚨 Jornada muy larga',
                `${emp.name} lleva ${hh}h ${p2(mm2)}m con la jornada abierta.`,
                'alert-10h', '/?go=admin:fichajes')
            }
          }
        }
      }
    }

    if (Object.keys(newKeys).length > 0) await markNotisSent(db, newKeys)

    let sent = 0, failed = 0
    for (const { emp, sub, payload } of toSend) {
      try {
        await sendPush(sub, payload, emp.name)
        sent++
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await deleteSub(emp.id)
        } else {
          console.warn(`[cron] push error for ${emp.name}:`, err.statusCode, err.body || err.message)
        }
        failed++
      }
    }

    let waSent = 0
    for (const { emp, message } of waToSend) {
      const ok = await sendWhatsApp(emp.telefono, message, emp.name)
      if (ok) waSent++
    }

    const result = {
      ok: true, today, nowSpain: `${p2(nowH)}:${p2(nowM)}`,
      checked: employees.length, sent, failed, queued: toSend.length, waSent
    }
    console.log('[cron-reminders]', JSON.stringify(result))
    return res.status(200).json(result)

  } catch (e) {
    console.error('[cron-reminders] fatal', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
