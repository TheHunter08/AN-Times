import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildSimplePdfBlob, buildXlsxBlob } from './exportFiles.js'

function blobBytes(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result))
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })
}

describe('exportaciones profesionales', () => {
  it('genera un PDF válido, paginado y compatible con acentos', async () => {
    const blob = await buildSimplePdfBlob(
      'Informe mensual · Julio',
      ['RESUMEN', 'Empleado: José Muñoz', ...Array.from({ length:90 }, (_, index) => `Registro ${index + 1}: jornada completa y validada`)],
      { subtitle:'Documento profesional de registro horario' },
    )
    const bytes = await blobBytes(blob)
    const pdf = await PDFDocument.load(bytes)
    expect(blob.type).toBe('application/pdf')
    expect(bytes.slice(0, 4)).toEqual(new Uint8Array([37, 80, 68, 70]))
    expect(pdf.getPageCount()).toBeGreaterThan(1)
  })

  it('genera un XLSX real con datos y cabecera', async () => {
    const blob = await buildXlsxBlob(
      ['Empleado', 'Horas', 'Centro'],
      [['Ana', 8, 'Obra Norte'], ['Luis', 7.5, 'Oficina']],
      'Fichajes: julio/2026',
    )
    const bytes = await blobBytes(blob)
    expect(blob.type).toContain('spreadsheetml')
    expect(bytes[0]).toBe(80)
    expect(bytes[1]).toBe(75)
    expect(bytes.length).toBeGreaterThan(1000)
  })
})
