import { test, expect } from '@playwright/test'

// Simula una sesión de empleado pre-autenticada via localStorage
async function loginAsEmployee(page) {
  await page.addInitScript(() => {
    const session = { user: { id: 'e1', name: 'Ismael Angeles de la Cruz', pin: '1111', color: '#6366f1', initials: 'IA', empresa: 'Soluciones Mata', centroTrabajo: 'Obra Principal', role: 'encargado', startDate: '2024-01-01' }, isAdmin: false, isEnc: true, isJO: false }
    localStorage.setItem('an_times_ses', JSON.stringify(session))
  })
}

test.describe('App carga correctamente', () => {
  test('la pantalla de login se renderiza', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/TIMES/i)
    // Debe haber un campo PIN o pantalla de login
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})

test.describe('Pantalla empleado', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsEmployee(page)
    await page.goto('/')
  })

  test('muestra el panel de empleado después del login', async ({ page }) => {
    // Espera que el panel de empleado se renderice (botón de fichar)
    await expect(page.locator('#sEmp, .screen')).toBeVisible({ timeout: 10000 })
  })

  test('navega entre tabs correctamente', async ({ page }) => {
    await page.waitForSelector('.emp-nav', { timeout: 10000 })
    const tabs = page.locator('.emp-nav-item')
    const count = await tabs.count()
    expect(count).toBeGreaterThanOrEqual(4)
    // Navega a Vacaciones
    await tabs.nth(2).click()
    await expect(page.locator('.vac-hero, .vac-wrap2')).toBeVisible({ timeout: 5000 })
  })

  test('el botón de fichar está visible en inicio', async ({ page }) => {
    await page.waitForSelector('.jor-circle-btn', { timeout: 10000 })
    const btn = page.locator('.jor-circle-btn')
    await expect(btn).toBeVisible()
    await expect(btn).toContainText(/iniciar/i)
  })

  test('navega a Calendario', async ({ page }) => {
    await page.waitForSelector('.emp-nav', { timeout: 10000 })
    const tabs = page.locator('.emp-nav-item')
    await tabs.nth(3).click()
    await expect(page.locator('.cal-grid, .emp-tab')).toBeVisible({ timeout: 5000 })
  })
})
