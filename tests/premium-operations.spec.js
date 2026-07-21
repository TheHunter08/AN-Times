import { test, expect } from '@playwright/test'

test.describe('Vista premium', () => {
  test('las tres superficies responden sin desbordamiento horizontal', async ({ page }) => {
    await page.goto('/uiv2-preview.html')
    await expect(page.getByRole('button', { name: 'Administrador', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Empleado', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Empleado', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Acceso', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Acceso', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1)
  })

  test('el modo claro es uniforme en administrador, empleado y acceso', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'light'))
    await page.goto('/uiv2-preview.html')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    const assertLightSurface = async selector => {
      const color = await page.locator(selector).evaluate(element => getComputedStyle(element).backgroundColor)
      const rawChannels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) || []
      const channels = color.startsWith('color(') ? rawChannels.map(channel => channel * 255) : rawChannels
      expect(channels).toHaveLength(3)
      expect(Math.min(...channels)).toBeGreaterThan(225)
    }

    await assertLightSurface('body')
    await assertLightSurface('#sAdmin .uiv2-sidebar')
    await assertLightSurface('#sAdmin .ti-live-panel')

    await page.getByRole('button', { name: 'Empleado', exact: true }).click()
    await assertLightSurface('#sEmp .employee-home-v7__hero')
    await assertLightSurface('#sEmp .employee-home-v7__week')
    await assertLightSurface('#sEmp .employee-home-v7__clock-center')

    const clockTrack = await page.locator('#sEmp .employee-home-v7__track').evaluate(element => getComputedStyle(element).stroke)
    expect(clockTrack).not.toBe('rgba(255, 255, 255, 0.065)')
    await expect(page.locator('#sEmp .employee-home-v7__clock-action')).toHaveCSS('color', 'rgb(109, 40, 217)')

    await page.getByRole('button', { name: 'Acceso', exact: true }).click()
    await assertLightSurface('.v7-login-shell')
  })
})
