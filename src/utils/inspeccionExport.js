// ── Registro diario de jornada — Art. 34.9 ET (RD-ley 8/2019) ─────────────────
// Genera el registro horario oficial que la empresa debe conservar 4 años y
// tener a disposición de la Inspección de Trabajo: día a día del mes completo,
// con identificación de empresa (CIF) y trabajador (DNI), entrada/salida,
// pausas, totales y espacio de firmas. Excel (una hoja por empleado) y HTML
// imprimible (una página por empleado).
import { calcMin, recWorkSecs, mhm, p2, monthlyExtras } from './time.js'

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const ftimeShort = iso => {
  const d = new Date(iso)
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`
}

// Datos día a día del mes completo para un empleado.
function buildEmpDays(db, emp, month) {
  const [y, mo] = month.split('-').map(Number)
  const daysInMonth = new Date(y, mo, 0).getDate()
  const recs = (db.records || [])
    .filter(r => r.empId === emp.id && r.fin && r.inicio?.startsWith(month))
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
  const vacs = (db.vacaciones || []).filter(v => v.empId === emp.id && v.estado === 'aprobada')

  const days = []
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${month}-${p2(d)}`
    const dow = new Date(dateStr + 'T00:00:00').getDay()
    const dayRecs = recs.filter(r => r.inicio.startsWith(dateStr))
    const enVacaciones = vacs.some(v => v.fechaInicio <= dateStr && dateStr <= v.fechaFin)
    if (dayRecs.length) {
      const workMin = dayRecs.reduce((s, r) => s + calcMin(r), 0)
      const brkMin = dayRecs.reduce((s, r) => s + Math.floor((r.breakSecs || 0) / 60), 0)
      days.push({
        dateStr, d, dow,
        entrada: ftimeShort(dayRecs[0].inicio),
        salida: ftimeShort(dayRecs[dayRecs.length - 1].fin),
        brkMin, workMin,
        obs: dayRecs.length > 1 ? `${dayRecs.length} tramos` : '',
      })
    } else {
      days.push({
        dateStr, d, dow,
        entrada: '', salida: '', brkMin: 0, workMin: 0,
        obs: enVacaciones ? 'Vacaciones' : (dow === 0 || dow === 6) ? 'Descanso semanal' : '',
      })
    }
  }
  const totalMin = days.reduce((s, x) => s + x.workMin, 0)
  const totalBrk = days.reduce((s, x) => s + x.brkMin, 0)
  const diasTrabajados = days.filter(x => x.workMin > 0).length
  const { netExtraMin } = monthlyExtras(db.records, emp.id, month)
  return { days, totalMin, totalBrk, diasTrabajados, extraMin: netExtraMin || 0 }
}

const sanitizeSheetName = name =>
  (name || 'Empleado').replace(/[[\]*?/\\:]/g, ' ').trim().slice(0, 31) || 'Empleado'

// ── Excel: hoja Resumen + una hoja por empleado ───────────────────────────────
export async function exportInspeccionXLSX(db, month) {
  const XLSX = await import('xlsx')
  const empresa = db.config?.companyName || (db.empresas || [])[0] || ''
  const cif = db.config?.companyCif || '—'
  const mesNombre = new Date(month + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  if (!emps.length) return { ok: false, reason: 'sin_empleados' }

  const wb = XLSX.utils.book_new()
  const minToDecH = m => Math.round(m / 60 * 100) / 100

  // Hoja resumen
  const resumenRows = []
  const perEmp = emps.map(e => ({ e, data: buildEmpDays(db, e, month) }))
  perEmp.forEach(({ e, data }) => {
    resumenRows.push([e.name, e.dni || '—', data.diasTrabajados, mhm(data.totalMin), minToDecH(data.totalMin), data.extraMin > 0 ? mhm(data.extraMin) : '—'])
  })
  const totalAll = perEmp.reduce((s, x) => s + x.data.totalMin, 0)
  const resumenAoa = [
    ['REGISTRO DIARIO DE JORNADA — Art. 34.9 del Estatuto de los Trabajadores (RD-ley 8/2019)'],
    [],
    ['Empresa:', empresa, '', 'CIF:', cif],
    ['Período:', mesNombre, '', 'Generado:', new Date().toLocaleString('es-ES')],
    [],
    ['Trabajador', 'DNI/NIE', 'Días trabajados', 'Total horas', 'Total (dec.)', 'H. extra (>40h/sem)'],
    ...resumenRows,
    [],
    ['TOTAL', '', perEmp.reduce((s, x) => s + x.data.diasTrabajados, 0), mhm(totalAll), minToDecH(totalAll), ''],
    [],
    ['Este registro debe conservarse durante 4 años y permanecer a disposición de los trabajadores,'],
    ['sus representantes legales y la Inspección de Trabajo y Seguridad Social.'],
  ]
  const wsResumen = XLSX.utils.aoa_to_sheet(resumenAoa)
  wsResumen['!cols'] = [28, 14, 15, 12, 12, 18].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

  // Hoja por empleado
  const usedNames = new Set(['Resumen'])
  perEmp.forEach(({ e, data }) => {
    const rows = data.days.map(x => [
      `${p2(x.d)}/${p2(Number(month.slice(5, 7)))}`,
      DAY_NAMES[x.dow],
      x.entrada || '—',
      x.salida || '—',
      x.brkMin > 0 ? mhm(x.brkMin) : '—',
      x.workMin > 0 ? mhm(x.workMin) : '—',
      x.workMin > 0 ? minToDecH(x.workMin) : '',
      x.obs,
    ])
    const aoa = [
      ['REGISTRO DIARIO DE JORNADA — Art. 34.9 ET (RD-ley 8/2019)'],
      [],
      ['Empresa:', empresa, '', 'CIF:', cif],
      ['Trabajador:', e.name, '', 'DNI/NIE:', e.dni || '—'],
      ['Mes:', mesNombre, '', 'Centro:', e.centroTrabajo || '—'],
      [],
      ['Fecha', 'Día', 'Entrada', 'Salida', 'Pausas', 'Horas', 'Horas (dec.)', 'Observaciones'],
      ...rows,
      [],
      ['TOTAL', '', '', '', data.totalBrk > 0 ? mhm(data.totalBrk) : '—', mhm(data.totalMin), minToDecH(data.totalMin), `${data.diasTrabajados} día${data.diasTrabajados === 1 ? '' : 's'} trabajado${data.diasTrabajados === 1 ? '' : 's'}`],
      ['Horas extraordinarias (semanal >40h / mensual 160h):', '', '', '', '', data.extraMin > 0 ? mhm(data.extraMin) : '0h 00m', '', ''],
      [],
      [],
      ['Firma del trabajador:', '', '', '', 'Firma y sello de la empresa:', '', '', ''],
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [8, 11, 9, 9, 9, 10, 11, 22].map(w => ({ wch: w }))
    let name = sanitizeSheetName(e.name)
    let n = 2
    while (usedNames.has(name)) name = sanitizeSheetName(e.name).slice(0, 28) + ' ' + n++
    usedNames.add(name)
    XLSX.utils.book_append_sheet(wb, ws, name)
  })

  const fname = `registro_jornada_${(empresa || 'empresa').replace(/\s+/g, '_')}_${month}.xlsx`
  XLSX.writeFile(wb, fname)
  return { ok: true, count: emps.length }
}

// ── HTML imprimible: una página por empleado con firmas ───────────────────────
export function buildInspeccionHTML(db, month) {
  const empresa = db.config?.companyName || (db.empresas || [])[0] || '—'
  const cif = db.config?.companyCif || '—'
  const mesNombre = new Date(month + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const pages = emps.map(e => {
    const data = buildEmpDays(db, e, month)
    const rowsHtml = data.days.map(x => `<tr${x.workMin === 0 ? ' class="empty-day"' : ''}>
      <td>${p2(x.d)}/${p2(Number(month.slice(5, 7)))}</td>
      <td>${DAY_NAMES[x.dow]}</td>
      <td>${x.entrada || '—'}</td>
      <td>${x.salida || '—'}</td>
      <td>${x.brkMin > 0 ? mhm(x.brkMin) : '—'}</td>
      <td class="hours">${x.workMin > 0 ? mhm(x.workMin) : '—'}</td>
      <td class="obs">${esc(x.obs)}</td>
    </tr>`).join('')
    return `<section class="emp-page">
      <h1>Registro diario de jornada</h1>
      <h2>Art. 34.9 del Estatuto de los Trabajadores · RD-ley 8/2019</h2>
      <div class="meta">
        <div><span>Empresa</span>${esc(empresa)}</div>
        <div><span>CIF</span>${esc(cif)}</div>
        <div><span>Trabajador</span>${esc(e.name)}</div>
        <div><span>DNI/NIE</span>${esc(e.dni || '—')}</div>
        <div><span>Mes</span>${mesNombre}</div>
        <div><span>Centro</span>${esc(e.centroTrabajo || '—')}</div>
      </div>
      <table>
        <thead><tr><th>Fecha</th><th>Día</th><th>Entrada</th><th>Salida</th><th>Pausas</th><th>Horas</th><th>Observaciones</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr class="total"><td colspan="4">TOTAL — ${data.diasTrabajados} día${data.diasTrabajados === 1 ? '' : 's'} trabajado${data.diasTrabajados === 1 ? '' : 's'}</td><td>${data.totalBrk > 0 ? mhm(data.totalBrk) : '—'}</td><td class="hours">${mhm(data.totalMin)}</td><td></td></tr>
          <tr class="total"><td colspan="5">Horas extraordinarias (semanal &gt;40h / mensual 160h)</td><td class="hours">${data.extraMin > 0 ? mhm(data.extraMin) : '0h 00m'}</td><td></td></tr>
        </tfoot>
      </table>
      <div class="sign">
        <div class="sign-box">Firma del trabajador<br><br><br>________________________<br><span>${esc(e.name)}</span></div>
        <div class="sign-box">Firma y sello de la empresa<br><br><br>________________________<br><span>${esc(empresa)}</span></div>
      </div>
    </section>`
  }).join('')

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Registro de jornada ${mesNombre} · ${esc(empresa)}</title>
<style>
*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;font-size:11px;margin:0;padding:24px}
.emp-page{page-break-after:always;padding-bottom:16px}
.emp-page:last-child{page-break-after:auto}
h1{font-size:16px;margin:0 0 2px}h2{font-size:11px;color:#555;font-weight:400;margin:0 0 14px}
.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 20px;background:#f6f6f8;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:11px}
.meta div span{display:block;color:#888;font-size:9px;text-transform:uppercase;letter-spacing:.04em}
table{width:100%;border-collapse:collapse}
th{background:#1a1a2e;color:#fff;padding:5px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.04em}
td{padding:4px 8px;border-bottom:1px solid #eee}
tr.empty-day td{color:#aaa}
td.hours{font-weight:700}td.obs{color:#777;font-size:10px}
tfoot tr.total td{border-top:2px solid #1a1a2e;border-bottom:none;font-weight:700;padding-top:6px}
.sign{margin-top:28px;display:flex;gap:48px}
.sign-box{flex:1;font-size:10px;color:#555;text-align:center}
.sign-box span{font-size:9px;color:#999}
footer{margin-top:20px;font-size:8px;color:#aaa;border-top:1px solid #eee;padding-top:8px}
@media print{body{padding:12px}button{display:none}}
</style></head><body>
${pages || '<p>No hay empleados activos.</p>'}
<footer>Registro generado por TIMES INC el ${new Date().toLocaleString('es-ES')} · Conservación obligatoria: 4 años · A disposición de los trabajadores, sus representantes legales y la Inspección de Trabajo y Seguridad Social (art. 34.9 ET)</footer>
</body></html>`
}
