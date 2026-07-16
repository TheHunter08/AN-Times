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
