import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore.js'
import { calcSecs } from '../utils/time.js'

export function useTimer() {
  const timer   = useAppStore(s => s.timer)
  const userId  = useAppStore(s => s.session.user?.id)
  const tickRef     = useRef(0)
  const saveTickRef = useRef(null)

  useEffect(() => {
    if (!userId) return

    const interval = setInterval(() => {
      // Always read fresh state — no stale closures, interval never resets on db change
      const { db, timer: t, updateTimer, saveDB } = useAppStore.getState()

      const openRec = (db.records || []).find(r => r.empId === userId && !r.fin)
      if (!openRec) {
        if (t.state !== 'idle') updateTimer({ state: 'idle', ws: 0, bs: 0 })
        return
      }

      const state = openRec.enDescanso ? 'break' : 'working'
      const secs  = calcSecs(openRec)
      updateTimer({ state, ws: secs.work, bs: secs.brk })

      // Persist workSecs/breakSecs every ~30 s so server always has fresh data
      if ((++tickRef.current) % 30 === 0) {
        clearTimeout(saveTickRef.current)
        const recId   = openRec.id
        const work    = secs.work
        const brk     = secs.brk
        saveTickRef.current = setTimeout(() => {
          const { db: fresh, saveDB: sd } = useAppStore.getState()
          const current = fresh.records.find(r => r.id === recId)
          // Si el registro ya se cerró (el propio empleado, un encargado u otro
          // dispositivo) entre que se tomó esta instantánea y que se guarda, no la
          // apliquemos — pisaría las horas finales reales con un valor "en vivo"
          // desactualizado y de menor duración.
          if (!current || current.fin) return
          const records = fresh.records.map(r =>
            r.id === recId ? { ...r, workSecs: work, breakSecs: brk, _upd: new Date().toISOString() } : r
          )
          sd({ records })
        }, 5000)
      }
    }, 1000)

    return () => {
      clearInterval(interval)
      clearTimeout(saveTickRef.current)
    }
  }, [userId])   // ← only re-run when the logged-in user changes, NOT on every db write

  return timer
}
