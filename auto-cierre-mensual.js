// Cron: se ejecuta cada día (ver .github/workflows/cierre-mensual.yml) y genera
// el periodo anterior en cuanto termina el viernes de su última semana.
// Genera automáticamente los cierres del mes anterior para todos los empleados activos
// y envía notificación push para que los firmen.

import { toClosureRow } from './src/services/tableSyncPlan.js'
import { canCloseMonth } from './src/utils/monthClose.js'
import { monthlyExtras } from './src/utils/time.js'
import { workBalanceOptions } from './src/utils/workBalance.js'
import { fileURLToPath } from 'url'
import path from 'path'

process.env.TZ = 'Europe/Madrid'

// Limpia BOM (﻿) y espacios que GitHub Secrets puede incluir al copiar desde Windows
const cleanEnv = s => (s || '').replace(/^﻿/, '').trim()
const SB_URL   = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON  = cleanEnv(process.env.VITE_SB_ANON)
const SB_SERVICE = cleanEnv(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
// Fail-closed (igual que el resto de api/*.js): si el secret de GitHub
// Actions se queda vacío por error, antes el script seguía funcionando en
// silencio contra un proyecto/clave fijados en el código fuente, en vez de
// fallar de forma visible.
const PUSH_URL = cleanEnv(process.env.PUSH_URL) || 'https://times-inc.vercel.app/api/sendpush'
const PUSH_SECRET = cleanEnv(process.env.PUSH_SECRET)
const SB_KEY = SB_SERVICE || SB_ANON

const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
}

// El runner de GitHub Actions corre en UTC, no en hora de España — a diferencia del
// navegador (donde new Date().getHours() etc. ya son locales), aquí hay que forzar
// explícitamente Europe/Madrid o un fichaje de madrugada (00:00-02:00 local) se cuela
// en el mes UTC anterior y se queda fuera del cierre legal de ese mes.
const madridDateStr = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

// Lee empleados/vacaciones/cierres/medicos/ausencias de las tablas normalizadas
// y app_entities en vez del blob `app_data` completo — este cron se ejecuta a
// diario y antes descargaba el histórico ENTERO de la empresa (todos los
// fichajes desde el primer día) solo para cerrar el mes anterior. Los
// fichajes se acotan a las semanas que de verdad puede necesitar
// monthlyExtras() para `mes`: desde el día 1 de `mes` hasta unos días dentro
// del mes siguiente (la última semana de `mes` puede terminar ahí si su
// lunes cae en los últimos días del mes).
async function readDB(mes) {
  const [year, month] = mes.split('-').map(Number)
  const recordsFromIso = new Date(Date.UTC(year, month - 1, 1)).toISOString()
  const recordsToIso = new Date(Date.UTC(year, month, 8)).toISOString() // mes+1, día 8: margen de sobra sobre los 4 días máximos posibles de desborde
  const [employeesResponse, recordsResponse, closuresResponse, vacationsResponse, entitiesResponse] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/employees?select=*&baja=eq.false`, { headers:SB_HEADERS }),
    fetch(`${SB_URL}/rest/v1/records?select=*&deleted=eq.false&inicio=gte.${encodeURIComponent(recordsFromIso)}&inicio=lt.${encodeURIComponent(recordsToIso)}`, { headers:SB_HEADERS }),
    fetch(`${SB_URL}/rest/v1/cierres?select=id,emp_id,mes,estado&deleted=eq.false&mes=eq.${encodeURIComponent(mes)}`, { headers:SB_HEADERS }),
    fetch(`${SB_URL}/rest/v1/vacaciones?select=*&deleted=eq.false`, { headers:SB_HEADERS }),
    fetch(`${SB_URL}/rest/v1/app_entities?select=collection,entity_id,data&deleted=eq.false&collection=in.(medicos,ausencias,config)`, { headers:SB_HEADERS }),
  ])
  if (![employeesResponse, recordsResponse, closuresResponse, vacationsResponse, entitiesResponse].every(response => response.ok)) throw new Error('normalized monthly-close source unavailable')
  const db = {
    employees:(await employeesResponse.json()).map(row => ({ ...(row.data || {}), id:row.id, name:row.name, role:row.role, baja:row.baja, isAdmin:row.role === 'admin' })),
    records:(await recordsResponse.json()).map(row => ({ ...(row.data || {}), id:row.id, empId:row.emp_id, inicio:row.inicio, fin:row.fin, centro:row.centro, workSecs:row.work_secs, breakSecs:row.break_secs, closed:row.closed })),
    cierres:(await closuresResponse.json()).map(row => ({ empId:row.emp_id, mes:row.mes, estado:row.estado })),
    vacaciones:(await vacationsResponse.json()).map(row => ({ ...(row.data || {}), id:row.id, empId:row.emp_id, fechaInicio:row.fecha_inicio, fechaFin:row.fecha_fin, estado:row.estado })),
    medicos:[], ausencias:[], config:{},
  }
  for (const row of await entitiesResponse.json()) {
    if (row.entity_id === '__singleton__') db[row.collection] = row.data || {}
    else if (Array.isArray(db[row.collection])) db[row.collection].push(row.data || {})
  }
  return db
}

async function sendPush(empId, title, body) {
  try {
    const response = await fetch(PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(PUSH_SECRET ? { Authorization:`Bearer ${PUSH_SECRET}` } : {}) },
      body: JSON.stringify({ userId: empId, title, body, tag: 'cierre', url: '/?go=emp:perfil' }),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 120)}`)
    return true
  } catch (e) {
    console.warn(`Push a ${empId} falló:`, e.message)
    return false
  }
}

async function upsertClosures(cierres) {
  const rows = cierres.map(cierre => toClosureRow(cierre, cierre._upd))
  const response = await fetch(`${SB_URL}/rest/v1/cierres?on_conflict=id`, {
    method:'POST',
    headers:{ ...SB_HEADERS, Prefer:'resolution=merge-duplicates,return=minimal' },
    body:JSON.stringify(rows),
  })
  if (!response.ok) throw new Error(`cierres upsert failed: ${response.status} ${(await response.text()).slice(0, 160)}`)
}

function calcMin(r) {
  if (!r.fin) return 0
  // Los registros cerrados tienen workSecs pre-calculado — mismo comportamiento que time.js
  if (r.workSecs > 0) return Math.floor(r.workSecs / 60)
  const workMs = new Date(r.fin) - new Date(r.inicio)
  const breakMs = (r.breakSecs || 0) * 1000
  return Math.max(0, Math.floor((workMs - breakMs) / 60000))
}

export async function runMonthlyClose(now = new Date()) {
  // Mes anterior
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const mes = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`
  const mesLabel = prevMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

  console.log(`Generando cierres para ${mesLabel} (${mes})…`)
  if (!canCloseMonth(mes, now)) {
    console.log(`El periodo ${mes} sigue abierto: aún no terminó el viernes de su última semana.`)
    return { ok:true, mes, processed:0, skipped:'period-open' }
  }

  if (!SB_URL || !SB_KEY) throw new Error('VITE_SB_URL / service role Supabase no configurados')

  const db = await readDB(mes)

  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
  const cierres = db.cierres || []
  const records = db.records || []
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
    const weeklyBalance = monthlyExtras(records, e.id, mes, workBalanceOptions(db, e, { now }))
    const generadoAt = new Date().toISOString()
    const cierre = {
      // Id estable para que un reintento tras fallo parcial sea idempotente.
      id: `cierre_${mes}_${e.id}`,
      empId: e.id,
      empName: e.name,
      mes,
      generadoPor: 'Sistema (automático)',
      generadoAt,
      _upd: generadoAt,
      totalMin,
      targetMin: weeklyBalance.targetMin,
      extraMin: weeklyBalance.weeklyExtraMin,
      deficitMin: weeklyBalance.deficitMin,
      balanceMin: weeklyBalance.balanceMin,
      justifiedMin: weeklyBalance.justifiedMin,
      nonContractMin: weeklyBalance.nonContractMin,
      weeklyBreakdown: weeklyBalance.weekly,
      dias: new Set(eRecs.map(r => madridDateStr(r.inicio))).size,
      estado: 'pendiente',
      firma: null,
      records_snapshot: eRecs.map(r => ({
        inicio: r.inicio, fin: r.fin, centro: r.centro, workSecs: r.workSecs || 0,
      })),
    }
    nuevos.push(cierre)
  }

  if (!nuevos.length) {
    console.log('Nada que generar.')
    return { ok:true, mes, processed:0, skipped:'nothing-to-generate' }
  }

  // La tabla `cierres` (columna `data`, ver toClosureRow) ya guarda el cierre
  // completo — es la fuente que lee la app (cloudFetch trata las tablas como
  // principales). Escribir además el blob `app_data` entero aquí solo
  // duplicaba la persistencia a cambio de descargar y resubir el histórico
  // completo de la empresa cada día.
  await upsertClosures(nuevos)
  console.log(`✅ ${nuevos.length} cierre(s) generado(s)`)

  for (const c of nuevos) {
    await sendPush(c.empId, '📋 Cierre mensual pendiente', `Tu resumen de ${mesLabel} está listo para firmar en la app.`)
    console.log(`  Push enviado a ${c.empName}`)
  }

  return { ok:true, mes, processed:nuevos.length }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isDirectRun) runMonthlyClose().catch(e => { console.error(e); process.exit(1) })
