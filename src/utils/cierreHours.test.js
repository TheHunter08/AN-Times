import { describe, expect, it } from 'vitest'
import { calcSecs, recWorkSecs } from './time.js'
import { buildRecordSnapshot } from './adminHelpers.js'

// Reproduce el pipeline completo de horas del cierre mensual (generación →
// firma → PDF) con datos realistas, para verificar que el total nunca
// termina en 0 por una incompatibilidad entre las distintas formas en que
// se construye records_snapshot (servidor vs. admin vs. ModalCierreSign).
describe('cálculo de horas del cierre — todos los caminos que construyen records_snapshot', () => {
  const empId = 'e1'
  const records = []
  for (let day = 1; day <= 20; day++) {
    const d = String(day).padStart(2, '0')
    const dow = new Date(2026, 7, day).getDay()
    if (dow === 0 || dow === 6) continue // fin de semana
    records.push({
      id: `r${day}`, empId,
      inicio: `2026-08-${d}T06:00:00.000Z`, // 08:00 Madrid (verano, UTC+2)
      fin: `2026-08-${d}T14:00:00.000Z`,   // 16:00 Madrid
      breaks: [], workSecs: 0, breakSecs: 0,
    })
  }
  const expectedDays = records.length
  const expectedMin = expectedDays * 8 * 60

  it('el snapshot del cron de servidor (auto-cierre-mensual.js) da el total correcto', () => {
    // Mismo shape que produce auto-cierre-mensual.js: solo inicio/fin/centro/workSecs.
    const serverSnapshot = records.map(r => ({ inicio: r.inicio, fin: r.fin, centro: r.centro, workSecs: r.workSecs || 0 }))
    const totalMin = Math.floor(serverSnapshot.reduce((sum, record) => sum + recWorkSecs(record), 0) / 60)
    expect(totalMin).toBe(expectedMin)
  })

  it('el snapshot de generación manual del admin (buildRecordSnapshot) da el total correcto', () => {
    const adminSnapshot = records.map(buildRecordSnapshot)
    const totalMin = Math.floor(adminSnapshot.reduce((sum, record) => sum + recWorkSecs(record), 0) / 60)
    expect(totalMin).toBe(expectedMin)
  })

  it('el snapshot de vista previa al firmar (ModalCierreSign, calcSecs inline) da el total correcto', () => {
    const previewSnapshot = records.map(record => {
      const totals = calcSecs(record)
      return { ...record, workSecs: totals.work, breakSecs: totals.brk }
    })
    const totalMin = Math.floor(previewSnapshot.reduce((sum, record) => sum + recWorkSecs(record), 0) / 60)
    expect(totalMin).toBe(expectedMin)
  })

  it('recWorkSecs da el mismo resultado sea cual sea el camino que generó el snapshot', () => {
    const serverSnapshot = records.map(r => ({ inicio: r.inicio, fin: r.fin, centro: r.centro, workSecs: r.workSecs || 0 }))
    const adminSnapshot = records.map(buildRecordSnapshot)
    const previewSnapshot = records.map(record => {
      const totals = calcSecs(record)
      return { ...record, workSecs: totals.work, breakSecs: totals.brk }
    })
    const totals = [serverSnapshot, adminSnapshot, previewSnapshot].map(snapshot =>
      Math.floor(snapshot.reduce((sum, record) => sum + recWorkSecs(record), 0) / 60))
    expect(new Set(totals).size).toBe(1)
  })
})
