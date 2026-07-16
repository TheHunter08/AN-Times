import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/session.js'

async function openSection(page, group, item) {
  const groupButton = page.getByRole('button', { name: group, exact: true })
  if (await groupButton.isVisible()) await groupButton.click()
  await page.getByRole('button', { name: item, exact: true }).click()
}

test.describe('Panel de administración', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 })
  })

  test('muestra el dashboard por defecto', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  for (const destination of [
    ['Equipo', 'Fichajes'],
    ['Equipo', 'Empleados'],
    ['Gestión', 'Solicitudes'],
    ['Análisis', 'Informes'],
    ['Análisis', 'Auditoría'],
    ['Sistema', 'Centro operativo'],
  ]) {
    test(`navega a ${destination[1]}`, async ({ page }) => {
      await openSection(page, destination[0], destination[1])
      await expect(page.getByRole('heading', { name: destination[1], exact: true })).toBeVisible({ timeout: 8000 })
    })
  }

  test('cierra la sesión y vuelve al acceso', async ({ page }) => {
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page.getByRole('button', { name: 'PIN', exact: true })).toBeVisible({ timeout: 8000 })
  })
})

test('la auditoría muestra la cadena de trazabilidad', async ({ page }) => {
  await loginAsAdmin(page, {
    audit: [{
      id: 'audit-1', ts: new Date().toISOString(), _upd: new Date().toISOString(),
      action: 'Fichaje modificado', detail: 'Empleado Prueba · 08:00–17:00', who: 'Admin',
      entityId: 'record-1', reason: 'Corrección solicitada',
      before: { in: '08:15', out: '17:00' }, after: { in: '08:00', out: '17:00' },
    }],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 })
  await openSection(page, 'Análisis', 'Auditoría')
  await expect(page.getByText('Fichaje modificado', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Ver trazabilidad/i }).click()
  await expect(page.getByText('Corrección solicitada')).toBeVisible()
})
