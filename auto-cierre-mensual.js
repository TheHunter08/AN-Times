// Cron: se ejecuta el 1ro de cada mes (ver .github/workflows/cierre-mensual.yml)
// Genera automáticamente los cierres del mes anterior para todos los empleados activos
// y envía notificación push para que los firmen.

import { createHash } from 'crypto'

const SB_URL  = process.env.VITE_SB_URL  || 'https://eyyhlcvpyiorpdnvqsll.supabase.co'
const SB_ANON = process.env.VITE_SB_ANON || ''
const PUSH_URL = process.env.PUSH_URL || 'https://an-times.vercel.app/api/sendpush'

if (!SB_ANON) { console.error('VITE_SB_ANON no configurado'); process.exit(1) }

const SB_HEADERS = {
  apikey: SB_ANON,
  Authorization: `Bearer ${SB_ANON}`,
  'Content-Type': 'application/json',
}

const gid = () => createHash('sha1').update(Date.now() + Math.random().toString()).digest('hex').slice(0,12)

async function readDB() {
  const res = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1&select=data`, { headers: SB_HEADERS })
  if (!res.ok) throw new Error(`DB read failed: ${res.status}`)
  const rows = await res.json()
  return rows?.[0]?.data || null
}

async function writeDB(data) {
  const res = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.1`, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(`DB write failed: ${res.status}`)
}

async function sendPush(empId, title, body) {
  try {
    await fetch(PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: empId, title, body, tag: 'cierre', url: '/?go=emp:perfil' }),
    })
  } catch (e) {
    console.warn(`Push a ${empId} falló:`, e.message)
  }
}

function calcMin(r) {
  if (!r.fin) return 0
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

  const db = await readDB()
  if (!db) throw new Error('No se pudo leer la BD')

  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
  const cierres = db.cierres || []
  const records = db.records || []

  const nuevos = []
  for (const e of emps) {
    if (cierres.find(c => c.empId === e.id && c.mes === mes)) {
      console.log(`  ${e.name}: cierre ya existe, omitido`)
      continue
    }
    const eRecs = records.filter(r => r.empId === e.id && r.fin && r.inicio.startsWith(mes))
    if (!eRecs.length) {
      console.log(`  ${e.name}: sin registros en ${mes}, omitido`)
      continue
    }
    const totalMin = eRecs.reduce((s, r) => s + calcMin(r), 0)
    nuevos.push({
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
    })
  }

  if (!nuevos.length) {
    console.log('Nada que generar.')
    return
  }

  await writeDB({ ...db, cierres: [...cierres, ...nuevos] })
  console.log(`✅ ${nuevos.length} cierre(s) generado(s)`)

  for (const c of nuevos) {
    await sendPush(c.empId, '📋 Cierre mensual pendiente', `Tu resumen de ${mesLabel} está listo para firmar en la app.`)
    console.log(`  Push enviado a ${c.empName}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
