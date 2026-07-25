// PDF de la matriz empleado × día ("Resumen"). Tabla ancha con muchas columnas
// (hasta 31 días) — se usa un tamaño de página A3 apaisado en vez de A4 para
// que cada columna tenga anchura legible sin reducir la fuente al mínimo.
import { downloadBlob } from './exportFiles.js'

const PAGE = [1190, 842] // A3 apaisado en puntos
const ML = 28
const MT = 90
const MB = 40
const NAME_W = 150
const ROLE_W = 100
const ROW_H = 20
const HEADER_H = 26

const safe = s => String(s ?? '')
  .normalize('NFC')
  .replace(/[–—−]/g, '-')
  .replace(/[^ -~ -ÿ€]/g, '')

function fmtHours(hours) {
  if (!hours) return ''
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export async function buildResumenPdfBlob({ title, subtitle, days, sameMonth, rows, dayLabel }) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  const fontR = await pdf.embedFont(StandardFonts.Helvetica)
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold)
  const primary = rgb(0.36, 0.38, 0.82)
  const ink = rgb(0.10, 0.10, 0.15)
  const gray = rgb(0.55, 0.55, 0.60)
  const ltGray = rgb(0.96, 0.96, 0.98)
  const border = rgb(0.82, 0.82, 0.88)
  const white = rgb(1, 1, 1)
  const vacBg = rgb(0.93, 0.90, 1.0)

  const contentW = PAGE[0] - ML * 2 - NAME_W - ROLE_W
  const dayColW = Math.max(18, contentW / Math.max(1, days.length))
  const fontSize = dayColW < 22 ? 6.5 : 7.5

  let page, y
  const drawHeader = () => {
    page = pdf.addPage(PAGE)
    page.drawRectangle({ x: 0, y: PAGE[1] - 60, width: PAGE[0], height: 60, color: primary })
    page.drawText('TIMES INC', { x: ML, y: PAGE[1] - 26, size: 11, font: fontB, color: white })
    page.drawText(safe(title), { x: ML, y: PAGE[1] - 44, size: 15, font: fontB, color: white })
    if (subtitle) page.drawText(safe(subtitle), { x: PAGE[0] - ML - 300, y: PAGE[1] - 26, size: 8.5, font: fontR, color: white, maxWidth: 300 })
    y = PAGE[1] - MT

    // Cabecera de columnas
    page.drawRectangle({ x: ML, y: y - HEADER_H, width: NAME_W + ROLE_W + days.length * dayColW, height: HEADER_H, color: primary })
    page.drawText('Empleado', { x: ML + 4, y: y - HEADER_H + 8, size: 8, font: fontB, color: white })
    page.drawText('Rol', { x: ML + NAME_W + 4, y: y - HEADER_H + 8, size: 8, font: fontB, color: white })
    days.forEach((d, i) => {
      const label = dayLabel(d)
      const x = ML + NAME_W + ROLE_W + i * dayColW
      page.drawText(label, { x: x + dayColW / 2 - label.length * fontSize * 0.28, y: y - HEADER_H + 8, size: fontSize, font: fontB, color: white })
    })
    y -= HEADER_H
  }

  drawHeader()

  rows.forEach((row, rowIndex) => {
    if (y - ROW_H < MB) drawHeader()
    const striped = rowIndex % 2 === 1
    const rowY = y
    page.drawRectangle({ x: ML, y: rowY - ROW_H, width: NAME_W + ROLE_W + days.length * dayColW, height: ROW_H, color: striped ? ltGray : white })
    page.drawText(safe(row.employee.name || row.employee.id), { x: ML + 4, y: rowY - ROW_H + 6, size: 8, font: fontR, color: ink, maxWidth: NAME_W - 8 })
    page.drawText(safe(row.roleLabel), { x: ML + NAME_W + 4, y: rowY - ROW_H + 6, size: 7.5, font: fontR, color: gray, maxWidth: ROLE_W - 8 })
    row.cells.forEach((cell, i) => {
      const x = ML + NAME_W + ROLE_W + i * dayColW
      if (cell.isVacation) page.drawRectangle({ x, y: rowY - ROW_H, width: dayColW, height: ROW_H, color: vacBg })
      const label = cell.minutes > 0 ? fmtHours(cell.hours) : (cell.isVacation ? 'Vac' : '-')
      const textColor = cell.minutes > 0 ? ink : gray
      page.drawText(label, { x: x + dayColW / 2 - label.length * fontSize * 0.28, y: rowY - ROW_H + 6, size: fontSize, font: fontR, color: textColor })
    })
    page.drawLine({ start: { x: ML, y: rowY - ROW_H }, end: { x: ML + NAME_W + ROLE_W + days.length * dayColW, y: rowY - ROW_H }, thickness: 0.3, color: border })
    y -= ROW_H
  })

  const pages = pdf.getPages()
  pages.forEach((p, index) => {
    p.drawText(`TIMES INC · Resumen generado el ${new Date().toLocaleString('es-ES')}`, { x: ML, y: 20, size: 6.5, font: fontR, color: gray })
    p.drawText(`Página ${index + 1} de ${pages.length}`, { x: PAGE[0] - ML - 70, y: 20, size: 6.5, font: fontR, color: gray })
  })

  return new Blob([await pdf.save()], { type: 'application/pdf' })
}

export async function downloadResumenPdf(options, filename) {
  const blob = await buildResumenPdfBlob(options)
  downloadBlob(blob, filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
  return { ok: true, blob }
}
