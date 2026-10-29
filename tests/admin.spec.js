import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/session.js'

async function openSection(page, group, item) {
  const menu = page.getByRole('button', { name:/Abrir menú/i })
  if (await menu.isVisible()) await menu.click()
  const nav = page.getByRole('navigation', { name:'Navegación principal', exact:true })
  const itemName = new RegExp(`^${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i')
  const groupName = new RegExp(`^${group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i')
  const itemButton = nav.getByRole('button', { name:itemName })
  if (!await itemButton.isVisible()) await nav.getByRole('button', { name:groupName }).click()
  await itemButton.click()
}

test.describe('Panel de administración', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 })
  })

  test('muestra el dashboard por defecto', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('abre el Nexo con el teclado y ejecuta comandos de navegación', async ({ page }) => {
    await page.keyboard.press('Control+k')
    const commandCenter = page.getByRole('dialog', { name:'Centro de mando' })
    await expect(commandCenter).toBeVisible()
    await expect(commandCenter.getByText(/Pulso operativo/).first()).toBeVisible()
    await expect(commandCenter).toContainText('Cálculo explicable · sin enviar datos')

    const commandSearch = commandCenter.getByRole('textbox', { name:'Buscar comandos' })
    await commandSearch.fill('Auditoría')
    await commandSearch.press('Enter')
    await expect(page.getByRole('heading', { name:'Auditoría', exact:true })).toBeVisible({ timeout:8000 })
    await expect(commandCenter).toHaveCount(0)
  })

  test('informa al administrador de una reconciliación sin presentarla como error', async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('times-conflict', { detail:{ count:2 } }))
    })

    await expect(page.getByText('Se aplicaron las versiones más recientes de 2 fichajes')).toBeVisible()
    await expect(page.getByText(/Datos actualizados por otro usuario/)).toHaveCount(0)
  })

  for (const destination of [
    ['Equipo', 'Fichajes', 'Fichajes'],
    ['Equipo', 'Empleados', 'Empleados'],
    ['Gestión', 'Solicitudes', 'Solicitudes'],
    ['Análisis', 'Cumplimiento', 'Centro de cumplimiento'],
    ['Análisis', 'Auditoría', 'Auditoría'],
    ['Sistema', 'Centro operativo', 'Centro operativo'],
  ]) {
    test(`navega a ${destination[1]}`, async ({ page }) => {
      await openSection(page, destination[0], destination[1])
      await expect(page.getByRole('heading', { name: destination[2], exact: true })).toBeVisible({ timeout: 8000 })
    })
  }

  test('cierra la sesión y vuelve al acceso', async ({ page }) => {
    let remoteLogoutRequests = 0
    await page.route(/supabase\.co\/auth\/v1\/logout/i, route => {
      remoteLogoutRequests += 1
      expect(route.request().headers().authorization).toBe('Bearer sesion-persistida')
      return route.fulfill({ status:204, body:'' })
    })
    await page.evaluate(() => {
      localStorage.setItem('sb-eyyhlcvpyiorpdnvqsll-auth-token', JSON.stringify({
        access_token:'sesion-persistida',
        refresh_token:'refresh-persistido',
      }))
    })
    const menu = page.getByRole('button', { name:/Abrir menú/i })
    if (await menu.isVisible()) await menu.click()
    await page.getByRole('button', { name:'Cerrar sesión', exact:true }).click()
    await expect(page.getByRole('button', { name: 'PIN', exact: true })).toBeVisible({ timeout: 8000 })
    await expect.poll(() => page.evaluate(
      () => localStorage.getItem('sb-eyyhlcvpyiorpdnvqsll-auth-token'),
    )).toBeNull()
    await expect.poll(() => remoteLogoutRequests).toBe(1)
  })
})

test('cumplimiento muestra riesgos reales y permite abrir la excepción', async ({ page }) => {
  const staleStart = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  await loginAsAdmin(page, {
    records: [{ id:'open-1', empId:'e1', empName:'Empleado Prueba', inicio:staleStart, fin:null, _upd:new Date().toISOString() }],
    cierres: [{ id:'close-1', empId:'e1', mes:'2026-06', firmaAdmin:false, firmaEmp:false }],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openSection(page, 'Análisis', 'Cumplimiento')
  await expect(page.getByRole('heading', { name:'Centro de cumplimiento' })).toBeVisible()
  await expect(page.getByText('Jornadas sin finalizar', { exact:true })).toBeVisible()
  await expect(page.getByText('Cierres pendientes de firma', { exact:true })).toBeVisible()
  await page.getByRole('button', { name:/Jornadas sin finalizar/ }).click()
  await expect(page.getByRole('heading', { name:'Anomalías' })).toBeVisible()
})

test('empleados muestra qué falta para vincular cada cuenta', async ({ page }) => {
  const modernPin = 'pbkdf2:00112233445566778899aabbccddeeff:hash:600000'
  await loginAsAdmin(page, {
    employees:[
      { id:'linked', name:'Cuenta Vinculada', email:'vinculada@empresa.com', pin:modernPin, authId:'auth-1', role:'empleado', baja:false },
      { id:'ready', name:'Cuenta Preparada', email:'preparada@empresa.com', pin:modernPin, role:'empleado', baja:false },
      { id:'missing', name:'Sin Correo', email:'', pin:modernPin, role:'empleado', baja:false },
      { id:'legacy', name:'PIN Antiguo', email:'antiguo@empresa.com', pin:'a'.repeat(64), authId:'auth-legacy', role:'empleado', baja:false },
    ],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openSection(page, 'Equipo', 'Empleados')

  await expect(page.getByRole('note')).toContainText('2 vinculadas · 0 pendientes de confirmar · 1 listas para vincular · 1 con requisitos pendientes')
  await expect(page.getByRole('note')).toContainText('1 PIN heredado necesita una actualización segura')
  await expect(page.getByText('Cuenta vinculada', { exact:true })).toHaveCount(2)
  await expect(page.getByText('Lista para vincular', { exact:true })).toBeVisible()
  await expect(page.getByText('Falta correo', { exact:true })).toBeVisible()
  await expect(page.getByText('PIN pendiente de actualizar', { exact:true })).toBeVisible()
})

test('vehículos permite crear un vehículo y asignarlo a un empleado', async ({ page }) => {
  await loginAsAdmin(page, {
    employees:[{ id:'e1', name:'Empleado Prueba', email:'empleado@empresa.com', role:'empleado', baja:false, centroTrabajo:'Obra Principal' }],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openSection(page, 'Gestión', 'Vehículos')

  await expect(page.getByText('No hay vehículos. Crea el primero arriba.', { exact:true })).toBeVisible()
  await page.getByRole('button', { name:'Añadir', exact:true }).click()

  const dialog = page.getByRole('dialog', { name:'Nuevo vehículo', exact:true })
  await dialog.getByPlaceholder('Ej: 1234 ABC').fill('1234 abc')
  await dialog.getByPlaceholder('Ej: Renault').fill('Renault')
  await dialog.getByPlaceholder('Ej: Kangoo').fill('Kangoo')
  await dialog.getByRole('button', { name:'Empleado', exact:true }).click()
  await dialog.getByRole('combobox').filter({ hasText:'Selecciona un empleado' }).selectOption({ label:'Empleado Prueba' })
  await dialog.getByRole('button', { name:'Crear vehículo', exact:true }).click()

  await expect(page.getByText('1234 ABC', { exact:false })).toBeVisible()
  await expect(page.getByText(/Renault Kangoo/)).toBeVisible()
  await expect(page.getByText(/Empleado Prueba/)).toBeVisible()

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('an_times_v1')).vehiculos)
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({ matricula:'1234 ABC', marca:'Renault', modelo:'Kangoo', asignadoTipo:'empleado', asignadoId:'e1' })
})

test('obras permite eliminar una obra y la desasigna de empleados y vehículos', async ({ page }) => {
  await loginAsAdmin(page, {
    employees:[{ id:'e1', name:'Empleado Prueba', email:'empleado@empresa.com', role:'empleado', baja:false, centroTrabajo:'Centro Norte', obrasAsignadas:['obra-fantasma'] }],
    obras:[{ id:'obra-fantasma', nombre:'TELECOMUNICACIONES', activa:true }],
    vehiculos:[{ id:'v1', matricula:'1234 ABC', asignadoTipo:'obra', asignadoId:'obra-fantasma', activo:true }],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openSection(page, 'Gestión', 'Obras')

  await expect(page.getByRole('button', { name:/Ver detalle de la obra TELECOMUNICACIONES/i })).toBeVisible()
  await page.getByRole('button', { name:/Ver detalle de la obra TELECOMUNICACIONES/i }).click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name:'Eliminar obra', exact:true }).click()

  await expect(page.getByRole('button', { name:/Ver detalle de la obra TELECOMUNICACIONES/i })).toHaveCount(0)

  const db = await page.evaluate(() => JSON.parse(localStorage.getItem('an_times_v1')))
  expect(db.obras).toHaveLength(0)
  expect(db.employees.find(e => e.id === 'e1').obrasAsignadas).toEqual([])
  expect(db.vehiculos[0]).toMatchObject({ asignadoTipo:'', asignadoId:'' })
})

test('obras: "Ver empleados asignados" filtra a los empleados con esa obra en su lista de obras asignadas', async ({ page }) => {
  await loginAsAdmin(page, {
    employees:[
      { id:'e1', name:'Asignado A La Obra', email:'e1@empresa.com', role:'empleado', baja:false, obrasAsignadas:['obra-1'] },
      { id:'e2', name:'Sin Asignar', email:'e2@empresa.com', role:'empleado', baja:false, obrasAsignadas:[] },
    ],
    obras:[{ id:'obra-1', nombre:'TELECOMUNICACIONES', activa:true }],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openSection(page, 'Gestión', 'Obras')
  await page.getByRole('button', { name:/Ver detalle de la obra TELECOMUNICACIONES/i }).click()
  await page.getByRole('button', { name:'Ver empleados asignados', exact:true }).click()

  await expect(page.getByRole('heading', { name:'Empleados', exact:true })).toBeVisible()
  await expect(page.getByText('Empleados asignados a TELECOMUNICACIONES (1)')).toBeVisible()
  await expect(page.getByText('Asignado A La Obra')).toBeVisible()
  await expect(page.getByText('Sin Asignar')).not.toBeVisible()

  // Quitar el filtro vuelve a mostrar a todos.
  await page.getByRole('button', { name:'Quitar filtro de obra' }).click()
  await expect(page.getByText('Sin Asignar')).toBeVisible()
})

test('la auditoría muestra la cadena de trazabilidad', async ({ page }) => {
  await loginAsAdmin(page, {
    audit: [{
      id: 'audit-1', ts: new Date().toISOString(), _upd: new Date().toISOString(),
      action: 'Fichaje modificado', detail: 'Empleado Prueba · 08:00–17:00', who: 'Admin',
      entityId: 'record-1', reason: 'Corrección solicitada',
      before: { in: '08:15', out: '17:00' }, after: { in: '08:00', out: '17:00' },
    }],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 })
  await openSection(page, 'Análisis', 'Auditoría')
  await expect(page.getByText('Fichaje modificado', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Ver trazabilidad/i }).click()
  await expect(page.getByText('Corrección solicitada')).toBeVisible()
})

test('exporta un recordatorio recurrente de informe al calendario', async ({ page }) => {
  await loginAsAdmin(page, {
    config: {
      reportSchedules: [{
        id: 'weekly-hours', name: 'Resumen de horas', frequency: 'weekly',
        format: 'pdf', recipients: 'equipo@times.inc', enabled: true,
      }],
    },
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openSection(page, 'Sistema', 'Centro operativo')
  await expect(page.getByRole('button', { name:'Calendario', exact:true })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name:'Calendario', exact:true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('informe-weekly-hours.ics')
})

test('descarga informes mensuales reales en PDF y Excel', async ({ page }) => {
  const inicio = new Date(2026, 6, 15, 8, 0).toISOString()
  const fin = new Date(2026, 6, 15, 16, 0).toISOString()
  await loginAsAdmin(page, {
    records:[{ id:'export-1', empId:'e1', empName:'Empleado Prueba', inicio, fin, centro:'Obra Principal', workSecs:28800, breakSecs:0 }],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openSection(page, 'Análisis', 'Cumplimiento')
  await expect(page.getByText('Informes mensuales', { exact:true })).toBeVisible()
  const reportRow = page.locator('.uiv2-report-row').filter({ hasText:'Informe mensual' })
  await expect(reportRow).toHaveCount(1)

  const excelDownload = page.waitForEvent('download')
  await reportRow.getByRole('button', { name:'Excel general', exact:true }).click()
  expect((await excelDownload).suggestedFilename()).toBe('informe-horas-general-2026-07.xlsx')

  await reportRow.getByText('Individual', { exact:true }).click()
  const individualDownload = page.waitForEvent('download')
  await reportRow.getByRole('button', { name:'Empleado Prueba', exact:true }).click()
  expect((await individualDownload).suggestedFilename()).toBe('informe-horas-Empleado-Prueba-2026-07.xlsx')

  const pdfDownload = page.waitForEvent('download')
  await reportRow.getByRole('button', { name:'PDF', exact:true }).click()
  expect((await pdfDownload).suggestedFilename()).toBe('informe-2026-07.pdf')
})

test('mantiene resolubles las jornadas antiguas pendientes y no cuenta las validadas', async ({ page }) => {
  await loginAsAdmin(page, {
    records:[
      { id:'pending-old', empId:'e1', empName:'Empleado Prueba', inicio:'2026-05-01T08:00:00Z', fin:'2026-05-01T16:00:00Z', workSecs:28800, aceptada:false, validado:false, rechazado:false },
      { id:'approved-old', empId:'e1', empName:'Empleado Prueba', inicio:'2026-05-02T08:00:00Z', fin:'2026-05-02T16:00:00Z', workSecs:28800, aceptada:false, validado:true, rechazado:false },
    ],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openSection(page, 'Gestión', 'Validar horas')
  await expect(page.getByRole('heading', { name:'Validar horas' })).toBeVisible()
  await expect(page.getByRole('button', { name:'Pendientes (1)', exact:true })).toBeVisible()
  await expect(page.getByText('Empleado Prueba', { exact:true })).toBeVisible()
})

test('Times AI resume la actividad operativa por obra', async ({ page }) => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0).toISOString()
  await loginAsAdmin(page, {
    employees:[{ id:'e1', name:'Empleado Prueba', obrasAsignadas:['obra-a'] }],
    obras:[{ id:'obra-a', nombre:'Obra Centro', activa:true }],
    records:[{ id:'open-ai', empId:'e1', inicio:start, fin:null, centro:'Obra Centro', breaks:[] }],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await page.getByRole('button', { name:'Abrir Times AI', exact:true }).click()

  const dialog = page.getByRole('dialog', { name:'Times AI', exact:true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name:'Estado de las obras', exact:true }).click()
  await expect(dialog.getByText(/Obra Centro: 1 trabajando/)).toBeVisible({ timeout:3000 })
})

test('validar horas permite sustituir lo trabajado por la jornada esperada', async ({ page }) => {
  await loginAsAdmin(page, {
    config:{ wdMin:480 },
    records:[{ id:'short-day', empId:'e1', empName:'Empleado Prueba', inicio:'2026-07-13T08:00:00Z', fin:'2026-07-13T15:00:00Z', workSecs:25200, breaks:[], aceptada:false, validado:false, rechazado:false }],
  })
  // persistRecordRow necesita que el upsert a /rest/v1/records responda ok
  // (loginAsAdmin aborta todo supabase.co por defecto) — Playwright usa el
  // último route() registrado que matchee, así que esto gana sobre el abort.
  await page.route(/supabase\.co\/rest\/v1\/records/i, route => route.fulfill({ status:200, contentType:'application/json', body:'[]' }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openSection(page, 'Gestión', 'Validar horas')
  await expect(page.getByRole('heading', { name:'Validar horas' })).toBeVisible()

  await page.getByRole('button', { name:'Modificar', exact:true }).click()
  const dialog = page.getByRole('dialog', { name:'Modificar horario' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Hora de entrada')).toHaveValue('08:00')
  await dialog.getByRole('button', { name:/Sustituir por lo esperado/ }).click()
  await expect(dialog.getByLabel('Hora de salida')).toHaveValue('16:00')
  await dialog.getByLabel('Motivo de la modificación').fill('Sustituido por la jornada esperada')
  await dialog.getByRole('button', { name:'Guardar', exact:true }).click()
  await expect(dialog).not.toBeVisible()

  const record = await page.evaluate(() => JSON.parse(localStorage.getItem('an_times_v1')).records.find(r => r.id === 'short-day'))
  expect(record.workSecs).toBe(28800)
  expect(record.validado).toBe(true)
})

test('resumen permite filtrar la matriz por obra', async ({ page }) => {
  await loginAsAdmin(page, {
    employees:[
      { id:'e1', name:'Zoe Norte', role:'empleado', baja:false },
      { id:'e2', name:'Beto Sur', role:'empleado', baja:false },
    ],
    obras:[
      { id:'obra-norte', nombre:'Obra Norte', activa:true },
      { id:'obra-sur', nombre:'Obra Sur', activa:true },
    ],
    records:[
      { id:'r1', empId:'e1', empName:'Zoe Norte', inicio:'2026-07-06T08:00:00Z', fin:'2026-07-06T16:00:00Z', centro:'Obra Norte', workSecs:28800, breaks:[] },
      { id:'r2', empId:'e2', empName:'Beto Sur', inicio:'2026-07-06T08:00:00Z', fin:'2026-07-06T12:00:00Z', centro:'Obra Sur', workSecs:14400, breaks:[] },
    ],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openSection(page, 'Análisis', 'Resumen')
  await expect(page.getByRole('heading', { name:'Resumen' })).toBeVisible()
  await page.getByRole('button', { name:'Fecha específica' }).click()
  await page.locator('input[type="date"]').fill('2026-07-06')

  await expect(page.getByRole('cell', { name:'Zoe Norte' })).toBeVisible()
  await expect(page.getByRole('cell', { name:'Beto Sur' })).toBeVisible()

  await page.getByRole('button', { name:'Obra Norte', exact:true }).click()
  await expect(page.getByRole('cell', { name:'Zoe Norte' })).toBeVisible()
  await expect(page.getByRole('cell', { name:'Beto Sur' })).not.toBeVisible()

  await page.getByRole('button', { name:'Todas', exact:true }).click()
  await expect(page.getByRole('cell', { name:'Beto Sur' })).toBeVisible()
})

test('resumen oculta por defecto a los de baja y a quien no fichó ningún día, pero permite pedir el informe de un empleado de baja explícitamente', async ({ page }) => {
  await loginAsAdmin(page, {
    employees:[
      { id:'e1', name:'Activo Con Horas', role:'empleado', baja:false },
      { id:'e2', name:'Activo Sin Fichar', role:'empleado', baja:false },
      { id:'e3', name:'De Baja Con Horas', role:'empleado', baja:true },
    ],
    records:[
      { id:'r1', empId:'e1', empName:'Activo Con Horas', inicio:'2026-07-06T08:00:00Z', fin:'2026-07-06T16:00:00Z', workSecs:28800, breaks:[] },
      { id:'r3', empId:'e3', empName:'De Baja Con Horas', inicio:'2026-07-06T08:00:00Z', fin:'2026-07-06T16:00:00Z', workSecs:28800, breaks:[] },
    ],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openSection(page, 'Análisis', 'Resumen')
  await expect(page.getByRole('heading', { name:'Resumen' })).toBeVisible()
  await page.locator('input[type="month"]').fill('2026-07')

  await expect(page.getByRole('cell', { name:'Activo Con Horas' })).toBeVisible()
  await expect(page.getByRole('cell', { name:'Activo Sin Fichar' })).not.toBeVisible()
  await expect(page.getByRole('cell', { name:'De Baja Con Horas' })).not.toBeVisible()

  // Pero sí se puede pedir explícitamente el informe del empleado de baja.
  await page.locator('select').first().selectOption({ label:'De Baja Con Horas (baja)' })
  await expect(page.getByRole('cell', { name:'De Baja Con Horas' })).toBeVisible()
})

test('planning precarga el horario esperado al añadir una jornada manual: 9h lun-jue, 4h viernes, siempre desde las 8:00', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openSection(page, 'Equipo', 'Planning')

  // Semana anterior completa: así tanto el lunes como el viernes caen en el
  // pasado (si se usara la semana en curso, el viernes podría ser un día
  // "futuro" todavía sin fichar, y Planning no ofrece "Añadir" ahí).
  await page.getByRole('button', { name:'Semana anterior' }).click()
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1) - 7)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  const mondayLabel = monday.toLocaleDateString('es-ES', { weekday:'short', day:'numeric' })
  const fridayLabel = friday.toLocaleDateString('es-ES', { weekday:'short', day:'numeric' })

  await page.getByRole('button', { name:new RegExp(`${fridayLabel}:.*Añadir jornada manual`, 'i') }).click()
  let dialog = page.getByRole('dialog', { name:'Añadir jornada manual' })
  await expect(dialog.getByLabel('Hora entrada')).toHaveValue('08:00')
  await expect(dialog.getByLabel('Hora salida')).toHaveValue('12:00') // viernes: 4h
  await dialog.getByRole('button', { name:'Cerrar' }).click()
  await expect(dialog).not.toBeVisible()

  await page.getByRole('button', { name:new RegExp(`${mondayLabel}:.*Añadir jornada manual`, 'i') }).click()
  dialog = page.getByRole('dialog', { name:'Añadir jornada manual' })
  await expect(dialog.getByLabel('Hora entrada')).toHaveValue('08:00')
  await expect(dialog.getByLabel('Hora salida')).toHaveValue('17:00') // lunes: 9h
})

test('planning permite cerrar y reabrir una semana revisada, y cambiar a vista mensual', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept())
  const now = new Date()
  const dayLabel = now.toLocaleDateString('es-ES', { weekday:'short', day:'numeric' })
  await loginAsAdmin(page) // sin fichajes: el empleado de prueba aparece "Ausente" hoy
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openSection(page, 'Equipo', 'Planning')
  await expect(page.getByRole('heading', { name:'Planning semanal' })).toBeVisible()

  const todayCell = page.getByRole('button', { name:new RegExp(`${dayLabel}:.*Añadir jornada manual`, 'i') })
  await expect(todayCell).toBeVisible()

  // Cerrar la semana actual como revisada: no requiere confirmación.
  await page.getByRole('button', { name:'Cerrar semana revisada' }).click()
  const reopenButton = page.getByRole('button', { name:/Semana cerrada · Reabrir/ })
  await expect(reopenButton).toBeVisible()
  await expect(page.getByRole('button', { name:new RegExp(`${dayLabel}:.*Semana cerrada, no se puede añadir`, 'i') })).toBeVisible()
  await expect(todayCell).not.toBeVisible() // ya no ofrece "Añadir jornada manual"

  // Reabrir sí pide confirmación (el listener de arriba la acepta).
  await reopenButton.click()
  await expect(page.getByRole('button', { name:'Cerrar semana revisada' })).toBeVisible()
  await expect(todayCell).toBeVisible()

  // persistRecordRow necesita que el upsert a /rest/v1/records responda ok
  // (loginAsAdmin aborta todo supabase.co por defecto).
  await page.route(/supabase\.co\/rest\/v1\/records/i, route => route.fulfill({ status:200, contentType:'application/json', body:'[]' }))

  // Con la semana reabierta, añadir el fichaje manual funciona con normalidad.
  // El horario esperado precarga 08:00–17:00 (9h) un día laborable lun-jue;
  // hoy (miércoles 28/10/2026 en este entorno) cae en ese caso.
  await todayCell.click()
  const dialog = page.getByRole('dialog', { name:'Añadir jornada manual' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Hora entrada')).toHaveValue('08:00')
  await expect(dialog.getByLabel('Hora salida')).toHaveValue('17:00')
  await dialog.getByRole('button', { name:'Añadir jornada' }).click()
  await expect(dialog).not.toBeVisible()
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem('an_times_v1')).records)
  expect(records).toHaveLength(1)

  // Vista mensual: mismo grid, pero con todos los días del mes en curso.
  await page.getByRole('button', { name:'Mes', exact:true }).click()
  await expect(page.getByRole('heading', { name:'Planning mensual' })).toBeVisible()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  await expect(page.locator('table thead th')).toHaveCount(daysInMonth + 1) // + la columna Empleado
})

test('planning no deja cerrar una semana con fichajes sin validar', async ({ page }) => {
  const dateStr = new Date().toISOString().slice(0, 10)
  await loginAsAdmin(page, {
    records:[{ id:'r-pending', empId:'e1', empName:'Empleado Prueba', inicio:`${dateStr}T08:00:00Z`, fin:`${dateStr}T16:00:00Z`, breaks:[], aceptada:false, validado:false, rechazado:false }],
  })
  // persistRecordRow (aprobar en Validar horas) necesita que el upsert a
  // /rest/v1/records responda ok (loginAsAdmin aborta todo supabase.co).
  await page.route(/supabase\.co\/rest\/v1\/records/i, route => route.fulfill({ status:200, contentType:'application/json', body:'[]' }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openSection(page, 'Equipo', 'Planning')

  const closeButton = page.getByRole('button', { name:'Cerrar semana (1 sin validar)' })
  await expect(closeButton).toBeVisible()
  await expect(closeButton).toBeDisabled()
  const closuresBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('an_times_v1')).planningClosures)
  expect(closuresBefore ?? []).toHaveLength(0)

  // Una vez validado el fichaje desde Validar horas, la semana sí se puede cerrar.
  await openSection(page, 'Gestión', 'Validar horas')
  await expect(page.getByRole('heading', { name:'Validar horas' })).toBeVisible()
  await page.getByRole('button', { name:'Ok', exact:true }).click() // fila de escritorio: "Aceptar" solo va en el title/tooltip

  await openSection(page, 'Equipo', 'Planning')
  await page.getByRole('button', { name:'Cerrar semana revisada' }).click()
  await expect(page.getByRole('button', { name:/Semana cerrada · Reabrir/ })).toBeVisible()
})

test('planning muestra "Mes cerrado" en vista mensual cuando todas sus semanas están cerradas', async ({ page }) => {
  // Octubre 2026 (mes en curso en este entorno) toca las semanas que
  // empiezan el 28/09, 05/10, 12/10, 19/10 y 26/10 — se cierran todas.
  await loginAsAdmin(page, {
    planningClosures:['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'].map((weekStart, i) => ({
      id:`pc${i}`, weekStart, closedAt:'2026-10-28T00:00:00.000Z', closedBy:'Admin',
    })),
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openSection(page, 'Equipo', 'Planning')
  await page.getByRole('button', { name:'Mes', exact:true }).click()
  await expect(page.getByText('Mes cerrado')).toBeVisible()

  // En un mes con alguna semana sin cerrar, el aviso no aparece.
  await page.getByRole('button', { name:'mes anterior' }).click()
  await expect(page.getByText('Mes cerrado')).not.toBeVisible()
})
