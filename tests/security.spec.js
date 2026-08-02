import { test, expect } from '@playwright/test'
import { loginAsEmployee } from './helpers/session.js'

test('la pantalla de empleado tiene contenido principal y no solicita ubicación al cargar si está denegada', async ({ page }) => {
  await page.addInitScript(() => {
    window.__geoWatchCalls = 0
    Object.defineProperty(navigator, 'permissions', {
      configurable:true,
      value:{ query:async () => ({ state:'denied', addEventListener() {}, removeEventListener() {} }) },
    })
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{
        watchPosition() { window.__geoWatchCalls += 1; return 1 },
        clearWatch() {},
        getCurrentPosition(_ok, fail) { fail?.({ code:1, message:'denied' }) },
      },
    })
  })
  await loginAsEmployee(page)
  await page.goto('/')

  await expect(page.getByRole('main')).toBeVisible({ timeout:15000 })
  expect(await page.evaluate(() => window.__geoWatchCalls)).toBe(0)
})

test('migra una sesión antigua sin conservar PIN ni ficha personal duplicada', async ({ page }) => {
  await loginAsEmployee(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name:/Buenos días|Buenas tardes|Buenas noches/ })).toBeVisible({ timeout:15000 })

  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('an_times_ses') || 'null'))
  expect(persisted.user).toEqual({
    id:'e1', name:'Empleado Prueba', role:'encargado',
    isAdmin:false, isEnc:false, isJO:false,
  })
  expect(JSON.stringify(persisted)).not.toContain('1111')
  expect(persisted.user).not.toHaveProperty('pin')
  expect(persisted.user).not.toHaveProperty('centroTrabajo')
})
