import { test, expect } from '@playwright/test'
import { employee, loginAsEmployee, seedLogin } from './helpers/session.js'

test('la pantalla de acceso se renderiza', async ({ page }) => {
  await seedLogin(page)
  await page.goto('/')
  await expect(page).toHaveTitle(/TIMES/i)
  await expect(page.getByRole('button', { name: 'PIN', exact: true })).toBeVisible({ timeout: 10000 })
})

test('actualiza datos de otros usuarios sin molestar al empleado con avisos técnicos', async ({ page }) => {
  await loginAsEmployee(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name:/Iniciar jornada/i })).toBeVisible({ timeout:15000 })

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('times-conflict', { detail:{ count:2 } }))
  })
  await page.waitForTimeout(300)

  await expect(page.getByText(/versiones más recientes|actualizados por otro usuario/i)).toHaveCount(0)
})

test('muestra las obras asignadas por id al iniciar una jornada', async ({ page }) => {
  await loginAsEmployee(page, {
    employees:[{ ...employee, centroTrabajo:'', obrasAsignadas:['obra-norte', 'obra-centro'] }],
    centrosTrabajo:['Centro legacy'],
    obras:[
      { id:'obra-norte', nombre:'Nave Norte', activa:true },
      { id:'obra-centro', nombre:'Reforma Centro', activa:true },
    ],
  })
  await page.goto('/')
  const clock = page.getByRole('button', { name:/Iniciar jornada.*Mantén pulsado/i })
  await expect(clock).toBeVisible({ timeout:15000 })
  const box = await clock.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(400)
  await page.mouse.up()

  const dialog = page.getByRole('dialog', { name:/Selecciona tu obra/i })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('option', { name:'Nave Norte', exact:true })).toBeAttached()
  await expect(dialog.getByRole('option', { name:'Reforma Centro', exact:true })).toBeAttached()
  await expect(dialog.getByRole('option', { name:'Centro legacy', exact:true })).toHaveCount(0)
})

test('nunca ofrece una obra fantasma a partir de una referencia obsoleta en obrasAsignadas', async ({ page }) => {
  // Bug real reportado: un empleado con 'Gecama'/'TELECOMUNICACIONES' (nombres
  // antiguos, ya sin obra real que coincida tras un renombrado) veía esas
  // cadenas en bruto como si fueran obras reales en el selector de "Iniciar
  // jornada" — ver employeeObraOptions en obraAttribution.js.
  await loginAsEmployee(page, {
    employees:[{ ...employee, centroTrabajo:'', obrasAsignadas:['obra-norte', 'Gecama', 'TELECOMUNICACIONES'] }],
    obras:[{ id:'obra-norte', nombre:'Nave Norte', activa:true }],
  })
  await page.goto('/')
  const clock = page.getByRole('button', { name:/Iniciar jornada.*Mantén pulsado/i })
  await expect(clock).toBeVisible({ timeout:15000 })
  const box = await clock.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(400)
  await page.mouse.up()

  const dialog = page.getByRole('dialog', { name:/Selecciona tu obra/i })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('option', { name:'Nave Norte', exact:true })).toBeAttached()
  await expect(dialog.getByRole('option', { name:'Gecama', exact:true })).toHaveCount(0)
  await expect(dialog.getByRole('option', { name:'TELECOMUNICACIONES', exact:true })).toHaveCount(0)
})

test('completa una entrada y una salida y conserva el fichaje cerrado', async ({ page }) => {
  // Sin obrasAsignadas directas, se ofrece la obra adscrita al centro de
  // trabajo del empleado (nunca el centro en sí) — ver employeeObraOptions.
  await loginAsEmployee(page, {
    centrosTrabajo:['Obra Principal'],
    obras:[{ id:'obra-principal', nombre:'Obra Principal', centroTrabajo:'Obra Principal', activa:true }],
  })
  await page.goto('/')

  const hold = async (button) => {
    const box = await button.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    // Margen sobre HOLD_DURATION: en emulación móvil requestAnimationFrame
    // puede perder un frame cuando el estado acaba de cambiar.
    await page.waitForTimeout(550)
    await page.mouse.up()
  }

  await hold(page.getByRole('button', { name:/Iniciar jornada.*Mantén pulsado/i }))
  const centerDialog = page.getByRole('dialog', { name:/Selecciona tu obra/i })
  await expect(centerDialog).toBeVisible()
  await centerDialog.getByRole('button', { name:'Iniciar jornada', exact:true }).click()

  const stopButton = page.getByRole('button', { name:/Finalizar jornada.*Mantén pulsado/i })
  await expect(stopButton).toBeVisible()
  await hold(stopButton)
  await expect(page.getByText('¿Terminar la jornada ahora?', { exact:true })).toBeVisible()
  await page.getByRole('button', { name:'Confirmar', exact:true }).click()
  await expect(page.getByRole('button', { name:/Iniciar jornada.*Mantén pulsado/i })).toBeVisible()

  const records = await page.evaluate(() => JSON.parse(localStorage.getItem('an_times_v1')).records)
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ empId:employee.id, closed:true })
  expect(records[0].aceptada).toBeUndefined()
  expect(records[0].inicio).toBeTruthy()
  expect(records[0].fin).toBeTruthy()
})

test('Times AI protege los datos del equipo para un empleado normal', async ({ page }) => {
  await loginAsEmployee(page, {
    employees:[{ ...employee, role:'empleado', isEnc:false, isJO:false }],
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name:/Iniciar jornada.*Mantén pulsado/i })).toBeVisible({ timeout:15000 })
  await page.getByRole('button', { name:/Asistente IA|Abrir asistente de IA/i }).first().click()
  const dialog = page.getByRole('dialog', { name:'Times AI', exact:true })
  await expect(dialog.getByRole('button', { name:'¿Mis datos están sincronizados?', exact:true })).toBeVisible()
  await expect(dialog.getByRole('button', { name:'¿Quién olvidó fichar?', exact:true })).toHaveCount(0)
  await dialog.getByPlaceholder('Pregúntame sobre tu jornada…').fill('¿Quién olvidó fichar?')
  await dialog.getByRole('button', { name:'Enviar', exact:true }).click()
  await expect(dialog.getByText(/Solo administradores y responsables de equipo/)).toBeVisible({ timeout:3000 })
})

test.describe('Pantalla del empleado', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsEmployee(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Iniciar jornada.*Mantén pulsado/i })).toBeVisible({ timeout: 15000 })
  })

  test('muestra el control de jornada', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Iniciar jornada.*Mantén pulsado/i })).toBeVisible()
    await expect(page.getByText('Tiempo trabajado', { exact: true })).toBeVisible()
    await expect(page.getByText('Copiloto del día', { exact:true })).toBeVisible()
    await expect(page.getByText('Local · privado', { exact:true })).toBeVisible()
    await expect(page.getByText('Todo listo para tu próxima jornada', { exact:true })).toBeVisible()
  })

  test('navega a Vacaciones', async ({ page }) => {
    await page.getByRole('button', { name: 'Vacaciones', exact: true }).last().click()
    await expect(page.getByText(/Vacaciones|Solicitar vacaciones/i).first()).toBeVisible({ timeout: 8000 })
  })

  test('permite solicitar una baja médica sin que cuente como vacación', async ({ page }) => {
    await page.getByRole('button', { name: 'Vacaciones', exact: true }).last().click()
    await page.getByRole('button', { name: 'Solicitar vacaciones', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Solicitar vacaciones', exact: true })
    await expect(dialog.getByText('Solicitar ausencia', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: '🩺 Baja médica', exact: true }).click()
    const toISODate = (d) => d.toISOString().slice(0, 10)
    const start = new Date(); start.setDate(start.getDate() + 1)
    const end = new Date(start); end.setDate(end.getDate() + 4)
    await dialog.locator('input[type="date"]').first().fill(toISODate(start))
    await dialog.locator('input[type="date"]').last().fill(toISODate(end))
    await dialog.getByRole('button', { name: 'Solicitar', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText('Baja médica', { exact: false })).toBeVisible()
    await expect(page.getByText('5 días', { exact: false })).toBeVisible()

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('an_times_v1')).vacaciones)
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ tipo: 'baja_medica', estado: 'pendiente', dias: 5 })
  })

  test('navega a Calendario', async ({ page }) => {
    await page.getByRole('button', { name: 'Calendario', exact: true }).last().click()
    await expect(page.getByText(/Calendario|Leyenda/i).first()).toBeVisible({ timeout: 8000 })
  })

  test('exporta el mes visible a un calendario compatible', async ({ page }) => {
    await page.getByRole('button', { name: 'Calendario', exact: true }).last().click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportar mes al calendario', exact: true }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^calendario-laboral-\d{4}-\d{2}\.ics$/)
  })

  test('permite gestionar el modelo de IA local desde configuración', async ({ page }) => {
    await page.getByRole('button', { name:'Perfil', exact:true }).last().click()
    await page.getByRole('button', { name:'Configuración', exact:true }).click()
    const dialog = page.getByRole('dialog', { name:'Configuración', exact:true })
    await expect(dialog.getByText('IA avanzada sin conexión', { exact:true })).toBeVisible()
    await expect(dialog.getByText(/Qwen 2\.5 · 0\.5B · descarga aproximada de 430 MB/)).toBeVisible()
    await expect(dialog.getByText('Descargar solo mediante Wi‑Fi', { exact:true })).toBeVisible()
  })

  test('muestra una ruta de activación privada y permite completar la vinculación de cuenta', async ({ page }) => {
    // El correo, la firma y las notificaciones ya son obligatorios para pasar del
    // onboarding, así que aquí solo pueden quedar pendientes la cuenta vinculada y el PIN.
    await page.getByRole('button', { name:'Perfil', exact:true }).last().click()
    await expect(page.getByText('Ruta de activación', { exact:true })).toBeVisible()
    await expect(page.getByText('2 pasos para completar tu cuenta', { exact:true })).toBeVisible()
    await expect(page.getByText('60%', { exact:true })).toBeVisible()
    await page.getByRole('button', { name:'Completar: Cuenta vinculada', exact:true }).click()
    await expect(page.getByText('¿Cerrar sesión?', { exact:false })).toBeVisible()
    await page.getByRole('button', { name:'Confirmar', exact:true }).click()
    await expect(page.getByRole('button', { name:'PIN', exact:true })).toBeVisible({ timeout:8000 })
  })

  test('muestra gastos legacy y guarda un gasto nuevo con control de sincronización', async ({ page }) => {
    const month = new Date().toISOString().slice(0, 7)
    await loginAsEmployee(page, { gastos:[
      { id:'legacy-1', empId:employee.id, concepto:'Taxi', importe:'10', estado:'aprobado', ts:`${month}-02T10:00:00Z` },
      { id:'legacy-2', empId:employee.id, concepto:'Dieta', importe:'5', estado:'aprobado', ts:`${month}-03T10:00:00Z` },
    ] })
    await page.goto('/')
    await page.getByRole('button', { name:'Perfil', exact:true }).last().click()
    await page.getByRole('button', { name:'Gastos', exact:true }).click()

    await expect(page.getByText(/15,00.*aprobados/)).toBeVisible()
    await page.getByRole('button', { name:'+ Nuevo gasto', exact:true }).click()
    await page.getByPlaceholder(/Qué fue/).fill('Aparcamiento')
    await page.getByPlaceholder('0.00').fill('7.50')
    await page.getByRole('button', { name:'Enviar gasto', exact:true }).click()
    await expect(page.getByText(/Gasto enviado correctamente/)).toBeVisible()

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('an_times_v1')).gastos.find(item => item.concepto === 'Aparcamiento'))
    expect(saved).toMatchObject({ importe:7.5, estado:'pendiente' })
    expect(saved._upd).toBeTruthy()
  })

})
