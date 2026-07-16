import { test, expect } from '@playwright/test'
import { seedLogin } from './helpers/session.js'

test('activa automáticamente una versión PWA que ya está esperando', async ({ page }) => {
  await page.addInitScript(() => {
    const waitingWorker = new EventTarget()
    waitingWorker.state = 'installed'
    waitingWorker.postMessage = message => { window.__pwaUpdateMessage = message }

    const registration = new EventTarget()
    registration.waiting = waitingWorker
    registration.installing = null
    registration.update = async () => undefined

    const serviceWorker = new EventTarget()
    serviceWorker.controller = {}
    serviceWorker.ready = Promise.resolve(registration)
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    })
  })
  await seedLogin(page)
  await page.goto('/')

  await expect.poll(() => page.evaluate(() => window.__pwaUpdateMessage), { timeout: 1500 })
    .toEqual({ type: 'SKIP_WAITING' })
  await expect(page.getByRole('button', { name: /Actualizar ahora/i })).toHaveCount(0)
})
