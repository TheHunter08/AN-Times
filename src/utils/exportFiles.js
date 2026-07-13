import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export async function downloadSimplePdf(title, lines, filename) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage([595, 842])
  let y = 800
  page.drawText(title, { x: 42, y, size: 17, font: bold, color: rgb(.12, .12, .16) })
  y -= 30
  for (const raw of lines) {
    const text = String(raw ?? '').replace(/[^\x20-\x7EÀ-ÿ]/g, '')
    if (y < 48) { page = pdf.addPage([595, 842]); y = 800 }
    page.drawText(text.slice(0, 105), { x: 42, y, size: 9.5, font, color: rgb(.22, .22, .28) })
    y -= 15
  }
  const blob = new Blob([await pdf.save()], { type: 'application/pdf' })
  downloadBlob(blob, filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}

export function downloadExcel(headers, rows, filename) {
  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`
  downloadBlob(new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8' }), filename.endsWith('.xls') ? filename : `${filename}.xls`)
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
