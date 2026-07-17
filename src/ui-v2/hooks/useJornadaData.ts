// Datos derivados del tab "Jornada" — misma lógica que TabJornada.jsx (legacy),
// solo relocalizada como hook reutilizable por la página ui-v2 equivalente.
import { useMemo } from 'react'
import { calcSecs, calcMin, recWorkSecs, wkStart, p2, localDateStr } from '../../utils/time.js'
import { WD, WK } from '../../config/constants.js'

export function useJornadaData(db: any, u: any, timer: any) {
  return useMemo(() => {
    const now = new Date()
    const ws = wkStart(now)
    const wsStr = localDateStr(ws)
    const mk = `${now.getFullYear()}-${p2(now.getMonth() + 1)}`
    const todayStr = localDateStr(now)

    const weekRecs = (db.records || []).filter((r: any) => r.empId === u.id && r.fin && new Date(r.inicio) >= new Date(wsStr + 'T00:00:00'))
    const monthMin = (db.records || [])
      .filter((r: any) => r.empId === u.id && r.fin && r.inicio && localDateStr(new Date(r.inicio)).startsWith(mk))
      .reduce((s: number, r: any) => s + calcMin(r), 0)

    const recs = (db.records || []).filter((r: any) => r.empId === u.id && r.inicio && localDateStr(new Date(r.inicio)) === todayStr).sort((a: any, b: any) => a.inicio.localeCompare(b.inicio))
    const realRecs = recs.filter((r: any) => !r.fin || recWorkSecs(r) >= 30)
    const o = realRecs.find((r: any) => !r.fin)

    const completedSecs = realRecs.filter((r: any) => r.fin && r.closed).reduce((a: number, r: any) => a + recWorkSecs(r), 0)
    const liveSecs = o ? calcSecs(o).work : 0
    const totSecs = completedSecs + liveSecs
    const totMin = Math.floor(totSecs / 60)
    const brkMin = recs.reduce((a: number, r: any) => a + Math.floor((r.breakSecs || 0) / 60), 0)
    const wdEfectivo = db.config?.wdMin || WD

    const weekMin = weekRecs.reduce((s: number, r: any) => s + calcMin(r), 0) + (timer.state !== 'idle' ? Math.floor(timer.ws / 60) : 0)
    const weekMinAntes = Math.max(0, weekMin - totMin)
    const extraMin = Math.max(0, weekMin - WK) - Math.max(0, weekMinAntes - WK)
    const normMin = Math.max(0, totMin - extraMin)

    const tlItems = realRecs.map((r: any) => ({ r, isCurrent: !r.fin }))

    const histDays = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() - i - 1); return localDateStr(d)
    })
    const histWithRecs = histDays
      .map(ds => ({ ds, recs: (db.records || []).filter((r: any) => r.empId === u.id && r.inicio && localDateStr(new Date(r.inicio)) === ds && r.fin) }))
      .filter(h => h.recs.length > 0)

    const pendingValidation = (db.records || []).filter((r: any) => r.empId === u.id && r.fin && !r.aceptada).length

    return { now, o, totMin, brkMin, monthMin, weekMin, extraMin, normMin, wdEfectivo, tlItems, histWithRecs, pendingValidation }
    // localDateStr(new Date()) como dependencia (no solo timer/db): sin ella, si el
    // empleado no ha fichado (timer.state se queda en 'idle') el memo no se recalcula
    // al cruzar la medianoche y "hoy" se queda pegado al día anterior.
  }, [db.records, db.config?.wdMin, timer.state, timer.ws, u.id, localDateStr(new Date())])
}
