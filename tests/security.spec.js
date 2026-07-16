import { test, expect } from '@playwright/test'
import { loginAsEmployee } from './helpers/session.js'

test('migra una sesión antigua sin conservar PIN ni ficha personal duplicada', async ({ page }) => {
  await loginAsEmployee(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name:/Buenas/ })).toBeVisible({ timeout:15000 })

  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('an_times_ses') || 'null'))
  expect(persisted.user).toEqual({
    id:'e1', name:'Empleado Prueba', role:'encargado',
    isAdmin:false, isEnc:false, isJO:false,
  })
  expect(JSON.stringify(persisted)).not.toContain('1111')
  expect(persisted.user).not.toHaveProperty('pin')
  expect(persisted.user).not.toHaveProperty('centroTrabajo')
})

