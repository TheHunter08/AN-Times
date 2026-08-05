import { test, expect } from '@playwright/test'
import { employee, loginAsAdmin, loginAsEmployee } from './helpers/session.js'

// PDF válido mínimo (una página, sin texto) generado con pdf-lib para poder
// probar el estampado real de la firma (stampSignatureOnPdf usa pdf-lib para
// cargarlo, no aceptaría un placeholder inválido).
const PDF_DATA_URL = 'data:application/pdf;base64,JVBERi0xLjcKJYGBgYEKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAxMTIKPj4Kc3RyZWFtCnicHcoxCgJRDEXR/q0itSDmZ/Jf/oBYCDNY2AjZgMgoihaKuH5Hud3hPrFNqPx6XbDaTffP9L6ejsvQvnnTaL0USp5hLrlH+a9FXMWqSj6w9o4jh/AwlnCOpnRW09CwqKycfSN5Qy4wJA74AgrwGVYKZW5kc3RyZWFtCmVuZG9iagoKNyAwIG9iago8PAovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvT2JqU3RtCi9OIDUKL0ZpcnN0IDI2Ci9MZW5ndGggMzU5Cj4+CnN0cmVhbQp4nNVSTUvDQBC976+Yox5kJ5tvKYW2SRSkKK2gKB7SZCmRsivJVuq/dyZJLT2IZwmP3Zl5s/s28zxAUBAE4EOcQAChryCE2PNgMhHy8etDg3wot7oT8q6pO3glDsIK3oRc2L1x4InpVJy4i9KVO7sVQxN4TD4yHlpb7yvdwqTIiwIxRsQoIESIKqN1QUgJimKqqYT2hDgYQbnYR/RnVCsGRPHQw/WeG479Oa3EjZiTDdwgGeKfe/mufDhD/aUnnQq5tHVWOg0X2bVCFWGCIQYq9NOXS/odrS6d/b+P6/U31vz6wrM583h5yK1mD/RTlivd2X1b0diZV1iq8OZW7z61a6ryKsY0IZ1xkpLHRmPI5/vNu656Kof5wd2sHWsYEpxb6rop5/ZA7kP66OU9yIMzY6xjV/Z+NI7UcBSNHj2TzIKEXO83rg856Qk5LzvdSz3pJBGmsnVjtiCfGjMzXXNM8InfLcXF5wplbmRzdHJlYW0KZW5kb2JqCgo4IDAgb2JqCjw8Ci9TaXplIDkKL1Jvb3QgMiAwIFIKL0luZm8gMyAwIFIKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL1R5cGUgL1hSZWYKL0xlbmd0aCA0MAovVyBbIDEgMiAyIF0KL0luZGV4IFsgMCA5IF0KPj4Kc3RyZWFtCnicFcSxEQAgDAOxt8MdLdOzE1MlWIWAbrMhKTlVWuKAeD9fGGGsA6oKZW5kc3RyZWFtCmVuZG9iagoKc3RhcnR4cmVmCjY2MgolJUVPRg=='

async function openAdminPage(page, group, item) {
  const menu = page.getByRole('button', { name: /Abrir menú/i })
  if (await menu.isVisible()) await menu.click()
  const nav = page.getByRole('navigation', { name: 'Navegación principal', exact: true })
  const itemName = new RegExp(`^${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i')
  const itemButton = nav.getByRole('button', { name: itemName })
  if (!await itemButton.isVisible()) await nav.getByRole('button', { name: group, exact: true }).click()
  await itemButton.click()
}

async function openEmployeeDocuments(page) {
  await expect(page.getByRole('button', { name: /Iniciar jornada.*Mantén pulsado/i })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Perfil', exact: true }).last().click()
  await page.getByRole('button', { name: /^Documentos/i }).click()
  await expect(page.getByRole('dialog', { name: 'Documentos' })).toBeVisible()
}

// loginAsEmployee/loginAsAdmin bloquean TODO supabase.co para no depender de
// red real. Eso deja sin respuesta las llamadas REST de sincronización
// (app_data), que entran en su motor de reintentos con backoff — ruido que
// puede volver a escribir en localStorage una instantánea previa a media
// prueba. Este stub (registrado después, con prioridad) responde con éxito
// vacío a esas llamadas para que la sincronización no reintente, sin que
// ninguna petición real salga hacia Supabase.
async function stubRestSuccess(page) {
  await page.route(/supabase\.co\/rest\/v1\//i, route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
}

// Simula el bucket de Storage: createSignedUrl (POST) + la descarga real del
// PDF (GET con el token devuelto). loginAsEmployee/loginAsAdmin registran su
// propio abort-all DESPUÉS de cada llamada — como Playwright ejecuta el
// handler más reciente primero, hay que volver a registrar esto tras cada
// login para que siga teniendo prioridad sobre ese abort-all.
async function mockStorageSigning(page, pdfDataUrl, onSignRequest) {
  await page.route(/supabase\.co\/storage\/v1\//i, async route => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'POST' && url.pathname.includes('/object/sign/')) {
      onSignRequest?.()
      const afterSign = url.pathname.split('/object/sign/')[1]
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedURL: `/object/sign/${afterSign}?token=faketoken` }) })
    }
    if (req.method() === 'GET' && url.pathname.includes('/object/sign/') && url.search.includes('token=faketoken')) {
      const bytes = Buffer.from(pdfDataUrl.split(',')[1], 'base64')
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: bytes })
    }
    return route.continue()
  })
}

test('empleado firma un documento subido en base64 y el admin lo ve firmado con su contenido', async ({ page }) => {
  await loginAsEmployee(page, {
    documentos: [{
      id: 'doc-b64', empId: employee.id, empName: employee.name, tipo: 'contrato',
      nombre: 'Contrato.pdf', data: PDF_DATA_URL, mime: 'application/pdf', size: '2 KB',
      createdAt: new Date().toISOString(),
    }],
  })
  await stubRestSuccess(page)
  await page.goto('/')
  await openEmployeeDocuments(page)

  // El título mostrado viene de `nombre` (el admin no guarda `titulo`) — sin
  // el fallback añadido, esta tarjeta mostraría "undefined".
  await expect(page.getByText('Pendientes de firma (1)')).toBeVisible()
  await expect(page.getByText('Contrato.pdf')).toBeVisible()

  await page.getByRole('button', { name: 'Ver' }).click()
  await expect(page.getByText('Sin contenido adjunto')).toHaveCount(0)
  await expect(page.locator('iframe')).toBeVisible({ timeout: 10000 })

  await page.getByRole('button', { name: 'Firmar', exact: true }).click()
  await expect(page.getByText('Tu firma guardada:')).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar y firmar' }).click()
  await expect(page.getByText('Documento firmado correctamente')).toBeVisible({ timeout: 8000 })

  // Captura el registro persistido justo tras el toast, antes de que el motor
  // de reintentos offline (red bloqueada a propósito en este test) drene su
  // cola de reintentos y sobrescriba localStorage con una instantánea previa
  // al firmado — ruido propio de simular "sin red", no del flujo de firma.
  const signedDoc = await page.evaluate(() => JSON.parse(localStorage.getItem('an_times_v1')).documentos[0])
  expect(signedDoc.firma).toBeTruthy()
  expect(signedDoc.fileData).toMatch(/^data:application\/pdf;base64,/)

  await expect(page.getByText('Firmados (1)')).toBeVisible()
  await expect(page.getByText(/· Firmado/)).toBeVisible()
  await expect(page.getByRole('img', { name: 'firma' })).toBeVisible()

  // Verifica que el contenido firmado se puede volver a ver (no queda vacío)
  await page.getByRole('button', { name: 'Ver' }).click()
  await expect(page.getByText('Sin contenido adjunto')).toHaveCount(0)
  await expect(page.locator('iframe')).toBeVisible({ timeout: 10000 })

  // El administrador debe ver el mismo documento ya firmado, con badge y
  // poder descargarlo — usamos el registro real que dejó el empleado.
  await loginAsAdmin(page, { documentos: [signedDoc] })
  await stubRestSuccess(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 })
  await openAdminPage(page, 'Gestión', 'Documentos')
  await expect(page.getByRole('heading', { name: 'Documentos', exact: true })).toBeVisible()
  await expect(page.getByText(/✓ Firmado/)).toBeVisible()

  let downloadHref = null
  await page.exposeFunction('__captureDownload', href => { downloadHref = href })
  await page.evaluate(() => {
    const orig = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () { window.__captureDownload(this.href); return orig.call(this) }
  })
  await page.getByRole('button', { name: 'Descargar' }).click()
  await expect.poll(() => downloadHref).toMatch(/^data:application\/pdf;base64,/)
})

test('empleado firma un documento guardado solo en Storage (sin base64 local)', async ({ page }) => {
  const storagePath = `${employee.id}/doc-storage.pdf`
  let signRequests = 0
  await loginAsEmployee(page, {
    documentos: [{
      id: 'doc-storage', empId: employee.id, empName: employee.name, tipo: 'nomina',
      nombre: 'Nomina.pdf', storagePath, mime: 'application/pdf', size: '3 KB',
      createdAt: new Date().toISOString(),
    }],
  })
  await mockStorageSigning(page, PDF_DATA_URL, () => { signRequests += 1 })
  await stubRestSuccess(page)

  await page.goto('/')
  await openEmployeeDocuments(page)
  await expect(page.getByText('Nomina.pdf')).toBeVisible()

  await page.getByRole('button', { name: 'Ver' }).click()
  await expect(page.getByText('Sin contenido adjunto')).toHaveCount(0)
  // Una URL .pdf de Storage (no data:) se muestra con enlaces Abrir/Descargar
  // (role="link", son <a>, no <button>) en vez de iframe — comportamiento
  // intencional de DocPreview.jsx para URLs externas .pdf.
  await expect(page.getByRole('link', { name: 'Abrir' })).toBeVisible({ timeout: 10000 })
  expect(signRequests).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Firmar', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar y firmar' }).click()
  await expect(page.getByText('Documento firmado correctamente')).toBeVisible({ timeout: 8000 })

  const signedDoc = await page.evaluate(() => JSON.parse(localStorage.getItem('an_times_v1')).documentos[0])
  expect(signedDoc.firma).toBeTruthy()
  // Aunque el original vivía solo en Storage, tras firmar el contenido
  // definitivo (con la firma estampada) queda en fileData.
  expect(signedDoc.fileData).toMatch(/^data:application\/pdf;base64,/)
  expect(signedDoc.storagePath).toBe(storagePath)

  // El admin debe ver el documento firmado usando fileData directamente, sin
  // volver a pedir una URL firmada del original (que ya no lleva la firma).
  await loginAsAdmin(page, { documentos: [signedDoc] })
  const signRequestsBeforeAdmin = signRequests
  await mockStorageSigning(page, PDF_DATA_URL, () => { signRequests += 1 })
  await stubRestSuccess(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 })
  await openAdminPage(page, 'Gestión', 'Documentos')
  await expect(page.getByText(/✓ Firmado/)).toBeVisible()
  await page.getByRole('button', { name: 'Ver' }).click()
  expect(signRequests).toBe(signRequestsBeforeAdmin)
})
