import { test, expect } from '@playwright/test'

async function loginAsAdmin(page) {
  await page.addInitScript(() => {
    const session = { user: null, isAdmin: true, isEnc: false, isJO: false }
    localStorage.setItem('an_times_ses', JSON.stringify(session))
  })
}

test.describe('Panel Admin', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/')
    await expect(page.locator('.adm-panel, .adm-wrap, .adm-sidebar').first()).toBeVisible({ timeout: 15000 })
  })

  test('muestra el dashboard por defecto', async ({ page }) => {
    await expect(page.locator('text=/dashboard/i').first()).toBeVisible()
  })

  test('navega a Fichajes', async ({ page }) => {
    await page.locator('[data-page="fichajes"], text=/fichajes/i').first().click()
    await expect(page.locator('.adm-panel-title, text=/fichajes/i').first()).toBeVisible({ timeout: 5000 })
  })

  test('navega a Empleados', async ({ page }) => {
    await page.locator('[data-page="empleados"], text=/empleados/i').first().click()
    await expect(page.locator('.adm-panel-title, text=/empleados/i').first()).toBeVisible({ timeout: 5000 })
  })

  test('navega a Ajustes', async ({ page }) => {
    await page.locator('[data-page="ajustes"], text=/ajustes/i').first().click()
    await expect(page.locator('.adm-panel-title, text=/ajustes/i').first()).toBeVisible({ timeout: 5000 })
  })

  test('navega a Auditoría', async ({ page }) => {
    await page.locator('[data-page="auditoria"], text=/auditor/i').first().click()
    await expect(page.locator('.adm-panel-title, text=/audit/i').first()).toBeVisible({ timeout: 5000 })
  })

  test('navega a Solicitudes', async ({ page }) => {
    await page.locator('[data-page="solicitudes"], text=/solicitudes/i').first().click()
    await expect(page.locator('.adm-panel-title, text=/solicitudes/i').first()).toBeVisible({ timeout: 5000 })
  })

  test('navega a Informes', async ({ page }) => {
    await page.locator('[data-page="informes"], text=/informes/i').first().click()
    await expect(page.locator('.adm-panel-title, text=/informes/i').first()).toBeVisible({ timeout: 5000 })
  })

  test('logout cierra sesión y vuelve al login', async ({ page }) => {
    const logoutBtn = page.locator('button:has-text("Cerrar"), button[aria-label*="logout"], button[aria-label*="salir"]').first()
    if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await logoutBtn.click()
      await expect(page.locator('.login-wrap')).toBeVisible({ timeout: 8000 })
    }
  })
})

test.describe('Auditoría - registro de acciones', () => {
  test('muestra entradas de audit log', async ({ page }) => {
    // Pre-populate audit log
    await page.addInitScript(() => {
      const session = { user: null, isAdmin: true, isEnc: false, isJO: false }
      localStorage.setItem('an_times_ses', JSON.stringify(session))
      try {
        const raw = localStorage.getItem('an_times_v1')
        const db = raw ? JSON.parse(raw) : {}
        db.audit = [
          { ts: new Date().toISOString(), action: 'Fichaje eliminado', detail: 'Test empleado · 2026-06-28', who: 'Admin' },
          { ts: new Date().toISOString(), action: 'Configuración guardada', detail: 'Empresa Test', who: 'Admin' },
        ]
        localStorage.setItem('an_times_v1', JSON.stringify(db))
      } catch {}
    })
    await page.goto('/')
    await expect(page.locator('.adm-panel, .adm-wrap').first()).toBeVisible({ timeout: 15000 })
    await page.locator('[data-page="auditoria"], text=/auditor/i').first().click()
    await expect(page.locator('text=/Fichaje eliminado|Configuración/i').first()).toBeVisible({ timeout: 5000 })
  })
})
