import { test, expect } from '@playwright/test'
import { seedLogin } from './helpers/session.js'

test.describe('Acceso con PIN y email', () => {
  test.beforeEach(async ({ page }) => {
    await seedLogin(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'PIN', exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('muestra marca, modos y empleado', async ({ page }) => {
    await expect(page.getByText('TIMES INC').first()).toBeVisible()
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
})

test('un empleado bloqueado ve el contador', async ({ page }) => {
  await seedLogin(page, { pinLockouts: { e1: { until: Date.now() + 5 * 60 * 1000, attempts: 5 } } })
  await page.goto('/')
  await page.getByRole('button', { name: /Empleado$/ }).click()
  await expect(page.getByText(/Bloqueado.*\d:\d{2}/i)).toBeVisible({ timeout: 5000 })
})
