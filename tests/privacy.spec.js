import { test, expect } from '@playwright/test'

test('el aviso de privacidad informa, atrapa el foco y registra la lectura', async ({ page }) => {
  await page.route(/supabase\.co/i, route => route.abort())
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('an_welcome_v1', '1')
  })

  await page.goto('/')

  const dialog = page.getByRole('dialog', { name:'Privacidad y datos' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('No se guarda un recorrido')
  await expect(dialog).toContainText('obligación legal')

  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()

  const checkbox = dialog.getByRole('checkbox', { name:/He leído la información/ })
  const confirm = dialog.getByRole('button', { name:/Marca la casilla/ })
  await expect(checkbox).toBeFocused()
  await expect(confirm).toBeDisabled()

  await checkbox.check()
  await dialog.getByRole('button', { name:'Confirmar y continuar' }).click()

  await expect(dialog).toBeHidden()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('an_times_privacy_v1'))).toBe('1')
})
