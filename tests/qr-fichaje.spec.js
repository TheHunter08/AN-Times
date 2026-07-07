import { test, expect } from '@playwright/test'

// Misma técnica que fichaje.spec.js: sesión simulada por localStorage, sin
// PIN real y sin escribir nada en Supabase — estos tests solo comprueban
// que la UI del fichaje por QR se renderiza y abre correctamente, nunca
// completan un fichaje real (evita crear registros falsos en producción).
async function loginAsEmployee(page, overrides = {}) {
  await page.addInitScript((extra) => {
    const session = {
      user: { id: 'e1', name: 'Ismael Angeles de la Cruz', pin: '1111', color: '#6366f1', initials: 'IA', empresa: 'Soluciones Mata', centroTrabajo: 'Obra Principal', role: 'encargado', startDate: '2024-01-01', ...extra },
      isAdmin: false, isEnc: true, isJO: false,
    }
    localStorage.setItem('an_times_ses', JSON.stringify(session))
    // Evita que el modal de aviso de privacidad tape la UI en el test —
    // fichaje.spec.js no lo necesitaba, probablemente porque ese modal se
    // añadió después; sin esto, "Marca la casilla para continuar" bloquea
    // cualquier clic en el resto de la pantalla.
    localStorage.setItem('an_times_privacy_v1', '1')
  }, overrides)
}

test.describe('Fichaje por QR — empleado', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsEmployee(page)
    await page.goto('/')
  })

  test('el botón "Fichar con QR" está visible en Inicio', async ({ page }) => {
    await page.waitForSelector('.jor-circle-btn', { timeout: 20000 })
    await expect(page.locator('text=/Fichar.*QR|QR.*equipo/i').first()).toBeVisible()
  })

  test('pulsar el botón abre el modal de escaneo', async ({ page }) => {
    await page.waitForSelector('.jor-circle-btn', { timeout: 20000 })
    await page.locator('text=/Fichar.*QR|QR.*equipo/i').first().click()
    await expect(page.locator('.modal >> text="Fichar con QR"')).toBeVisible({ timeout: 5000 })
    // Sin cámara real en el entorno de test, debe mostrar el estado de error
    // en vez de quedarse colgado o romper la página.
    await expect(page.locator('text=/no se pudo acceder a la cámara/i')).toBeVisible({ timeout: 5000 })
  })

  test('el modal de escaneo se cierra con la ×', async ({ page }) => {
    await page.waitForSelector('.jor-circle-btn', { timeout: 20000 })
    await page.locator('text=/Fichar.*QR|QR.*equipo/i').first().click()
    await expect(page.locator('.modal >> text="Fichar con QR"')).toBeVisible({ timeout: 5000 })
    await page.locator('.modal button >> text="×"').click()
    await expect(page.locator('.modal >> text="Fichar con QR"')).not.toBeVisible()
  })
})

test.describe('Mi código QR — perfil del empleado', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsEmployee(page)
    await page.goto('/')
  })

  test('la tarjeta "Mi código QR" aparece en el perfil', async ({ page }) => {
    await page.waitForSelector('.emp-nav', { timeout: 20000 })
    const tabs = page.locator('.emp-nav-item')
    await tabs.last().click() // Perfil suele ser la última pestaña
    await expect(page.locator('text="Mi código QR"')).toBeVisible({ timeout: 5000 })
  })

  test('abre el modal y genera un canvas con el QR', async ({ page }) => {
    await page.waitForSelector('.emp-nav', { timeout: 20000 })
    const tabs = page.locator('.emp-nav-item')
    await tabs.last().click()
    await page.locator('text="Mi código QR"').click()
    await expect(page.locator('.modal >> text="Mi código QR"')).toBeVisible({ timeout: 5000 })
    // El canvas del QR debe tener contenido real dibujado, no quedarse en blanco.
    const canvas = page.locator('.modal canvas')
    await expect(canvas).toBeVisible({ timeout: 5000 })
    const hasContent = await canvas.evaluate(el => {
      const ctx = el.getContext('2d')
      const data = ctx.getImageData(0, 0, el.width, el.height).data
      return data.some(byte => byte !== 0)
    })
    expect(hasContent).toBe(true)
  })
})
