// Exportación de PDF de jornada (semanal / mensual firmado / rango) — misma
// lógica que TabJornada.jsx (legacy), relocalizada sin cambios de negocio.
import { useCallback, useState } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { today, calcMin, recWorkSecs, wkStart, p2, ftime, mhm, monthlyExtras, localDateStr } from '../../utils/time.js'
import { WM } from '../../config/constants.js'
import { PDF_PAGE, pdfColors, pdfSafe, drawTableHeaderRow, drawTableDataRow, drawSignatureBlock, drawDocumentFooters, addReportPage, findResponsableFirma } from '../../utils/pdfReport.js'

export function useJornadaPdfExport(db: any, u: any, toast: (msg: string) => void) {
  const [informeUrl, setInformeUrl] = useState<string | null>(null)
  const [informeBlob, setInformeBlob] = useState<Blob | null>(null)
  const [informeHash, setInformeHash] = useState<string | null>(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [generatingWeekPdf, setGeneratingWeekPdf] = useState(false)
  const [showRangeExport, setShowRangeExport] = useState(false)
  const nowIso = today()
  const [exportFrom, setExportFrom] = useState(nowIso.slice(0, 7) + '-01')
  const [exportTo, setExportTo] = useState(nowIso)
  const [generatingRangePdf, setGeneratingRangePdf] = useState(false)

  const closeInforme = useCallback(() => {
    setInformeUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setInformeBlob(null)
  }, [])

  useModalBack(!!informeUrl, closeInforme)

  const exportRangePDF = async () => {
    if (!exportFrom || !exportTo || exportFrom > exportTo) return
    setGeneratingRangePdf(true)
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const rangeRecs = (db.records || [])
        .filter((r: any) => r.empId === u.id && r.fin && r.inicio >= exportFrom + 'T00:00:00' && r.inicio <= exportTo + 'T23:59:59')
        .sort((a: any, b: any) => a.inicio.localeCompare(b.inicio))
      const totalMin2 = rangeRecs.reduce((s: number, r: any) => s + calcMin(r), 0)
      const rangeLabel = `${exportFrom} – ${exportTo}`
      const pdfDoc = await PDFDocument.create()
      const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      const safe = pdfSafe
      const { W: PW, H: PH } = PDF_PAGE
      const ML = 35, MR = 35, CW = PW - ML - MR
      const COLS = [
        { label: 'Fecha', w: 72 }, { label: 'Entrada', w: 52 }, { label: 'Salida', w: 52 },
        { label: 'Centro / Obra', w: 279 }, { label: 'Horas netas', w: 70 },
      ]
      const ROW_H = 15, HEAD_H = 17
      const pdfCols = pdfColors(rgb)
      let page: any, y = 0, pageNum = 0
      const newPage = () => {
        pageNum++
        ;({ page, y } = addReportPage(pdfDoc, {
          ml: ML, mr: MR, cw: CW, pw: PW, ph: PH, pageNum, colors: pdfCols, fontR, fontB,
          empresa: u.empresa || 'TIMES INC',
          title: 'INFORME DE JORNADA - RANGO',
          subtitle: `Trabajador: ${u.name} · Período: ${rangeLabel}`,
        }))
        y = drawTableHeaderRow(page, { ml: ML, y, cw: CW, cols: COLS, colors: pdfCols, fontB, headH: HEAD_H })
      }
      newPage()
      rangeRecs.forEach((r: any, idx: number) => {
        if (y - ROW_H < 50) newPage()
        const d = new Date(r.inicio)
        const cols2 = [
          `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`,
          `${p2(d.getHours())}:${p2(d.getMinutes())}`,
          r.fin ? `${p2(new Date(r.fin).getHours())}:${p2(new Date(r.fin).getMinutes())}` : '--',
          safe(r.centro || ''),
          mhm(calcMin(r)),
        ]
        y = drawTableDataRow(page, { ml: ML, cw: CW, y, vals: cols2, cols: COLS, striped: idx % 2 !== 0, colors: pdfCols, fontR, fontB, highlightIdx: 4, rowH: ROW_H })
      })
      y -= 10
      page.drawText(`Total: ${mhm(totalMin2)} en ${rangeRecs.length} registros`, { x: ML, y, size: 9, font: fontB, color: pdfCols.pri })
      drawDocumentFooters(pdfDoc, { ml: ML, cw: CW, colors: pdfCols, fontR })
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
      setInformeBlob(blob)
      setInformeUrl(URL.createObjectURL(blob))
      setShowRangeExport(false)
    } catch (e: any) {
      toast('Error al generar PDF de rango: ' + (e?.message || e))
    } finally {
      setGeneratingRangePdf(false)
    }
  }

  const exportMonthPDF = async () => {
    setGeneratingPdf(true)
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const pdfCols = pdfColors(rgb)
      const now2 = new Date()
      const mk2 = `${now2.getFullYear()}-${p2(now2.getMonth() + 1)}`
      const monthRecs = (db.records || []).filter((r: any) => r.empId === u.id && r.fin && r.inicio && localDateStr(new Date(r.inicio)).startsWith(mk2)).sort((a: any, b: any) => a.inicio.localeCompare(b.inicio))
      const totalMin2 = monthRecs.reduce((s: number, r: any) => s + calcMin(r), 0)
      const monthName = now2.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      const pdfDoc = await PDFDocument.create()
      const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      const localDate = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` }
      const safe = pdfSafe
      const { W: PW, H: PH } = PDF_PAGE
      const ML = 35, MR = 35, CW = PW - ML - MR
      const COLS = [
        { label: 'Fecha', w: 72 }, { label: 'Entrada', w: 52 }, { label: 'Salida', w: 52 },
        { label: 'Centro / Obra', w: 279 }, { label: 'Horas netas', w: 70 },
      ]
      const ROW_H = 15, HEAD_H = 17, SIG_AREA = 110
      const cGreen = pdfCols.green
      // La portada es la página 1; el primer bloque de detalle empieza en la 2.
      let page: any, y = 0, pageNum = 1
      const newPage = () => {
        pageNum++
        const obras = u.obrasAsignadas?.length ? u.obrasAsignadas.join(', ') : (u.centroTrabajo || '-')
        ;({ page, y } = addReportPage(pdfDoc, {
          ml: ML, mr: MR, cw: CW, pw: PW, ph: PH, pageNum, colors: pdfCols, fontR, fontB,
          empresa: u.empresa || 'Obra',
          title: 'REGISTRO DE JORNADA LABORAL',
          subtitle: `Trabajador: ${u.name}   .   Mes: ${monthName}   .   Obras: ${obras}`,
        }))
      }
      const tableHeader = () => { y = drawTableHeaderRow(page, { ml: ML, y, cw: CW, cols: COLS, colors: pdfCols, fontB, headH: HEAD_H }) }
      const cover = pdfDoc.addPage([PW, PH])
      cover.drawRectangle({ x: 0, y: PH - 120, width: PW, height: 120, color: pdfCols.pri })
      cover.drawText(safe(u.empresa || 'TIMES INC'), { x: ML, y: PH - 50, size: 24, font: fontB, color: pdfCols.white })
      cover.drawText('REGISTRO DE JORNADA LABORAL', { x: ML, y: PH - 78, size: 11, font: fontR, color: rgb(0.8, 0.82, 1) })
      cover.drawText(new Date().toLocaleDateString('es-ES'), { x: PW - MR - 90, y: PH - 50, size: 10, font: fontR, color: rgb(0.8, 0.82, 1) })
      const ly = (n: number) => PH - 200 - n * 28
      cover.drawText('Trabajador', { x: ML, y: ly(0) + 10, size: 8, font: fontR, color: pdfCols.gray })
      cover.drawText(safe(u.name), { x: ML, y: ly(0) - 6, size: 16, font: fontB, color: pdfCols.dark })
      cover.drawLine({ start: { x: ML, y: ly(0) - 16 }, end: { x: PW - MR, y: ly(0) - 16 }, thickness: 0.4, color: pdfCols.border })
      cover.drawText('Periodo', { x: ML, y: ly(1) + 10, size: 8, font: fontR, color: pdfCols.gray })
      cover.drawText(monthName.charAt(0).toUpperCase() + monthName.slice(1), { x: ML, y: ly(1) - 6, size: 16, font: fontB, color: pdfCols.dark })
      cover.drawLine({ start: { x: ML, y: ly(1) - 16 }, end: { x: PW - MR, y: ly(1) - 16 }, thickness: 0.4, color: pdfCols.border })
      cover.drawText('Centro / Obra', { x: ML, y: ly(2) + 10, size: 8, font: fontR, color: pdfCols.gray })
      cover.drawText(safe(u.obrasAsignadas?.length ? u.obrasAsignadas.join(', ') : (u.centroTrabajo || '-')), { x: ML, y: ly(2) - 6, size: 12, font: fontB, color: pdfCols.dark, maxWidth: CW })
      cover.drawLine({ start: { x: ML, y: ly(2) - 16 }, end: { x: PW - MR, y: ly(2) - 16 }, thickness: 0.4, color: pdfCols.border })
      const statsY = ly(3) - 10
      cover.drawRectangle({ x: ML, y: statsY - 80, width: CW, height: 80, color: pdfCols.priLt, borderColor: pdfCols.pri, borderWidth: 0.6 })
      const exCover = monthlyExtras(db.records, u.id, mk2)
      const statItems = [
        { label: 'Jornadas', val: String(monthRecs.length) },
        { label: 'Total horas', val: mhm(totalMin2) },
        { label: 'H. extra', val: exCover.netExtraMin > 0 ? `+${mhm(exCover.netExtraMin)}` : exCover.deficitMin > 0 ? `-${mhm(exCover.deficitMin)}` : '0h' },
        { label: 'Objetivo 160h', val: totalMin2 >= WM ? 'OK (160h)' : `Falta ${mhm(WM - totalMin2)}` },
      ]
      const statW = CW / statItems.length
      statItems.forEach((s, i) => {
        const sx = ML + i * statW + statW / 2
        cover.drawText(s.label, { x: sx - 20, y: statsY - 25, size: 7.5, font: fontR, color: pdfCols.gray, maxWidth: statW - 8 })
        cover.drawText(s.val, { x: sx - 26, y: statsY - 50, size: 14, font: fontB, color: pdfCols.pri, maxWidth: statW - 4 })
      })
      cover.drawText(
        'Generado automáticamente por TIMES INC conforme al RDL 8/2019 de registro diario de jornada.',
        { x: ML, y: 40, size: 6, font: fontR, color: pdfCols.gray, maxWidth: CW }
      )
      newPage(); tableHeader()
      monthRecs.forEach((r: any, i: number) => {
        if (y - ROW_H < 35 + SIG_AREA) { newPage(); tableHeader() }
        const wm = Math.floor(recWorkSecs(r) / 60)
        const centroObra = [r.centro, r.obra].filter(Boolean).join(' / ') || u.centroTrabajo || '-'
        const vals = [localDate(r.inicio), ftime(r.inicio), r.fin ? ftime(r.fin) : '-', centroObra, mhm(wm)]
        y = drawTableDataRow(page, { ml: ML, cw: CW, y, vals, cols: COLS, striped: i % 2 !== 0, colors: pdfCols, fontR, fontB, highlightIdx: 4, rowH: ROW_H })
      })
      if (y - 50 < 35 + SIG_AREA) { newPage() }
      const exPdf = monthlyExtras(db.records, u.id, mk2)
      const targetMin2 = WM
      const cDiff = exPdf.netExtraMin > 0 ? cGreen : exPdf.deficitMin > 0 ? rgb(0.87, 0.27, 0.27) : pdfCols.pri
      page.drawRectangle({ x: ML, y: y - 50, width: CW, height: 50, color: pdfCols.priLt, borderColor: pdfCols.pri, borderWidth: 0.6 })
      page.drawText(`TOTAL: ${mhm(totalMin2)}   ·   ${monthRecs.length} jornada${monthRecs.length !== 1 ? 's' : ''} registrada${monthRecs.length !== 1 ? 's' : ''}`, { x: ML + 8, y: y - 14, size: 8.5, font: fontB, color: pdfCols.pri })
      page.drawText(`Objetivo mensual: 160h (${mhm(targetMin2)})`, { x: ML + 8, y: y - 28, size: 7.5, font: fontR, color: pdfCols.dark, maxWidth: CW - 16 })
      const extraLine = exPdf.netExtraMin > 0
        ? `H. extra del mes: +${mhm(exPdf.netExtraMin)} sobre las 160h`
        : exPdf.deficitMin > 0
          ? `Deficit: -${mhm(exPdf.deficitMin)} para completar las 160h obligatorias`
          : totalMin2 >= targetMin2 ? 'Objetivo de 160h alcanzado' : `Pendiente: ${mhm(targetMin2 - totalMin2)} para las 160h`
      page.drawText(extraLine, { x: ML + 8, y: y - 42, size: 7.5, font: fontB, color: cDiff, maxWidth: CW - 16 })
      y -= 58
      if (y - SIG_AREA < 30) { newPage() }
      y -= 10
      page.drawText('FIRMA DEL TRABAJADOR', { x: ML, y: y - 11, size: 6.5, font: fontB, color: pdfCols.gray })
      const firma = db.firmas?.[u?.id]?.main
      await drawSignatureBlock(pdfDoc, page, {
        x: ML, y, width: 130, colors: pdfCols, fontR, fontB,
        signatureDataUrl: firma?.data,
        label: firma?.data ? `${u.name}   .   Firmado digitalmente   .   ${new Date().toLocaleString('es-ES')}` : u.name,
        sublabel: firma?.data ? 'Firma verificada' : undefined,
        richMissing: true, missingLabel: 'Sin firma digital', missingDetail: 'Configurala en Perfil > Firma digital',
      } as any)
      const { firma: responsableFirma, nombre: responsableNombre } = findResponsableFirma(db, u)
      page.drawText('FIRMA DEL RESPONSABLE', { x: ML + CW / 2, y: y - 11, size: 6.5, font: fontB, color: pdfCols.gray })
      await drawSignatureBlock(pdfDoc, page, {
        x: ML + CW / 2, y, width: 130, colors: pdfCols, fontR, fontB,
        signatureDataUrl: responsableFirma?.data,
        label: responsableNombre,
        sublabel: undefined,
      })
      const canonical = JSON.stringify(monthRecs.map((r: any) => ({ id: r.id, empId: r.empId, inicio: r.inicio, fin: r.fin, centro: r.centro })))
      const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
      const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
      const shortHash = hashHex.slice(0, 16) + '…'
      drawDocumentFooters(pdfDoc, { ml: ML, cw: CW, colors: pdfCols, fontR, startPage: 1 })
      page.drawText(`SHA-256: ${shortHash}  ·  Generado: ${new Date().toLocaleString('es-ES')}`, { x: ML, y: 20, size: 5.5, font: fontR, color: pdfCols.gray, maxWidth: CW })
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
      setInformeBlob(blob)
      setInformeHash(hashHex)
      setInformeUrl(URL.createObjectURL(blob))
    } catch (e: any) {
      toast('Error al generar el PDF: ' + (e?.message || e))
    } finally {
      setGeneratingPdf(false)
    }
  }

  const exportWeekPDF = async () => {
    setGeneratingWeekPdf(true)
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const pdfCols = pdfColors(rgb)
      const now2 = new Date()
      const ws2 = wkStart(now2)
      const weekRecs2 = (db.records || []).filter((r: any) => r.empId === u.id && r.fin && r.inicio && new Date(r.inicio) >= ws2).sort((a: any, b: any) => a.inicio.localeCompare(b.inicio))
      const totalMin2 = weekRecs2.reduce((s: number, r: any) => s + calcMin(r), 0)
      const weekLabel = `Semana del ${ws2.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} al ${now2.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`
      const pdfDoc = await PDFDocument.create()
      const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      const localDate = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` }
      const { W: PW, H: PH } = PDF_PAGE
      const ML = 35, MR = 35, CW = PW - ML - MR
      const COLS = [
        { label: 'Fecha', w: 72 }, { label: 'Entrada', w: 52 }, { label: 'Salida', w: 52 },
        { label: 'Centro / Obra', w: 279 }, { label: 'Horas netas', w: 70 },
      ]
      const ROW_H = 15, HEAD_H = 17, SIG_AREA = 110
      let page: any, y = 0, pageNum = 0
      const newPage = () => {
        pageNum++
        const obras = u.obrasAsignadas?.length ? u.obrasAsignadas.join(', ') : (u.centroTrabajo || '-')
        ;({ page, y } = addReportPage(pdfDoc, {
          ml: ML, mr: MR, cw: CW, pw: PW, ph: PH, pageNum, colors: pdfCols, fontR, fontB,
          empresa: u.empresa || 'Obra',
          title: 'REGISTRO DE JORNADA LABORAL - INFORME SEMANAL',
          subtitle: `Trabajador: ${u.name}   .   ${weekLabel}   .   Obras: ${obras}`,
        }))
      }
      const tableHeader = () => { y = drawTableHeaderRow(page, { ml: ML, y, cw: CW, cols: COLS, colors: pdfCols, fontB, headH: HEAD_H }) }
      newPage(); tableHeader()
      weekRecs2.forEach((r: any, i: number) => {
        if (y - ROW_H < 35 + SIG_AREA) { newPage(); tableHeader() }
        const wm = Math.floor(recWorkSecs(r) / 60)
        const centroObra = [r.centro, r.obra].filter(Boolean).join(' / ') || u.centroTrabajo || '-'
        const vals = [localDate(r.inicio), ftime(r.inicio), r.fin ? ftime(r.fin) : '-', centroObra, mhm(wm)]
        y = drawTableDataRow(page, { ml: ML, cw: CW, y, vals, cols: COLS, striped: i % 2 !== 0, colors: pdfCols, fontR, fontB, highlightIdx: 4, rowH: ROW_H })
      })
      if (y - 40 < 35 + SIG_AREA) { newPage() }
      const targetMin2 = weekRecs2.length * 480
      const diffMin2 = totalMin2 - targetMin2
      const diffSign = diffMin2 >= 0 ? '+' : ''
      const cDiff = diffMin2 >= 0 ? pdfCols.green : pdfCols.red
      page.drawRectangle({ x: ML, y: y - 40, width: CW, height: 40, color: pdfCols.priLt, borderColor: pdfCols.pri, borderWidth: 0.6 })
      page.drawText(`TOTAL: ${mhm(totalMin2)}   ·   ${weekRecs2.length} jornada${weekRecs2.length !== 1 ? 's' : ''} registrada${weekRecs2.length !== 1 ? 's' : ''}`, { x: ML + 8, y: y - 14, size: 8.5, font: fontB, color: pdfCols.pri })
      page.drawText(`Objetivo: ${mhm(targetMin2)}   Desviación: ${diffSign}${mhm(Math.abs(diffMin2))}`, { x: ML + 8, y: y - 30, size: 7.5, font: fontR, color: cDiff, maxWidth: CW - 16 })
      y -= 48
      if (y - SIG_AREA < 30) { newPage() }
      y -= 10
      page.drawText('FIRMA DEL TRABAJADOR', { x: ML, y: y - 11, size: 6.5, font: fontB, color: pdfCols.gray })
      const firma = db.firmas?.[u?.id]?.main
      await drawSignatureBlock(pdfDoc, page, {
        x: ML, y, width: 130, colors: pdfCols, fontR, fontB,
        signatureDataUrl: firma?.data,
        label: firma?.data ? `${u.name}   .   Firmado digitalmente   .   ${new Date().toLocaleString('es-ES')}` : u.name,
        sublabel: firma?.data ? 'Firma verificada' : undefined,
        richMissing: true, missingLabel: 'Sin firma digital', missingDetail: 'Configurala en Perfil > Firma digital',
      } as any)
      const { firma: responsableFirmaW, nombre: responsableNombreW } = findResponsableFirma(db, u)
      page.drawText('FIRMA DEL RESPONSABLE', { x: ML + CW / 2, y: y - 11, size: 6.5, font: fontB, color: pdfCols.gray })
      await drawSignatureBlock(pdfDoc, page, {
        x: ML + CW / 2, y, width: 130, colors: pdfCols, fontR, fontB,
        signatureDataUrl: responsableFirmaW?.data,
        label: responsableNombreW,
        sublabel: undefined,
      })
      drawDocumentFooters(pdfDoc, { ml: ML, cw: CW, colors: pdfCols, fontR })
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
      setInformeBlob(blob)
      setInformeUrl(URL.createObjectURL(blob))
    } catch (e: any) {
      toast('Error al generar el PDF: ' + (e?.message || e))
    } finally {
      setGeneratingWeekPdf(false)
    }
  }

  return {
    informeUrl, informeBlob, informeHash, closeInforme,
    generatingPdf, generatingWeekPdf, generatingRangePdf,
    showRangeExport, setShowRangeExport, exportFrom, setExportFrom, exportTo, setExportTo,
    exportWeekPDF, exportMonthPDF, exportRangePDF,
  }
}
