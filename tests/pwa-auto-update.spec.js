import { test, expect } from '@playwright/test'
import { loginAsEmployee, seedLogin } from './helpers/session.js'

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

test('activa la versión aunque updatefound no llegue al reanudar la PWA', async ({ page }) => {
  await page.addInitScript(() => {
    const waitingWorker = new EventTarget()
    waitingWorker.state = 'installed'
    waitingWorker.postMessage = message => { window.__pwaUpdateMessage = message }

    const registration = new EventTarget()
    registration.waiting = null
    registration.installing = null
    registration.update = async () => {
      // Reproduce WebView/iOS: update() termina con el worker preparado, pero el
      // evento updatefound no se entrega a la página que acaba de recuperar foco.
      registration.waiting = waitingWorker
    }

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
})

test('el centro de actualización manual instala una versión ya preparada al pulsar el botón', async ({ page }) => {
  await page.addInitScript(() => {
    const waitingWorker = new EventTarget()
    waitingWorker.state = 'installed'
    waitingWorker.postMessage = message => { window.__pwaManualUpdateMessage = message }

    // El registro del ciclo automático (serviceWorker.ready) nunca tiene nada
    // pendiente, para aislar y probar solo el botón manual.
    const autoRegistration = new EventTarget()
    autoRegistration.waiting = null
    autoRegistration.installing = null
    autoRegistration.update = async () => {}

    // El registro que consulta el botón manual (getRegistration) sí encuentra
    // una versión lista tras llamar a update().
    const manualRegistration = new EventTarget()
    manualRegistration.waiting = null
    manualRegistration.installing = null
    manualRegistration.update = async () => { manualRegistration.waiting = waitingWorker }

    const serviceWorker = new EventTarget()
    serviceWorker.controller = {}
    serviceWorker.ready = Promise.resolve(autoRegistration)
    serviceWorker.getRegistration = async () => manualRegistration
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker })
  })
  await loginAsEmployee(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name:/Iniciar jornada/i })).toBeVisible({ timeout:15000 })

  await page.getByRole('button', { name:'Perfil', exact:true }).last().click()
  await page.getByRole('button', { name:'Configuración', exact:true }).click()
  const dialog = page.getByRole('dialog', { name:'Configuración', exact:true })
  await expect(dialog.getByText('Actualizaciones', { exact:true })).toBeVisible()
  await dialog.getByRole('button', { name:'Buscar actualizaciones', exact:true }).click()

  await expect.poll(() => page.evaluate(() => window.__pwaManualUpdateMessage), { timeout: 5000 })
    .toEqual({ type: 'SKIP_WAITING' })
})

test('el centro de actualización manual avisa cuando ya se tiene la última versión', async ({ page }) => {
  await page.addInitScript(() => {
    const registration = new EventTarget()
    registration.waiting = null
    registration.installing = null
    registration.update = async () => {}

    const serviceWorker = new EventTarget()
    serviceWorker.controller = {}
    serviceWorker.ready = Promise.resolve(registration)
    serviceWorker.getRegistration = async () => registration
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker })
  })
  await loginAsEmployee(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name:/Iniciar jornada/i })).toBeVisible({ timeout:15000 })

  await page.getByRole('button', { name:'Perfil', exact:true }).last().click()
  await page.getByRole('button', { name:'Configuración', exact:true }).click()
  const dialog = page.getByRole('dialog', { name:'Configuración', exact:true })
  await dialog.getByRole('button', { name:'Buscar actualizaciones', exact:true }).click()

  await expect(page.getByText('Ya tienes la última versión instalada')).toBeVisible({ timeout:5000 })
})
