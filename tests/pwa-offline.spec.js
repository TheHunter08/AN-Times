import { test, expect } from '@playwright/test'

test('el app shell instalado arranca sin red mediante el service worker real', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'pwa-chromium')
  await page.goto('/')
  await expect.poll(() => page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false
    const registration = await navigator.serviceWorker.ready
    return Boolean(registration.active)
  }), { timeout:15000 }).toBe(true)

  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  await page.reload({ waitUntil:'domcontentloaded' })
  await expect(page.locator('#root')).not.toBeEmpty()
  await expect(page).toHaveTitle(/Times/i)
})
