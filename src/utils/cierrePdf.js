import { mhm, p2, recWorkSecs } from './time.js'
import { PDF_PAGE, pdfColors, pdfSafe, drawTableHeaderRow, drawTableDataRow, drawSignatureBlock, drawDocumentFooters, addReportPage } from './pdfReport.js'

async function sha256Hex(str) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

function arrayBufferToBase64(buf) {
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

const { W: PW, H: PH } = PDF_PAGE
const ML = 40, MR = 40, CW = PW - ML - MR

// PDF individual: cierre de un empleado, con firma estampada si está firmado.
export async function buildCierreIndividualPDF({ cierre, empresa }) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const colors = pdfColors(rgb)
  const mesLabel = new Date(cierre.mes + '-01').toLocaleDateString('es-ES', { month:'long', year:'numeric' })

  const pdfDoc = await PDFDocument.create()
  const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const COLS = [
    { label:'Fecha', w:90 }, { label:'Centro / Obra', w:255 },
    { label:'Entrada', w:60 }, { label:'Horas', w:110 },
  ]
  const ROW_H = 16, HEAD_H = 18

  let page = pdfDoc.addPage([PW, PH])
  let y = PH - 40

  page.drawRectangle({ x:0, y:PH-90, width:PW, height:90, color:colors.pri })
  page.drawText(pdfSafe(empresa || 'TIMES INC'), { x:ML, y:PH-40, size:18, font:fontB, color:colors.white })
  page.drawText('CIERRE MENSUAL DE JORNADA', { x:ML, y:PH-62, size:10, font:fontR, color:rgb(0.85,0.86,1) })
  y = PH - 118

  page.drawText(pdfSafe(cierre.empName), { x:ML, y, size:15, font:fontB, color:colors.dark })
  y -= 16
  page.drawText(pdfSafe(`${mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}  ·  Generado el ${new Date(cierre.generadoAt).toLocaleDateString('es-ES')} por ${cierre.generadoPor || '—'}`), { x:ML, y, size:9, font:fontR, color:colors.gray })
  y -= 24

  y = drawTableHeaderRow(page, { ml:ML, y, cw:CW, cols:COLS, colors, fontB, headH:HEAD_H })

  let pageNum = 1
  const newPage = ({ withTable = false, section = 'Detalle de jornadas' } = {}) => {
    pageNum++
    ;({ page, y } = addReportPage(pdfDoc, {
      ml: ML, mr: MR, cw: CW, pw: PW, ph: PH, pageNum, colors, fontR, fontB,
      empresa: empresa || 'TIMES INC',
      title: 'CIERRE MENSUAL DE JORNADA',
      subtitle: `${cierre.empName} · ${mesLabel} · ${section}`,
    }))
    if (withTable) y = drawTableHeaderRow(page, { ml:ML, y, cw:CW, cols:COLS, colors, fontB, headH:HEAD_H })
  }

  const recs = cierre.records_snapshot || []
  const totalMin = Math.floor(recs.reduce((sum, record) => sum + recWorkSecs(record), 0) / 60)
  const targetMin = cierre.targetMin || 160 * 60
  const extraMin = Math.max(0, totalMin - targetMin)
  recs.forEach((r, i) => {
    if (y - ROW_H < 140) newPage({ withTable: true })
    const d = new Date(r.inicio)
    const wm = Math.floor(recWorkSecs(r) / 60)
    const vals = [
      d.toLocaleDateString('es-ES'),
      r.centro || '—',
      `${p2(d.getHours())}:${p2(d.getMinutes())}`,
      mhm(wm),
    ]
    y = drawTableDataRow(page, { ml:ML, cw:CW, y, vals, cols:COLS, striped: i%2!==0, colors, fontR, fontB, highlightIdx:3, rowH:ROW_H })
  })

  if (y - 90 < 30) newPage({ section: 'Resumen mensual' })
  y -= 12
  page.drawRectangle({ x:ML, y:y-38, width:CW, height:38, color:colors.priLt, borderColor:colors.pri, borderWidth:0.6 })
  page.drawText(pdfSafe(`TOTAL: ${mhm(totalMin)}  ·  EXTRA MES: ${mhm(extraMin)}  ·  ${cierre.dias} día${cierre.dias!==1?'s':''}`), { x:ML+10, y:y-22, size:10, font:fontB, color:colors.pri })
  y -= 58

  const corrections = recs.flatMap(record => (record.correcciones || []).map(correction => ({ record, correction })))
  if (corrections.length) {
    if (y - 42 < 100) newPage({ section: 'Historial de modificaciones' })
    page.drawText(`HISTORIAL DE MODIFICACIONES (${corrections.length})`, { x:ML, y, size:8, font:fontB, color:colors.pri })
    y -= 14
    corrections.forEach(({ record, correction }) => {
      if (y - 38 < 100) newPage({ section: 'Historial de modificaciones' })
      const oldIn = correction.oldInicio ? new Date(correction.oldInicio).toLocaleString('es-ES') : '—'
      const oldOut = correction.oldFin ? new Date(correction.oldFin).toLocaleString('es-ES') : '—'
      const newIn = correction.newInicio ? new Date(correction.newInicio).toLocaleString('es-ES') : '—'
      const newOut = correction.newFin ? new Date(correction.newFin).toLocaleString('es-ES') : '—'
      page.drawRectangle({ x:ML, y:y-34, width:CW, height:34, color:colors.ltGray, borderColor:colors.border, borderWidth:0.4 })
      page.drawText(pdfSafe(`${record.id || 'Fichaje'} · ${correction.by || '—'} · ${correction.device || 'Dispositivo no registrado'}`), { x:ML+6, y:y-11, size:6.8, font:fontB, color:colors.dark, maxWidth:CW-12 })
      page.drawText(pdfSafe(`${oldIn}–${oldOut}  ->  ${newIn}–${newOut}`), { x:ML+6, y:y-21, size:6.2, font:fontR, color:colors.gray, maxWidth:CW-12 })
      page.drawText(pdfSafe(`Motivo: ${correction.motivo || 'Sin motivo'} · ${correction.ts ? new Date(correction.ts).toLocaleString('es-ES') : 'Fecha no registrada'}`), { x:ML+6, y:y-30, size:6.2, font:fontR, color:colors.gray, maxWidth:CW-12 })
      y -= 39
    })
    y -= 8
  }

  if (y - 90 < 30) newPage({ section: 'Firma del trabajador' })
  page.drawText('FIRMA DEL TRABAJADOR', { x:ML, y:y-11, size:7, font:fontB, color:colors.gray })
  await drawSignatureBlock(pdfDoc, page, {
    x: ML, y, width: 150, colors, fontR, fontB,
    signatureDataUrl: cierre.firma?.signatureData,
    label: cierre.firma
      ? `${cierre.empName}  ·  Firmado digitalmente  ·  ${new Date(cierre.firma.firmadoAt).toLocaleString('es-ES')}`
      : 'Pendiente de firma',
    sublabel: cierre.firma ? 'Firma verificada' : null,
  })

  drawDocumentFooters(pdfDoc, { ml:ML, cw:CW, colors, fontR })

  // Huella SHA-256 de los datos canónicos del cierre. No se presenta como una
  // firma criptográfica del archivo PDF: permite verificar que el resumen
  // coincide con el registro conservado por la aplicación.
  const hashInput = JSON.stringify({
    empId:cierre.empId, mes:cierre.mes, totalMin, generadoAt:cierre.generadoAt || '',
    records:recs.map(r => ({ id:r.id, inicio:r.inicio, fin:r.fin, workSecs:r.workSecs, breakSecs:r.breakSecs, correcciones:r.correcciones || [] })),
  })
  const hash = await sha256Hex(hashInput)
  if (hash) {
    page.drawText(pdfSafe(`SHA-256 de datos: ${hash}`), { x: ML, y: 12, size: 4.5, font: fontR, color: colors.gray, maxWidth: CW })
    page.drawText(pdfSafe(`Verificar en: https://times-inc.vercel.app/api/verify-cierre?hash=${hash}`), { x: ML, y: 7, size: 4.5, font: fontR, color: colors.gray, maxWidth: CW })
  }

  const bytes = await pdfDoc.save()
  const dataUrl = 'data:application/pdf;base64,' + arrayBufferToBase64(bytes)
  return { dataUrl, blob: new Blob([bytes], { type:'application/pdf' }), hash }
}

// PDF consolidado: horas de todos los empleados de un mes, con estado de firma.
export async function buildCierreConsolidadoPDF({ cierres, mes, empresa }) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const colors = pdfColors(rgb)
  const mesLabel = new Date(mes + '-01').toLocaleDateString('es-ES', { month:'long', year:'numeric' })

  const pdfDoc = await PDFDocument.create()
  const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const COLS = [
    { label:'Empleado', w:155 }, { label:'Días', w:40 },
    { label:'Horas', w:65 }, { label:'Extra', w:65 },
    { label:'Estado', w:80 }, { label:'Fecha firma', w:110 },
  ]
  const ROW_H = 20, HEAD_H = 20

  let page = pdfDoc.addPage([PW, PH])
  let y = PH - 40

  page.drawRectangle({ x:0, y:PH-90, width:PW, height:90, color:colors.pri })
  page.drawText(pdfSafe(empresa || 'TIMES INC'), { x:ML, y:PH-40, size:18, font:fontB, color:colors.white })
  page.drawText('CIERRE MENSUAL CONSOLIDADO', { x:ML, y:PH-62, size:10, font:fontR, color:rgb(0.85,0.86,1) })
  y = PH - 118

  page.drawText(mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1), { x:ML, y, size:15, font:fontB, color:colors.dark })
  y -= 16
  page.drawText(pdfSafe(`Generado el ${new Date().toLocaleDateString('es-ES')}  ·  ${cierres.length} empleado${cierres.length!==1?'s':''}`), { x:ML, y, size:9, font:fontR, color:colors.gray })
  y -= 24

  y = drawTableHeaderRow(page, { ml:ML, y, cw:CW, cols:COLS, colors, fontB, headH:HEAD_H })

  let pageNum = 1
  const newPage = ({ withTable = false, section = 'Resumen por empleado' } = {}) => {
    pageNum++
    ;({ page, y } = addReportPage(pdfDoc, {
      ml: ML, mr: MR, cw: CW, pw: PW, ph: PH, pageNum, colors, fontR, fontB,
      empresa: empresa || 'TIMES INC',
      title: 'CIERRE MENSUAL CONSOLIDADO',
      subtitle: `${mesLabel} · ${cierres.length} empleados · ${section}`,
    }))
    if (withTable) y = drawTableHeaderRow(page, { ml:ML, y, cw:CW, cols:COLS, colors, fontB, headH:HEAD_H })
  }

  let totalMin = 0
  let totalExtraMin = 0
  let firmadosCount = 0
  let correctionCount = 0
  cierres.forEach((c, i) => {
    if (y - ROW_H < 60) newPage({ withTable: true })
    totalMin += c.totalMin || 0
    const employeeExtraMin = Math.max(0, (c.totalMin || 0) - (c.targetMin || 160 * 60))
    totalExtraMin += employeeExtraMin
    correctionCount += (c.records_snapshot || []).reduce((sum, record) => sum + (record.correcciones || []).length, 0)
    const firmado = c.estado === 'firmado'
    if (firmado) firmadosCount++
    const vals = [c.empName, String(c.dias || 0), mhm(c.totalMin || 0), mhm(employeeExtraMin), '', '']
    const yAfter = drawTableDataRow(page, { ml:ML, cw:CW, y, vals, cols:COLS, striped: i%2!==0, colors, fontR, fontB, rowH:ROW_H })
    // Estado y fecha de firma se dibujan aparte para conservar el color-coding
    const xEstado = ML + COLS[0].w + COLS[1].w + COLS[2].w + COLS[3].w
    page.drawText(firmado ? 'OK Firmado' : 'Pendiente', { x:xEstado+4, y:y-ROW_H+4, size:7.5, font:fontB, color: firmado ? colors.green : colors.orange })
    const xFecha = xEstado + COLS[4].w
    const fechaTxt = firmado && c.firma?.firmadoAt ? new Date(c.firma.firmadoAt).toLocaleDateString('es-ES') : '—'
    page.drawText(fechaTxt, { x:xFecha+4, y:y-ROW_H+4, size:7, font:fontR, color:colors.gray })
    y = yAfter
  })

  if (y - 44 < 30) newPage({ section: 'Totales de empresa' })
  y -= 14
  page.drawRectangle({ x:ML, y:y-44, width:CW, height:44, color:colors.priLt, borderColor:colors.pri, borderWidth:0.6 })
  page.drawText(`TOTAL EMPRESA: ${mhm(totalMin)}  ·  EXTRA MES: ${mhm(totalExtraMin)}`, { x:ML+10, y:y-19, size:10, font:fontB, color:colors.pri })
  page.drawText(pdfSafe(`${firmadosCount} de ${cierres.length} cierres firmados`), { x:ML+10, y:y-34, size:8.5, font:fontR, color: firmadosCount===cierres.length ? colors.green : colors.orange })
  if (correctionCount) page.drawText(pdfSafe(`${correctionCount} modificación${correctionCount!==1?'es':''} con trazabilidad incluida${correctionCount!==1?'s':''}`), { x:ML+250, y:y-34, size:8, font:fontB, color:colors.orange, maxWidth:CW-260 })

  drawDocumentFooters(pdfDoc, { ml:ML, cw:CW, colors, fontR })

  const bytes = await pdfDoc.save()
  const dataUrl = 'data:application/pdf;base64,' + arrayBufferToBase64(bytes)
  return { dataUrl, blob: new Blob([bytes], { type:'application/pdf' }) }
}
