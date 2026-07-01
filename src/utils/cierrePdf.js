import { mhm, p2 } from './time.js'
import { makePrintableSignature } from './pdfSign.js'

function arrayBufferToBase64(buf) {
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

const safe = s => String(s ?? '').replace(/[^\x00-\xFF]/g,'?')

// PDF individual: cierre de un empleado, con firma estampada si está firmado.
export async function buildCierreIndividualPDF({ cierre, empresa }) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const mesLabel = new Date(cierre.mes + '-01').toLocaleDateString('es-ES', { month:'long', year:'numeric' })

  const pdfDoc = await PDFDocument.create()
  const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const PW = 595, PH = 842, ML = 40, MR = 40, CW = PW - ML - MR
  const cPri = rgb(0.36,0.38,0.82), cPriLt = rgb(0.94,0.93,1.0)
  const cDark = rgb(0.10,0.10,0.15), cGray = rgb(0.45,0.45,0.50)
  const cLtGray = rgb(0.96,0.96,0.98), cBorder = rgb(0.85,0.85,0.90), cWhite = rgb(1,1,1)
  const cGreen = rgb(0.10,0.62,0.46)

  const COLS = [
    { label:'Fecha', w:90 }, { label:'Centro / Obra', w:255 },
    { label:'Entrada', w:60 }, { label:'Horas', w:110 },
  ]
  const ROW_H = 16, HEAD_H = 18

  let page = pdfDoc.addPage([PW, PH])
  let y = PH - 40

  page.drawRectangle({ x:0, y:PH-90, width:PW, height:90, color:cPri })
  page.drawText(safe(empresa || 'TIMES INC'), { x:ML, y:PH-40, size:18, font:fontB, color:cWhite })
  page.drawText('CIERRE MENSUAL DE JORNADA', { x:ML, y:PH-62, size:10, font:fontR, color:rgb(0.85,0.86,1) })
  y = PH - 118

  page.drawText(safe(cierre.empName), { x:ML, y, size:15, font:fontB, color:cDark })
  y -= 16
  page.drawText(`${mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}  ·  Generado el ${new Date(cierre.generadoAt).toLocaleDateString('es-ES')} por ${safe(cierre.generadoPor || '—')}`, { x:ML, y, size:9, font:fontR, color:cGray })
  y -= 24

  // Header tabla
  let xc = ML
  page.drawRectangle({ x:ML, y:y-HEAD_H, width:CW, height:HEAD_H, color:cPri })
  COLS.forEach(c => {
    page.drawText(c.label, { x:xc+6, y:y-HEAD_H+6, size:8, font:fontB, color:cWhite })
    xc += c.w
  })
  y -= HEAD_H

  const recs = cierre.records_snapshot || []
  recs.forEach((r, i) => {
    if (y - ROW_H < 140) { page = pdfDoc.addPage([PW, PH]); y = PH - 50 }
    const d = new Date(r.inicio)
    const wm = Math.floor((r.workSecs || 0) / 60)
    const vals = [
      d.toLocaleDateString('es-ES'),
      safe(r.centro || '—'),
      `${p2(d.getHours())}:${p2(d.getMinutes())}`,
      mhm(wm),
    ]
    page.drawRectangle({ x:ML, y:y-ROW_H, width:CW, height:ROW_H, color: i%2===0 ? cWhite : cLtGray })
    page.drawLine({ start:{x:ML,y:y-ROW_H}, end:{x:ML+CW,y:y-ROW_H}, thickness:0.3, color:cBorder })
    let xr = ML
    vals.forEach((v, ci) => {
      page.drawText(v, { x:xr+6, y:y-ROW_H+5, size:8, font: ci===3?fontB:fontR, color: ci===3?cPri:cDark, maxWidth:COLS[ci].w-10 })
      xr += COLS[ci].w
    })
    y -= ROW_H
  })

  if (y - 90 < 30) { page = pdfDoc.addPage([PW, PH]); y = PH - 50 }
  y -= 12
  page.drawRectangle({ x:ML, y:y-38, width:CW, height:38, color:cPriLt, borderColor:cPri, borderWidth:0.6 })
  page.drawText(`TOTAL: ${mhm(cierre.totalMin)}  ·  ${cierre.dias} día${cierre.dias!==1?'s':''} trabajado${cierre.dias!==1?'s':''}`, { x:ML+10, y:y-22, size:11, font:fontB, color:cPri })
  y -= 58

  page.drawText('FIRMA DEL TRABAJADOR', { x:ML, y:y-11, size:7, font:fontB, color:cGray })
  if (cierre.firma?.signatureData) {
    try {
      const printable = await makePrintableSignature(cierre.firma.signatureData)
      const b64 = printable.split(',')[1]
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const sigImg = await pdfDoc.embedPng(bytes.buffer)
      const sigW = 150, sigH = sigW * (sigImg.height / sigImg.width)
      page.drawImage(sigImg, { x:ML, y:y-20-sigH, width:sigW, height:sigH })
      page.drawLine({ start:{x:ML,y:y-24-sigH}, end:{x:ML+190,y:y-24-sigH}, thickness:0.5, color:cGray })
      page.drawText(safe(`${cierre.empName}  ·  Firmado digitalmente  ·  ${new Date(cierre.firma.firmadoAt).toLocaleString('es-ES')}`), { x:ML, y:y-34-sigH, size:7, font:fontR, color:cGray, maxWidth:300 })
      page.drawText('Firma verificada', { x:ML+195, y:y-27-sigH, size:8, font:fontB, color:cGreen })
    } catch {
      page.drawLine({ start:{x:ML,y:y-70}, end:{x:ML+190,y:y-70}, thickness:0.5, color:cGray })
      page.drawText(safe(cierre.empName), { x:ML, y:y-80, size:7, font:fontR, color:cGray })
    }
  } else {
    page.drawRectangle({ x:ML, y:y-16-70, width:190, height:70, color:cLtGray, borderColor:rgb(0.87,0.27,0.27), borderWidth:0.5 })
    page.drawText('Pendiente de firma', { x:ML+10, y:y-32, size:8, font:fontB, color:rgb(0.87,0.27,0.27) })
  }

  page.drawText('Documento generado automáticamente por TIMES INC conforme al RDL 8/2019 de registro diario de jornada.', { x:ML, y:24, size:5.5, font:fontR, color:cGray, maxWidth:CW })

  const bytes = await pdfDoc.save()
  const dataUrl = 'data:application/pdf;base64,' + arrayBufferToBase64(bytes)
  return { dataUrl, blob: new Blob([bytes], { type:'application/pdf' }) }
}

// PDF consolidado: horas de todos los empleados de un mes, con estado de firma.
export async function buildCierreConsolidadoPDF({ cierres, mes, empresa }) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const mesLabel = new Date(mes + '-01').toLocaleDateString('es-ES', { month:'long', year:'numeric' })

  const pdfDoc = await PDFDocument.create()
  const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const PW = 595, PH = 842, ML = 40, MR = 40, CW = PW - ML - MR
  const cPri = rgb(0.36,0.38,0.82), cPriLt = rgb(0.94,0.93,1.0)
  const cDark = rgb(0.10,0.10,0.15), cGray = rgb(0.45,0.45,0.50)
  const cLtGray = rgb(0.96,0.96,0.98), cBorder = rgb(0.85,0.85,0.90), cWhite = rgb(1,1,1)
  const cGreen = rgb(0.10,0.62,0.46), cOrange = rgb(0.83,0.55,0.10)

  const COLS = [
    { label:'Empleado', w:190 }, { label:'Días', w:50 },
    { label:'Horas', w:80 }, { label:'Estado', w:90 }, { label:'Fecha firma', w:105 },
  ]
  const ROW_H = 20, HEAD_H = 20

  let page = pdfDoc.addPage([PW, PH])
  let y = PH - 40

  page.drawRectangle({ x:0, y:PH-90, width:PW, height:90, color:cPri })
  page.drawText(safe(empresa || 'TIMES INC'), { x:ML, y:PH-40, size:18, font:fontB, color:cWhite })
  page.drawText('CIERRE MENSUAL CONSOLIDADO', { x:ML, y:PH-62, size:10, font:fontR, color:rgb(0.85,0.86,1) })
  y = PH - 118

  page.drawText(mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1), { x:ML, y, size:15, font:fontB, color:cDark })
  y -= 16
  page.drawText(`Generado el ${new Date().toLocaleDateString('es-ES')}  ·  ${cierres.length} empleado${cierres.length!==1?'s':''}`, { x:ML, y, size:9, font:fontR, color:cGray })
  y -= 24

  let xc = ML
  page.drawRectangle({ x:ML, y:y-HEAD_H, width:CW, height:HEAD_H, color:cPri })
  COLS.forEach(c => {
    page.drawText(c.label, { x:xc+6, y:y-HEAD_H+7, size:8, font:fontB, color:cWhite })
    xc += c.w
  })
  y -= HEAD_H

  let totalMin = 0
  let firmadosCount = 0
  cierres.forEach((c, i) => {
    if (y - ROW_H < 60) { page = pdfDoc.addPage([PW, PH]); y = PH - 50 }
    totalMin += c.totalMin || 0
    const firmado = c.estado === 'firmado'
    if (firmado) firmadosCount++
    const vals = [safe(c.empName), String(c.dias || 0), mhm(c.totalMin || 0)]
    page.drawRectangle({ x:ML, y:y-ROW_H, width:CW, height:ROW_H, color: i%2===0 ? cWhite : cLtGray })
    page.drawLine({ start:{x:ML,y:y-ROW_H}, end:{x:ML+CW,y:y-ROW_H}, thickness:0.3, color:cBorder })
    let xr = ML
    vals.forEach((v, ci) => {
      page.drawText(v, { x:xr+6, y:y-ROW_H+6, size:8.5, font:fontR, color:cDark, maxWidth:COLS[ci].w-10 })
      xr += COLS[ci].w
    })
    xr = ML + COLS[0].w + COLS[1].w + COLS[2].w
    page.drawText(firmado ? 'OK Firmado' : 'Pendiente', { x:xr+6, y:y-ROW_H+6, size:8.5, font:fontB, color: firmado ? cGreen : cOrange })
    xr += COLS[3].w
    page.drawText(firmado && c.firma?.firmadoAt ? new Date(c.firma.firmadoAt).toLocaleDateString('es-ES') : '—', { x:xr+6, y:y-ROW_H+6, size:8, font:fontR, color:cGray })
    y -= ROW_H
  })

  if (y - 44 < 30) { page = pdfDoc.addPage([PW, PH]); y = PH - 50 }
  y -= 14
  page.drawRectangle({ x:ML, y:y-44, width:CW, height:44, color:cPriLt, borderColor:cPri, borderWidth:0.6 })
  page.drawText(`TOTAL EMPRESA: ${mhm(totalMin)}`, { x:ML+10, y:y-19, size:11, font:fontB, color:cPri })
  page.drawText(`${firmadosCount} de ${cierres.length} cierres firmados`, { x:ML+10, y:y-34, size:8.5, font:fontR, color: firmadosCount===cierres.length ? cGreen : cOrange })

  page.drawText('Documento generado automáticamente por TIMES INC conforme al RDL 8/2019 de registro diario de jornada.', { x:ML, y:24, size:5.5, font:fontR, color:cGray, maxWidth:CW })

  const bytes = await pdfDoc.save()
  const dataUrl = 'data:application/pdf;base64,' + arrayBufferToBase64(bytes)
  return { dataUrl, blob: new Blob([bytes], { type:'application/pdf' }) }
}
