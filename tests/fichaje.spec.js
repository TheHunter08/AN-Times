import { test, expect } from '@playwright/test'
import { loginAsEmployee, seedLogin } from './helpers/session.js'

test('la pantalla de acceso se renderiza', async ({ page }) => {
  await seedLogin(page)
  await page.goto('/')
  await expect(page).toHaveTitle(/TIMES/i)
  await expect(page.getByRole('button', { name: 'PIN', exact: true })).toBeVisible({ timeout: 10000 })
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

  test('permite gestionar el modelo de IA local desde configuración', async ({ page }) => {
    await page.getByRole('button', { name:'Perfil', exact:true }).last().click()
    await page.getByRole('button', { name:'Configuración', exact:true }).click()
    const dialog = page.getByRole('dialog', { name:'Configuración', exact:true })
    await expect(dialog.getByText('IA avanzada sin conexión', { exact:true })).toBeVisible()
    await expect(dialog.getByText(/Qwen 2\.5 · 0\.5B · descarga aproximada de 430 MB/)).toBeVisible()
    await expect(dialog.getByText('Descargar solo mediante Wi‑Fi', { exact:true })).toBeVisible()
  })
})
