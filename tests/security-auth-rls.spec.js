import { expect, test } from '@playwright/test'
import { LEGAL_NOTICE_VERSION } from '../src/utils/legalCompliance.js'

const AUTH_ID = '11111111-2222-4333-8444-555555555555'
const EMPLOYEE_ID = 'e-secure'
const EMAIL = 'empleado.seguro@times.test'
const PASSWORD = 'Clave-segura-2026'
const AUTH_STORAGE_KEY = 'sb-eyyhlcvpyiorpdnvqsll-auth-token'
const PRIVATE_CACHE_KEY = `an_times_auth_${AUTH_ID}`
const NOW = '2026-08-11T08:00:00.000Z'
const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function jwt(payload) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg:'HS256', typ:'JWT' })}.${encode(payload)}.e2e-signature`
}

test('Auth/RLS carga tablas con JWT y elimina datos privados al cerrar sesión', async ({ page, context }) => {
  const accessToken = jwt({
    sub:AUTH_ID,
    aud:'authenticated',
    role:'authenticated',
    email:EMAIL,
    exp:Math.floor(Date.now() / 1000) + 3600,
  })
  const authUser = {
    id:AUTH_ID,
    aud:'authenticated',
    role:'authenticated',
    email:EMAIL,
    email_confirmed_at:NOW,
    app_metadata:{ provider:'email', providers:['email'] },
    user_metadata:{},
    identities:[],
    created_at:NOW,
    updated_at:NOW,
  }
  const authResponse = {
    access_token:accessToken,
    token_type:'bearer',
    expires_in:3600,
    expires_at:Math.floor(Date.now() / 1000) + 3600,
    refresh_token:'refresh-e2e-token',
    user:authUser,
  }
  const employee = {
    id:EMPLOYEE_ID,
    name:'Empleado Seguro',
    email:EMAIL,
    auth_id:AUTH_ID,
    role:'empleado',
    centro_trabajo:'Obra Segura',
    obras_asignadas:[],
    baja:false,
    updated_at:NOW,
    data:{
      id:EMPLOYEE_ID,
      name:'Empleado Seguro',
      email:EMAIL,
      authId:AUTH_ID,
      role:'empleado',
      centroTrabajo:'Obra Segura',
      onboardingDone:true,
      baja:false,
    },
  }
  const record = {
    id:'record-private-e2e',
    emp_id:EMPLOYEE_ID,
    emp_name:'Empleado Seguro',
    inicio:'2026-08-10T07:00:00.000Z',
    fin:'2026-08-10T15:00:00.000Z',
    centro:'Obra Segura',
    work_secs:28800,
    break_secs:0,
    breaks:[],
    closed:true,
    aceptada:true,
    validado:true,
    deleted:false,
    revision:1,
    updated_at:NOW,
    data:{ id:'record-private-e2e', empId:EMPLOYEE_ID, empName:'Empleado Seguro', _upd:NOW },
  }
  const entities = [
    {
      collection:'firmas', entity_id:EMPLOYEE_ID,
      data:{ main:{ data:SIGNATURE, updatedAt:NOW, empName:'Empleado Seguro' } },
      revision:1, deleted:false, updated_at:NOW,
    },
    {
      collection:'legalAcknowledgements', entity_id:`legal_${EMPLOYEE_ID}_${LEGAL_NOTICE_VERSION}`,
      data:{
        id:`legal_${EMPLOYEE_ID}_${LEGAL_NOTICE_VERSION}`,
        empId:EMPLOYEE_ID,
        empName:'Empleado Seguro',
        authId:AUTH_ID,
        noticeVersion:LEGAL_NOTICE_VERSION,
        eventType:'information_received',
        acknowledgedAt:NOW,
        serverConfirmed:true,
        evidenceState:'confirmed',
        _upd:NOW,
      },
      revision:1, deleted:false, updated_at:NOW,
    },
    {
      collection:'config', entity_id:'__singleton__', data:{},
      revision:1, deleted:false, updated_at:NOW,
    },
  ]

  let signedIn = false
  const restCallsAfterLogin = []
  const allRestPaths = []

  await context.grantPermissions(['notifications'], { origin:'http://localhost:4173' })
  await page.addInitScript(({ employeeId }) => {
    window.__TIMES_E2E__ = true
    localStorage.clear()
    if (!('Notification' in window)) window.Notification = class Notification {}
    try {
      Object.defineProperty(window.Notification, 'permission', {
        configurable:true,
        get:() => 'granted',
      })
    } catch {}
    localStorage.setItem('an_times_privacy_v1', '1')
    localStorage.setItem('an_welcome_v1', '1')
    localStorage.setItem(`an_push_ready_${employeeId}`, String(Date.now()))
  }, { employeeId:EMPLOYEE_ID })

  await page.route(/supabase\.co/i, async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (path === '/auth/v1/token') {
      const grantType = url.searchParams.get('grant_type')
      if (grantType === 'password') signedIn = true
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(authResponse) })
    }
    if (path === '/auth/v1/user') {
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(authUser) })
    }
    if (path === '/auth/v1/logout') {
      return route.fulfill({ status:204, body:'' })
    }
    if (path.startsWith('/realtime/v1/')) return route.abort()

    if (path.startsWith('/rest/v1/')) {
      allRestPaths.push(path)
      if (signedIn) {
        restCallsAfterLogin.push({
          path,
          authorization:request.headers().authorization || '',
        })
      }
      if (path === '/rest/v1/rpc/get_app_sync_state') {
        return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(NOW) })
      }
      if (method !== 'GET') {
        return route.fulfill({ status:200, contentType:'application/json', body:'[]' })
      }
      const table = path.slice('/rest/v1/'.length)
      const rows = {
        employees:[employee],
        records:[record],
        vacaciones:[],
        cierres:[],
        obras:[],
        app_entities:entities,
        audit_events:[],
        push_subs:[],
      }[table] ?? []
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(rows) })
    }

    return route.fulfill({ status:200, contentType:'application/json', body:'{}' })
  })

  await page.goto('/')
  await page.getByRole('textbox', { name:'Email' }).fill(EMAIL)
  await page.getByRole('textbox', { name:'Contraseña' }).fill(PASSWORD)
  await page.getByRole('button', { name:'Continuar' }).click()

  await expect(page.getByText(/Empleado Seguro/).first()).toBeVisible()
  await expect(page.getByText('Iniciar jornada').first()).toBeVisible()

  expect(allRestPaths).not.toContain('/rest/v1/app_data')
  expect(restCallsAfterLogin.some(call => call.path === '/rest/v1/employees')).toBe(true)
  expect(restCallsAfterLogin.some(call => call.path === '/rest/v1/records')).toBe(true)
  expect(restCallsAfterLogin.some(call => call.path === '/rest/v1/app_entities')).toBe(true)
  expect(restCallsAfterLogin.every(call => call.authorization === `Bearer ${accessToken}`)).toBe(true)

  const persisted = await page.evaluate(({ privateCacheKey, authStorageKey }) => ({
    privateCache:localStorage.getItem(privateCacheKey),
    legacyCache:localStorage.getItem('an_times_v1'),
    session:localStorage.getItem('an_times_ses'),
    auth:localStorage.getItem(authStorageKey),
  }), { privateCacheKey:PRIVATE_CACHE_KEY, authStorageKey:AUTH_STORAGE_KEY })
  expect(persisted.privateCache).toContain('record-private-e2e')
  expect(persisted.legacyCache).toBeNull()
  expect(JSON.parse(persisted.session).authMethod).toBe('email')
  expect(persisted.auth).toContain(AUTH_ID)

  await page.getByRole('button', { name:'Cerrar sesión' }).first().click()
  await page.getByRole('button', { name:'Confirmar', exact:true }).click()
  await expect(page.getByRole('textbox', { name:'Email' })).toBeVisible()

  const afterLogout = await page.evaluate(({ privateCacheKey, authStorageKey }) => ({
    privateCache:localStorage.getItem(privateCacheKey),
    legacyCache:localStorage.getItem('an_times_v1'),
    session:localStorage.getItem('an_times_ses'),
    auth:localStorage.getItem(authStorageKey),
    allStorage:JSON.stringify(localStorage),
  }), { privateCacheKey:PRIVATE_CACHE_KEY, authStorageKey:AUTH_STORAGE_KEY })
  expect(afterLogout.privateCache).toBeNull()
  expect(afterLogout.legacyCache).toBeNull()
  expect(afterLogout.session).toBeNull()
  expect(afterLogout.auth).toBeNull()
  expect(afterLogout.allStorage).not.toContain('record-private-e2e')
  expect(afterLogout.allStorage).not.toContain('Empleado Seguro')
})

test('Auth/RLS mantiene disponible el alta personal sin descargar el directorio privado', async ({ page }) => {
  let activationBody = null
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('an_times_privacy_v1', '1')
    localStorage.setItem('an_welcome_v1', '1')
  })
  await page.route('**/api/account-bootstrap**', async route => {
    const url = new URL(route.request().url())
    expect(url.searchParams.get('q')).toBe('seg')
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ employees:[{ id:EMPLOYEE_ID, name:'Empleado Seguro', dept:'Obra Segura', pinLen:4 }] }),
    })
  })
  await page.route('**/api/activate-account', async route => {
    activationBody = route.request().postDataJSON()
    await route.fulfill({ status:401, contentType:'application/json', body:JSON.stringify({ error:'PIN incorrecto' }) })
  })
  await page.route(/supabase\.co/i, async route => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/realtime/v1/')) return route.abort()
    if (url.pathname === '/auth/v1/user') return route.fulfill({ status:401, contentType:'application/json', body:JSON.stringify({ message:'missing session' }) })
    return route.fulfill({ status:200, contentType:'application/json', body:'[]' })
  })

  await page.goto('/')
  await page.getByRole('button', { name:'Primera vez: vincular mi cuenta' }).click()
  await page.getByRole('searchbox', { name:'Busca y selecciona tu perfil' }).fill('seg')
  await page.getByRole('button', { name:/Empleado Seguro/ }).click()
  await page.getByRole('textbox', { name:'Email' }).fill(EMAIL)
  await page.getByRole('textbox', { name:'Contraseña' }).fill(PASSWORD)
  await page.getByLabel('Tu PIN habitual de fichaje').fill('1234')
  await page.getByRole('button', { name:'Crear y vincular cuenta' }).click()

  await expect(page.getByText('PIN incorrecto')).toBeVisible()
  expect(activationBody).toEqual({ employeeId:EMPLOYEE_ID, pin:'1234', email:EMAIL, password:PASSWORD })
})
