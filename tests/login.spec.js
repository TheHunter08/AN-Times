import { test, expect } from '@playwright/test'
import { seedLogin } from './helpers/session.js'

test.describe('Acceso con PIN y email', () => {
  test.beforeEach(async ({ page }) => {
    await seedLogin(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'PIN', exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('muestra marca, modos y empleado', async ({ page }) => {
    await expect(page.getByRole('main').getByText('TIMES INC', { exact:true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Email', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Empleado$/ })).toBeVisible()
  })

  test('seleccionar un empleado muestra el teclado PIN', async ({ page }) => {
    await page.getByRole('button', { name: /Empleado$/ }).click()
    await expect(page.getByRole('button', { name: '9', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '0', exact: true })).toBeVisible()
  })

  test('el modo email muestra sus campos', async ({ page }) => {
    await page.getByRole('button', { name: 'Email', exact: true }).click()
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /olvidaste/i })).toBeVisible()
  })

  test('permite iniciar el alta segura de la primera cuenta', async ({ page }) => {
    await page.getByRole('button', { name: 'Email', exact: true }).click()
    await page.getByRole('button', { name: 'Primera vez: crear cuenta' }).click()
    await expect(page.getByText('Crea tu acceso seguro')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Crear acceso seguro' })).toBeVisible()
    await expect(page.getByRole('note')).toContainText('enlace de confirmación')
    await page.getByRole('button', { name: 'Ya tengo cuenta' }).click()
    await expect(page.getByText('Accede a TIMES INC')).toBeVisible()
  })
})

test('un empleado bloqueado ve el contador', async ({ page }) => {
  await seedLogin(page, { pinLockouts: { e1: { until: Date.now() + 5 * 60 * 1000, attempts: 5 } } })
  await page.goto('/')
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
