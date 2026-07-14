export async function downloadSimplePdf(title, lines, filename) {
  // PDF solo se descarga cuando el usuario exporta. Evita cargar ~438 kB al
  // arrancar el panel o la pantalla del empleado.
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
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

// Genera un .xlsx real (no HTML disfrazado de .xls) \u2014 se descarga solo al
// exportar, igual que el PDF, para no cargar la librer\u00eda al arrancar la app.
export async function downloadXlsx(headers, rows, filename, sheetName) {
  const writeXlsxFile = (await import('write-excel-file/browser')).default
  const sheetData = [headers, ...rows].map(row => row.map(cell => ({ value: cell ?? '' })))
  await writeXlsxFile(sheetData, { sheet: sheetName }).toFile(filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

export function downloadCsv(headers, rows, filename) {
  const esc = value => `"${String(value ?? '').replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map(row => row.map(esc).join(',')).join('\n')
  downloadBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

// Descarga un PDF ya generado (data URL con firma/hash) sin regenerarlo —
// usar siempre que exista un documento oficial ya firmado y guardado.
export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
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
