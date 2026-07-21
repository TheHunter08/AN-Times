import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { buildHoursReportXlsxBlob } from './hoursReportXlsx.js'

function blobBytes(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result))
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })
}

describe('informe Excel de horas', () => {
  it('genera resumen general, detalle y una hoja individual por empleado', async () => {
    const employees = [
      { id:'e1', name:'Ana García', centroTrabajo:'Obra Norte' },
      { id:'e2', name:'Luis Martín', centroTrabajo:'Oficina' },
    ]
    const records = [
      { id:'r1', empId:'e1', inicio:'2026-07-01T08:00:00.000Z', fin:'2026-07-01T16:30:00.000Z', breaks:[{ start:'2026-07-01T12:00:00.000Z', end:'2026-07-01T12:30:00.000Z' }], centro:'Obra Norte', validado:true, correcciones:[] },
      { id:'r2', empId:'e2', inicio:'2026-07-02T08:00:00.000Z', fin:'2026-07-02T16:00:00.000Z', breaks:[], centro:'Oficina', correcciones:[{ motivo:'Ajuste autorizado' }] },
      { id:'r3', empId:'deleted', empName:'Empleado histórico', inicio:'2026-07-03T08:00:00.000Z', fin:'2026-07-03T16:00:00.000Z', breaks:[], centro:'Archivo', validado:true },
    ]
    const blob = await buildHoursReportXlsxBlob({ monthKey:'2026-07', monthLabel:'julio de 2026', employees, records, closures:[], generatedAt:new Date('2026-07-31T18:00:00.000Z') })
    const zip = unzipSync(await blobBytes(blob))
    const workbookXml = new TextDecoder().decode(zip['xl/workbook.xml'])
    const sheetFiles = Object.keys(zip).filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    expect(blob.type).toContain('spreadsheetml')
    expect(workbookXml).toContain('Resumen general')
    expect(workbookXml).toContain('Detalle fichajes')
    expect(workbookXml).toContain('Ana García')
    expect(workbookXml).toContain('Luis Martín')
    expect(workbookXml).toContain('Empleado histórico')
    expect(sheetFiles).toHaveLength(5)
    expect(sheetFiles.some(name => new TextDecoder().decode(zip[name]).includes('SUM('))).toBe(true)
  })

  it('genera un informe individual sin incluir a otros empleados', async () => {
    const employees = [{ id:'e1', name:'Ana' }, { id:'e2', name:'Luis' }]
    const blob = await buildHoursReportXlsxBlob({ monthKey:'2026-07', monthLabel:'julio de 2026', employees, records:[], employeeId:'e1' })
    const zip = unzipSync(await blobBytes(blob))
    const workbookXml = new TextDecoder().decode(zip['xl/workbook.xml'])
    expect(workbookXml).toContain('Ana')
    expect(workbookXml).not.toContain('Luis')
  })
})
