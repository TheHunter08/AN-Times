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

const VAPID_PUBLIC  = isValid(toB64Url(process.env.VAPID_PUBLIC))  ? toB64Url(process.env.VAPID_PUBLIC)  : 'BJLsu9gt57Oa3uflEpMVUfRXgawp49vhtgdMjU6nzb9zOjWgSxIxuuFQVe6z_uiNXNPUwbCPqUHUoZk_iVmjNfQ'
const VAPID_PRIVATE = isValid(toB64Url(process.env.VAPID_PRIVATE)) ? toB64Url(process.env.VAPID_PRIVATE) : null
const SB_URL        = cleanEnv(process.env.VITE_SB_URL)  || 'https://eyyhlcvpyiorpdnvqsll.supabase.co'
const SB_ANON       = cleanEnv(process.env.VITE_SB_ANON) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I'
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

async function markNotisSent(keys) {
  const current = await getAppData()
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

export default async function handler(req, res) {
  const isCronInvocation = req.headers['x-vercel-cron'] === '1'
  if (!isCronInvocation && CRON_SECRET) {
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

    const schedule = (emp, sub, key, keyVal, title, body, tag, url) => {
      if (!sub?.endpoint) return
      toSend.push({ emp, sub, payload: mkPayload(title, body, tag, url) })
      newKeys[key] = keyVal
    }

    for (const emp of employees) {
      const sub = subMap.get(emp.id)
      const empRecs = records.filter(r => r.empId === emp.id)
      const openRec = empRecs.find(r => !r.fin)
      const todayRecs = empRecs.filter(r => typeof r.inicio === 'string' && r.inicio.startsWith(today))
      const hasFichado = todayRecs.length > 0

      // ── 1. Recordatorio de fichaje ──────────────────────────────────────────
      {
        const remTime = emp.reminderTime || '08:30'
        const [rh, rm] = safeTimeSplit(remTime, '08:30')
        const key = 'an_rem_' + emp.id
        if (notisSent[key] !== today && !hasFichado && ((nowH - rh) * 60 + (nowM - rm)) >= 0) {
          schedule(emp, sub, key, today,
            '⏰ Recordatorio de fichaje',
            '¿Has fichado hoy? No olvides registrar tu jornada laboral.',
            'reminder-fichar', '/?tab=inicio')
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
        const salidaT = emp.salidaTime || cfgSalidaTime
        const [sh, sm] = safeTimeSplit(salidaT, '21:00')
        const key = 'an_salida_' + openRec.id
        if (!notisSent[key] && ((nowH - sh) * 60 + (nowM - sm)) >= 0) {
          const elapsedMin = Math.floor((nowMs - new Date(openRec.inicio).getTime()) / 60000)
          const hh = Math.floor(elapsedMin / 60), mm2 = Math.floor(elapsedMin % 60)
          schedule(emp, sub, key, '1',
            '🔔 ¿Olvidaste fichar la salida?',
            `Llevas ${hh}h ${p2(mm2)}m con la jornada abierta. ¿Ya has terminado?`,
            'jornada', '/?tab=jornada')
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
        const pendCierres = cierres.filter(c => c.empId === emp.id && c.estado === 'pendiente')
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
    }

    if (Object.keys(newKeys).length > 0) await markNotisSent(newKeys)

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

    const result = {
      ok: true, today, nowSpain: `${p2(nowH)}:${p2(nowM)}`,
      checked: employees.length, sent, failed, queued: toSend.length
    }
    console.log('[cron-reminders]', JSON.stringify(result))
    return res.status(200).json(result)

  } catch (e) {
    console.error('[cron-reminders] fatal', e)
    return res.status(500).json({ error: e.message })
  }
}
