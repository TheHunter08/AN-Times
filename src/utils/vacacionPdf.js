import { PDF_PAGE, pdfColors, pdfSafe, drawSignatureBlock, drawDocumentFooters } from './pdfReport.js'

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

const fmtDate = (ds) => ds ? new Date(ds + 'T00:00:00').toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' }) : '—'

// PDF de la solicitud de vacaciones aprobada, firmado por el empleado antes
// de enviarse al jefe de obra — mismo patrón que buildCierreIndividualPDF
// (generación programática + bloque de firma), pero de una sola página.
export async function buildVacacionPDF({ vac, empresa }) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const colors = pdfColors(rgb)

  const pdfDoc = await PDFDocument.create()
  const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const page = pdfDoc.addPage([PW, PH])
  let y = PH - 40

  page.drawRectangle({ x:0, y:PH-90, width:PW, height:90, color:colors.pri })
  page.drawText(pdfSafe(empresa || 'TIMES INC'), { x:ML, y:PH-40, size:18, font:fontB, color:colors.white })
  page.drawText('SOLICITUD DE VACACIONES APROBADA', { x:ML, y:PH-62, size:10, font:fontR, color:rgb(0.85,0.86,1) })
  y = PH - 118

  page.drawText(pdfSafe(vac.empName || '—'), { x:ML, y, size:15, font:fontB, color:colors.dark })
  y -= 16
  page.drawText(pdfSafe(`Solicitud generada el ${new Date(vac.ts || Date.now()).toLocaleDateString('es-ES')}${vac.asignadoPor ? ` · Aprobado por ${vac.asignadoPor}` : ''}`), { x:ML, y, size:9, font:fontR, color:colors.gray })
  y -= 30

  page.drawRectangle({ x:ML, y:y-70, width:CW, height:70, color:colors.priLt, borderColor:colors.pri, borderWidth:0.6 })
  page.drawText('PERÍODO', { x:ML+12, y:y-16, size:8, font:fontB, color:colors.pri })
  page.drawText(pdfSafe(`${fmtDate(vac.fechaInicio)}  →  ${fmtDate(vac.fechaFin)}`), { x:ML+12, y:y-34, size:12, font:fontB, color:colors.dark, maxWidth:CW-24 })
  page.drawText(pdfSafe(`${vac.dias || 0} día${vac.dias === 1 ? '' : 's'} natural${vac.dias === 1 ? '' : 'es'}${vac.motivo ? `  ·  ${vac.motivo}` : ''}`), { x:ML+12, y:y-52, size:9, font:fontR, color:colors.gray, maxWidth:CW-24 })
  y -= 100

  const noteLines = [
    'Este documento certifica que el período de vacaciones anterior ha sido',
    'aprobado por la empresa y firmado digitalmente por el trabajador. Se remite',
    'al responsable de obra para su conocimiento y planificación del equipo.',
  ]
  noteLines.forEach((line, i) => {
    page.drawText(pdfSafe(line), { x:ML, y: y - i * 12, size:8, font:fontR, color:colors.gray, maxWidth:CW })
  })
  y -= 70

  page.drawText('FIRMA DEL TRABAJADOR', { x:ML, y:y-11, size:7, font:fontB, color:colors.gray })
  await drawSignatureBlock(pdfDoc, page, {
    x: ML, y, width: 170, colors, fontR, fontB,
    signatureDataUrl: vac.firma?.signatureData,
    label: vac.firma
      ? `${vac.empName}  ·  Firmado digitalmente  ·  ${new Date(vac.firma.firmadoAt).toLocaleString('es-ES')}`
      : 'Pendiente de firma',
    sublabel: vac.firma ? 'Firma verificada' : null,
  })

  drawDocumentFooters(pdfDoc, { ml:ML, cw:CW, colors, fontR })

  const bytes = await pdfDoc.save()
  const dataUrl = 'data:application/pdf;base64,' + arrayBufferToBase64(bytes)
  return { dataUrl, blob: new Blob([bytes], { type:'application/pdf' }) }
}
