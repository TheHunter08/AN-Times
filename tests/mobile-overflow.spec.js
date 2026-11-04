import { test, expect } from '@playwright/test'
import { loginAsAdmin, loginAsEmployee, employee } from './helpers/session.js'

// 320px: el móvil más estrecho realista (gama baja/antigua) — más exigente
// que el iPhone SE (375px). Si una página desborda aquí, también lo hará en
// dispositivos más anchos, así que cubre el caso general.
const WIDTH = 320

async function openSection(page, group, item) {
  // Este clic es también la regresión real que motivó este archivo: a
  // ≤760px, "Abrir menú" y "Abrir centro de mando" quedaban exactamente
  // superpuestos (justify-content:flex-end sin resetear en el breakpoint
  // móvil — ver Header.tsx) y el primero dejaba de recibir clics. Si eso
  // vuelve a pasar, este helper se queda colgado aquí, no solo el chequeo
  // de desbordamiento de abajo.
  const menu = page.getByRole('button', { name:/Abrir menú/i })
  if (await menu.isVisible()) await menu.click()
  const nav = page.getByRole('navigation', { name:'Navegación principal', exact:true })
  const itemName = new RegExp(`^${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i')
  const groupName = new RegExp(`^${group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i')
  const itemButton = nav.getByRole('button', { name:itemName })
  if (!await itemButton.isVisible()) await nav.getByRole('button', { name:groupName }).click()
  await itemButton.click()
}

async function assertNoHorizontalOverflow(page, label) {
  await page.waitForTimeout(200)
  const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
  expect(widths.scroll, `${label} desborda horizontalmente a ${WIDTH}px (scrollWidth ${widths.scroll} > clientWidth ${widths.client})`).toBeLessThanOrEqual(widths.client + 1)
}

const ADMIN_PAGES = [
  ['Principal', 'Dashboard'], ['Principal', 'Centro de pendientes'],
  ['Equipo', 'Empleados'], ['Equipo', 'En línea'], ['Equipo', 'Fichajes'], ['Equipo', 'Planning'], ['Equipo', 'Turnos'],
  ['Gestión', 'Validar horas'], ['Gestión', 'Solicitudes'], ['Gestión', 'Vacaciones'], ['Gestión', 'Gastos'],
  ['Gestión', 'Obras'], ['Gestión', 'Centros de trabajo'], ['Gestión', 'Vehículos'], ['Gestión', 'Documentos'],
  ['Análisis', 'Resumen'], ['Análisis', 'Estadísticas'], ['Análisis', 'Cumplimiento'], ['Análisis', 'Cierre mensual'],
  ['Análisis', 'Anomalías'], ['Análisis', 'Auditoría'],
  ['Comunicación', 'Mensajes'], ['Comunicación', 'Notificaciones'],
  ['Sistema', 'Centro operativo'], ['Sistema', 'Cuentas con incidencia'],
]

test('panel de administración: ninguna página desborda horizontalmente en un móvil estrecho', async ({ page }) => {
  await page.setViewportSize({ width: WIDTH, height: 700 })
  // Nombres largos deliberados: el desbordamiento casi siempre aparece con
  // contenido real (texto largo), no con los datos cortos de los fixtures.
  await loginAsAdmin(page, {
    employees: [
      { id:'e1', name:'Empleado Prueba con Nombre Bastante Largo', email:'empleado@empresa.com', role:'encargado', baja:false, centroTrabajo:'Obra Principal con Nombre Largo' },
      { id:'e2', name:'María José González Fernández de la Torre', email:'maria@empresa.com', role:'empleado', baja:false, centroTrabajo:'Obra Principal con Nombre Largo', fichajeNivel:'qr' },
    ],
    records: [{ id:'r1', empId:'e1', empName:'Empleado Prueba con Nombre Bastante Largo', inicio:new Date(Date.now()-3600000).toISOString(), fin:null }],
    vacaciones: [{ id:'v1', empId:'e2', empName:'María José González Fernández de la Torre', estado:'pendiente', inicio:'2026-11-10', fin:'2026-11-14' }],
    gastos: [{ id:'g1', empId:'e1', empName:'Empleado Prueba con Nombre Bastante Largo', estado:'pendiente', importe:45.5, concepto:'Dietas y desplazamiento a obra' }],
    obras: [{ id:'o1', nombre:'Obra Principal con Nombre Largo', lat:40.4, lng:-3.7, radio:200 }],
    vehiculos: [{ id:'veh1', matricula:'1234ABC', modelo:'Furgoneta Transit Larga', asignadoA:'e1' }],
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name:'Dashboard' })).toBeVisible({ timeout:15000 })
  await assertNoHorizontalOverflow(page, 'Dashboard')

  for (const [group, item] of ADMIN_PAGES.slice(1)) {
    await openSection(page, group, item)
    await assertNoHorizontalOverflow(page, item)
  }
})

test('vista empleado: ninguna pestaña desborda horizontalmente en un móvil estrecho', async ({ page }) => {
  await page.setViewportSize({ width: WIDTH, height: 700 })
  await loginAsEmployee(page, {
    vacaciones: [{ id:'v1', empId:employee.id, empName:employee.name, estado:'pendiente', inicio:'2026-11-10', fin:'2026-11-14' }],
    gastos: [{ id:'g1', empId:employee.id, empName:employee.name, estado:'pendiente', importe:45.5, concepto:'Dietas y desplazamiento a obra con descripción larga' }],
    records: [{ id:'r1', empId:employee.id, empName:employee.name, inicio:new Date(Date.now()-3600000).toISOString(), fin:null }],
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name:/Iniciar jornada|Finalizar jornada/i })).toBeVisible({ timeout:15000 })
  await assertNoHorizontalOverflow(page, 'Inicio')

  for (const tab of ['Jornada', 'Vacaciones', 'Calendario', 'Turnos']) {
    await page.getByRole('button', { name: tab, exact: true }).last().click()
    await assertNoHorizontalOverflow(page, tab)
  }
  await page.getByRole('button', { name: 'Perfil', exact: true }).last().click()
  await assertNoHorizontalOverflow(page, 'Perfil')
  for (const sub of ['Gastos', 'Denuncia', 'Actualizaciones']) {
    await page.getByRole('button', { name: new RegExp(`^${sub}`) }).first().click()
    await assertNoHorizontalOverflow(page, `Perfil > ${sub}`)
    await page.getByRole('button', { name: /Volver a Perfil/i }).click()
  }
})
