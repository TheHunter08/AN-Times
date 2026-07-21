import { test, expect } from '@playwright/test'
import { loginAsEmployee } from './helpers/session.js'

test.describe('Requisitos obligatorios del empleado', () => {
  test('no permite omitir el registro de notificaciones', async ({ page }) => {
    await loginAsEmployee(page, {}, { pushReady:false })
    await page.goto('/')

    const dialog = page.getByRole('dialog', { name:/requisitos obligatorios/i })
    await expect(dialog).toBeVisible({ timeout:15000 })
    await expect(dialog.getByRole('button', { name:'Continuar →' })).toBeDisabled()
    await expect(dialog.getByText(/Omitir/i)).toHaveCount(0)
  })

  test('no permite omitir ni guardar una firma vacía', async ({ page }) => {
    await loginAsEmployee(page, { firmas:{} })
    await page.goto('/')

    const dialog = page.getByRole('dialog', { name:/requisitos obligatorios/i })
    await expect(dialog).toBeVisible({ timeout:15000 })
    await dialog.getByRole('button', { name:'Continuar →' }).click()
    await expect(dialog.getByText('Dibuja tu firma', { exact:true })).toBeVisible()
    await expect(dialog.getByText(/Omitir/i)).toHaveCount(0)
    await dialog.getByRole('button', { name:'Guardar firma →' }).click()
    await expect(page.getByText(/La firma es obligatoria/i)).toBeVisible()
  })
})
