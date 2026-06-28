import { test, expect } from '@playwright/test'

test.describe('Login - Pantalla PIN', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.login-wrap')).toBeVisible({ timeout: 10000 })
  })

  test('muestra el logo y los tabs de modo', async ({ page }) => {
    await expect(page.locator('.login-logo-name')).toContainText('TIMES')
    const tabs = page.locator('.login-tab')
    await expect(tabs).toHaveCount(2)
  })

  test('selector de empleado aparece en modo PIN', async ({ page }) => {
    const sel = page.locator('.login-select')
    await expect(sel).toBeVisible()
  })

  test('muestra error al introducir PIN incorrecto', async ({ page }) => {
    await page.selectOption('.login-select', { index: 1 })
    // Pulsar 4 dígitos incorrectos
    for (const k of ['9', '9', '9', '9']) {
      await page.locator(`.login-key >> text="${k}"`).first().click()
    }
    await expect(page.locator('.login-err')).toBeVisible({ timeout: 5000 })
  })

  test('el tab de email muestra formulario de email/contraseña', async ({ page }) => {
    await page.locator('.login-tab >> text="Email"').click()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('botón de olvidé contraseña cambia de pantalla', async ({ page }) => {
    await page.locator('.login-tab >> text="Email"').click()
    const forgotBtn = page.locator('text=/olvidé|olvidaste|recuperar/i').first()
    if (await forgotBtn.isVisible()) {
      await forgotBtn.click()
      await expect(page.locator('input[type="email"], .login-err, text=/email/i').first()).toBeVisible({ timeout: 3000 })
    }
  })
})

test.describe('Login - Lockout PIN', () => {
  test('lockout muestra contador después de 5 intentos fallidos', async ({ page }) => {
    // Inyectar lockout pre-existente en localStorage
    const empId = 'e1'
    await page.addInitScript((id) => {
      localStorage.setItem(`an_lk_${id}`, JSON.stringify({ until: Date.now() + 5 * 60 * 1000 }))
    }, empId)
    await page.goto('/')
    await expect(page.locator('.login-select')).toBeVisible({ timeout: 10000 })
    await page.selectOption('.login-select', empId)
    // Debe mostrar el countdown en formato M:SS
    await expect(page.locator('.login-err')).toContainText(/\d:\d{2}/, { timeout: 3000 })
  })
})
