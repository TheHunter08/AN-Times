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
})
