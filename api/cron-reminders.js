// ── Cron de recordatorios ─────────────────────────────────────────────────────
// Ejecutado por Vercel Cron una vez al día (ver vercel.json) y, con más
// frecuencia en horario laboral (05:00-12:00 UTC, L-V), por
// .github/workflows/fichar-reminder.yml — este endpoint es idempotente por
// diseño (dedup vía db.notisSent) así que puede recibir ambos disparos.
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
import { timingSafeEqual } from 'crypto'

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
  if (!current || !Object.keys(keys || {}).length) return
  const latest = await getAppData()
  if (!latest) throw new Error('no app_data while marking notifications')
  const merged = { ...latest, notisSent: { ...(latest.notisSent || {}), ...keys }, _ts: Date.now() }
  const response = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1`, {
    method: 'PATCH',
    headers: { ...SB_H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ data: merged, updated_at: new Date().toISOString() })
  })
  if (!response.ok) throw new Error(`markNotisSent patch ${response.status}`)
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
  // Fail-closed: si CRON_SECRET no está configurado (p.ej. un despliegue con
  // la env var ausente), antes el endpoint quedaba abierto a cualquiera en vez
  // de rechazar — este cron dispara push/WhatsApp masivos y escribe en
  // Supabase, así que un secreto ausente debe bloquear, no permitir.
  if (!CRON_SECRET) return res.status(500).json({ error: 'CRON_SECRET no configurado' })
  const token = (req.headers['authorization'] || '').replace('Bearer ', '')
  const hasValidSecret = token.length === CRON_SECRET.length && timingSafeEqual(Buffer.from(token), Buffer.from(CRON_SECRET))
  if (!hasValidSecret) return res.status(401).json({ error: 'Unauthorized' })
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
    const dowSpain  = now.getDay() // 0=Dom, 1=Lun … 5=Vie, 6=Sáb
    const isWeekday = dowSpain >= 1 && dowSpain <= 5

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

    const mkPayload = (title, body, tag, url = '/') =>
      JSON.stringify({ title, body, tag, url: (typeof url === 'string' && url.startsWith('/')) ? url : '/' })

    const waToSend = []
    // newKeys ya no se usa para marcar "enviado" — solo se marca de verdad tras
    // un envío que tuvo éxito (ver más abajo, tras los bucles de envío). Antes
    // se marcaba aquí mismo, ANTES de intentar enviar nada: un fallo transitorio
    // de red/push service perdía el recordatorio para siempre (la clave ya
    // constaba como "enviada" y nunca se reintentaba, ni en el siguiente cron).
    // Tampoco se marcaba cuando el empleado no tenía push ni teléfono — ahora
    // simplemente no se programa nada para él y no se marca la clave.
    const schedule = (emp, sub, key, keyVal, title, body, tag, url) => {
      if (sub?.endpoint) {
        toSend.push({ emp, sub, payload: mkPayload(title, body, tag, url), key, keyVal })
      } else if (emp.telefono) {
        // Sin push sub → intentar WhatsApp como canal alternativo
        waToSend.push({ emp, message: `*${title}*\n${body}`, key, keyVal })
      }
    }

    for (const emp of employees) {
     try {
      const sub = subMap.get(emp.id)
      const empRecs = records.filter(r => r.empId === emp.id)
      const openRec = empRecs.find(r => !r.fin)
      const todayRecs = empRecs.filter(r => typeof r.inicio === 'string' && r.inicio.startsWith(today))
      const hasFichado = todayRecs.length > 0

      // ── 1. Recordatorio de fichaje (solo lunes a viernes) ──────────────────
      if (isWeekday) {
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

      // ── 6. Resumen semanal (viernes 17:00-17:59, hora España) ──────────────
      // Informa al empleado de sus horas totales de la semana.
      if (now.getDay() === 5 && nowH === 17) {
        const monOffset = now.getDay() === 0 ? 6 : now.getDay() - 1
        const mon = new Date(now); mon.setDate(now.getDate() - monOffset)
        const weekStartStr = `${mon.getFullYear()}-${p2(mon.getMonth()+1)}-${p2(mon.getDate())}`
        const weekRecs = empRecs.filter(r => r.fin && r.inicio >= weekStartStr + 'T00:00:00')
        const weekTotalMin = Math.floor(weekRecs.reduce((s, r) => {
          const elapsed = (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 60000
          return s + Math.max(0, elapsed - Math.floor((r.breakSecs || 0) / 60))
        }, 0))
        if (weekTotalMin > 0) {
          const key = `an_resumen_sem_${emp.id}_${today}`
          if (!notisSent[key]) {
            const hh = Math.floor(weekTotalMin / 60), mm = weekTotalMin % 60
            const nota = weekTotalMin >= 2400 ? ' ✅' : weekTotalMin < 1920 ? ' · Por debajo del objetivo' : ''
            schedule(emp, sub, key, today,
              '📊 Tu semana en Times INC',
              `Esta semana has trabajado ${hh}h ${p2(mm)}m.${nota}`,
              'resumen-semanal', '/?tab=jornada')
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

    // ── 7. Alertas de convenio colectivo (a admins / jefes de obra) ───────────
    // ET art. 34.3: máximo 9h ordinarias/día, 12h de descanso entre jornadas.
    // Se notifica al admin una vez por infracción (clave por empId + fecha/jornada).
    {
      const WD_MAX_MIN = 540 // 9 h en minutos
      const REST_MIN_H = 12  // 12 h de descanso entre jornadas
      const admins = (db.employees || []).filter(e => !e.baja && (e.isAdmin || e.role === 'jefe_obra'))

      for (const emp of employees) {
        try {
          const empRecs2 = records.filter(r => r.empId === emp.id)
          const todayRecs2 = empRecs2.filter(r => r.inicio?.startsWith(today))

          // 7a. Jornada diaria > 9 h
          const todayTotalMin = Math.floor(todayRecs2.reduce((s, r) => {
            const ini = new Date(r.inicio).getTime()
            const fin = r.fin ? new Date(r.fin).getTime() : nowMs
            return s + Math.max(0, (fin - ini) / 60000 - Math.floor((r.breakSecs || 0) / 60))
          }, 0))
          if (todayTotalMin > WD_MAX_MIN) {
            for (const adm of admins) {
              const admSub = subMap.get(adm.id)
              const key = `an_conv9h_${adm.id}_${emp.id}_${today}`
              if (!notisSent[key]) {
                const hh = Math.floor(todayTotalMin / 60), mm2 = todayTotalMin % 60
                schedule(adm, admSub, key, '1',
                  '⚠️ Convenio: jornada > 9 h',
                  `${emp.name} lleva ${hh}h ${p2(mm2)}m hoy (límite ET: 9 h ordinarias).`,
                  'conv-9h', '/?go=admin:fichajes')
              }
            }
          }

          // 7b. Descanso < 12 h entre jornadas
          const openRec2 = empRecs2.find(r => !r.fin)
          if (openRec2) {
            const prevSorted = empRecs2
              .filter(r => r.fin && r.inicio < openRec2.inicio)
              .sort((a, b) => b.fin.localeCompare(a.fin))
            if (prevSorted.length > 0) {
              const lastFinMs = new Date(prevSorted[0].fin).getTime()
              const restH = (new Date(openRec2.inicio).getTime() - lastFinMs) / 3_600_000
              if (restH < REST_MIN_H) {
                for (const adm of admins) {
                  const admSub = subMap.get(adm.id)
                  const key = `an_conv12h_${emp.id}_${openRec2.id}`
                  if (!notisSent[key]) {
                    const rh = Math.floor(restH), rm = Math.floor((restH - rh) * 60)
                    schedule(adm, admSub, key, '1',
                      '⚠️ Convenio: descanso insuficiente',
                      `${emp.name} descansó solo ${rh}h ${p2(rm)}m (mínimo legal: 12 h entre jornadas).`,
                      'conv-12h', '/?go=admin:fichajes')
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error(`[cron-reminders] error convenio ${emp.id}:`, e.message)
        }
      }
    }

    // ── 8. Aniversarios de contratación (a las 09:00, al admin) ─────────────
    // Usa el campo startDate (fecha de alta) de cada empleado. Si el MM-DD
    // de hoy coincide con el MM-DD del startDate y han pasado ≥ 1 año,
    // se envía una notificación a los administradores.
    if (nowH === 9) {
      const todayMMDD  = today.slice(5) // 'MM-DD'
      const adminsAniv = (db.employees || []).filter(e => !e.baja && (e.isAdmin || e.role === 'jefe_obra'))
      for (const emp of employees) {
        try {
          if (!emp.startDate) continue
          const empMMDD  = String(emp.startDate).slice(5) // 'MM-DD'
          if (empMMDD !== todayMMDD) continue
          const years = new Date().getFullYear() - parseInt(String(emp.startDate).slice(0, 4), 10)
          if (years < 1) continue
          for (const adm of adminsAniv) {
            const admSub = subMap.get(adm.id)
            const key = `an_aniv_${adm.id}_${emp.id}_${today}`
            if (!notisSent[key]) {
              schedule(adm, admSub, key, today,
                `🎂 Aniversario de ${emp.name}`,
                `Hoy cumple ${years} año${years > 1 ? 's' : ''} en la empresa. ¡Felicidades!`,
                'aniversario', '/?go=admin:empleados')
            }
          }
        } catch (e) {
          console.error(`[cron-reminders] error aniversario ${emp.id}:`, e.message)
        }
      }
    }

    // La generación del cierre mensual del día 1 vive solo en
    // auto-cierre-mensual.js (workflow dedicado cierre-mensual.yml, 08:00
    // UTC). Antes este cron también generaba el mismo cierre con OTRA
    // fórmula de cálculo de horas (no usaba workSecs precalculado) — cuál de
    // los dos ganara la carrera decidía las horas del documento legal
    // firmado, y un fallo de lock optimista en el otro script podía dejar a
    // empleados sin la notificación de "cierre pendiente" aunque el cierre
    // ya existiera. Un solo generador elimina la carrera de raíz.

    // Solo se marca como "enviado" (notisSent) lo que realmente se entregó — ver
    // comentario junto a schedule() más arriba. successKeys se rellena aquí,
    // DESPUÉS de intentar el envío real, no antes.
    //
    // Antes ambos bucles eran secuenciales (await uno a uno) y notisSent solo
    // se guardaba UNA VEZ al final de todo — con una plantilla grande y el
    // timeout por defecto de Vercel, un corte a mitad de bucle perdía el
    // registro de lo que sí se había entregado, y el siguiente cron reenviaba
    // duplicados a quien ya lo había recibido. Se paraleliza con
    // allSettled (mismo patrón que send-push-all.js/sync-ping.js) y se
    // persiste notisSent tras cada tanda, no solo al final.
    let successKeys = {}

    const pushResults = await Promise.allSettled(toSend.map(({ emp, sub, payload, key, keyVal }) =>
      sendPush(sub, payload, emp.name).then(
        () => ({ ok: true, key, keyVal }),
        err => ({ ok: false, key, err, emp })
      )
    ))
    let sent = 0, failed = 0
    const expiredSubs = []
    for (const result of pushResults) {
      const value = result.status === 'fulfilled' ? result.value : null
      if (value?.ok) { sent++; successKeys[value.key] = value.keyVal; continue }
      failed++
      const err = value?.err
      if (err?.statusCode === 410 || err?.statusCode === 404) expiredSubs.push(value.emp.id)
      else if (value) console.warn(`[cron] push error for ${value.emp.name}:`, err?.statusCode, err?.body || err?.message)
    }
    if (Object.keys(successKeys).length > 0) await markNotisSent(db, successKeys)
    if (expiredSubs.length) await Promise.allSettled(expiredSubs.map(id => deleteSub(id)))

    successKeys = {}
    const waResults = await Promise.allSettled(waToSend.map(({ emp, message, key, keyVal }) =>
      sendWhatsApp(emp.telefono, message, emp.name).then(ok => ({ ok, key, keyVal }))
    ))
    let waSent = 0
    for (const result of waResults) {
      const value = result.status === 'fulfilled' ? result.value : null
      if (value?.ok) { waSent++; successKeys[value.key] = value.keyVal }
    }
    if (Object.keys(successKeys).length > 0) await markNotisSent(db, successKeys)

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
