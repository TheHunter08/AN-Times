import { test, expect } from '@playwright/test'
import { loginAsEmployee } from './helpers/session.js'

test.describe('Fichaje por QR', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsEmployee(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Fichar a un empleado' })).toBeVisible({ timeout: 15000 })
  })

  test('abre y cierra el escáner', async ({ page }) => {
    await page.getByRole('button', { name: 'Fichar a un empleado' }).click()
    const dialog = page.getByRole('dialog', { name: 'Fichar con QR' })
    await expect(dialog).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar escáner QR' }).click()
    await expect(dialog).not.toBeVisible()
  })
})

test('el mismo QR inicia y después finaliza la jornada del empleado', async ({ page }) => {
  const target = { id:'e2', name:'Trabajador QR', pin:'2222', pinLen:4, role:'empleado', centroTrabajo:'Obra Principal', onboardingDone:true, baja:false }
  await loginAsEmployee(page, {
    employees:[
      { id:'e1', name:'Encargado', pin:'1111', pinLen:4, role:'encargado', centroTrabajo:'Obra Principal', onboardingDone:true, baja:false },
      target,
    ],
    firmas:{
      e1:{ main:{ data:'data:image/jpeg;base64,firma-encargado' } },
      e2:{ main:{ data:'data:image/jpeg;base64,firma-trabajador' } },
    },
  })
  await page.goto('/')

  const scan = async () => {
    await page.getByRole('button', { name:'Fichar a un empleado' }).click()
    await expect(page.getByRole('dialog', { name:'Fichar con QR' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => typeof window.__TIMES_E2E_QR_SCAN__)).toBe('function')
    await page.evaluate(() => window.__TIMES_E2E_QR_SCAN__(`${window.location.origin}/?emp=e2`))
  }

  await scan()
  await expect.poll(() => page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('an_times_v1'))
    return db.records.some(record => record.empId === 'e2' && !record.fin)
  })).toBe(true)
  await scan()
  await expect(page.getByText('¿Finalizar la jornada de Trabajador QR?')).toBeVisible()
  await page.getByRole('button', { name:'Confirmar', exact:true }).click()
  await expect(page.getByText(/Jornada finalizada para Trabajador QR/)).toBeVisible()

  const targetRecords = await page.evaluate(() => JSON.parse(localStorage.getItem('an_times_v1')).records.filter(record => record.empId === 'e2'))
  expect(targetRecords).toHaveLength(1)
  expect(targetRecords[0].fin).toBeTruthy()
  expect(targetRecords[0].closed).toBe(true)
})

test.describe('Código QR del perfil', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsEmployee(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Perfil', exact: true }).last()).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Perfil', exact: true }).last().click()
  })

  test('abre un QR real en canvas', async ({ page }) => {
    await page.getByText('Mi código QR', { exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Mi código QR' })
    await expect(dialog).toBeVisible()
    const canvas = dialog.locator('canvas')
    await expect(canvas).toBeVisible()
    expect(await canvas.evaluate(el => {
      const data = el.getContext('2d').getImageData(0, 0, el.width, el.height).data
      return data.some(byte => byte !== 0)
    })).toBe(true)
  })
})
