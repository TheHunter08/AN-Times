// Cron: se ejecuta el 1ro de cada mes (ver .github/workflows/cierre-mensual.yml)
// Genera automáticamente los cierres del mes anterior para todos los empleados activos
// y envía notificación push para que los firmen.

import { createHash } from 'crypto'
import { buildCierreIndividualPDF } from './src/utils/cierrePdf.js'

// Limpia BOM (﻿) y espacios que GitHub Secrets puede incluir al copiar desde Windows
const cleanEnv = s => (s || '').replace(/^﻿/, '').trim()
const SB_URL   = cleanEnv(process.env.VITE_SB_URL)  || 'https://eyyhlcvpyiorpdnvqsll.supabase.co'
const SB_ANON  = cleanEnv(process.env.VITE_SB_ANON) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I'
const PUSH_URL = cleanEnv(process.env.PUSH_URL) || 'https://an-times.vercel.app/api/sendpush'

const SB_HEADERS = {
  apikey: SB_ANON,
  Authorization: `Bearer ${SB_ANON}`,
  'Content-Type': 'application/json',
}

const gid = () => createHash('sha1').update(Date.now() + Math.random().toString()).digest('hex').slice(0,12)

// El runner de GitHub Actions corre en UTC, no en hora de España — a diferencia del
// navegador (donde new Date().getHours() etc. ya son locales), aquí hay que forzar
// explícitamente Europe/Madrid o un fichaje de madrugada (00:00-02:00 local) se cuela
// en el mes UTC anterior y se queda fuera del cierre legal de ese mes.
const madridDateStr = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

async function readDB() {
  const res = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data,updated_at`, { headers: SB_HEADERS })
  if (!res.ok) throw new Error(`DB read failed: ${res.status}`)
  const rows = await res.json()
  if (!rows?.[0]) return null
  return { data: rows[0].data, ts: rows[0].updated_at }
}

async function writeDB(data, expectedTs) {
  // Lock optimista: solo escribe si updated_at no ha cambiado desde la lectura
  const cond = expectedTs ? `?id=eq.1&updated_at=eq.${encodeURIComponent(expectedTs)}` : '?id=eq.1'
  const res = await fetch(`${SB_URL}/rest/v1/app_data${cond}`, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal,count=exact' },
    body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(`DB write failed: ${res.status}`)
  const count = parseInt(res.headers.get('Content-Range')?.split('/')[1] || '1', 10)
  if (count === 0) throw new Error('Escritura rechazada: la BD cambió mientras procesábamos. Reintenta.')
}

async function sendPush(empId, title, body) {
  try {
    await fetch(PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: empId, title, body, tag: 'cierre', url: '/?go=emp:perfil' }),
    })
  } catch (e) {
    console.warn(`Push a ${empId} falló:`, e.message)
  }
}

function calcMin(r) {
  if (!r.fin) return 0
  // Los registros cerrados tienen workSecs pre-calculado — mismo comportamiento que time.js
  if (r.workSecs > 0) return Math.floor(r.workSecs / 60)
  const workMs = new Date(r.fin) - new Date(r.inicio)
  const breakMs = (r.breakSecs || 0) * 1000
  return Math.max(0, Math.floor((workMs - breakMs) / 60000))
}

async function main() {
  const now = new Date()
  // Mes anterior
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const mes = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`
  const mesLabel = prevMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

  console.log(`Generando cierres para ${mesLabel} (${mes})…`)

  const result = await readDB()
  if (!result) throw new Error('No se pudo leer la BD')
  const { data: db, ts: dbTs } = result

  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
  const cierres = db.cierres || []
  const records = db.records || []
  const empresa = db.config?.companyName || db.empresas?.[0] || 'TIMES INC'

  const nuevos = []
  for (const e of emps) {
    if (cierres.find(c => c.empId === e.id && c.mes === mes)) {
      console.log(`  ${e.name}: cierre ya existe, omitido`)
      continue
    }
    const eRecs = records.filter(r => r.empId === e.id && r.fin && r.inicio && madridDateStr(r.inicio).startsWith(mes))
    if (!eRecs.length) {
      console.log(`  ${e.name}: sin registros en ${mes}, omitido`)
      continue
    }
    const totalMin = eRecs.reduce((s, r) => s + calcMin(r), 0)
    const cierre = {
      id: gid(),
      empId: e.id,
      empName: e.name,
      mes,
      generadoPor: 'Sistema (automático)',
      generadoAt: new Date().toISOString(),
      totalMin,
      dias: eRecs.length,
      estado: 'pendiente',
      firma: null,
      records_snapshot: eRecs.map(r => ({
        inicio: r.inicio, fin: r.fin, centro: r.centro, workSecs: r.workSecs || 0,
      })),
    }
    try {
      const { dataUrl } = await buildCierreIndividualPDF({ cierre, empresa })
      cierre.pdfData = dataUrl
      console.log(`  ${e.name}: PDF generado`)
    } catch (err) {
      console.warn(`  ${e.name}: no se pudo generar el PDF —`, err.message)
    }
    nuevos.push(cierre)
  }

  if (!nuevos.length) {
    console.log('Nada que generar.')
    return
  }

  await writeDB({ ...db, cierres: [...cierres, ...nuevos] }, dbTs)
  console.log(`✅ ${nuevos.length} cierre(s) generado(s)`)

  for (const c of nuevos) {
    await sendPush(c.empId, '📋 Cierre mensual pendiente', `Tu resumen de ${mesLabel} está listo para firmar en la app.`)
    console.log(`  Push enviado a ${c.empName}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
