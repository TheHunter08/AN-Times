import { mhm, p2, recWorkSecs } from './time.js'
import { PDF_PAGE, pdfColors, pdfSafe, drawTableHeaderRow, drawTableDataRow, drawSignatureBlock, drawFooterLegal } from './pdfReport.js'

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

  const recs = cierre.records_snapshot || []
  const totalMin = Math.floor(recs.reduce((sum, record) => sum + recWorkSecs(record), 0) / 60)
  recs.forEach((r, i) => {
    if (y - ROW_H < 140) { page = pdfDoc.addPage([PW, PH]); y = PH - 50 }
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

  if (y - 90 < 30) { page = pdfDoc.addPage([PW, PH]); y = PH - 50 }
  y -= 12
  page.drawRectangle({ x:ML, y:y-38, width:CW, height:38, color:colors.priLt, borderColor:colors.pri, borderWidth:0.6 })
  page.drawText(pdfSafe(`TOTAL: ${mhm(totalMin)}  ·  ${cierre.dias} día${cierre.dias!==1?'s':''} trabajado${cierre.dias!==1?'s':''}`), { x:ML+10, y:y-22, size:11, font:fontB, color:colors.pri })
  y -= 58

  page.drawText('FIRMA DEL TRABAJADOR', { x:ML, y:y-11, size:7, font:fontB, color:colors.gray })
  await drawSignatureBlock(pdfDoc, page, {
    x: ML, y, width: 150, colors, fontR, fontB,
    signatureDataUrl: cierre.firma?.signatureData,
    label: cierre.firma
      ? `${cierre.empName}  ·  Firmado digitalmente  ·  ${new Date(cierre.firma.firmadoAt).toLocaleString('es-ES')}`
      : 'Pendiente de firma',
    sublabel: cierre.firma ? 'Firma verificada' : null,
  })

  drawFooterLegal(page, { ml:ML, cw:CW, colors, fontR })

  // Hash de integridad SHA-256: firma los datos clave del documento
  // para que inspección de trabajo pueda verificar que no ha sido alterado.
  const hashInput = `${cierre.empId}|${cierre.mes}|${totalMin}|${recs.length}|${recs.map(r => r.id).join(',')}|${cierre.generadoAt || ''}`
  const hash = await sha256Hex(hashInput)
  if (hash) {
    page.drawText(pdfSafe(`SHA-256: ${hash}`), { x: ML, y: 12, size: 4.5, font: fontR, color: colors.gray, maxWidth: CW })
  }

  const bytes = await pdfDoc.save()
  const dataUrl = 'data:application/pdf;base64,' + arrayBufferToBase64(bytes)
  return { dataUrl, blob: new Blob([bytes], { type:'application/pdf' }) }
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
    { label:'Empleado', w:190 }, { label:'Días', w:50 },
    { label:'Horas', w:80 }, { label:'Estado', w:90 }, { label:'Fecha firma', w:105 },
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

  let totalMin = 0
  let firmadosCount = 0
  cierres.forEach((c, i) => {
    if (y - ROW_H < 60) { page = pdfDoc.addPage([PW, PH]); y = PH - 50 }
    totalMin += c.totalMin || 0
    const firmado = c.estado === 'firmado'
    if (firmado) firmadosCount++
    const vals = [c.empName, String(c.dias || 0), mhm(c.totalMin || 0), '', '']
    const yAfter = drawTableDataRow(page, { ml:ML, cw:CW, y, vals, cols:COLS, striped: i%2!==0, colors, fontR, fontB, rowH:ROW_H })
    // Estado y fecha de firma se dibujan aparte para conservar el color-coding
    const xEstado = ML + COLS[0].w + COLS[1].w + COLS[2].w
    page.drawText(firmado ? 'OK Firmado' : 'Pendiente', { x:xEstado+4, y:y-ROW_H+4, size:7.5, font:fontB, color: firmado ? colors.green : colors.orange })
    const xFecha = xEstado + COLS[3].w
    const fechaTxt = firmado && c.firma?.firmadoAt ? new Date(c.firma.firmadoAt).toLocaleDateString('es-ES') : '—'
    page.drawText(fechaTxt, { x:xFecha+4, y:y-ROW_H+4, size:7, font:fontR, color:colors.gray })
    y = yAfter
  })

  if (y - 44 < 30) { page = pdfDoc.addPage([PW, PH]); y = PH - 50 }
  y -= 14
  page.drawRectangle({ x:ML, y:y-44, width:CW, height:44, color:colors.priLt, borderColor:colors.pri, borderWidth:0.6 })
  page.drawText(`TOTAL EMPRESA: ${mhm(totalMin)}`, { x:ML+10, y:y-19, size:11, font:fontB, color:colors.pri })
  page.drawText(pdfSafe(`${firmadosCount} de ${cierres.length} cierres firmados`), { x:ML+10, y:y-34, size:8.5, font:fontR, color: firmadosCount===cierres.length ? colors.green : colors.orange })

  drawFooterLegal(page, { ml:ML, cw:CW, colors, fontR })

  const bytes = await pdfDoc.save()
  const dataUrl = 'data:application/pdf;base64,' + arrayBufferToBase64(bytes)
  return { dataUrl, blob: new Blob([bytes], { type:'application/pdf' }) }
}
