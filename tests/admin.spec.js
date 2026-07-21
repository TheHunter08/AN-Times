import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/session.js'

async function openSection(page, group, item) {
  const menu = page.getByRole('button', { name:/Abrir menú/i })
  if (await menu.isVisible()) await menu.click()
  const nav = page.getByRole('navigation', { name:'Navegación principal', exact:true })
  const itemName = new RegExp(`^${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i')
  const itemButton = nav.getByRole('button', { name:itemName })
  if (!await itemButton.isVisible()) await nav.getByRole('button', { name:group, exact:true }).click()
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
    const menu = page.getByRole('button', { name:/Abrir menú/i })
    if (await menu.isVisible()) await menu.click()
    await page.getByRole('button', { name:'Cerrar sesión', exact:true }).click()
    await expect(page.getByRole('button', { name: 'PIN', exact: true })).toBeVisible({ timeout: 8000 })
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
  await expect(page.getByText('Google Calendar, Outlook o Apple Calendar')).toBeVisible()
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
  await reportRow.getByRole('button', { name:'Excel', exact:true }).click()
  expect((await excelDownload).suggestedFilename()).toBe('fichajes-2026-07.xlsx')

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
