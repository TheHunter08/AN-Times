import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildCierreIndividualPDF, buildCierreConsolidadoPDF } from './cierrePdf.js'

async function pageCount(blob) {
  const buffer = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })
  const bytes = new Uint8Array(buffer)
  return (await PDFDocument.load(bytes)).getPageCount()
}

function record(index) {
  const day = String((index % 28) + 1).padStart(2, '0')
  return {
    id:`r-${index}`,
    inicio:`2026-07-${day}T08:00:00.000Z`,
    fin:`2026-07-${day}T16:00:00.000Z`,
    centro:index % 2 ? 'Obra Norte' : 'Oficina',
    workSecs:28800,
    breakSecs:0,
    breaks:[],
  }
}

describe('cierres PDF multipágina', () => {
  it('genera un cierre individual completo con varias páginas', async () => {
    const result = await buildCierreIndividualPDF({
      empresa:'TIMES INC',
      cierre:{
        empId:'e-1', empName:'Empleado de Prueba', mes:'2026-07', dias:28,
        generadoAt:'2026-07-31T18:00:00.000Z', generadoPor:'Administración',
        records_snapshot:Array.from({ length:75 }, (_, index) => record(index)),
      },
    })
    expect(result.blob.type).toBe('application/pdf')
    expect(await pageCount(result.blob)).toBeGreaterThan(1)
  })

  it('genera el cierre consolidado completo con varias páginas', async () => {
    const cierres = Array.from({ length:54 }, (_, index) => ({
      empName:`Empleado ${index + 1}`, dias:22, totalMin:9600 + index,
      estado:index % 3 ? 'firmado' : 'pendiente',
      firma:index % 3 ? { firmadoAt:'2026-07-31T18:00:00.000Z' } : null,
      records_snapshot:[],
    }))
    const result = await buildCierreConsolidadoPDF({ cierres, mes:'2026-07', empresa:'TIMES INC' })
    expect(result.blob.type).toBe('application/pdf')
    expect(await pageCount(result.blob)).toBeGreaterThan(1)
  })
})
