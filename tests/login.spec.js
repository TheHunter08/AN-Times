import { test, expect } from '@playwright/test'
import { employee, seedLogin } from './helpers/session.js'

async function mockImmediateActivation(page, { authId = 'auth-activada', email = 'empleado@empresa.com', created = true } = {}) {
  let activationBody = null
  await page.route('**/api/activate-account', async route => {
    activationBody = route.request().postDataJSON()
    return route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ ok:true, employeeId:activationBody.employeeId, authId, email:activationBody.email, created }),
    })
  })
  await page.route(/supabase\.co\/auth\/v1\/token/i, route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({
      access_token:'token-activado', refresh_token:'refresh-activado', token_type:'bearer',
      expires_in:3600, expires_at:Math.floor(Date.now() / 1000) + 3600,
      user:{
        id:authId, aud:'authenticated', role:'authenticated', email,
        email_confirmed_at:new Date().toISOString(),
        app_metadata:{ provider:'email', providers:['email'] }, user_metadata:{},
        created_at:new Date().toISOString(), updated_at:new Date().toISOString(),
      },
    }),
  }))
  return () => activationBody
}

test.describe('Acceso con PIN y email', () => {
  test.beforeEach(async ({ page }) => {
    await seedLogin(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'PIN', exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('muestra marca, modos y empleado', async ({ page }) => {
    await expect(page.getByRole('main').getByText('TIMES INC', { exact:true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Email', exact: true })).toBeVisible()
    await expect(page.getByLabel('Buscar perfil de empleado')).toBeVisible()
    await page.getByLabel('Buscar perfil de empleado').fill('Em')
    await expect(page.getByRole('button', { name: /Empleado$/ })).toBeVisible()
  })

  test('seleccionar un empleado muestra el teclado PIN', async ({ page }) => {
    await page.getByLabel('Buscar perfil de empleado').fill('Em')
    await page.getByRole('button', { name: /Empleado$/ }).click()
    await expect(page.getByRole('button', { name: '9', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '0', exact: true })).toBeVisible()
  })

  test('el PIN no solicita JWT y limpia tokens guardados por versiones antiguas', async ({ page }) => {
    let pinJwtRequests = 0
    await page.route('**/api/pin-login', route => {
      pinJwtRequests += 1
      return route.fulfill({ status:410, body:'retired' })
    })
    await page.evaluate(() => localStorage.setItem('an_times_pin_jwt', JSON.stringify({
      token:'header.payload.signature',
      expiresAt:Date.now() + 3_600_000,
      empId:'e1',
    })))

    await page.getByLabel('Buscar perfil de empleado').fill('Em')
    await page.getByRole('button', { name: /Empleado$/ }).click()
    for (let digit = 0; digit < 4; digit += 1) {
      await page.getByRole('button', { name: '1', exact:true }).click()
    }

    await expect.poll(() => page.evaluate(
      () => localStorage.getItem('an_times_pin_jwt'),
    )).toBeNull()
    expect(pinJwtRequests).toBe(0)
  })

  test('el modo email muestra sus campos', async ({ page }) => {
    await page.getByRole('button', { name: 'Email', exact: true }).click()
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /olvidaste/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /No llegó la confirmación/i })).toBeVisible()
  })

  test('permite reenviar el correo de confirmación pendiente', async ({ page }) => {
    let resendBody = null
    await page.route(/supabase\.co\/auth\/v1\/resend/i, async route => {
      resendBody = route.request().postDataJSON()
      return route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify({}),
      })
    })
    await page.getByRole('button', { name:'Email', exact:true }).click()
    await page.getByLabel('Email', { exact:true }).fill('empleado@empresa.com')
    await page.getByRole('button', { name:/No llegó la confirmación/i }).click()
    await expect(page.getByText(/recibirás un nuevo enlace/i)).toBeVisible()
    expect(resendBody).toMatchObject({ type:'signup', email:'empleado@empresa.com' })
  })

  test('orienta a crear la cuenta cuando Supabase rechaza credenciales inexistentes', async ({ page }) => {
    await page.route(/supabase\.co\/auth\/v1\/token/i, route => route.fulfill({
      status:400,
      contentType:'application/json',
      body:JSON.stringify({ message:'Invalid login credentials' }),
    }))
    await page.getByRole('button', { name:'Email', exact:true }).click()
    await page.getByLabel('Email', { exact:true }).fill('empleado@empresa.com')
    await page.getByLabel('Contraseña', { exact:true }).fill('password-segura')
    await page.getByRole('button', { name:'Continuar', exact:true }).click()
    await expect(page.getByText(/Si aún no vinculaste tu cuenta, usa «Primera vez: vincular mi cuenta»/)).toBeVisible()
  })

  test('permite iniciar el alta segura de la primera cuenta', async ({ page }) => {
    await page.getByRole('button', { name: 'Email', exact: true }).click()
    await page.getByRole('button', { name: 'Primera vez: vincular mi cuenta' }).click()
    await expect(page.getByText('Crea y vincula tu cuenta')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Cómo vincular tu cuenta' })).toContainText('no es un código nuevo')
    await expect(page.getByLabel('Tu PIN habitual de fichaje')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Crear y vincular cuenta' })).toBeVisible()
    await expect(page.getByRole('note')).toContainText('El PIN solo acredita')
    await page.getByRole('button', { name: 'Ya tengo una cuenta vinculada' }).click()
    await expect(page.getByText('Accede a TIMES INC')).toBeVisible()
  })

  test('activa la cuenta inmediatamente sin esperar un correo', async ({ page }) => {
    await seedLogin(page, { employees:[{ ...employee, email:'empleado@empresa.com', pin:'1111' }] })
    const activationRequest = await mockImmediateActivation(page, { authId:'auth-inmediata' })
    await page.goto('/')
    await page.getByRole('button', { name:'Email', exact:true }).click()
    await page.getByRole('button', { name:'Primera vez: vincular mi cuenta' }).click()
    await page.getByLabel('Email', { exact:true }).fill('empleado@empresa.com')
    await page.getByLabel('Contraseña', { exact:true }).fill('password-segura')
    await page.getByLabel('Tu PIN habitual de fichaje').fill('1111')
    await page.getByRole('button', { name:'Crear y vincular cuenta' }).click()

    await expect(page.getByRole('button', { name:/Iniciar jornada/i })).toBeVisible({ timeout:15000 })
    expect(activationRequest()).toMatchObject({ employeeId:'e1', pin:'1111', email:'empleado@empresa.com' })
  })

  test('obliga al administrador a seleccionar su perfil y vincular Auth con su PIN', async ({ page }) => {
    const admin = { id:'admin-1', name:'Administración Principal', role:'admin', isAdmin:true, pin:'9999', pinLen:4, baja:false }
    await seedLogin(page, { employees:[employee, admin] })
    await page.route('**/api/account-bootstrap**', route => route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ employees:[{ id:admin.id, name:admin.name, dept:'Administración', pinLen:4 }] }),
    }))
    const activationRequest = await mockImmediateActivation(page, { authId:'auth-admin', email:'admin@empresa.com' })
    await page.goto('/')
    await page.getByRole('button', { name:'Email', exact:true }).click()
    await page.getByRole('button', { name:'Primera vez: vincular mi cuenta' }).click()
    await page.getByRole('searchbox', { name:'Busca y selecciona tu perfil' }).fill('admin')
    await page.getByRole('button', { name:/Administración Principal/ }).click()
    await page.getByLabel('Email', { exact:true }).fill('admin@empresa.com')
    await page.getByLabel('Contraseña', { exact:true }).fill('password-segura')
    await page.getByLabel('Tu PIN habitual de fichaje').fill('9999')
    await page.getByRole('button', { name:'Crear y vincular cuenta' }).click()

    await expect.poll(activationRequest).toMatchObject({ employeeId:'admin-1', pin:'9999', email:'admin@empresa.com' })
  })

  test('obliga a activar correo y Supabase Auth tras acreditar el PIN de una ficha incompleta', async ({ page }) => {
    await seedLogin(page, { employees:[{ ...employee, email:'', authId:null, pin:'1111' }] })
    const activationRequest = await mockImmediateActivation(page, { authId:'auth-activada', email:'nuevo@empresa.com' })
    await page.goto('/')
    await page.getByLabel('Buscar perfil de empleado').fill('Em')
    await page.getByRole('button', { name:/Empleado$/ }).click()
    for (let digit = 0; digit < 4; digit += 1) {
      await page.getByRole('button', { name:'1', exact:true }).click()
    }

    await expect(page.getByText('Activa tu cuenta oficial')).toBeVisible()
    await expect(page.getByText(/PIN verificado para Empleado/)).toBeVisible()
    await expect(page.getByLabel('Tu PIN habitual de fichaje')).not.toBeVisible()
    await page.getByLabel('Email', { exact:true }).fill('Nuevo@Empresa.com')
    await page.getByLabel('Contraseña', { exact:true }).fill('password-segura')
    await page.getByRole('button', { name:'Crear y vincular cuenta' }).click()

    await expect(page.getByRole('button', { name:/Iniciar jornada/i })).toBeVisible({ timeout:15000 })
    expect(activationRequest()).toMatchObject({ employeeId:'e1', pin:'1111', email:'nuevo@empresa.com' })
  })

  test('no crea una cuenta si el PIN no acredita al empleado', async ({ page }) => {
    let activationRequests = 0
    await seedLogin(page, { employees:[{ ...employee, email:'empleado@empresa.com', pin:'1111' }] })
    await page.route('**/api/activate-account', route => {
      activationRequests += 1
      return route.abort()
    })
    await page.goto('/')
    await page.getByRole('button', { name:'Email', exact:true }).click()
    await page.getByRole('button', { name:'Primera vez: vincular mi cuenta' }).click()
    await page.getByLabel('Email', { exact:true }).fill('empleado@empresa.com')
    await page.getByLabel('Contraseña', { exact:true }).fill('password-segura')
    await page.getByLabel('Tu PIN habitual de fichaje').fill('9999')
    await page.getByRole('button', { name:'Crear y vincular cuenta' }).click()
    await expect(page.getByText(/PIN incorrecto/)).toBeVisible()
    expect(activationRequests).toBe(0)
  })

  test('no vincula una cuenta si dos empleados comparten el mismo correo', async ({ page }) => {
    let activationRequests = 0
    await seedLogin(page, {
      employees:[
        { ...employee, email:'compartido@empresa.com', pin:'1111' },
        { ...employee, id:'e2', name:'Otro Empleado', email:'COMPARTIDO@empresa.com', pin:'2222' },
      ],
    })
    await page.route('**/api/activate-account', route => {
      activationRequests += 1
      return route.abort()
    })
    await page.goto('/')
    await page.getByRole('button', { name:'Email', exact:true }).click()
    await page.getByRole('button', { name:'Primera vez: vincular mi cuenta' }).click()
    await page.getByLabel('Email', { exact:true }).fill('compartido@empresa.com')
    await page.getByLabel('Contraseña', { exact:true }).fill('password-segura')
    await page.getByLabel('Tu PIN habitual de fichaje').fill('1111')
    await page.getByRole('button', { name:'Crear y vincular cuenta' }).click()
    await expect(page.getByText(/correo aparece en varios empleados/i)).toBeVisible()
    expect(activationRequests).toBe(0)
  })

  test('recupera con contraseña y PIN una vinculación obsoleta', async ({ page }) => {
    const authUser = {
      id:'auth-nueva',
      aud:'authenticated',
      role:'authenticated',
      email:'empleado@empresa.com',
      email_confirmed_at:new Date().toISOString(),
      app_metadata:{ provider:'email', providers:['email'] },
      user_metadata:{},
      created_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),
    }
    await seedLogin(page, {
      employees:[{ ...employee, email:'empleado@empresa.com', pin:'1111', authId:'auth-antigua' }],
    })
    await page.route(/supabase\.co\/auth\/v1\/token/i, route => route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        access_token:'token-prueba',
        refresh_token:'refresh-prueba',
        token_type:'bearer',
        expires_in:3600,
        expires_at:Math.floor(Date.now() / 1000) + 3600,
        user:authUser,
      }),
    }))
    await page.goto('/')
    await page.getByRole('button', { name:'Email', exact:true }).click()
    await page.getByLabel('Email', { exact:true }).fill('empleado@empresa.com')
    await page.getByLabel('Contraseña', { exact:true }).fill('password-segura')
    await page.getByRole('button', { name:'Continuar', exact:true }).click()

    await expect(page.getByText(/Introduce tu PIN de fichaje para recuperar el acceso/)).toBeVisible({ timeout:15000 })
    await page.getByLabel('PIN para primera vinculación').fill('1111')
    await page.getByRole('button', { name:'Continuar', exact:true }).click()

    await expect.poll(() => page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('an_times_v1') || '{}')
      return db.employees?.find(employee => employee.id === 'e1')?.authId
    }), { timeout:15000 }).toBe('auth-nueva')
  })

  test('no reutiliza una identidad vinculada a otro perfil dado de baja', async ({ page }) => {
    const authUser = {
      id:'auth-compartida',
      aud:'authenticated',
      role:'authenticated',
      email:'empleado@empresa.com',
      email_confirmed_at:new Date().toISOString(),
      app_metadata:{ provider:'email', providers:['email'] },
      user_metadata:{},
      created_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),
    }
    await seedLogin(page, {
      employees:[
        { ...employee, id:'e-antiguo', email:'empleado@empresa.com', authId:'auth-compartida', baja:true },
        { ...employee, id:'e-nuevo', email:'empleado@empresa.com', pin:'1111', baja:false },
      ],
    })
    await page.route(/supabase\.co\/auth\/v1\/token/i, route => route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        access_token:'token-prueba',
        refresh_token:'refresh-prueba',
        token_type:'bearer',
        expires_in:3600,
        expires_at:Math.floor(Date.now() / 1000) + 3600,
        user:authUser,
      }),
    }))
    await page.route(/supabase\.co\/auth\/v1\/logout/i, route => route.fulfill({ status:204, body:'' }))
    await page.goto('/')
    await page.getByRole('button', { name:'Email', exact:true }).click()
    await page.getByLabel('Email', { exact:true }).fill('empleado@empresa.com')
    await page.getByLabel('Contraseña', { exact:true }).fill('password-segura')
    await page.getByRole('button', { name:'Continuar', exact:true }).click()
    await expect(page.getByRole('alert')).toContainText('completar esta primera vinculación', { timeout:15000 })
    await page.getByLabel('PIN para primera vinculación').fill('1111')
    await page.getByRole('button', { name:'Continuar', exact:true }).click()

    await expect(page.getByText(/cuenta ya está vinculada a otro perfil/i)).toBeVisible({ timeout:15000 })
    await expect.poll(() => page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('an_times_v1') || '{}')
      return db.employees?.find(item => item.id === 'e-nuevo')?.authId || null
    })).toBeNull()
  })

  test('recrea con PIN una cuenta cuyo usuario Auth anterior fue eliminado', async ({ page }) => {
    const authUser = {
      id:'auth-recreada',
      aud:'authenticated',
      role:'authenticated',
      email:'empleado@empresa.com',
      email_confirmed_at:new Date().toISOString(),
      app_metadata:{ provider:'email', providers:['email'] },
      user_metadata:{},
      identities:[{ identity_id:'identidad-nueva', provider:'email' }],
      created_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),
    }
    await seedLogin(page, {
      employees:[{ ...employee, email:'empleado@empresa.com', pin:'1111', authId:'auth-eliminada' }],
    })
    await mockImmediateActivation(page, { authId:'auth-recreada', email:'empleado@empresa.com' })
    await page.goto('/')
    await page.getByRole('button', { name:'Email', exact:true }).click()
    await page.getByRole('button', { name:'Primera vez: vincular mi cuenta' }).click()
    await page.getByLabel('Email', { exact:true }).fill('empleado@empresa.com')
    await page.getByLabel('Contraseña', { exact:true }).fill('password-segura')
    await page.getByLabel('Tu PIN habitual de fichaje').fill('1111')
    await page.getByRole('button', { name:'Crear y vincular cuenta' }).click()

    await expect.poll(() => page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('an_times_v1') || '{}')
      return db.employees?.find(item => item.id === 'e1')?.authId
    })).toBe('auth-recreada')
    await expect(page.getByRole('button', { name:/Iniciar jornada/i })).toBeVisible()
  })

  test('recupera de forma controlada una cuenta Auth ya vinculada', async ({ page }) => {
    await seedLogin(page, {
      employees:[{ ...employee, email:'empleado@empresa.com', pin:'1111', authId:'auth-existente' }],
    })
    await mockImmediateActivation(page, { authId:'auth-existente', email:'empleado@empresa.com', created:false })
    await page.goto('/')
    await page.getByRole('button', { name:'Email', exact:true }).click()
    await page.getByRole('button', { name:'Primera vez: vincular mi cuenta' }).click()
    await page.getByLabel('Email', { exact:true }).fill('empleado@empresa.com')
    await page.getByLabel('Contraseña', { exact:true }).fill('password-segura')
    await page.getByLabel('Tu PIN habitual de fichaje').fill('1111')
    await page.getByRole('button', { name:'Crear y vincular cuenta' }).click()

    await expect(page.getByRole('button', { name:/Iniciar jornada/i })).toBeVisible({ timeout:15000 })
  })

  test('muestra y valida la contraseña nueva al volver desde recuperación', async ({ page }) => {
    await page.goto('/?reset=1')
    await expect(page.getByText('Crea una contraseña nueva')).toBeVisible()
    await expect(page.getByRole('button', { name:'PIN', exact:true })).not.toBeVisible()
    await expect(page.getByLabel('Email', { exact:true })).not.toBeVisible()

    await page.getByLabel('Nueva contraseña', { exact:true }).fill('nueva-clave-segura')
    await page.getByLabel('Repite la nueva contraseña', { exact:true }).fill('otra-clave-segura')
    await page.getByRole('button', { name:'Guardar nueva contraseña' }).click()

    await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible()
  })
})

test('un empleado bloqueado ve el contador', async ({ page }) => {
  await seedLogin(page, { pinLockouts: { e1: { until: Date.now() + 5 * 60 * 1000, attempts: 5 } } })
  await page.goto('/')
  await page.getByLabel('Buscar perfil de empleado').fill('Em')
  await page.getByRole('button', { name: /Empleado$/ }).click()
  await expect(page.getByText(/Bloqueado.*\d:\d{2}/i)).toBeVisible({ timeout: 5000 })
})

test('un directorio grande no expone nombres hasta buscar dos letras', async ({ page }) => {
  const employees = ['Empleado Prueba', 'Ana Campo', 'Bruno Obra', 'Carla Norte', 'Diego Sur'].map((name, index) => ({
    id:`e${index + 1}`, name, pin:'1111', pinLen:4, role:'empleado', baja:false,
  }))
  await seedLogin(page, { employees })
  await page.goto('/')
  await expect(page.getByLabel('Buscar perfil de empleado')).toBeVisible({ timeout:10000 })
  await expect(page.getByRole('button', { name:/Ana$/ })).toHaveCount(0)
  await page.getByLabel('Buscar perfil de empleado').fill('An')
  await expect(page.getByRole('button', { name:/Ana$/ })).toBeVisible()
})
