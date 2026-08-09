import { readFileSync } from 'node:fs'
import { planPlaintextPinUpgrade } from '../src/utils/pinMigration.js'
import { readAllRestRows } from './read-all-rest-rows.mjs'

function loadEnvFile(path) {
  try {
    for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = raw.trim().replace(/^\uFEFF/, '')
      const index = line.indexOf('=')
      if (!line || line.startsWith('#') || index < 1) continue
      const key = line.slice(0, index).trim()
      if (process.env[key] == null) process.env[key] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    }
  } catch {}
}

loadEnvFile('.env')
loadEnvFile('.env.local')

const url = String(process.env.VITE_SB_URL || 'https://eyyhlcvpyiorpdnvqsll.supabase.co').replace(/\/$/, '')
const key = String(process.env.VITE_SB_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I')
const headers = { apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json' }
const apply = process.argv.includes('--apply')

async function request(path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers:{ ...headers, ...options.headers },
  })
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path.split('?')[0]} respondió ${response.status}: ${(await response.text()).slice(0, 240)}`)
  }
  return response.status === 204 ? null : response.json().catch(() => null)
}

const [tableRows, blobRows] = await Promise.all([
  readAllRestRows({ baseUrl:url, path:'employees?select=id,pin_hash,pin_len,data,updated_at&order=id.asc', headers }),
  request('app_data?select=data,updated_at&id=eq.1'),
])
const blobRow = blobRows[0]
if (!blobRow) throw new Error('No existe app_data id=1')

const tableById = new Map(tableRows.map(row => [String(row.id), row]))
const blobEmployees = Array.isArray(blobRow.data?.employees) ? blobRow.data.employees : []
const blobById = new Map(blobEmployees.map(employee => [String(employee.id), employee]))
const ids = new Set([...tableById.keys(), ...blobById.keys()])
const plans = []
const conflicts = []

for (const id of ids) {
  const table = tableById.get(id)
  const blob = blobById.get(id)
  const values = [
    table?.pin_hash,
    table?.data?.pin,
    table?.data?.pinHash,
    blob?.pin,
    blob?.pinHash,
  ]
  const plan = await planPlaintextPinUpgrade(id, values)
  if (plan.conflict) conflicts.push(id)
  else if (plan.upgrade) plans.push({ id, table, blob, ...plan })
}

console.log(JSON.stringify({
  mode:apply ? 'apply' : 'dry-run',
  candidates:plans.length,
  conflicts:conflicts.length,
  tableCopies:plans.filter(plan => plan.table).length,
  blobCopies:plans.filter(plan => plan.blob).length,
}, null, 2))

if (conflicts.length) {
  console.error(`Reparación cancelada: ${conflicts.length} empleado(s) tienen copias de PIN incompatibles.`)
  process.exitCode = 1
} else if (!apply || !plans.length) {
  process.exit(0)
} else {
  const nowIso = new Date().toISOString()
  const planById = new Map(plans.map(plan => [plan.id, plan]))
  const nextBlobEmployees = blobEmployees.map(employee => {
    const plan = planById.get(String(employee.id))
    if (!plan) return employee
    return {
      ...employee,
      pin:plan.targetPin,
      ...(Object.hasOwn(employee, 'pinHash') ? { pinHash:plan.targetPin } : {}),
      pinLen:plan.pinLen,
      _upd:nowIso,
    }
  })

  if (plans.some(plan => plan.blob)) {
    const updatedBlob = await request(
      `app_data?id=eq.1&updated_at=eq.${encodeURIComponent(blobRow.updated_at)}`,
      {
        method:'PATCH',
        headers:{ Prefer:'return=representation' },
        body:JSON.stringify({
          data:{ ...blobRow.data, employees:nextBlobEmployees },
          updated_at:nowIso,
        }),
      },
    )
    if (!updatedBlob?.length) throw new Error('El blob cambió durante la reparación; no se sobrescribió.')
  }

  const failures = []
  let tableUpdated = 0
  for (const plan of plans.filter(item => item.table)) {
    try {
      const currentData = plan.table.data && typeof plan.table.data === 'object' ? plan.table.data : {}
      const updated = await request(
        `employees?id=eq.${encodeURIComponent(plan.id)}&updated_at=eq.${encodeURIComponent(plan.table.updated_at)}`,
        {
          method:'PATCH',
          headers:{ Prefer:'return=representation' },
          body:JSON.stringify({
            pin_hash:plan.targetPin,
            pin_len:plan.pinLen,
            data:{
              ...currentData,
              pin:plan.targetPin,
              ...(Object.hasOwn(currentData, 'pinHash') ? { pinHash:plan.targetPin } : {}),
              pinLen:plan.pinLen,
              _upd:nowIso,
            },
            updated_at:nowIso,
          }),
        },
      )
      if (!updated?.length) throw new Error('la fila cambió durante la reparación')
      tableUpdated++
    } catch (error) {
      failures.push({ id:plan.id, error:error.message })
    }
  }

  console.log(JSON.stringify({
    ok:failures.length === 0,
    upgraded:plans.length,
    tableUpdated,
    blobUpdated:plans.filter(plan => plan.blob).length,
    failures,
  }, null, 2))
  if (failures.length) process.exitCode = 1
}
