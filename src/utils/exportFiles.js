const BRAND = {
  primary: '#7C3AED',
  primaryDark: '#5B21B6',
  primarySoft: '#F3E8FF',
  ink: '#171322',
  muted: '#6B6476',
  border: '#DDD6E8',
  stripe: '#FAF8FC',
}

function safePdfText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[–—−]/g, '-')
    .replace(/[•·]/g, '-')
    .replace(/[^ -~ -ÿ€]/g, '')
}

function wrapPdfText(text, font, size, maxWidth) {
  const words = safePdfText(text).split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }
    lines.push(current)
    current = word
  }
  if (current) lines.push(current)
  return lines
}

export async function buildSimplePdfBlob(title, lines, options = {}) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const pageSize = [595, 842]
  const margin = 42
  const contentWidth = pageSize[0] - margin * 2
  const primary = rgb(.486, .227, .929)
  const ink = rgb(.09, .075, .135)
  const muted = rgb(.42, .39, .47)
  const border = rgb(.87, .84, .91)
  const soft = rgb(.965, .94, 1)
  let page
  let y

  const addPage = () => {
    page = pdf.addPage(pageSize)
    page.drawRectangle({ x:0, y:pageSize[1] - 88, width:pageSize[0], height:88, color:primary })
    page.drawText('TIMES INC', { x:margin, y:pageSize[1] - 39, size:11, font:bold, color:rgb(1, 1, 1) })
    const titleLines = wrapPdfText(title, bold, 16, contentWidth - 110).slice(0, 2)
    titleLines.forEach((line, index) => page.drawText(line, { x:margin, y:pageSize[1] - 62 - index * 17, size:16, font:bold, color:rgb(1, 1, 1) }))
    page.drawText(new Date().toLocaleDateString('es-ES'), { x:pageSize[0] - margin - 72, y:pageSize[1] - 39, size:8, font:regular, color:rgb(.9, .86, 1) })
    y = pageSize[1] - 116
  }

  addPage()
  if (options.subtitle) {
    page.drawRectangle({ x:margin, y:y - 34, width:contentWidth, height:34, color:soft, borderColor:primary, borderWidth:.5 })
    wrapPdfText(options.subtitle, regular, 8.5, contentWidth - 18).slice(0, 2).forEach((line, index) => {
      page.drawText(line, { x:margin + 9, y:y - 14 - index * 11, size:8.5, font:regular, color:ink })
    })
    y -= 48
  }

  for (const raw of lines || []) {
    const text = safePdfText(raw)
    if (!text) { y -= 8; continue }
    const isSection = text.length < 80 && (text === text.toUpperCase() || text.endsWith(':'))
    const font = isSection ? bold : regular
    const size = isSection ? 9.5 : 8.5
    const wrapped = wrapPdfText(text, font, size, contentWidth - (isSection ? 16 : 0))
    const required = wrapped.length * 12 + (isSection ? 12 : 3)
    if (y - required < 48) addPage()
    if (isSection) {
      page.drawRectangle({ x:margin, y:y - required + 4, width:contentWidth, height:required, color:soft })
      y -= 9
    }
    wrapped.forEach(line => {
      page.drawText(line, { x:margin + (isSection ? 8 : 0), y, size, font, color:isSection ? primary : ink, maxWidth:contentWidth })
      y -= 12
    })
    if (!isSection) {
      page.drawLine({ start:{ x:margin, y:y + 4 }, end:{ x:margin + contentWidth, y:y + 4 }, thickness:.25, color:border })
      y -= 3
    }
  }

  const pages = pdf.getPages()
  pages.forEach((item, index) => {
    item.drawText(`TIMES INC · Documento generado el ${new Date().toLocaleString('es-ES')}`, { x:margin, y:22, size:6.5, font:regular, color:muted })
    item.drawText(`Página ${index + 1} de ${pages.length}`, { x:pageSize[0] - margin - 62, y:22, size:6.5, font:regular, color:muted })
  })
  return new Blob([await pdf.save()], { type:'application/pdf' })
}

export async function downloadSimplePdf(title, lines, filename, options) {
  const blob = await buildSimplePdfBlob(title, lines, options)
  downloadBlob(blob, filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
  return { ok:true, blob }
}

function cleanSheetName(sheetName) {
  return String(sheetName || 'Informe').replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 31) || 'Informe'
}

function excelValue(value) {
  if (value instanceof Date || typeof value === 'number' || typeof value === 'boolean') return value
  return String(value ?? '')
}

function normalizedLabel(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function excelStatusStyle(value) {
  const status = normalizedLabel(value)
  if (/valid|aprobad|firmad|completad/.test(status)) return { textColor:'#047857', backgroundColor:'#ECFDF5', fontWeight:'bold' }
  if (/rechaz|anulad|incidencia|error/.test(status)) return { textColor:'#B91C1C', backgroundColor:'#FEF2F2', fontWeight:'bold' }
  if (/pendiente|sin firma|por validar/.test(status)) return { textColor:'#B45309', backgroundColor:'#FFFBEB', fontWeight:'bold' }
  return null
}

export async function buildXlsxBlob(headers, rows, sheetName = 'Informe') {
  const writeXlsxFile = (await import('write-excel-file/browser')).default
  const safeHeaders = (headers || []).map(value => String(value ?? ''))
  const safeRows = (rows || []).map(row => safeHeaders.map((_, index) => excelValue(row?.[index])))
  const statusColumn = safeHeaders.findIndex(header => /estado|validacion/.test(normalizedLabel(header)))
  const widths = safeHeaders.map((header, column) => {
    const longest = Math.max(header.length, ...safeRows.slice(0, 300).map(row => String(row[column] ?? '').length))
    return { width:Math.min(45, Math.max(12, longest + 2)) }
  })
  const headerRow = safeHeaders.map(value => ({
    value, fontWeight:'bold', textColor:'#FFFFFF', backgroundColor:BRAND.primary,
    borderColor:BRAND.primaryDark, borderStyle:'thin', alignVertical:'center', wrap:true, height:30,
  }))
  const dataRows = safeRows.map((row, rowIndex) => row.map((value, columnIndex) => {
    const statusStyle = columnIndex === statusColumn ? excelStatusStyle(value) : null
    return {
      value,
      backgroundColor:statusStyle?.backgroundColor || (rowIndex % 2 ? BRAND.stripe : '#FFFFFF'),
      borderColor:BRAND.border,
      bottomBorderColor:BRAND.border,
      bottomBorderStyle:'thin',
      textColor:statusStyle?.textColor || BRAND.ink,
      fontWeight:statusStyle?.fontWeight,
      alignVertical:'top',
      wrap:true,
      height:22,
    }
  }))
  return writeXlsxFile([headerRow, ...dataRows], {
    sheet:cleanSheetName(sheetName),
    columns:widths,
    stickyRowsCount:1,
    showGridLines:false,
    zoomScale:90,
  }).toBlob()
}

export async function downloadXlsx(headers, rows, filename, sheetName) {
  const blob = await buildXlsxBlob(headers, rows, sheetName)
  downloadBlob(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
  return { ok:true, blob }
}

export function downloadCsv(headers, rows, filename) {
  const esc = value => `"${String(value ?? '').replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map(row => row.map(esc).join(',')).join('\r\n')
  downloadBlob(new Blob(['\ufeff' + csv], { type:'text/csv;charset=utf-8' }), filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
