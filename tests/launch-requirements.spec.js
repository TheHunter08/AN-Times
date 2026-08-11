import { test, expect } from '@playwright/test'
import { employee, loginAsEmployee } from './helpers/session.js'

test.describe('Requisitos obligatorios del empleado', () => {
  test('no permite omitir el registro de notificaciones (empleado nuevo)', async ({ page }) => {
    await loginAsEmployee(page, { firmas:{} }, { pushReady:false })
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

  test('exige un correo personal válido y sin duplicados antes de continuar', async ({ page }) => {
    await loginAsEmployee(page, { employees:[{ ...employee, email:'' }] })
    await page.goto('/')

    const dialog = page.getByRole('dialog', { name:/requisitos obligatorios/i })
    await expect(dialog).toBeVisible({ timeout:15000 })
    await expect(dialog.getByText('Tu correo personal', { exact:true })).toBeVisible()
    await dialog.getByRole('button', { name:'Guardar correo →' }).click()
    await expect(page.getByText(/Introduce un email válido/i)).toBeVisible()
  })

  test('un empleado con firma y correo ya guardados solo debe reconfirmar notificaciones', async ({ page }) => {
    await loginAsEmployee(page, {}, { pushReady:false })
    await page.goto('/')

    const dialog = page.getByRole('dialog', { name:/verifica tus notificaciones/i })
    await expect(dialog).toBeVisible({ timeout:15000 })
    await expect(dialog.getByText('Tu correo personal', { exact:true })).toHaveCount(0)
    await expect(dialog.getByText('Dibuja tu firma', { exact:true })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name:'Continuar →' })).toBeDisabled()
  })
})
