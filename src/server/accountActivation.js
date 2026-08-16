import { verifyPin, hashPin } from '../utils/pinSecurity.js'

const clean = value => String(value || '').replace(/^\uFEFF/, '').trim()
const SB_URL = clean(process.env.VITE_SB_URL)
const SB_ANON = clean(process.env.VITE_SB_ANON)
const SB_SERVICE = clean(process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
const SERVICE_HEADERS = {
  apikey:SB_SERVICE || SB_ANON,
  Authorization:`Bearer ${SB_SERVICE}`,
  'Content-Type':'application/json',
}
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase()
}

async function request(path, options = {}, auth = false) {
  const base = auth ? `${SB_URL}/auth/v1/` : `${SB_URL}/rest/v1/`
  const response = await fetch(base + path, {
    ...options,
    headers:{ ...SERVICE_HEADERS, ...options.headers },
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) {
    const error = new Error(payload?.msg || payload?.message || payload?.error_description || payload?.error || `Supabase respondió ${response.status}`)
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}

async function activationState(employeeId) {
  const rows = await request(`account_activation_attempts?emp_id=eq.${encodeURIComponent(employeeId)}&select=failed_attempts,locked_until`)
  return rows?.[0] || null
}

async function registerFailure(employeeId) {
  const rows = await request('rpc/register_account_activation_failure', {
    method:'POST', body:JSON.stringify({ p_emp_id:employeeId }),
  })
  return rows?.[0] || rows || null
}

async function clearFailures(employeeId) {
  await request('rpc/clear_account_activation_failures', {
    method:'POST', body:JSON.stringify({ p_emp_id:employeeId }),
  })
}

async function archivedPin(employeeId) {
  try {
    const rows = await request(`employee_pin_archive?employee_id=eq.${encodeURIComponent(employeeId)}&select=pin_hash,pin_len`)
    return rows?.[0] || null
  } catch (error) {
    // La tabla de rollback solo existe una vez ejecutado policies_auth.sql.
    // Antes de esa migración, "sin archivo" es el estado normal, no un fallo:
    // no debe tumbar la activación de cuentas que sí tienen pin_hash directo.
    if (error?.status === 404 || error?.payload?.code === 'PGRST205') return null
    throw error
  }
}

export async function accountBootstrap(req, res) {
  res.setHeader?.('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error:'Método no permitido' })
  if (!SB_URL || !SB_SERVICE) return res.status(503).json({ error:'Directorio temporalmente no disponible' })

  const query = String(req.query?.q || '').trim().toLocaleLowerCase('es')
  if (query.length < 2 || query.length > 60) return res.status(200).json({ employees:[] })

  try {
    // La consulta se hace con service role, pero la respuesta es deliberadamente
    // mínima: nunca salen email, auth_id, empresa, PIN ni hashes.
    const rows = await request('employees?baja=eq.false&select=id,name,centro_trabajo,pin_len,data&limit=200')
    const employees = (rows || [])
      .map(item => ({
        id:String(item.id),
        name:String(item.name || item.data?.name || '').trim(),
        dept:String(item.centro_trabajo || item.data?.dept || item.data?.centroTrabajo || '').trim(),
        pinLen:Number(item.pin_len || 4),
      }))
      .filter(item => item.name && `${item.name} ${item.dept}`.toLocaleLowerCase('es').includes(query))
      .slice(0, 8)
    return res.status(200).json({ employees })
  } catch (error) {
    console.error('[account-bootstrap] fatal:', { status:error?.status, message:error?.message })
    return res.status(503).json({ error:'No se pudo consultar el directorio de activación' })
  }
}

async function writeBlobEmployee(employeeId, patch) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const rows = await request('app_data?id=eq.1&select=data,updated_at')
    const row = rows?.[0]
    if (!row?.data) throw new Error('No existe el estado principal de la aplicación')
    const currentEmployees = Array.isArray(row.data.employees) ? row.data.employees : []
    if (!currentEmployees.some(item => String(item?.id) === employeeId)) {
      throw new Error('El empleado no existe en el estado principal')
    }
    const nextEmployees = currentEmployees.map(item => String(item?.id) === employeeId ? { ...item, ...patch } : item)
    const updated = await request(`app_data?id=eq.1&updated_at=eq.${encodeURIComponent(row.updated_at)}`, {
      method:'PATCH',
      headers:{ Prefer:'return=representation' },
      body:JSON.stringify({ data:{ ...row.data, employees:nextEmployees, _ts:Date.now() }, updated_at:patch._upd }),
    })
    if (updated?.length) return
  }
  throw new Error('Los datos cambiaron durante la activación; vuelve a intentarlo')
}

async function createOrRecoverAuthUser(employee, email, password) {
  const linkedAuthId = employee.auth_id || employee.data?.authId || employee.data?.auth_id
  if (linkedAuthId) {
    try {
      const user = await request(`admin/users/${encodeURIComponent(linkedAuthId)}`, {
        method:'PUT',
        body:JSON.stringify({ email, password, email_confirm:true, user_metadata:{ employee_id:employee.id, activation_source:'verified_pin' } }),
      }, true)
      return { user, created:false }
    } catch (error) {
      if (error.status !== 404) throw error
    }
  }

  try {
    const user = await request('admin/users', {
      method:'POST',
      body:JSON.stringify({ email, password, email_confirm:true, user_metadata:{ employee_id:employee.id, activation_source:'verified_pin' } }),
    }, true)
    return { user, created:true }
  } catch (error) {
    if (error.status !== 422) throw error
    for (let page = 1; page <= 10; page++) {
      const payload = await request(`admin/users?page=${page}&per_page=1000`, {}, true)
      const users = payload?.users || []
      const existing = users.find(item => normalizedEmail(item?.email) === email)
      if (existing) {
        // Solo se recupera una creación parcial producida por esta misma ruta.
        // Conocer el PIN nunca permite apropiarse de una cuenta Auth ajena.
        if (String(existing.user_metadata?.employee_id || '') !== String(employee.id)
          || existing.user_metadata?.activation_source !== 'verified_pin') throw error
        const user = await request(`admin/users/${encodeURIComponent(existing.id)}`, {
          method:'PUT',
          body:JSON.stringify({ password, email_confirm:true, user_metadata:{ ...existing.user_metadata, employee_id:employee.id, activation_source:'verified_pin' } }),
        }, true)
        return { user, created:false }
      }
      if (users.length < 1000) break
    }
    throw error
  }
}

async function linkEmployeeTable(employeeId, email, authId, nowIso) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const rows = await request(`employees?id=eq.${encodeURIComponent(employeeId)}&baja=eq.false&select=id,company_id,name,email,auth_id,pin_hash,pin_len,data,updated_at`)
    const current = rows?.[0]
    if (!current) throw new Error('La ficha del empleado ya no está activa')
    if (current.auth_id && current.auth_id !== authId) throw new Error('La ficha ya está vinculada a otra identidad')
    const employeeData = {
      ...(current.data || {}), email, authId, auth_id:authId,
      authActivationPending:false, authActivatedAt:nowIso, _upd:nowIso,
    }
    const updatedRows = await request(`employees?id=eq.${encodeURIComponent(current.id)}&updated_at=eq.${encodeURIComponent(current.updated_at)}`, {
      method:'PATCH', headers:{ Prefer:'return=representation' },
      body:JSON.stringify({ email, auth_id:authId, data:employeeData, updated_at:nowIso }),
    })
    if (updatedRows?.length) return { ...current, email, auth_id:authId, data:employeeData, updated_at:nowIso }
  }
  throw new Error('La ficha cambió repetidamente durante la activación; vuelve a intentarlo')
}

export default async function activateAccount(req, res) {
  res.setHeader?.('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error:'Método no permitido' })
  if (!SB_URL || !SB_SERVICE) return res.status(503).json({ error:'Activación temporalmente no disponible' })

  const employeeId = String(req.body?.employeeId || '').trim()
  const pin = String(req.body?.pin || '').trim()
  const email = normalizedEmail(req.body?.email)
  const password = String(req.body?.password || '')
  if (!employeeId || employeeId.length > 100 || !/^\d{4,6}$/.test(pin)) {
    return res.status(400).json({ error:'Empleado o PIN no válido' })
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return res.status(400).json({ error:'Correo no válido' })
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error:'La contraseña debe tener entre 8 y 128 caracteres' })

  try {
    const state = await activationState(employeeId)
    if (state?.locked_until && new Date(state.locked_until).getTime() > Date.now()) {
      return res.status(429).json({ error:'Demasiados intentos. Espera quince minutos antes de volver a intentarlo.' })
    }

    const [employeeRows, duplicateRows] = await Promise.all([
      request(`employees?id=eq.${encodeURIComponent(employeeId)}&baja=eq.false&select=id,company_id,name,email,auth_id,pin_hash,pin_len,data,updated_at`),
      request(`employees?email=eq.${encodeURIComponent(email)}&baja=eq.false&id=neq.${encodeURIComponent(employeeId)}&select=id`),
    ])
    const employee = employeeRows?.[0]
    if (!employee) return res.status(404).json({ error:'Empleado activo no encontrado o sin PIN configurado' })
    const pinCredential = employee.pin_hash
      ? { pin_hash:employee.pin_hash, pin_len:employee.pin_len }
      : await archivedPin(employee.id)
    // Arranque de la cuenta admin: la ficha con role='admin' puede existir sin
    // PIN ni auth_id nunca configurados (alta inicial de empresa). No hay hash
    // contra el que verificar, así que esta única vez el PIN introducido pasa
    // a ser el PIN oficial en vez de comprobarse contra uno existente. En
    // cuanto queda auth_id vinculado, esta puerta se cierra para siempre.
    const isAdminBootstrap = employee.role === 'admin' && !employee.auth_id && !pinCredential?.pin_hash
    if (!isAdminBootstrap && !pinCredential?.pin_hash) return res.status(404).json({ error:'Empleado activo no encontrado o sin PIN configurado' })
    if (duplicateRows?.length) return res.status(409).json({ error:'Ese correo ya pertenece a otro empleado' })

    if (!isAdminBootstrap && !await verifyPin(pin, pinCredential.pin_hash, employee.id)) {
      const failed = await registerFailure(employeeId)
      const locked = failed?.locked_until && new Date(failed.locked_until).getTime() > Date.now()
      return res.status(locked ? 429 : 401).json({
        error:locked ? 'PIN incorrecto. La activación queda bloqueada durante quince minutos.' : 'PIN incorrecto',
        remaining:locked ? 0 : Math.max(0, 5 - Number(failed?.failed_attempts || 1)),
      })
    }

    const authResult = await createOrRecoverAuthUser(employee, email, password)
    const authId = authResult.user?.id
    if (!authId) throw new Error('Supabase no devolvió la identidad creada')
    const nowIso = new Date().toISOString()
    const linkedEmployee = await linkEmployeeTable(employee.id, email, authId, nowIso)

    let bootstrapPinHash = null
    if (isAdminBootstrap) {
      bootstrapPinHash = await hashPin(pin, employee.id)
      await request(`employees?id=eq.${encodeURIComponent(employee.id)}`, {
        method:'PATCH', headers:{ Prefer:'return=minimal' },
        body:JSON.stringify({ pin_hash:bootstrapPinHash, pin_len:pin.length, updated_at:nowIso }),
      })
    }

    await writeBlobEmployee(String(employee.id), {
      email, authId, auth_id:authId, authActivationPending:false, authActivatedAt:nowIso, _upd:nowIso,
      ...(bootstrapPinHash ? { pin:bootstrapPinHash, pinHash:bootstrapPinHash, pinLen:pin.length } : {}),
    })
    await clearFailures(employeeId)
    await request('audit_events', {
      method:'POST', headers:{ Prefer:'return=minimal' },
      body:JSON.stringify({
        id:`account_activation:${employee.id}:${Date.now()}`,
        company_id:linkedEmployee.company_id,
        actor_emp_id:linkedEmployee.id,
        action:'Cuenta oficial activada',
        detail:linkedEmployee.name || linkedEmployee.id,
        data:{ category:'seguridad', employeeId:linkedEmployee.id, email, authId, immediate:true },
        created_at:nowIso,
        updated_at:nowIso,
      }),
    })

    return res.status(200).json({ ok:true, employeeId:employee.id, authId, email, created:authResult.created })
  } catch (error) {
    const message = String(error?.message || '')
    if (error?.status === 422 || /already.*registered|already.*exists|duplicate/i.test(message)) {
      return res.status(409).json({ error:'Ese correo ya tiene una cuenta. Inicia sesión o recupera su contraseña.' })
    }
    console.error('[account-activation] fatal:', { employeeId, status:error?.status, message })
    return res.status(500).json({ error:'No se pudo completar la activación. Inténtalo de nuevo.' })
  }
}
