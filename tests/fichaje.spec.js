import { test, expect } from '@playwright/test'
import { employee, loginAsEmployee, seedLogin } from './helpers/session.js'

test('la pantalla de acceso se renderiza', async ({ page }) => {
  await seedLogin(page)
  await page.goto('/')
  await expect(page).toHaveTitle(/TIMES/i)
  await expect(page.getByRole('button', { name: 'PIN', exact: true })).toBeVisible({ timeout: 10000 })
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

  const dialog = page.getByRole('dialog', { name:/Seleccionar centro de trabajo/i })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('option', { name:'Nave Norte', exact:true })).toBeAttached()
  await expect(dialog.getByRole('option', { name:'Reforma Centro', exact:true })).toBeAttached()
  await expect(dialog.getByRole('option', { name:'Centro legacy', exact:true })).toHaveCount(0)
})

test('completa una entrada y una salida y conserva el fichaje cerrado', async ({ page }) => {
  await loginAsEmployee(page, { centrosTrabajo:['Obra Principal'] })
  await page.goto('/')

  const hold = async (button) => {
    const box = await button.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(400)
    await page.mouse.up()
  }

  await hold(page.getByRole('button', { name:/Iniciar jornada.*Mantén pulsado/i }))
  const centerDialog = page.getByRole('dialog', { name:/Seleccionar centro de trabajo/i })
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
  })

  test('navega a Vacaciones', async ({ page }) => {
    await page.getByRole('button', { name: 'Vacaciones', exact: true }).last().click()
    await expect(page.getByText(/Vacaciones|Solicitar vacaciones/i).first()).toBeVisible({ timeout: 8000 })
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

})
