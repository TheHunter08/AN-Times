import { makePrintableSignature } from './pdfSign.js'

// ── Constantes y helpers compartidos por todos los informes PDF ──────────────
// (TabJornada: exportRangePDF/exportMonthPDF/exportWeekPDF, cierrePdf.js)

export const PDF_PAGE = { W: 595, H: 842, ML: 35, MR: 35 }

export function pdfColors(rgb) {
  return {
    pri:   rgb(0.36, 0.38, 0.82),
    priLt: rgb(0.94, 0.93, 1.0),
    dark:  rgb(0.10, 0.10, 0.15),
    gray:  rgb(0.55, 0.55, 0.60),
    ltGray:rgb(0.96, 0.96, 0.98),
    border:rgb(0.82, 0.82, 0.88),
    white: rgb(1, 1, 1),
    green: rgb(0.10, 0.62, 0.46),
    red:   rgb(0.87, 0.27, 0.27),
    orange:rgb(0.83, 0.55, 0.10),
  }
}

// Limpia caracteres fuera de WinAnsi (✓ ⏳ ⚠ emojis, etc.) que hacen crash
// en pdf-lib con las fuentes estándar Helvetica.
export const pdfSafe = s => String(s ?? '')
  .replace(/✓/g, 'OK').replace(/✔/g, 'OK').replace(/⚠/g, '(!)')
  .replace(/⏳/g, '').replace(/−/g, '-').replace(/—/g, '-')
  .replace(/[^\x00-\xFF]/g, '?')

// Dibuja la fila de cabecera de una tabla (fondo de color, texto en negrita blanco).
export function drawTableHeaderRow(page, { ml, y, cw, cols, colors, fontB, headH = 17 }) {
  let xc = ml
  page.drawRectangle({ x: ml, y: y - headH, width: cw, height: headH, color: colors.pri })
  cols.forEach(c => {
    page.drawText(c.label, { x: xc + 4, y: y - headH + 5, size: 7.5, font: fontB, color: colors.white, maxWidth: c.w - 6 })
    xc += c.w
  })
  return y - headH
}

// Dibuja una fila de datos con franjas alternas y separadores verticales.
export function drawTableDataRow(page, { ml, cw, y, vals, cols, striped, colors, fontR, fontB, highlightIdx = -1, rowH = 15 }) {
  page.drawRectangle({ x: ml, y: y - rowH, width: cw, height: rowH, color: striped ? colors.ltGray : colors.white })
  page.drawLine({ start: { x: ml, y: y - rowH }, end: { x: ml + cw, y: y - rowH }, thickness: 0.3, color: colors.border })
  let xc = ml
  vals.forEach((v, ci) => {
    const isHighlight = ci === highlightIdx
    page.drawText(pdfSafe(v), { x: xc + 4, y: y - rowH + 4, size: 7.5, font: isHighlight ? fontB : fontR, color: isHighlight ? colors.pri : colors.dark, maxWidth: cols[ci].w - 8 })
    xc += cols[ci].w
  })
  let xs = ml
  cols.forEach((c, ci) => { if (ci < cols.length - 1) { page.drawLine({ start: { x: xs + c.w, y }, end: { x: xs + c.w, y: y - rowH }, thickness: 0.3, color: colors.border }); xs += c.w } })
  return y - rowH
}

// Estampa una firma (dataURL JPEG de useSignatureCanvas) como PNG embebido en el PDF.
export async function embedSignaturePng(pdfDoc, signatureDataUrl) {
  const printable = await makePrintableSignature(signatureDataUrl)
  const b64 = printable.split(',')[1]
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return pdfDoc.embedPng(bytes.buffer)
}

// Dibuja un bloque de firma: imagen + línea + etiqueta, o un aviso "sin firma".
// richMissing=true dibuja una caja roja con 2 líneas de aviso (usada en informes de jornada);
// si no, dibuja solo una línea + etiqueta simple (usada en cierres mensuales).
export async function drawSignatureBlock(pdfDoc, page, {
  x, y, width = 130, signatureDataUrl, label, sublabel, colors, fontR, fontB,
  missingLabel = 'Sin firma digital', missingDetail = null, richMissing = false,
}) {
  if (signatureDataUrl) {
    try {
      const sigImg = await embedSignaturePng(pdfDoc, signatureDataUrl)
      const h = width * (sigImg.height / sigImg.width)
      page.drawImage(sigImg, { x, y: y - 18 - h, width, height: h })
      page.drawLine({ start: { x, y: y - 22 - h }, end: { x: x + width + 40, y: y - 22 - h }, thickness: 0.5, color: colors.gray })
      page.drawText(pdfSafe(label), { x, y: y - 31 - h, size: 6.5, font: fontR, color: colors.gray, maxWidth: width + 130 })
      if (sublabel) page.drawText(sublabel, { x: x + width + 45, y: y - 25 - h, size: 7, font: fontB, color: colors.green })
      return
    } catch {
      // cae al bloque "sin firma" si falla el embed
    }
  }
  if (richMissing) {
    page.drawRectangle({ x, y: y - 16 - 70, width: width + 40, height: 70, color: colors.ltGray, borderColor: colors.red, borderWidth: 0.5 })
    page.drawText('(!) ' + missingLabel, { x: x + 10, y: y - 32, size: 7.5, font: fontB, color: colors.red })
    if (missingDetail) page.drawText(missingDetail, { x: x + 10, y: y - 44, size: 6.5, font: fontR, color: colors.gray })
    page.drawLine({ start: { x, y: y - 16 - 70 + 10 }, end: { x: x + width + 40, y: y - 16 - 70 + 10 }, thickness: 0.5, color: colors.border })
    page.drawText(pdfSafe(label), { x, y: y - 16 - 70 + 4, size: 6.5, font: fontR, color: colors.gray })
    return
  }
  page.drawLine({ start: { x, y: y - 65 }, end: { x: x + width + 40, y: y - 65 }, thickness: 0.5, color: colors.gray })
  page.drawText(pdfSafe(label || missingLabel), { x, y: y - 73, size: 7, font: fontR, color: colors.gray })
}

export function drawFooterLegal(page, { ml, cw, colors, fontR, y = 24 }) {
  page.drawText(
    'Documento generado automáticamente por TIMES INC conforme al RDL 8/2019 de registro diario de jornada. Datos con valor probatorio.',
    { x: ml, y, size: 5.5, font: fontR, color: colors.gray, maxWidth: cw }
  )
}

// Dibuja una fila de tarjetas de estadística (etiqueta arriba, valor grande
// centrado abajo) dentro de una caja con fondo de marca — reutilizable en
// cualquier informe (paquete de inspección, informe mensual, etc.).
export function drawStatRow(page, { ml, cw, y, height = 60, items, colors, fontR, fontB }) {
  page.drawRectangle({ x: ml, y: y - height, width: cw, height, color: colors.priLt, borderColor: colors.pri, borderWidth: 0.6 })
  const colW = cw / items.length
  items.forEach((item, i) => {
    const cx = ml + i * colW
    const center = cx + colW / 2
    const labelW = fontR.widthOfTextAtSize(item.label, 7.5)
    const valueW = fontB.widthOfTextAtSize(item.val, 13)
    page.drawText(pdfSafe(item.label), { x: center - Math.min(labelW, colW - 8) / 2, y: y - 20, size: 7.5, font: fontR, color: colors.gray, maxWidth: colW - 8 })
    page.drawText(pdfSafe(item.val), { x: center - Math.min(valueW, colW - 8) / 2, y: y - 42, size: 13, font: fontB, color: item.color || colors.pri, maxWidth: colW - 8 })
  })
  return y - height
}

// Dibuja un título de sección discreto (barra de color a la izquierda + texto
// en mayúsculas) para separar bloques dentro de un informe largo.
export function drawSectionTitle(page, { ml, y, text, colors, fontB, size = 8.5 }) {
  page.drawRectangle({ x: ml, y: y - size + 1, width: 3, height: size, color: colors.pri })
  page.drawText(pdfSafe(text), { x: ml + 8, y, size, font: fontB, color: colors.pri })
  return y - size - 8
}

// Añade el pie legal y la numeración a todas las páginas del documento.
// startPage permite omitir una portada que ya tenga su propio pie.
export function drawDocumentFooters(pdfDoc, { ml, cw, colors, fontR, startPage = 0 }) {
  const pages = pdfDoc.getPages()
  pages.forEach((page, index) => {
    if (index < startPage) return
    drawFooterLegal(page, { ml, cw: cw - 80, colors, fontR })
    const label = `Página ${index + 1} de ${pages.length}`
    page.drawText(label, {
      x: ml + cw - fontR.widthOfTextAtSize(label, 5.5),
      y: 24,
      size: 5.5,
      font: fontR,
      color: colors.gray,
    })
  })
}

// Añade una página nueva con la banda de cabecera (empresa + título + subtítulo + nº de página).
// Devuelve { page, y } con y ya posicionado justo debajo de la banda.
export function addReportPage(pdfDoc, { ml, mr, cw, pw, ph, empresa, title, subtitle, pageNum, colors, fontR, fontB }) {
  const page = pdfDoc.addPage([pw, ph])
  const yTop = ph - 30
  page.drawRectangle({ x: ml, y: yTop - 64, width: cw, height: 64, color: colors.priLt, borderColor: colors.pri, borderWidth: 0.8 })
  page.drawText(pdfSafe(empresa || 'Obra'), { x: ml + 10, y: yTop - 18, size: 10, font: fontB, color: colors.pri })
  page.drawText(title, { x: ml + 10, y: yTop - 31, size: 8.5, font: fontB, color: colors.dark })
  page.drawText(pdfSafe(subtitle), { x: ml + 10, y: yTop - 44, size: 7.5, font: fontR, color: colors.gray, maxWidth: cw - 80 })
  page.drawText(`Pág. ${pageNum}   ·   ${new Date().toLocaleDateString('es-ES')}`, { x: pw - mr - 85, y: yTop - 18, size: 7.5, font: fontR, color: colors.gray })
  return { page, y: yTop - 74 }
}

// Busca la firma del jefe de obra de la misma obra que el trabajador (o del admin como fallback).
export function findResponsableFirma(db, u) {
  const joEmp = u.obrasAsignadas?.length
    ? (db.employees || []).find(e => e.role === 'jefe_obra' && !e.baja && e.obrasAsignadas?.some(o => u.obrasAsignadas.includes(o)))
    : (db.employees || []).find(e => e.role === 'jefe_obra' && !e.baja)
  const firma = (joEmp ? db.firmas?.[joEmp.id]?.main : null) || db.firmas?.['admin']?.main
  const nombre = joEmp ? joEmp.name : 'Jefe de Obra / Responsable'
  return { firma, nombre }
}
