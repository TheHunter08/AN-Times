// Datos derivados del tab "Jornada" — misma lógica que TabJornada.jsx (legacy),
// solo relocalizada como hook reutilizable por la página ui-v2 equivalente.
import { useMemo } from 'react'
import { calcSecs, calcMin, recWorkSecs, p2, localDateStr, isWorkday, workWeekRecords, wkStart } from '../../utils/time.js'
import { WK } from '../../config/constants.js'
import { isRecordPendingValidation } from '../../utils/recordValidation.js'
import { effectiveDailyTargetMin, calendarWeeklyHours } from '../../utils/laborCalendar.js'

export function useJornadaData(db: any, u: any, timer: any) {
  return useMemo(() => {
    const now = new Date()
    const mk = `${now.getFullYear()}-${p2(now.getMonth() + 1)}`
    const todayStr = localDateStr(now)

    const weekRecs = workWeekRecords(db.records || [], u.id, now)
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
    const wdEfectivo = effectiveDailyTargetMin(db.config?.wdMin, todayStr)

    const currentDayIsWorkday = isWorkday(now)
    const liveWeekMin = currentDayIsWorkday && timer.state !== 'idle' ? Math.floor(timer.ws / 60) : 0
    const weekMin = weekRecs.reduce((s: number, r: any) => s + calcMin(r), 0) + liveWeekMin
    const weekMinAntes = Math.max(0, weekMin - (currentDayIsWorkday ? totMin : 0))
    // El calendario oficial manda sobre el objetivo semanal (p.ej. jornada
    // intensiva jul-ago, ~33h en vez de 40h) salvo que no haya calendario
    // cargado para esta semana, en cuyo caso se usa el fijo de 40h (WK).
    const calendarWeekHours = calendarWeeklyHours(localDateStr(wkStart(now)))
    const weekTarget = calendarWeekHours !== null ? calendarWeekHours * 60 : WK
    const extraMin = Math.max(0, weekMin - weekTarget) - Math.max(0, weekMinAntes - weekTarget)
    const normMin = Math.max(0, totMin - extraMin)

    const tlItems = realRecs.map((r: any) => ({ r, isCurrent: !r.fin }))

    // Solo el mes en curso (del día 1 a ayer): antes era una ventana fija de
    // 30 días, así que a principios de mes se veía mayormente el mes anterior.
    const daysSoFarThisMonth = Math.max(0, now.getDate() - 1)
    const histDays = Array.from({ length: daysSoFarThisMonth }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() - i - 1); return localDateStr(d)
    })
    const histWithRecs = histDays
      .map(ds => ({ ds, recs: (db.records || []).filter((r: any) => r.empId === u.id && r.inicio && localDateStr(new Date(r.inicio)) === ds && r.fin) }))
      .filter(h => h.recs.length > 0)

    const pendingValidation = (db.records || []).filter((r: any) => r.empId === u.id && isRecordPendingValidation(r)).length

    return { now, o, totMin, brkMin, monthMin, weekMin, extraMin, normMin, wdEfectivo, tlItems, histWithRecs, pendingValidation }
    // localDateStr(new Date()) como dependencia (no solo timer/db): sin ella, si el
    // empleado no ha fichado (timer.state se queda en 'idle') el memo no se recalcula
    // al cruzar la medianoche y "hoy" se queda pegado al día anterior.
  }, [db.records, db.config?.wdMin, timer.state, timer.ws, u.id, localDateStr(new Date())])
}
