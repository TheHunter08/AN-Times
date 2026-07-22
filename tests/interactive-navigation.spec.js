import { test, expect } from '@playwright/test'
import { employee, loginAsAdmin, loginAsEmployee } from './helpers/session.js'

async function openAdminPage(page, group, item) {
  const menu = page.getByRole('button', { name:/Abrir menú/i })
  if (await menu.isVisible()) await menu.click()
  const nav = page.getByRole('navigation', { name:'Navegación principal', exact:true })
  const itemName = new RegExp(`^${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i')
  const itemButton = nav.getByRole('button', { name:itemName })
  if (!await itemButton.isVisible()) await nav.getByRole('button', { name:group, exact:true }).click()
  await itemButton.click()
}

test('los KPI y paneles del dashboard abren su detalle', async ({ page }) => {
  await loginAsAdmin(page, {
    employees: [employee],
    records: [{ id:'r-open', empId:employee.id, empName:employee.name, inicio:new Date().toISOString(), fin:null }],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })

  await page.getByRole('button', { name:/Empleados activos: 1.*Abrir detalle/i }).click()
  await expect(page.getByRole('heading', { name:'Empleados', exact:true })).toBeVisible()

  const dashboardNav = page.getByRole('button', { name:'Dashboard', exact:true })
  if (!await dashboardNav.isVisible()) await page.getByRole('button', { name:/Abrir menú/i }).click()
  await dashboardNav.click()
  await page.getByRole('button', { name:/Trabajando ahora: 1.*Abrir detalle/i }).click()
  await expect(page.getByRole('heading', { name:/Equipo en línea/i })).toBeVisible()
  await page.getByRole('button', { name:/Empleado Prueba, trabajando.*Abrir fichajes/i }).click()
  await expect(page.getByRole('heading', { name:'Fichajes', exact:true })).toBeVisible()

  await openAdminPage(page, 'Principal', 'Dashboard')
  await page.getByRole('button', { name:/Abrir estadísticas de horas trabajadas/i }).click()
  await expect(page.getByRole('heading', { name:'Estadísticas del mes' })).toBeVisible()
  await page.getByRole('button', { name:/Empleados activos: 1.*Abrir detalle/i }).click()
  await expect(page.getByRole('heading', { name:'Empleados', exact:true })).toBeVisible()
})

test('los KPI y filas de anomalías filtran y abren fichajes', async ({ page }) => {
  const start = new Date(Date.now() - 11 * 3600000).toISOString()
  await loginAsAdmin(page, {
    employees:[employee],
    records:[{ id:'r-long', empId:employee.id, empName:employee.name, inicio:start, fin:new Date().toISOString(), breaks:[] }],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openAdminPage(page, 'Análisis', 'Anomalías')
  await page.getByRole('button', { name:/Severidad alta: 1.*Aplicar filtro/i }).click()
  await page.getByRole('button', { name:/Empleado Prueba: Jornada de 11.*Abrir fichajes/i }).click()
  await expect(page.getByRole('heading', { name:'Fichajes', exact:true })).toBeVisible()
})

test('el centro operativo abre los detalles relacionados', async ({ page }) => {
  await loginAsAdmin(page, { employees:[
    { ...employee, email:'empleado@times.test', authId:'auth-e1' },
    { id:'admin', name:'Administrador', email:'admin@times.test', authId:'auth-admin', role:'admin', isAdmin:true, baja:false },
  ] })
  await page.route(/supabase\.co\/rest\/v1\/push_subs.*select=user_id/i, route => route.fulfill({
    status:200, contentType:'application/json', body:JSON.stringify([{ user_id:employee.id }]),
  }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openAdminPage(page, 'Sistema', 'Centro operativo')

  await expect(page.getByRole('button', { name:/Firmas obligatorias: 1\/1 registradas/i })).toBeVisible()
  await expect(page.getByRole('button', { name:/Dispositivos: 1\/1 registrados/i })).toBeVisible()
  await expect(page.getByRole('button', { name:/Validaciones reales: Ninguna pendiente/i })).toBeVisible()
  await expect(page.getByText('Equipo preparado para el lanzamiento')).toBeVisible()

  await page.getByRole('button', { name:/Acceso seguro: \d+\/\d+ vinculados.*Revisar empleados/i }).click()
  await expect(page.getByRole('heading', { name:'Empleados', exact:true })).toBeVisible()

  await openAdminPage(page, 'Sistema', 'Centro operativo')
  await page.getByRole('button', { name:'Abrir cumplimiento', exact:true }).click()
  await expect(page.getByRole('heading', { name:'Centro de cumplimiento', exact:true })).toBeVisible()
})

test('el centro operativo identifica cada perfil incompleto', async ({ page }) => {
  await loginAsAdmin(page, { firmas:{}, employees:[{ ...employee, email:'', authId:null }] })
  await page.route(/supabase\.co\/rest\/v1\/push_subs.*select=user_id/i, route => route.fulfill({
    status:200, contentType:'application/json', body:'[]',
  }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openAdminPage(page, 'Sistema', 'Centro operativo')

  const blocker = page.getByRole('button', { name:/Revisar Empleado Prueba.*Falta email.*Falta crear acceso.*Falta firma.*Falta activar notificaciones/i })
  await expect(blocker).toBeVisible()
  await blocker.click()
  await expect(page.getByRole('heading', { name:'Empleados', exact:true })).toBeVisible()
  await expect(page.getByText('Editar empleado', { exact:true })).toBeVisible()
  await expect(page.getByPlaceholder('Ej: Juan García')).toHaveValue('Empleado Prueba')
})

test('solicitudes, gastos y documentos abren su contexto', async ({ page }) => {
  await loginAsAdmin(page, {
    vacaciones:[{ id:'v1', empId:employee.id, empName:employee.name, tipo:'vacaciones', estado:'pendiente', fechaInicio:'2026-07-20', fechaFin:'2026-07-21', ts:new Date().toISOString() }],
    gastos:[{ id:'g1', empId:employee.id, empName:employee.name, categoria:'transporte', concepto:'Taxi', importe:12.5, estado:'pendiente', ts:new Date().toISOString() }],
    documentos:[{ id:'d1', empId:employee.id, empName:employee.name, tipo:'contrato', nombre:'Contrato de prueba.pdf', size:'20 KB', createdAt:new Date().toISOString(), url:'about:blank#document-preview' }],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })

  await openAdminPage(page, 'Gestión', 'Solicitudes')
  await page.getByRole('button', { name:/Pendientes: 1.*Filtrar solicitudes/i }).click()
  await page.getByRole('button', { name:'Abrir fichajes de Empleado Prueba', exact:true }).click()
  await expect(page.getByRole('heading', { name:'Fichajes', exact:true })).toBeVisible()

  await openAdminPage(page, 'Gestión', 'Gastos')
  await page.getByRole('button', { name:/Pendiente de aprobar:.*Filtrar gastos/i }).click()
  await page.getByRole('button', { name:'Abrir fichajes de Empleado Prueba', exact:true }).click()
  await expect(page.getByRole('heading', { name:'Fichajes', exact:true })).toBeVisible()

  await openAdminPage(page, 'Gestión', 'Documentos')
  const preview = page.waitForEvent('popup')
  await page.getByRole('button', { name:'Ver', exact:true }).click()
  const previewPage = await preview
  await expect(previewPage).toHaveURL(/#document-preview$/)
  await previewPage.close()
})

test('planning y turnos abren los fichajes del empleado', async ({ page }) => {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const dayLabel = now.toLocaleDateString('es-ES', { weekday:'short', day:'numeric' })
  const dayName = now.toLocaleDateString('es-ES', { weekday:'short' }).replace(/[.,]/g, '')
  await loginAsAdmin(page, {
    records:[{ id:'r-plan', empId:employee.id, empName:employee.name, inicio:`${date}T08:00:00.000Z`, fin:`${date}T16:00:00.000Z`, breaks:[] }],
    turnos:[{ id:'t1', empId:employee.id, fecha:date, tipo:'normal', horaInicio:'08:00', horaFin:'16:00' }],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })

  await openAdminPage(page, 'Equipo', 'Planning')
  await page.getByRole('button', { name:new RegExp(`${dayLabel}: 8h.*Abrir fichajes de Empleado Prueba`, 'i') }).click()
  await expect(page.getByRole('heading', { name:'Fichajes', exact:true })).toBeVisible()

  await openAdminPage(page, 'Equipo', 'Turnos')
  await page.getByRole('button', { name:new RegExp(`${dayName}: 08:00 a 16:00.*Abrir fichajes de Empleado Prueba`, 'i') }).click()
  await expect(page.getByRole('heading', { name:'Fichajes', exact:true })).toBeVisible()
})

test('cierres, auditoría y obras ofrecen contexto interactivo', async ({ page }) => {
  const ts = new Date().toISOString()
  await loginAsAdmin(page, {
    cierres:[
      { id:'c-signed', empId:employee.id, empName:employee.name, mes:'2026-06', estado:'firmado', firmaEmp:{ ts }, firmaAdmin:true, records_snapshot:[], _upd:ts },
      { id:'c-pending', empId:employee.id, empName:employee.name, mes:'2026-05', estado:'pendiente', firmaEmp:null, firmaAdmin:null, records_snapshot:[], _upd:ts },
    ],
    audit:[{ id:'a-doc', action:'Documento descargado', user:'Admin', detail:'Contrato de prueba', ts }],
    obras:[{ id:'o1', nombre:'Obra Premium', coords:'40.4168,-3.7038', activa:true, fechaInicio:'2026-07-01', createdAt:ts }],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })

  await openAdminPage(page, 'Análisis', 'Cierre mensual')
  await page.getByRole('button', { name:'Filtrar cierres: Pendientes de firma', exact:true }).click()
  await expect(page.locator('.uiv2-close-row')).toHaveCount(1)
  await expect(page.getByRole('button', { name:'Filtrar cierres: Pendientes de firma', exact:true })).toHaveAttribute('aria-pressed', 'true')
  await page.locator('input[aria-label="Seleccionar cierre de Empleado Prueba"]:not([disabled])').check()
  await expect(page.getByRole('status', { name:'1 cierre seleccionado', exact:true })).toBeVisible()
  await page.getByRole('button', { name:'Revisar y firmar', exact:true }).click()
  await expect(page.getByRole('dialog', { name:'Confirmar firma administrativa en lote', exact:true })).toBeVisible()
  await page.getByRole('button', { name:'Firmar 1 cierre', exact:true }).click()
  await expect(page.getByRole('checkbox', { name:'Seleccionar cierre de Empleado Prueba', exact:true })).toBeDisabled()

  await openAdminPage(page, 'Análisis', 'Auditoría')
  await expect(page.getByText('Cierres firmados en lote', { exact:true })).toBeVisible()
  await page.getByRole('button', { name:/Abrir módulo relacionado con Documento descargado/i }).click()
  await expect(page.getByRole('heading', { name:'Documentos', exact:true })).toBeVisible()

  await openAdminPage(page, 'Gestión', 'Obras')
  await page.getByRole('button', { name:'Ver detalle de la obra Obra Premium', exact:true }).click()
  await expect(page.getByRole('dialog', { name:'Detalle de la obra Obra Premium', exact:true })).toBeVisible()
  await page.getByRole('button', { name:/Ver equipo de empleados/i }).click()
  await expect(page.getByRole('heading', { name:'Empleados', exact:true })).toBeVisible()
})

test('las horas se atribuyen a la obra fichada sin duplicarse entre asignaciones', async ({ page }) => {
  const now = new Date()
  const startA = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0)
  const endA = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0)
  const startB = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0)
  const endB = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0)
  await loginAsAdmin(page, {
    employees:[{ ...employee, obrasAsignadas:['obra-a', 'obra-b'] }],
    obras:[
      { id:'obra-a', nombre:'Reforma Centro', activa:true },
      { id:'obra-b', nombre:'Nave Norte', activa:true },
    ],
    records:[
      { id:'r-a', empId:employee.id, inicio:startA.toISOString(), fin:endA.toISOString(), centro:'Reforma Centro', breaks:[] },
      { id:'r-b', empId:employee.id, inicio:startB.toISOString(), fin:endB.toISOString(), centro:'Nave Norte', breaks:[] },
    ],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openAdminPage(page, 'Gestión', 'Obras')

  await page.getByRole('button', { name:'Ver detalle de la obra Reforma Centro', exact:true }).click()
  const detailA = page.getByRole('dialog', { name:'Detalle de la obra Reforma Centro', exact:true })
  await expect(detailA.getByText('2h', { exact:true })).toBeVisible()
  await detailA.getByRole('button', { name:'Cerrar detalle de la obra', exact:true }).click()

  await page.getByRole('button', { name:'Ver detalle de la obra Nave Norte', exact:true }).click()
  const detailB = page.getByRole('dialog', { name:'Detalle de la obra Nave Norte', exact:true })
  await expect(detailB.getByText('1h', { exact:true })).toBeVisible()
})

test('una obra nueva conserva coordenadas válidas para geofencing', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await openAdminPage(page, 'Gestión', 'Obras')
  await page.getByRole('button', { name:'Nueva obra', exact:true }).click()

  const dialog = page.getByRole('dialog', { name:'Nueva obra', exact:true })
  await dialog.getByRole('textbox', { name:'Nombre de la obra', exact:true }).fill('Obra Geovalla')
  await dialog.getByRole('textbox', { name:'Coordenadas GPS', exact:true }).fill('18.4861, -69.9312')
  await dialog.getByRole('button', { name:'Crear obra', exact:true }).click()

  await page.getByRole('button', { name:'Ver detalle de la obra Obra Geovalla', exact:true }).click()
  const detail = page.getByRole('dialog', { name:'Detalle de la obra Obra Geovalla', exact:true })
  await expect(detail.getByText('GPS: 18.48610, -69.93120', { exact:true })).toBeVisible()
})

test('una modificación conserva trazabilidad en auditoría y cierre mensual', async ({ page }) => {
  const base = new Date()
  base.setDate(Math.max(2, base.getDate() - 2))
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 6, 0)
  const end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 15, 0)
  const month = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`
  const ts = new Date().toISOString()
  await loginAsAdmin(page, {
    records:[{ id:'r-trace', empId:employee.id, empName:employee.name, inicio:start.toISOString(), fin:end.toISOString(), breaks:[], aceptada:false, validado:false, _upd:ts }],
    cierres:[{ id:'c-trace', empId:employee.id, empName:employee.name, mes:month, estado:'pendiente', records_snapshot:[], firmaEmp:null, firmaAdmin:null, _upd:ts }],
  })
  await page.route(/supabase\.co\/rest\/v1\/records/i, route => route.fulfill({ status:201, contentType:'application/json', body:'[]' }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })

  await openAdminPage(page, 'Equipo', 'Fichajes')
  await page.getByRole('button', { name:'Modificar fichaje de Empleado Prueba', exact:true }).click()
  await page.getByRole('textbox', { name:'Entrada de Empleado Prueba', exact:true }).fill('07:15')
  await page.getByRole('textbox', { name:'Salida de Empleado Prueba', exact:true }).fill('15:45')
  await page.getByRole('textbox', { name:'Motivo de modificación de Empleado Prueba', exact:true }).fill('Ajuste autorizado por supervisión')
  await page.getByRole('button', { name:'Guardar fichaje de Empleado Prueba', exact:true }).click()
  const updatedEntry = (page.viewportSize()?.width || 1000) < 700
    ? page.locator('.uiv2-table-mobile-value', { hasText:'07:15' }).first()
    : page.getByText('07:15', { exact:true }).first()
  await expect(updatedEntry).toBeVisible()

  await openAdminPage(page, 'Análisis', 'Auditoría')
  await expect(page.getByText('Fichaje modificado', { exact:true })).toBeVisible()
  await expect(page.getByText(/Android · Chrome|Linux · Chrome|Windows · Chrome|macOS · Chrome/).first()).toBeVisible()
  await page.getByRole('button', { name:'Ver trazabilidad', exact:true }).click()
  await expect(page.getByText('Motivo: Ajuste autorizado por supervisión', { exact:true })).toBeVisible()

  await openAdminPage(page, 'Análisis', 'Cierre mensual')
  await page.getByRole('button', { name:'Ver', exact:true }).click()
  const closeDialog = page.getByRole('dialog', { name:/Cierre mensual de Empleado Prueba/i })
  await expect(closeDialog).toBeVisible()
  await expect(closeDialog.getByText('07:15', { exact:true })).toBeVisible()
  await expect(closeDialog.getByText('15:45', { exact:true })).toBeVisible()
  await expect(page.getByText('Trazabilidad de modificaciones', { exact:true })).toBeVisible()
  await expect(page.getByText(/Ajuste autorizado por supervisión.*Chrome/)).toBeVisible()
})

test('una notificación admin abre la pantalla relacionada', async ({ page }) => {
  await loginAsAdmin(page, {
    notis: [{
      id:'n-admin', empId:'__admin__', action:'Nueva solicitud de vacaciones',
      detail:'Empleado Prueba', ts:new Date().toISOString(), leido:false,
    }],
  })
  await page.goto('/')
  await page.getByRole('button', { name:/Notificaciones, 1 sin leer/i }).click()
  await page.getByRole('button', { name:/Nueva solicitud de vacaciones.*Abrir detalle/i }).click()
  await expect(page.getByRole('heading', { name:'Solicitudes', exact:true })).toBeVisible()
})

test('una notificación admin respeta un destino explícito', async ({ page }) => {
  await loginAsAdmin(page, {
    notis: [{
      id:'n-admin-target', empId:'__admin__', action:'Aviso del sistema',
      detail:'Hay documentación pendiente', target:'/?go=admin%3Adocumentos',
      ts:new Date().toISOString(), leido:false,
    }],
  })
  await page.goto('/')
  await page.getByRole('button', { name:/Notificaciones, 1 sin leer/i }).click()
  await page.getByRole('button', { name:/Aviso del sistema.*Abrir detalle/i }).click()
  await expect(page.getByRole('heading', { name:'Documentos', exact:true })).toBeVisible()
})

test('una notificación de empleado abre su sección', async ({ page }) => {
  await loginAsEmployee(page, {
    notis: [{
      id:'n-employee', empId:employee.id, action:'Vacaciones aprobadas',
      detail:'Tu solicitud ha sido aprobada', ts:new Date().toISOString(), leido:false,
    }],
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name:/Iniciar jornada.*Mantén pulsado/i })).toBeVisible({ timeout:15000 })
  await page.getByRole('button', { name:/Notificaciones/i }).last().click()
  await page.getByRole('button', { name:/Vacaciones aprobadas.*Abrir detalle/i }).click()
  await expect(page.getByText(/Solicitar vacaciones|Vacaciones/i).first()).toBeVisible()
})

test('una notificación de empleado respeta el destino explícito', async ({ page }) => {
  await loginAsEmployee(page, {
    notis: [{
      id:'n-employee-target', empId:employee.id, action:'Tienes una novedad',
      detail:'Abre tus documentos', target:'/?go=emp%3Adocumentos',
      ts:new Date().toISOString(), leido:false,
    }],
  })
  await page.goto('/')
  await page.getByRole('button', { name:/Notificaciones/i }).last().click()
  await page.getByRole('button', { name:/Tienes una novedad.*Abrir detalle/i }).click()
  await expect(page.getByRole('dialog', { name:'Documentos' })).toBeVisible()
})

test('una notificación eliminada por el empleado se quita también del almacenamiento', async ({ page }) => {
  await loginAsEmployee(page, {
    notis: [{
      id:'n-employee-delete', empId:employee.id, action:'Aviso para eliminar',
      detail:'No debe volver', ts:new Date().toISOString(), leido:false,
    }],
  })
  await page.goto('/')
  await page.getByRole('button', { name:/Notificaciones/i }).last().click()
  await page.getByRole('button', { name:'Eliminar notificación', exact:true }).click()
  await expect(page.getByText('Sin notificaciones', { exact:true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('an_times_v1') || '{}')
    return (db.notis || []).some(item => item.id === 'n-employee-delete')
  })).toBe(false)
})

test('un clic push abre también los destinos que son modales', async ({ page }) => {
  await loginAsEmployee(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name:/Iniciar jornada.*Mantén pulsado/i })).toBeVisible({ timeout:15000 })
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('push-deeplink', { detail:'/?go=emp%3Amensajes' })))
  await expect(page.getByRole('dialog', { name:'Chat con administración', exact:true })).toBeVisible()
})
